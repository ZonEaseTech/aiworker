import type {
  LocalWorkerOverlayAsset,
  SoulAppEngineAssets,
  SoulAppEngineTarget,
  SoulAppProjectionReceipt,
  SoulAppProjectionReceiptEntry,
} from '@zonease/aiworker-soul-descriptor'

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const SKILL_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SKILL_FILE = 'SKILL.md'
const DEFAULT_SKILL_ASSET_SOURCE = 'engine-assets/skills'
const DEFAULT_WORKSPACE_ASSET_SOURCE = 'engine-assets/workspace'
const PROJECTION_RECEIPT = path.posix.join('.aiworker', 'projections.json')
const PRESERVE_EXISTING_WORKSPACE_TARGETS = new Set(['README.md'])
const MCP_SECRET_ASSIGNMENT_RE = /["']?([\w-]*(?:api[_-]?key|authorization|password|secret|token)[\w-]*)["']?\s*[:=]\s*["']([^"'\n]+)["']/gi
const MCP_SECRET_VALUE_RE = /Bearer\s+[\w.~+/-]{12,}|sk-[\w-]{8,}/i

export interface EngineAssetSource {
  appId: string
  engineAssets?: SoulAppEngineAssets
  sourceRoot: string
}

export interface WorkerOverlayProjectionAsset {
  content: string
  enabled: boolean
  id: string
  kind: 'entry-file' | 'mcp-client' | 'skill'
  target: string
}

/**
 * A worker config value that participates in the projection freshness marker
 * but produces no projected file — the v1-reserved `projection-overlay` kind
 * per docs/protocol.md. It moves the marker (marking the workspace stale) yet
 * applies no projected-file change.
 */
export interface ReservedOverlayProjectionConfig {
  checksum?: string | null
  enabled: boolean
  kind: string
  options?: Record<string, unknown>
  sourceRef?: string | null
  target: string
}

export interface EngineAssetProjectionInput {
  appId: string
  engineAssets?: SoulAppEngineAssets
  engineTarget?: SoulAppEngineTarget | null
  now: string
  preserveUnownedExistingTargets?: boolean
  reservedOverlayConfigs?: ReservedOverlayProjectionConfig[]
  sourceRoot: string
  variables: Record<string, string>
  workerOverlayAssets?: WorkerOverlayProjectionAsset[]
  workspaceRoot: string
}

export interface WorkspaceProjectionFreshnessInput {
  appId: string
  engineAssets?: SoulAppEngineAssets
  engineTarget?: SoulAppEngineTarget | null
  reservedOverlayConfigs?: ReservedOverlayProjectionConfig[]
  sourceRoot: string
  variables: Record<string, string>
  workerOverlayAssets?: WorkerOverlayProjectionAsset[]
}

export interface WorkspaceProjectionReceiptCleanupInput {
  receipt: SoulAppProjectionReceipt
  workspaceRoot: string
}

export interface WorkspaceProjectionReceiptCleanupResult {
  cleanedTargets: string[]
}

type EngineAssetProjectionContext = EngineAssetProjectionInput & {
  generatedAt: string
  previousProjectionTargets: ReadonlySet<string> | null
  sourceRoot: string
  workspaceRoot: string
}

export async function projectEngineAssetsToWorkspace(input: EngineAssetProjectionInput): Promise<SoulAppProjectionReceipt> {
  const sourceRoot = path.resolve(input.sourceRoot)
  const workspaceRoot = path.resolve(input.workspaceRoot)
  const generatedAt = input.now
  const previousProjectionTargets = input.preserveUnownedExistingTargets
    ? await readPreviousProjectionTargets(workspaceRoot)
    : null
  const projections: SoulAppProjectionReceiptEntry[] = []

  await mkdir(path.join(workspaceRoot, '.aiworker'), { recursive: true })
  const context = { ...input, generatedAt, previousProjectionTargets, sourceRoot, workspaceRoot }
  projections.push(...await projectWorkspaceFiles(context))
  projections.push(...await projectNativeSkills(context))
  projections.push(...await projectMcpClients(context))

  const receipt: SoulAppProjectionReceipt = {
    appId: input.appId,
    freshnessMarker: await computeWorkspaceProjectionFreshnessMarker({
      appId: input.appId,
      engineAssets: input.engineAssets,
      engineTarget: input.engineTarget,
      reservedOverlayConfigs: input.reservedOverlayConfigs,
      sourceRoot,
      variables: input.variables,
      workerOverlayAssets: input.workerOverlayAssets,
    }),
    generatedAt,
    projections,
    version: 1,
  }
  await writeFile(path.join(workspaceRoot, ...PROJECTION_RECEIPT.split('/')), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  return receipt
}

export function engineAssetProjectionReceiptPath(): string {
  return PROJECTION_RECEIPT
}

export async function computeWorkspaceProjectionFreshnessMarker(input: WorkspaceProjectionFreshnessInput): Promise<string> {
  const sourceRoot = path.resolve(input.sourceRoot)
  const reservedOverlayConfigs = input.reservedOverlayConfigs ?? []
  const payload = stableJson({
    appId: input.appId,
    baselineAssets: await baselineAssetFingerprints({
      engineAssets: input.engineAssets,
      engineTarget: input.engineTarget ?? null,
      sourceRoot,
      variables: input.variables,
    }),
    engineAssets: engineAssetsFingerprint(input.engineAssets),
    engineTarget: input.engineTarget ?? null,
    // Reserved overlays (e.g. the v1-reserved projection-overlay) move the
    // freshness marker yet are never projected. Omitted entirely when empty so
    // normal workers keep their previous marker and never reproject spuriously.
    ...(reservedOverlayConfigs.length > 0
      ? { reservedOverlayConfigs: reservedOverlayConfigFingerprints(reservedOverlayConfigs) }
      : {}),
    variables: variableFingerprints(input.variables),
    workerOverlayAssets: workerOverlayAssetFingerprints(input.workerOverlayAssets ?? [], input.variables),
  })
  return contentChecksum(payload)
}

export async function cleanupWorkspaceProjectionReceipt(input: WorkspaceProjectionReceiptCleanupInput): Promise<WorkspaceProjectionReceiptCleanupResult> {
  const workspaceRoot = path.resolve(input.workspaceRoot)
  const cleanedTargets: string[] = []
  for (const projection of input.receipt.projections) {
    await rm(workspaceProjectionTargetPath(workspaceRoot, projection.target), { force: true })
    cleanedTargets.push(projection.target)
  }
  return { cleanedTargets }
}

export function resolveSoulAppEngineTarget(engineId?: string | null): SoulAppEngineTarget | null {
  if (!engineId)
    return null
  if (engineId === 'codex' || engineId.startsWith('codex/'))
    return 'codex'
  if (engineId === 'claude-code' || engineId.startsWith('claude-code/'))
    return 'claude-code'
  return null
}

async function projectWorkspaceFiles(input: EngineAssetProjectionContext): Promise<SoulAppProjectionReceiptEntry[]> {
  const sourceDir = appLocalSourcePath(input.engineAssets?.workspace?.source ?? DEFAULT_WORKSPACE_ASSET_SOURCE)
  const root = path.join(input.sourceRoot, ...sourceDir.split('/'))
  const files = await listFiles(root)
  const entries: SoulAppProjectionReceiptEntry[] = []
  const baselineTargets = new Set<string>()
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/')
    baselineTargets.add(relative)
    const overlay = findOverlay(input.workerOverlayAssets, 'entry-file', relative)
    if (overlay) {
      if (overlay.enabled) {
        const content = renderTemplate(overlay.content, input.variables)
        const written = await writeProjectedFile(input.workspaceRoot, relative, content, preserveUnownedExistingTarget(input, relative))
        if (written)
          entries.push(receiptEntry(input, 'workspace-file', 'worker-overlay', relative, content))
      }
      continue
    }
    const source = path.posix.join(sourceDir, relative)
    const content = renderTemplate(await readFile(file, 'utf8'), input.variables)
    const written = await writeProjectedFile(input.workspaceRoot, relative, content, {
      preserveExisting: PRESERVE_EXISTING_WORKSPACE_TARGETS.has(relative),
    })
    if (!written)
      continue
    entries.push(receiptEntry(input, 'workspace-file', source, relative, content))
  }
  for (const asset of input.workerOverlayAssets ?? []) {
    if (asset.kind !== 'entry-file' || !asset.enabled || baselineTargets.has(asset.id))
      continue
    const target = projectableRelativeTarget(asset.id)
    const content = renderTemplate(asset.content, input.variables)
    const written = await writeProjectedFile(input.workspaceRoot, target, content, preserveUnownedExistingTarget(input, target))
    if (written)
      entries.push(receiptEntry(input, 'workspace-file', 'worker-overlay', target, content))
  }
  return entries
}

async function projectNativeSkills(input: EngineAssetProjectionContext): Promise<SoulAppProjectionReceiptEntry[]> {
  const sourceDir = appLocalSourcePath(input.engineAssets?.skills?.source ?? DEFAULT_SKILL_ASSET_SOURCE)
  const root = path.join(input.sourceRoot, ...sourceDir.split('/'))
  const skillDirs = await readdirOrEmpty(root)
  const entries: SoulAppProjectionReceiptEntry[] = []
  const configuredTargets = new Set<SoulAppEngineTarget>(input.engineAssets?.skills?.targets ?? ['codex', 'claude-code'])
  const baselineKeys = new Set<string>()
  for (const dirent of skillDirs) {
    if (!dirent.isDirectory() || !SKILL_ID_RE.test(dirent.name))
      continue
    const file = path.join(root, dirent.name, SKILL_FILE)
    if (!await isFile(file))
      continue

    const content = await readFile(file, 'utf8')
    const projectionId = `${input.appId}-${dirent.name}`
    const targets = [
      { engineTarget: 'codex' as const, path: path.posix.join('.agents', 'skills', projectionId, SKILL_FILE) },
      { engineTarget: 'claude-code' as const, path: path.posix.join('.claude', 'skills', projectionId, SKILL_FILE) },
    ].filter(target => configuredTargets.has(target.engineTarget))
    for (const target of targets) {
      baselineKeys.add(overlayKey('skill', dirent.name, target.engineTarget))
      const overlay = findOverlay(input.workerOverlayAssets, 'skill', dirent.name, target.engineTarget)
      if (overlay) {
        if (overlay.enabled) {
          await writeProjectedFile(input.workspaceRoot, target.path, overlay.content)
          entries.push(receiptEntry(
            input,
            'native-skill',
            'worker-overlay',
            target.path,
            overlay.content,
            target.engineTarget,
          ))
        }
        continue
      }
      await writeProjectedFile(input.workspaceRoot, target.path, content)
      entries.push(receiptEntry(
        input,
        'native-skill',
        path.posix.join(sourceDir, dirent.name, SKILL_FILE),
        target.path,
        content,
        target.engineTarget,
      ))
    }
  }
  for (const asset of input.workerOverlayAssets ?? []) {
    if (asset.kind !== 'skill' || !asset.enabled || !isSoulAppEngineTarget(asset.target))
      continue
    if (!configuredTargets.has(asset.target) || baselineKeys.has(overlayKey('skill', asset.id, asset.target)))
      continue
    const targetPath = skillProjectionPath(input.appId, asset.id, asset.target)
    await writeProjectedFile(input.workspaceRoot, targetPath, asset.content)
    entries.push(receiptEntry(input, 'native-skill', 'worker-overlay', targetPath, asset.content, asset.target))
  }
  return entries
}

async function projectMcpClients(input: EngineAssetProjectionContext): Promise<SoulAppProjectionReceiptEntry[]> {
  if (!input.engineTarget)
    return []

  const clients = (input.engineAssets?.mcpClients ?? []).filter(client => client.target === input.engineTarget)
  const adapter = mcpClientAdapter(input.engineTarget)
  const entries: SoulAppProjectionReceiptEntry[] = []

  for (const client of clients) {
    const overlay = findMcpOverlay(input.workerOverlayAssets, input.engineTarget)
    if (overlay) {
      if (overlay.enabled) {
        assertNoLiteralMcpSecrets(overlay.content, 'worker-overlay')
        const written = await writeProjectedFile(input.workspaceRoot, adapter.targetPath, overlay.content, preserveUnownedExistingTarget(input, adapter.targetPath))
        if (written)
          entries.push(receiptEntry(input, 'mcp-client', 'worker-overlay', adapter.targetPath, overlay.content, input.engineTarget))
      }
      continue
    }

    const sourceDir = appLocalSourcePath(client.source)
    const source = path.posix.join(sourceDir, adapter.sourceFile)
    const file = path.join(input.sourceRoot, ...source.split('/'))
    if (!await isFile(file))
      throw new Error(`MCP client config not found for ${input.engineTarget}: ${source}`)

    const content = await readFile(file, 'utf8')
    const written = await writeProjectedFile(input.workspaceRoot, adapter.targetPath, content, preserveUnownedExistingTarget(input, adapter.targetPath))
    if (written)
      entries.push(receiptEntry(input, 'mcp-client', source, adapter.targetPath, content, input.engineTarget))
  }

  const overlay = findMcpOverlay(input.workerOverlayAssets, input.engineTarget)
  if (overlay?.enabled && clients.length === 0) {
    assertNoLiteralMcpSecrets(overlay.content, 'worker-overlay')
    const written = await writeProjectedFile(input.workspaceRoot, adapter.targetPath, overlay.content, preserveUnownedExistingTarget(input, adapter.targetPath))
    if (written)
      entries.push(receiptEntry(input, 'mcp-client', 'worker-overlay', adapter.targetPath, overlay.content, input.engineTarget))
  }

  return entries
}

async function baselineAssetFingerprints(input: {
  engineAssets?: SoulAppEngineAssets
  engineTarget: SoulAppEngineTarget | null
  sourceRoot: string
  variables: Record<string, string>
}): Promise<Array<Record<string, unknown>>> {
  const fingerprints: Array<Record<string, unknown>> = []

  const workspaceSource = appLocalSourcePath(input.engineAssets?.workspace?.source ?? DEFAULT_WORKSPACE_ASSET_SOURCE)
  const workspaceRoot = path.join(input.sourceRoot, ...workspaceSource.split('/'))
  for (const file of await listFiles(workspaceRoot)) {
    const relative = path.relative(workspaceRoot, file).split(path.sep).join('/')
    const content = renderTemplate(await readFile(file, 'utf8'), input.variables)
    fingerprints.push({
      kind: 'workspace-file',
      sha256: contentChecksum(content),
      source: path.posix.join(workspaceSource, relative),
    })
  }

  const skillsSource = appLocalSourcePath(input.engineAssets?.skills?.source ?? DEFAULT_SKILL_ASSET_SOURCE)
  const skillsRoot = path.join(input.sourceRoot, ...skillsSource.split('/'))
  const configuredTargets = configuredSkillTargets(input.engineAssets)
  for (const dirent of await readdirOrEmpty(skillsRoot)) {
    if (!dirent.isDirectory() || !SKILL_ID_RE.test(dirent.name))
      continue
    const file = path.join(skillsRoot, dirent.name, SKILL_FILE)
    if (!await isFile(file))
      continue
    const content = await readFile(file, 'utf8')
    for (const target of configuredTargets) {
      fingerprints.push({
        engineTarget: target,
        kind: 'native-skill',
        sha256: contentChecksum(content),
        source: path.posix.join(skillsSource, dirent.name, SKILL_FILE),
      })
    }
  }

  if (input.engineTarget) {
    const clients = (input.engineAssets?.mcpClients ?? [])
      .filter(client => client.target === input.engineTarget)
      .sort((left, right) => left.source.localeCompare(right.source))
    for (const client of clients) {
      const adapter = mcpClientAdapter(input.engineTarget)
      const sourceDir = appLocalSourcePath(client.source)
      const source = path.posix.join(sourceDir, adapter.sourceFile)
      const file = path.join(input.sourceRoot, ...source.split('/'))
      fingerprints.push({
        engineTarget: input.engineTarget,
        kind: 'mcp-client',
        sha256: await sourceFileChecksum(file),
        source,
      })
    }
  }

  return fingerprints.sort((left, right) => stableJson(left).localeCompare(stableJson(right)))
}

async function sourceFileChecksum(file: string): Promise<string | null> {
  try {
    return contentChecksum(await readFile(file, 'utf8'))
  }
  catch (error) {
    if (isNoEntryError(error))
      return null
    throw error
  }
}

function engineAssetsFingerprint(engineAssets: SoulAppEngineAssets | undefined): Record<string, unknown> {
  return {
    mcpClients: (engineAssets?.mcpClients ?? [])
      .map(client => ({
        source: appLocalSourcePath(client.source),
        target: client.target,
      }))
      .sort((left, right) => `${left.target}:${left.source}`.localeCompare(`${right.target}:${right.source}`)),
    skills: {
      source: appLocalSourcePath(engineAssets?.skills?.source ?? DEFAULT_SKILL_ASSET_SOURCE),
      targets: configuredSkillTargets(engineAssets),
    },
    workspace: {
      source: appLocalSourcePath(engineAssets?.workspace?.source ?? DEFAULT_WORKSPACE_ASSET_SOURCE),
    },
  }
}

function configuredSkillTargets(engineAssets: SoulAppEngineAssets | undefined): SoulAppEngineTarget[] {
  return [...(engineAssets?.skills?.targets ?? ['codex', 'claude-code'])]
    .sort((left, right) => left.localeCompare(right))
}

function workerOverlayAssetFingerprints(assets: WorkerOverlayProjectionAsset[], variables: Record<string, string>): Array<Record<string, unknown>> {
  return assets
    .map(asset => ({
      contentSha256: asset.enabled
        ? contentChecksum(asset.kind === 'entry-file' ? renderTemplate(asset.content, variables) : asset.content)
        : null,
      enabled: asset.enabled,
      id: asset.id,
      kind: asset.kind,
      target: asset.target,
    }))
    .sort((left, right) => `${left.kind}:${left.target}:${left.id}`.localeCompare(`${right.kind}:${right.target}:${right.id}`))
}

function reservedOverlayConfigFingerprints(configs: ReservedOverlayProjectionConfig[]): Array<Record<string, unknown>> {
  return [...configs]
    .sort((left, right) => reservedOverlayConfigKey(left).localeCompare(reservedOverlayConfigKey(right)))
    .map(config => ({
      checksum: config.checksum ?? null,
      enabled: config.enabled,
      kind: config.kind,
      options: config.options ?? {},
      sourceRef: config.sourceRef ?? null,
      target: config.target,
    }))
}

function reservedOverlayConfigKey(config: ReservedOverlayProjectionConfig): string {
  return `${config.kind}:${config.target}:${config.sourceRef ?? ''}:${config.checksum ?? ''}`
}

function variableFingerprints(variables: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(variables)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, contentChecksum(value)]))
}

