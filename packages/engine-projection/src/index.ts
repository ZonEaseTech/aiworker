import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'

export {
  cleanupWorkspaceProjectionReceipt,
  computeWorkspaceProjectionFreshnessMarker,
  engineAssetProjectionReceiptPath,
  listBaselineAssets,
  projectEngineAssetsToWorkspace,
  resolveSoulAppEngineTarget,
} from './workspace-projection'
export type {
  EngineAssetProjectionInput,
  EngineAssetSource,
  ReservedOverlayProjectionConfig,
  WorkerOverlayProjectionAsset,
  WorkspaceProjectionFreshnessInput,
  WorkspaceProjectionReceiptCleanupInput,
  WorkspaceProjectionReceiptCleanupResult,
} from './workspace-projection'

export type EngineProjectionTarget = 'claude-code' | 'codex'
export type ProjectionStatus = 'projected'

export interface ProjectionReceiptFile {
  checksum: string
  kind: 'native-mcp-file' | 'skill' | 'workspace-asset'
  sourceRef: string
  status: ProjectionStatus
  target: EngineProjectionTarget
  targetPath: string
}

export interface ProjectionReceipt {
  freshnessMarker: string
  projectedFiles: ProjectionReceiptFile[]
}

export interface ProjectEngineAssetsInput {
  descriptor: Record<string, unknown>
  descriptorRoot: string
  target: EngineProjectionTarget
  workerConfig: unknown
  workspaceRoot: string
}

export interface CleanupReceiptInput {
  receipt: ProjectionReceipt
  workspaceRoot: string
}

interface WorkerConfigOverlay {
  enabled: boolean
  kind: string
  options: Record<string, unknown>
  sourceRef: string
  target: string
}

export const engineProjectionPackage = {
  name: '@zonease/aiworker-engine-projection',
  owns: [
    'workspace-assets',
    'skills',
    'native-mcp-files',
    'entry-files',
    'projection-receipts',
    'receipt-cleanup',
  ],
} as const

export async function projectEngineAssets(input: ProjectEngineAssetsInput): Promise<ProjectionReceipt> {
  const descriptorRoot = path.resolve(input.descriptorRoot)
  const workspaceRoot = path.resolve(input.workspaceRoot)
  const assets = descriptorEngineAssets(input.descriptor)
  const workerConfig = workerConfigOverlays(input.workerConfig)
  const projectedFiles: ProjectionReceiptFile[] = []

  if (assets.workspaceAssets?.source) {
    projectedFiles.push(...await projectWorkspaceAssets({
      descriptorRoot,
      source: assets.workspaceAssets.source,
      target: input.target,
      workerConfig,
      workspaceRoot,
    }))
  }

  if (assets.skills?.source) {
    projectedFiles.push(...await projectSkills({
      appId: descriptorAppId(input.descriptor),
      descriptorRoot,
      workerConfig,
      source: assets.skills.source,
      target: input.target,
      workspaceRoot,
    }))
  }

  const nativeMcpFile = assets.mcp?.targets?.[input.target]?.file
  if (nativeMcpFile) {
    const projected = await projectNativeMcpFile({
      descriptorRoot,
      file: nativeMcpFile,
      target: input.target,
      workerConfig,
      workspaceRoot,
    })
    if (projected)
      projectedFiles.push(projected)
  }

  return {
    freshnessMarker: computeProjectionFreshnessMarker({
      descriptor: input.descriptor,
      target: input.target,
      workerConfig: input.workerConfig,
    }),
    projectedFiles,
  }
}

export async function cleanupReceipt(input: CleanupReceiptInput): Promise<void> {
  const workspaceRoot = path.resolve(input.workspaceRoot)
  for (const file of input.receipt.projectedFiles) {
    await rm(projectedPath(workspaceRoot, file.targetPath), { force: true })
  }
}

export function computeProjectionFreshnessMarker(input: {
  descriptor: Record<string, unknown>
  target: EngineProjectionTarget
  workerConfig: unknown
}): string {
  const payload = stableJson({
    engine: descriptorEngineAssets(input.descriptor),
    target: input.target,
    workerConfig: input.workerConfig,
  })

  return `sha256:${createHash('sha256').update(payload).digest('hex')}`
}

