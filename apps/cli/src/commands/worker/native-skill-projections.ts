import type {
  NativeProjectSkillEngine,
  NativeSkillProjectionManifest,
  NativeSkillProjectionRecord,
  NativeSkillProjectionSeed,
  NativeSkillProjectionStatus,
} from '@zonease/aiworker-fs-layout'
import type { BrainSkillPack } from '@zonease/aiworker-shared'
import type { Dirent } from 'node:fs'
import type { SelectedSoul } from '../../soul/presets'

import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  hashNativeSkillContent,
  isManagedNativeSkillSlug,
  NATIVE_PROJECT_SKILL_TARGETS,
  nativeProjectSkillSlug,
  nativeSkillProjectionRecordKey,
  readNativeSkillProjectionManifest,
  relativeNativeSkillProjectionTargetPath,
  resolveNativeSkillProjectionManifestPath,
  resolveProjectNativeSkillPath,
  resolveProjectNativeSkillsDir,
  writeNativeSkillProjectionManifest,
} from '@zonease/aiworker-fs-layout'
import {
  BUILTIN_KERNEL_BRAIN_SKILL_PACKS,
  findBuiltinSoulBrainSkillPacks,
} from '@zonease/aiworker-shared'

export type NativeSkillProjectionOperationType
  = | 'create'
    | 'deprecate'
    | 'drifted'
    | 'missing'
    | 'orphaned'
    | 'removed'
    | 'unchanged'
    | 'update'

export interface NativeSkillProjectionOperation {
  actualHash?: string
  deprecatedPath?: string
  engine: NativeProjectSkillEngine
  lastAppliedHash?: string
  logicalId?: string
  reason: string
  slug: string
  sourceHash?: string
  sourceKind?: NativeSkillProjectionSeed['sourceKind']
  sourcePath?: string
  sourceVersion?: string
  status: NativeSkillProjectionStatus
  targetPath: string
  type: NativeSkillProjectionOperationType
  writeContent?: string
}

export interface NativeSkillProjectionSummary {
  active: number
  deprecated: number
  drifted: number
  missing: number
  orphaned: number
  outdated: number
  removed: number
  unchanged: number
}

export interface NativeSkillProjectionPlan {
  desiredCount: number
  manifestExists: boolean
  manifestPath: string
  mode: 'apply' | 'dry-run'
  operations: NativeSkillProjectionOperation[]
  projectRoot: string
  summary: NativeSkillProjectionSummary
}

interface NativeSkillProjectionPlannerOptions {
  desiredSeeds?: NativeSkillProjectionSeed[]
  mode?: 'apply' | 'dry-run'
  projectRoot: string
}

type ProjectionRecordKeyInput = Pick<NativeSkillProjectionRecord, 'engine' | 'logicalId'>

export function buildNativeSkillProjectionSeedsForSoul(soul: SelectedSoul): NativeSkillProjectionSeed[] {
  return brainSkillPacksToProjectionSeeds([
    ...BUILTIN_KERNEL_BRAIN_SKILL_PACKS,
    ...(soul.brainSkillPacks ?? []),
  ])
}

export function brainSkillPacksToProjectionSeeds(packs: readonly BrainSkillPack[]): NativeSkillProjectionSeed[] {
  return packs.map(pack => ({
    content: ensureTrailingNewline(pack.skillMd),
    logicalId: pack.id,
    sourceKind: 'builtin',
    sourcePath: pack.sourcePath,
    sourceVersion: pack.metadata.version,
  }))
}

export async function loadDesiredNativeSkillProjectionSeeds(projectRoot: string): Promise<NativeSkillProjectionSeed[]> {
  const soulId = await readProjectSoulPreset(projectRoot)
  return brainSkillPacksToProjectionSeeds([
    ...BUILTIN_KERNEL_BRAIN_SKILL_PACKS,
    ...(soulId === undefined ? [] : findBuiltinSoulBrainSkillPacks(soulId)),
  ])
}

