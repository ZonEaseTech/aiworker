import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'

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
  const projectedFiles: ProjectionReceiptFile[] = []

  if (assets.workspaceAssets?.source) {
    projectedFiles.push(...await projectWorkspaceAssets({
      descriptorRoot,
      source: assets.workspaceAssets.source,
      target: input.target,
      workspaceRoot,
    }))
  }

  if (assets.skills?.source) {
    projectedFiles.push(...await projectSkills({
      appId: descriptorAppId(input.descriptor),
      descriptorRoot,
      source: assets.skills.source,
      target: input.target,
      workspaceRoot,
    }))
  }

  const nativeMcpFile = assets.mcp?.targets?.[input.target]?.file
  if (nativeMcpFile) {
    projectedFiles.push(await projectNativeMcpFile({
      descriptorRoot,
      file: nativeMcpFile,
      target: input.target,
      workspaceRoot,
    }))
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
  workspaceRoot: string
}): Promise<ProjectionReceiptFile[]> {
  const sourceRoot = path.join(input.descriptorRoot, ...safeRelativeSegments(input.source))
  const files = await listFiles(sourceRoot)
  const projected: ProjectionReceiptFile[] = []

  for (const file of files) {
    const relativePath = toPortablePath(path.relative(sourceRoot, file))
    const targetPath = relativePath
    await copyProjectedFile(file, input.workspaceRoot, targetPath)
    projected.push(await receiptFile({
      kind: 'workspace-asset',
      sourceFile: file,
      sourceRef: `descriptor://engine/workspaceAssets/${relativePath}`,
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
  workspaceRoot: string
}): Promise<ProjectionReceiptFile[]> {
  const skillsRoot = path.join(input.descriptorRoot, ...safeRelativeSegments(input.source))
  const skillDirs = await readdirOrEmpty(skillsRoot)
  const projected: ProjectionReceiptFile[] = []

  for (const entry of skillDirs) {
    if (!entry.isDirectory())
      continue

    const skillId = entry.name
    const sourceFile = path.join(skillsRoot, skillId, 'SKILL.md')
    if (!await isFile(sourceFile))
      continue

    const targetPath = skillTargetPath(input.appId, skillId, input.target)
    await copyProjectedFile(sourceFile, input.workspaceRoot, targetPath)
    projected.push(await receiptFile({
      kind: 'skill',
      sourceFile,
      sourceRef: `descriptor://engine/skills/${skillId}`,
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
  workspaceRoot: string
}): Promise<ProjectionReceiptFile> {
  const sourceFile = path.join(input.descriptorRoot, ...safeRelativeSegments(input.file))
  const targetPath = input.target === 'codex' ? '.codex/config.toml' : '.mcp.json'

  await copyProjectedFile(sourceFile, input.workspaceRoot, targetPath)

  return await receiptFile({
    kind: 'native-mcp-file',
    sourceFile,
    sourceRef: `descriptor://engine/mcp/${input.target}`,
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
  const target = path.resolve(workspaceRoot, ...safeRelativeSegments(targetPath))
  const root = path.resolve(workspaceRoot)
  if (target !== root && !target.startsWith(`${root}${path.sep}`))
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