async function projectWorkspaceAssets(input: {
  descriptorRoot: string
  source: string
  target: EngineProjectionTarget
  workerConfig: WorkerConfigOverlay[]
  workspaceRoot: string
}): Promise<ProjectionReceiptFile[]> {
  const sourceRoot = path.join(input.descriptorRoot, ...safeRelativeSegments(input.source))
  const files = await listFiles(sourceRoot)
  const projected: ProjectionReceiptFile[] = []
  const overlayOnlySources = overlaySourceRefs(input.workerConfig, 'entry-file-overlay')

  for (const file of files) {
    const relativePath = toPortablePath(path.relative(sourceRoot, file))
    const targetPath = relativePath
    const sourceRef = `descriptor://engine/workspaceAssets/${relativePath}`
    if (overlayOnlySources.has(sourceRef))
      continue

    const overlay = findWorkerConfigOverlay(input.workerConfig, 'entry-file-overlay', sourceRef, input.target)
    if (overlay?.enabled === false)
      continue
    const projectedSourceRef = overlay?.enabled && overlay.sourceRef !== sourceRef ? overlay.sourceRef : sourceRef
    const sourceFile = projectedSourceRef === sourceRef ? file : workspaceAssetSourceFile(sourceRoot, projectedSourceRef)

    await copyProjectedFile(sourceFile, input.workspaceRoot, targetPath)
    projected.push(await receiptFile({
      kind: 'workspace-asset',
      sourceFile,
      sourceRef: projectedSourceRef,
      target: input.target,
      targetPath,
    }))
  }

  for (const overlay of input.workerConfig) {
    if (overlay.kind !== 'entry-file-overlay' || !overlay.enabled || !overlayAppliesToTarget(overlay, input.target) || replacementSourceRef(overlay))
      continue
    const targetPath = entryFileOverlayTargetPath(overlay)
    if (!targetPath)
      continue
    const sourceFile = workspaceAssetSourceFile(sourceRoot, overlay.sourceRef)
    await copyProjectedFile(sourceFile, input.workspaceRoot, targetPath)
    projected.push(await receiptFile({
      kind: 'workspace-asset',
      sourceFile,
      sourceRef: overlay.sourceRef,
      target: input.target,
      targetPath,
    }))
  }

  return projected
}

async function projectSkills(input: {
  appId: string
  descriptorRoot: string
  source: string
  target: EngineProjectionTarget
  workerConfig: WorkerConfigOverlay[]
  workspaceRoot: string
}): Promise<ProjectionReceiptFile[]> {
  const skillsRoot = path.join(input.descriptorRoot, ...safeRelativeSegments(input.source))
  const skillDirs = await readdirOrEmpty(skillsRoot)
  const projected: ProjectionReceiptFile[] = []
  const overlayOnlySources = overlaySourceRefs(input.workerConfig, 'skill-overlay')

  for (const entry of skillDirs) {
    if (!entry.isDirectory())
      continue

    const skillId = entry.name
    const sourceFile = path.join(skillsRoot, skillId, 'SKILL.md')
    if (!await isFile(sourceFile))
      continue

    const sourceRef = `descriptor://engine/skills/${skillId}`
    if (overlayOnlySources.has(sourceRef))
      continue

    const overlay = findWorkerConfigOverlay(input.workerConfig, 'skill-overlay', sourceRef, input.target)
    if (overlay?.enabled === false)
      continue
    const projectedSourceRef = overlay?.enabled && overlay.sourceRef !== sourceRef ? overlay.sourceRef : sourceRef
    const projectedSourceFile = projectedSourceRef === sourceRef ? sourceFile : skillSourceFile(skillsRoot, projectedSourceRef)

    const targetPath = skillTargetPath(input.appId, skillId, input.target)
    await copyProjectedFile(projectedSourceFile, input.workspaceRoot, targetPath)
    projected.push(await receiptFile({
      kind: 'skill',
      sourceFile: projectedSourceFile,
      sourceRef: projectedSourceRef,
      target: input.target,
      targetPath,
    }))
  }

  return projected
}