export async function planNativeSkillProjectionSync(options: NativeSkillProjectionPlannerOptions): Promise<NativeSkillProjectionPlan> {
  const desiredSeeds = options.desiredSeeds ?? await loadDesiredNativeSkillProjectionSeeds(options.projectRoot)
  const manifest = await readNativeSkillProjectionManifest(options.projectRoot)
  const operations: NativeSkillProjectionOperation[] = []
  const desiredKeys = new Set<string>()
  const desiredSlugs = new Set<string>()
  let retainedAdmissionCount = 0
  const projectionRecords = new Map<string, NativeSkillProjectionRecord>()
  const tombstones = manifest?.tombstones ?? []

  for (const record of manifest?.projections ?? [])
    projectionRecords.set(recordKey(record), record)

  for (const seed of desiredSeeds) {
    for (const target of NATIVE_PROJECT_SKILL_TARGETS) {
      const key = recordKey({ engine: target.engine, logicalId: seed.logicalId })
      desiredKeys.add(key)
      desiredSlugs.add(`${target.engine}:${nativeProjectSkillSlug(seed.logicalId)}`)
      operations.push(await planDesiredProjection(options.projectRoot, target.engine, seed, projectionRecords.get(key)))
    }
  }

  for (const record of projectionRecords.values()) {
    if (desiredKeys.has(recordKey(record)) || record.sourceKind !== 'admission')
      continue
    desiredKeys.add(recordKey(record))
    retainedAdmissionCount += 1
    operations.push(await planRetainedAdmissionProjection(options.projectRoot, record))
  }

  for (const record of projectionRecords.values()) {
    if (desiredKeys.has(recordKey(record)))
      continue
    operations.push(await planUndesiredProjection(options.projectRoot, record))
  }

  for (const tombstone of tombstones)
    operations.push(tombstoneOperation(options.projectRoot, tombstone))

  for (const orphan of await findOrphanedManagedNativeSkills(options.projectRoot, [...projectionRecords.values()], desiredSlugs))
    operations.push(orphan)

  operations.sort(compareOperations)

  return {
    desiredCount: desiredSeeds.length * NATIVE_PROJECT_SKILL_TARGETS.length + retainedAdmissionCount,
    manifestExists: manifest !== null,
    manifestPath: resolveNativeSkillProjectionManifestPath(options.projectRoot),
    mode: options.mode ?? 'dry-run',
    operations,
    projectRoot: options.projectRoot,
    summary: summarizeNativeSkillProjectionOperations(operations),
  }
}

export async function applyNativeSkillProjectionSync(projectRoot: string, desiredSeeds?: NativeSkillProjectionSeed[]): Promise<NativeSkillProjectionPlan> {
  const plan = await planNativeSkillProjectionSync({ desiredSeeds, mode: 'apply', projectRoot })
  const updatedAt = new Date().toISOString()
  const projections: NativeSkillProjectionRecord[] = []
  const tombstones: NativeSkillProjectionRecord[] = []

  for (const operation of plan.operations) {
    if (operation.type === 'orphaned')
      continue

    if (operation.type === 'create' || operation.type === 'update') {
      if (operation.logicalId === undefined || operation.sourceHash === undefined || operation.writeContent === undefined)
        continue
      await mkdir(path.dirname(operation.targetPath), { recursive: true })
      await writeFile(operation.targetPath, operation.writeContent, 'utf8')
      projections.push(recordFromOperation(projectRoot, operation, {
        actualHash: operation.sourceHash,
        lastAppliedHash: operation.sourceHash,
        status: 'active',
        updatedAt,
      }))
      continue
    }

    if (operation.type === 'unchanged') {
      projections.push(recordFromOperation(projectRoot, operation, {
        status: 'active',
        updatedAt,
      }))
      continue
    }

    if (operation.type === 'drifted' || operation.type === 'missing') {
      projections.push(recordFromOperation(projectRoot, operation, {
        status: operation.status,
        updatedAt,
      }))
      continue
    }

    if (operation.type === 'deprecate') {
      if (existsSync(operation.targetPath) && operation.deprecatedPath) {
        await mkdir(path.dirname(operation.deprecatedPath), { recursive: true })
        if (!existsSync(operation.deprecatedPath))
          await rename(operation.targetPath, operation.deprecatedPath)
      }
      tombstones.push(recordFromOperation(projectRoot, operation, {
        deprecatedAt: updatedAt,
        status: 'deprecated',
        targetPath: relativeNativeSkillProjectionTargetPath(projectRoot, operation.deprecatedPath ?? operation.targetPath),
        updatedAt,
      }))
      continue
    }

    if (operation.type === 'removed') {
      tombstones.push(recordFromOperation(projectRoot, operation, {
        removedAt: updatedAt,
        status: 'removed',
        updatedAt,
      }))
    }
  }

  const manifest: NativeSkillProjectionManifest = {
    projections: projections.sort(compareRecords),
    schemaVersion: 1,
    tombstones: tombstones.sort(compareRecords),
    updatedAt,
  }
  await writeNativeSkillProjectionManifest(projectRoot, manifest)

  return plan
}