async function readPreviousProjectionTargets(workspaceRoot: string): Promise<ReadonlySet<string>> {
  try {
    const raw = await readFile(path.join(workspaceRoot, ...PROJECTION_RECEIPT.split('/')), 'utf8')
    const receipt = JSON.parse(raw) as { projections?: Array<{ target?: unknown }> }
    return new Set((receipt.projections ?? []).map(item => item.target).filter((target): target is string => typeof target === 'string' && target.length > 0))
  }
  catch (error) {
    if (isNoEntryError(error) || error instanceof SyntaxError)
      return new Set()
    throw error
  }
}

function preserveUnownedExistingTarget(input: EngineAssetProjectionContext, target: string): { preserveExisting?: boolean } {
  if (!input.preserveUnownedExistingTargets || input.previousProjectionTargets?.has(target) || isAiworkerOwnedTarget(input.appId, target))
    return {}
  return { preserveExisting: true }
}

function isAiworkerOwnedTarget(appId: string, target: string): boolean {
  return target.startsWith(`.agents/skills/${appId}-`) || target.startsWith(`.claude/skills/${appId}-`) || target.startsWith('.aiworker/')
}

function mcpClientAdapter(engineTarget: SoulAppEngineTarget): { sourceFile: string, targetPath: string } {
  if (engineTarget === 'codex')
    return { sourceFile: 'config.toml', targetPath: path.posix.join('.codex', 'config.toml') }
  return { sourceFile: '.mcp.json', targetPath: '.mcp.json' }
}

