import type {
  SoulAppEngineAssets,
  SoulAppEngineTarget,
  SoulAppProjectionReceipt,
  SoulAppProjectionReceiptEntry,
} from '@zonease/aiworker-shared'

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const SKILL_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SKILL_FILE = 'SKILL.md'
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

export interface EngineAssetProjectionInput {
  appId: string
  engineAssets?: SoulAppEngineAssets
  engineTarget?: SoulAppEngineTarget | null
  now: string
  preserveUnownedExistingTargets?: boolean
  sourceRoot: string
  variables: Record<string, string>
  workerOverlayAssets?: WorkerOverlayProjectionAsset[]
  workspaceRoot: string
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
  const root = path.join(input.sourceRoot, 'engine-assets', 'workspace')
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
    const source = path.posix.join('engine-assets', 'workspace', relative)
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
  const root = path.join(input.sourceRoot, 'engine-assets', 'skills')
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
        path.posix.join('engine-assets', 'skills', dirent.name, SKILL_FILE),
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
    assertNoLiteralMcpSecrets(content, source)
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
  return source.replace(/^\.\//, '').split('/').filter(Boolean).join('/')
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
  return value.startsWith('$') || value.startsWith('env:') || value.startsWith('secretRef:')
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
  const targetPath = path.join(root, ...relativePath.split('/'))
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

function isNoEntryError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