export function summarizeNativeSkillProjectionOperations(operations: readonly NativeSkillProjectionOperation[]): NativeSkillProjectionSummary {
  const summary: NativeSkillProjectionSummary = {
    active: 0,
    deprecated: 0,
    drifted: 0,
    missing: 0,
    orphaned: 0,
    outdated: 0,
    removed: 0,
    unchanged: 0,
  }

  for (const operation of operations) {
    if (operation.status === 'active')
      summary.active += 1
    else if (operation.status === 'deprecated')
      summary.deprecated += 1
    else if (operation.status === 'drifted')
      summary.drifted += 1
    else if (operation.status === 'missing')
      summary.missing += 1
    else if (operation.status === 'orphaned')
      summary.orphaned += 1
    else if (operation.status === 'outdated')
      summary.outdated += 1
    else if (operation.status === 'removed')
      summary.removed += 1
    if (operation.type === 'unchanged')
      summary.unchanged += 1
  }
  return summary
}

export function publicNativeSkillProjectionPlan(plan: NativeSkillProjectionPlan): NativeSkillProjectionPlan {
  return {
    ...plan,
    operations: plan.operations.map(({ writeContent: _writeContent, ...operation }) => operation),
  }
}

async function planDesiredProjection(
  projectRoot: string,
  engine: NativeProjectSkillEngine,
  seed: NativeSkillProjectionSeed,
  previous?: NativeSkillProjectionRecord,
): Promise<NativeSkillProjectionOperation> {
  const targetPath = resolveProjectNativeSkillPath(projectRoot, engine, seed.logicalId)
  const slug = nativeProjectSkillSlug(seed.logicalId)
  const sourceHash = hashNativeSkillContent(seed.content)
  const actual = await readOptionalText(targetPath)
  const sourceFields = {
    engine,
    logicalId: seed.logicalId,
    slug,
    sourceHash,
    sourceKind: seed.sourceKind ?? 'builtin',
    sourcePath: seed.sourcePath,
    sourceVersion: seed.sourceVersion,
    targetPath,
    writeContent: seed.content,
  }

  if (actual === null) {
    return {
      ...sourceFields,
      lastAppliedHash: previous?.lastAppliedHash,
      reason: previous ? 'manifest expects this managed skill, but SKILL.md is missing' : 'managed skill has not been projected yet',
      status: 'missing',
      type: 'create',
    }
  }

  const actualHash = hashNativeSkillContent(actual)
  if (actualHash === sourceHash) {
    return {
      ...sourceFields,
      actualHash,
      lastAppliedHash: sourceHash,
      reason: 'managed skill is current',
      status: 'active',
      type: 'unchanged',
    }
  }

  if (previous?.lastAppliedHash && actualHash === previous.lastAppliedHash) {
    return {
      ...sourceFields,
      actualHash,
      lastAppliedHash: previous.lastAppliedHash,
      reason: 'managed source changed since the last projection',
      status: 'outdated',
      type: 'update',
    }
  }

  return {
    ...sourceFields,
    actualHash,
    lastAppliedHash: previous?.lastAppliedHash,
    reason: previous
      ? 'managed file differs from the last applied hash; manual review is required'
      : 'managed slug exists without manifest evidence; manual review is required',
    status: 'drifted',
    type: 'drifted',
  }
}