function appLocalSourcePath(source: string): string {
  const normalized = source.replace(/^\.\//, '').trim()
  const segments = normalized.split(/[\\/]/).filter(Boolean)
  if (!segments.length || path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized) || segments.includes('..'))
    throw new Error(`Engine asset source must be relative: ${source}`)
  return segments.join('/')
}

function findOverlay(
  assets: WorkerOverlayProjectionAsset[] | undefined,
  kind: WorkerOverlayProjectionAsset['kind'],
  id: string,
  target?: string,
): WorkerOverlayProjectionAsset | null {
  return assets?.find(asset => asset.kind === kind && asset.id === id && (!target || asset.target === target)) ?? null
}

function overlayKey(kind: WorkerOverlayProjectionAsset['kind'], id: string, target: string): string {
  return `${kind}:${target}:${id}`
}

function findMcpOverlay(assets: WorkerOverlayProjectionAsset[] | undefined, engineTarget: SoulAppEngineTarget): WorkerOverlayProjectionAsset | null {
  return assets?.find(asset => asset.kind === 'mcp-client' && asset.target === engineTarget) ?? null
}

function skillProjectionPath(appId: string, skillId: string, engineTarget: SoulAppEngineTarget): string {
  const projectionId = `${appId}-${skillId}`
  if (engineTarget === 'codex')
    return path.posix.join('.agents', 'skills', projectionId, SKILL_FILE)
  return path.posix.join('.claude', 'skills', projectionId, SKILL_FILE)
}