async function projectNativeMcpFile(input: {
  descriptorRoot: string
  file: string
  target: EngineProjectionTarget
  workerConfig: WorkerConfigOverlay[]
  workspaceRoot: string
}): Promise<ProjectionReceiptFile | null> {
  const sourceFile = path.join(input.descriptorRoot, ...safeRelativeSegments(input.file))
  const targetPath = input.target === 'codex' ? '.codex/config.toml' : '.mcp.json'
  const sourceRef = `descriptor://engine/mcp/${input.target}`
  const overlay = findWorkerConfigOverlay(input.workerConfig, 'mcp-overlay', sourceRef, input.target)
  if (overlay?.enabled === false)
    return null
  const projectedSourceRef = overlay?.enabled && overlay.sourceRef !== sourceRef ? overlay.sourceRef : sourceRef
  const projectedSourceFile = projectedSourceRef === sourceRef ? sourceFile : nativeMcpSourceFile(input.descriptorRoot, projectedSourceRef, input.target)

  await copyProjectedFile(projectedSourceFile, input.workspaceRoot, targetPath)

  return await receiptFile({
    kind: 'native-mcp-file',
    sourceFile: projectedSourceFile,
    sourceRef: projectedSourceRef,
    target: input.target,
    targetPath,
  })
}

async function receiptFile(input: {
  kind: ProjectionReceiptFile['kind']
  sourceFile: string
  sourceRef: string
  target: EngineProjectionTarget
  targetPath: string
}): Promise<ProjectionReceiptFile> {
  return {
    checksum: `sha256:${createHash('sha256').update(await readFile(input.sourceFile)).digest('hex')}`,
    kind: input.kind,
    sourceRef: input.sourceRef,
    status: 'projected',
    target: input.target,
    targetPath: input.targetPath,
  }
}

async function copyProjectedFile(sourceFile: string, workspaceRoot: string, targetPath: string): Promise<void> {
  const target = projectedPath(workspaceRoot, targetPath)
  await mkdir(path.dirname(target), { recursive: true })
  await cp(sourceFile, target, { force: true })
}

function projectedPath(workspaceRoot: string, targetPath: string): string {
  const segments = safeRelativeSegments(targetPath)
  const target = path.resolve(workspaceRoot, ...segments)
  const root = path.resolve(workspaceRoot)
  if (!segments.length || target === root || !target.startsWith(`${root}${path.sep}`))
    throw new Error(`Projection target escapes workspace root: ${targetPath}`)
  return target
}

function descriptorEngineAssets(descriptor: Record<string, unknown>): {
  mcp?: { targets?: Record<string, { file?: string }> }
  skills?: { source?: string }
  workspaceAssets?: { source?: string }
} {
  const engine = readObject(descriptor.engine) ?? {}
  const assets = readObject(engine.assets) ?? engine

  return {
    mcp: readMcpAssets(assets.mcp),
    skills: readSourceAsset(assets.skills),
    workspaceAssets: readSourceAsset(assets.workspaceAssets),
  }
}

function readMcpAssets(value: unknown): { targets?: Record<string, { file?: string }> } | undefined {
  const object = readObject(value)
  const targets = readObject(object?.targets)
  if (!targets)
    return undefined

  return {
    targets: Object.fromEntries(Object.entries(targets).map(([target, entry]) => {
      const file = readObject(entry)?.file
      return [target, typeof file === 'string' ? { file } : {}]
    })),
  }
}

function readSourceAsset(value: unknown): { source?: string } | undefined {
  const source = readObject(value)?.source
  return typeof source === 'string' ? { source } : undefined
}

function workerConfigOverlays(value: unknown): WorkerConfigOverlay[] {
  const values = readObject(value)?.values
  if (!Array.isArray(values))
    return []
  return values.flatMap((item) => {
    const record = readObject(item)
    if (!record || typeof record.kind !== 'string' || typeof record.sourceRef !== 'string')
      return []
    return [{
      enabled: record.enabled !== false,
      kind: record.kind,
      options: readObject(record.options) ?? {},
      sourceRef: record.sourceRef,
      target: typeof record.target === 'string' ? record.target : 'all',
    }]
  })
}