async function planUndesiredProjection(projectRoot: string, record: NativeSkillProjectionRecord): Promise<NativeSkillProjectionOperation> {
  const targetPath = path.join(projectRoot, ...record.targetPath.split('/'))
  const actual = await readOptionalText(targetPath)
  const base = operationFromRecord(projectRoot, record)

  if (actual === null) {
    return {
      ...base,
      reason: 'manifest record no longer has a native SKILL.md target',
      status: 'removed',
      type: 'removed',
    }
  }

  const actualHash = hashNativeSkillContent(actual)
  if (record.lastAppliedHash && actualHash === record.lastAppliedHash) {
    return {
      ...base,
      actualHash,
      deprecatedPath: `${targetPath}.deprecated`,
      reason: 'managed skill is no longer desired and can be removed from native discovery',
      status: 'deprecated',
      type: 'deprecate',
    }
  }

  return {
    ...base,
    actualHash,
    reason: 'managed skill is no longer desired, but local edits were detected',
    status: 'drifted',
    type: 'drifted',
  }
}

async function planRetainedAdmissionProjection(projectRoot: string, record: NativeSkillProjectionRecord): Promise<NativeSkillProjectionOperation> {
  const targetPath = path.join(projectRoot, ...record.targetPath.split('/'))
  const actual = await readOptionalText(targetPath)
  const base = operationFromRecord(projectRoot, record)

  if (actual === null) {
    return {
      ...base,
      reason: 'admission-managed skill is still desired, but SKILL.md is missing and no source body is available for automatic recreation',
      status: 'missing',
      type: 'missing',
    }
  }

  const actualHash = hashNativeSkillContent(actual)
  if (actualHash === record.sourceHash) {
    return {
      ...base,
      actualHash,
      lastAppliedHash: record.sourceHash,
      reason: 'admission-managed skill is current',
      status: 'active',
      type: 'unchanged',
    }
  }

  return {
    ...base,
    actualHash,
    reason: 'admission-managed skill differs from manifest source hash; manual review is required',
    status: 'drifted',
    type: 'drifted',
  }
}

function tombstoneOperation(projectRoot: string, record: NativeSkillProjectionRecord): NativeSkillProjectionOperation {
  return {
    ...operationFromRecord(projectRoot, record),
    reason: record.status === 'deprecated'
      ? 'managed skill was deprecated and removed from native discovery'
      : 'managed skill was removed before sync',
    status: record.status,
    type: record.status === 'deprecated' ? 'deprecate' : 'removed',
  }
}

async function findOrphanedManagedNativeSkills(
  projectRoot: string,
  manifestRecords: readonly NativeSkillProjectionRecord[],
  desiredSlugs: ReadonlySet<string>,
): Promise<NativeSkillProjectionOperation[]> {
  const knownTargetPaths = new Set(manifestRecords.map(record => path.join(projectRoot, ...record.targetPath.split('/'))))
  const operations: NativeSkillProjectionOperation[] = []

  for (const target of NATIVE_PROJECT_SKILL_TARGETS) {
    const root = resolveProjectNativeSkillsDir(projectRoot, target.engine)
    const entries = await readDirOptional(root)
    for (const entry of entries) {
      if (!entry.isDirectory() || !isManagedNativeSkillSlug(entry.name))
        continue
      const targetPath = path.join(root, entry.name, 'SKILL.md')
      if (!existsSync(targetPath) || knownTargetPaths.has(targetPath))
        continue
      const syntheticKey = `${target.engine}:${entry.name}`
      if (desiredSlugs.has(syntheticKey))
        continue
      const actual = await readOptionalText(targetPath)
      operations.push({
        ...(actual === null ? {} : { actualHash: hashNativeSkillContent(actual) }),
        engine: target.engine,
        reason: 'aiworker-managed slug exists without manifest ownership',
        slug: entry.name,
        status: 'orphaned',
        targetPath,
        type: 'orphaned',
      })
    }
  }

  return operations
}