function isSoulAppEngineTarget(value: string): value is SoulAppEngineTarget {
  return value === 'codex' || value === 'claude-code'
}

function projectableRelativeTarget(target: string): string {
  const normalized = target.split('/').filter(Boolean).join('/')
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..'))
    throw new Error(`Worker overlay target must be a relative workspace path: ${target}`)
  return normalized
}

function workspaceProjectionTargetPath(workspaceRoot: string, targetPath: string): string {
  const segments = targetPath.split('/').filter(Boolean)
  const target = path.resolve(workspaceRoot, ...segments)
  const root = path.resolve(workspaceRoot)
  if (!segments.length || path.posix.isAbsolute(targetPath) || segments.includes('..') || target === root || !target.startsWith(`${root}${path.sep}`))
    throw new Error(`Projection target escapes workspace root: ${targetPath}`)
  return target
}

function assertNoLiteralMcpSecrets(content: string, source: string): void {
  if (hasLiteralSecretAssignment(content) || MCP_SECRET_VALUE_RE.test(content))
    throw new Error(`MCP client config must not contain literal secrets: ${source}`)
}

function hasLiteralSecretAssignment(content: string): boolean {
  for (const match of content.matchAll(MCP_SECRET_ASSIGNMENT_RE)) {
    const value = match[2]?.trim() ?? ''
    if (!isSecretReferenceValue(value))
      return true
  }
  return false
}