function findWorkerConfigOverlay(
  overlays: WorkerConfigOverlay[],
  kind: string,
  sourceRef: string,
  target: EngineProjectionTarget,
): WorkerConfigOverlay | null {
  return overlays.find(overlay =>
    overlay.kind === kind
    && overlayMatchesSourceRef(overlay, sourceRef)
    && overlayAppliesToTarget(overlay, target),
  ) ?? null
}

function overlayAppliesToTarget(overlay: WorkerConfigOverlay, target: EngineProjectionTarget): boolean {
  return overlay.target === target || overlay.target === 'all'
}

function overlayMatchesSourceRef(overlay: WorkerConfigOverlay, sourceRef: string): boolean {
  return overlay.sourceRef === sourceRef || replacementSourceRef(overlay) === sourceRef
}

function replacementSourceRef(overlay: WorkerConfigOverlay): string | null {
  const replaces = overlay.options.replaces ?? overlay.options.replacesSourceRef
  return typeof replaces === 'string' && replaces.trim().length > 0 ? replaces.trim() : null
}

function overlaySourceRefs(overlays: WorkerConfigOverlay[], kind: string): ReadonlySet<string> {
  return new Set(overlays
    .filter(overlay => overlay.kind === kind && overlay.enabled && (replacementSourceRef(overlay) || entryFileOverlayTargetPath(overlay)) && replacementSourceRef(overlay) !== overlay.sourceRef)
    .map(overlay => overlay.sourceRef))
}

function entryFileOverlayTargetPath(overlay: WorkerConfigOverlay): string | null {
  const targetPath = overlay.options.targetPath
  return typeof targetPath === 'string' && targetPath.trim().length > 0 ? targetPath.trim() : null
}

function workspaceAssetSourceFile(sourceRoot: string, sourceRef: string): string {
  const prefix = 'descriptor://engine/workspaceAssets/'
  if (!sourceRef.startsWith(prefix))
    throw new Error(`Unsupported workspace asset overlay sourceRef: ${sourceRef}`)
  return path.join(sourceRoot, ...safeRelativeSegments(sourceRef.slice(prefix.length)))
}

function skillSourceFile(skillsRoot: string, sourceRef: string): string {
  const prefix = 'descriptor://engine/skills/'
  if (!sourceRef.startsWith(prefix))
    throw new Error(`Unsupported skill overlay sourceRef: ${sourceRef}`)
  const skillId = sourceRef.slice(prefix.length).replace(/\/SKILL\.md$/, '')
  return path.join(skillsRoot, ...safeRelativeSegments(skillId), 'SKILL.md')
}

function nativeMcpSourceFile(descriptorRoot: string, sourceRef: string, target: EngineProjectionTarget): string {
  const prefix = 'descriptor://engine/mcp/'
  if (!sourceRef.startsWith(prefix))
    throw new Error(`Unsupported native MCP overlay sourceRef: ${sourceRef}`)
  const sourceTarget = sourceRef.slice(prefix.length)
  const sourceFile = target === 'codex' ? 'config.toml' : '.mcp.json'
  return path.join(descriptorRoot, 'dist', 'engine-assets', 'mcp', ...safeRelativeSegments(sourceTarget), sourceFile)
}

function descriptorAppId(descriptor: Record<string, unknown>): string {
  const identity = readObject(descriptor.identity)
  const appId = identity?.appId ?? descriptor.id
  return typeof appId === 'string' && appId.length > 0 ? appId : 'soul'
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function skillTargetPath(appId: string, skillId: string, target: EngineProjectionTarget): string {
  const projectedSkillId = `${appId}-${skillId}`
  if (target === 'codex')
    return `.agents/skills/${projectedSkillId}/SKILL.md`
  return `.claude/skills/${projectedSkillId}/SKILL.md`
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

function isNoEntryError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}

function safeRelativeSegments(value: string): string[] {
  const segments = value.split(/[\\/]/).filter(Boolean)
  if (path.isAbsolute(value) || segments.includes('..'))
    throw new Error(`Projection path must be relative: ${value}`)
  return segments
}

function toPortablePath(value: string): string {
  return value.split(path.sep).join('/')
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