function recordFromOperation(
  projectRoot: string,
  operation: NativeSkillProjectionOperation,
  override: {
    actualHash?: string
    deprecatedAt?: string
    lastAppliedHash?: string
    removedAt?: string
    status: NativeSkillProjectionStatus
    targetPath?: string
    updatedAt: string
  },
): NativeSkillProjectionRecord {
  if (operation.logicalId === undefined || operation.sourceHash === undefined)
    throw new Error(`Cannot create native skill projection record for ${operation.slug}`)
  const target = NATIVE_PROJECT_SKILL_TARGETS.find(item => item.engine === operation.engine)
  if (!target)
    throw new Error(`Unsupported native project skill engine: ${operation.engine}`)

  return {
    actualHash: override.actualHash ?? operation.actualHash,
    deprecatedAt: override.deprecatedAt,
    directory: target.directory,
    engine: operation.engine,
    lastAppliedHash: override.lastAppliedHash ?? operation.lastAppliedHash,
    logicalId: operation.logicalId,
    removedAt: override.removedAt,
    slug: operation.slug,
    sourceHash: operation.sourceHash,
    sourceKind: operation.sourceKind ?? 'builtin',
    ...(operation.sourcePath ? { sourcePath: operation.sourcePath } : {}),
    ...(operation.sourceVersion ? { sourceVersion: operation.sourceVersion } : {}),
    status: override.status,
    targetPath: override.targetPath ?? relativeNativeSkillProjectionTargetPath(projectRoot, operation.targetPath),
    updatedAt: override.updatedAt,
  }
}

function operationFromRecord(projectRoot: string, record: NativeSkillProjectionRecord): NativeSkillProjectionOperation {
  return {
    actualHash: record.actualHash,
    engine: record.engine,
    lastAppliedHash: record.lastAppliedHash,
    logicalId: record.logicalId,
    slug: record.slug,
    sourceHash: record.sourceHash,
    sourceKind: record.sourceKind,
    sourcePath: record.sourcePath,
    sourceVersion: record.sourceVersion,
    status: record.status,
    targetPath: path.join(projectRoot, ...record.targetPath.split('/')),
    type: recordStatusToOperationType(record.status),
    reason: `manifest status is ${record.status}`,
  }
}

async function readProjectSoulPreset(projectRoot: string): Promise<string | undefined> {
  const policyPath = path.join(projectRoot, '.aiworker', 'policy.json')
  try {
    const policy = JSON.parse(await readFile(policyPath, 'utf8')) as { soul?: { preset?: unknown } }
    return typeof policy.soul?.preset === 'string' ? policy.soul.preset : undefined
  }
  catch {
    return undefined
  }
}

async function readOptionalText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8')
  }
  catch (error) {
    if (isNotFoundError(error))
      return null
    throw error
  }
}

async function readDirOptional(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true })
  }
  catch (error) {
    if (isNotFoundError(error))
      return []
    throw error
  }
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}

function recordKey(record: ProjectionRecordKeyInput): string {
  return nativeSkillProjectionRecordKey(record)
}

function recordStatusToOperationType(status: NativeSkillProjectionStatus): NativeSkillProjectionOperationType {
  if (status === 'active')
    return 'unchanged'
  if (status === 'deprecated')
    return 'deprecate'
  if (status === 'missing')
    return 'missing'
  if (status === 'outdated')
    return 'update'
  return status
}

function compareOperations(left: NativeSkillProjectionOperation, right: NativeSkillProjectionOperation): number {
  return `${left.engine}:${left.logicalId ?? left.slug}:${left.type}`.localeCompare(`${right.engine}:${right.logicalId ?? right.slug}:${right.type}`)
}

function compareRecords(left: NativeSkillProjectionRecord, right: NativeSkillProjectionRecord): number {
  return recordKey(left).localeCompare(recordKey(right))
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT'
}