function isSecretReferenceValue(value: string): boolean {
  return value.startsWith('$') || value.startsWith('env:') || value.startsWith('secretref:')
}

function receiptEntry(
  input: { appId: string, generatedAt: string },
  kind: SoulAppProjectionReceiptEntry['kind'],
  source: string,
  target: string,
  content: string,
  engineTarget?: SoulAppProjectionReceiptEntry['engineTarget'],
): SoulAppProjectionReceiptEntry {
  return {
    appId: input.appId,
    generatedAt: input.generatedAt,
    kind,
    sha256: createHash('sha256').update(content).digest('hex'),
    source,
    target,
    ...(engineTarget ? { engineTarget } : {}),
  }
}

function renderTemplate(content: string, variables: Record<string, string>): string {
  return content.replace(/\{\{([a-z][a-z0-9]*)\}\}/gi, (_, key: string) => variables[key] ?? '')
}

async function writeProjectedFile(root: string, relativePath: string, content: string, options: { preserveExisting?: boolean } = {}): Promise<boolean> {
  const targetPath = workspaceProjectionTargetPath(root, relativePath)
  if (options.preserveExisting && await isFile(targetPath))
    return false
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content, 'utf8')
  return true
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdirOrEmpty(root)
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath))
      continue
    }
    if (entry.isFile())
      files.push(fullPath)
  }
  return files.sort((left, right) => left.localeCompare(right))
}

async function readdirOrEmpty(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true })
  }
  catch (error) {
    if (isNoEntryError(error))
      return []
    throw error
  }
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  }
  catch (error) {
    if (isNoEntryError(error))
      return false
    throw error
  }
}

export async function listBaselineAssets(source: EngineAssetSource): Promise<LocalWorkerOverlayAsset[]> {
  const sourceRoot = path.resolve(source.sourceRoot)
  const assets: LocalWorkerOverlayAsset[] = []
  const now = new Date().toISOString()

  const workspaceSource = appLocalSourcePath(source.engineAssets?.workspace?.source ?? DEFAULT_WORKSPACE_ASSET_SOURCE)
  const workspaceRoot = path.join(sourceRoot, ...workspaceSource.split('/'))
  for (const file of await listFiles(workspaceRoot)) {
    const id = path.relative(workspaceRoot, file).split(path.sep).join('/')
    const content = await readFile(file, 'utf8')
    assets.push({
      checksum: contentChecksum(content),
      enabled: true,
      id,
      kind: 'entry-file',
      metadataJson: {},
      optionsJson: {},
      source: 'baseline',
      sourceRef: path.posix.join(workspaceSource, id),
      target: 'workspace',
      updatedAt: now,
    })
  }

  const skillsSource = appLocalSourcePath(source.engineAssets?.skills?.source ?? DEFAULT_SKILL_ASSET_SOURCE)
  const skillsRoot = path.join(sourceRoot, ...skillsSource.split('/'))
  for (const dirent of await readdirOrEmpty(skillsRoot)) {
    if (!dirent.isDirectory() || !SKILL_ID_RE.test(dirent.name))
      continue
    const file = path.join(skillsRoot, dirent.name, SKILL_FILE)
    if (!await isFile(file))
      continue
    const configuredTargets = source.engineAssets?.skills?.targets ?? ['codex', 'claude-code'] as SoulAppEngineTarget[]
    const content = await readFile(file, 'utf8')
    for (const target of configuredTargets) {
      assets.push({
        checksum: contentChecksum(content),
        enabled: true,
        id: dirent.name,
        kind: 'skill',
        metadataJson: {},
        optionsJson: {},
        source: 'baseline',
        sourceRef: path.posix.join(skillsSource, dirent.name, SKILL_FILE),
        target,
        updatedAt: now,
      })
    }
  }

  const configuredMcpClients = source.engineAssets?.mcpClients ?? []
  for (const client of configuredMcpClients) {
    const adapter = mcpClientAdapter(client.target)
    const sourceDir = appLocalSourcePath(client.source)
    const relativePath = path.posix.join(sourceDir, adapter.sourceFile)
    const file = path.join(sourceRoot, ...relativePath.split('/'))
    if (!await isFile(file))
      continue
    const content = await readFile(file, 'utf8')
    assets.push({
      checksum: contentChecksum(content),
      enabled: true,
      id: client.target,
      kind: 'mcp-client',
      metadataJson: {},
      optionsJson: {},
      source: 'baseline',
      sourceRef: relativePath,
      target: client.target,
      updatedAt: now,
    })
  }

  return assets
}

function contentChecksum(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function stableJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(item => stableJson(item)).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function isNoEntryError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
