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

export interface EngineAssetProjectionInput {
  appId: string
  engineAssets?: SoulAppEngineAssets
  engineTarget?: SoulAppEngineTarget | null
  now: string
  sourceRoot: string
  variables: Record<string, string>
  workspaceRoot: string
}

export async function projectEngineAssetsToWorkspace(input: EngineAssetProjectionInput): Promise<SoulAppProjectionReceipt> {
  const sourceRoot = path.resolve(input.sourceRoot)
  const workspaceRoot = path.resolve(input.workspaceRoot)
  const generatedAt = input.now
  const projections: SoulAppProjectionReceiptEntry[] = []

  await mkdir(path.join(workspaceRoot, '.aiworker'), { recursive: true })
  projections.push(...await projectWorkspaceFiles({ ...input, generatedAt, sourceRoot, workspaceRoot }))
  projections.push(...await projectNativeSkills({ ...input, generatedAt, sourceRoot, workspaceRoot }))
  projections.push(...await projectMcpClients({ ...input, generatedAt, sourceRoot, workspaceRoot }))

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

async function projectWorkspaceFiles(input: EngineAssetProjectionInput & { generatedAt: string, sourceRoot: string, workspaceRoot: string }): Promise<SoulAppProjectionReceiptEntry[]> {
  const root = path.join(input.sourceRoot, 'engine-assets', 'workspace')
  const files = await listFiles(root)
  const entries: SoulAppProjectionReceiptEntry[] = []
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/')
    const source = path.posix.join('engine-assets', 'workspace', relative)
    const content = renderTemplate(await readFile(file, 'utf8'), input.variables)
    const written = await writeProjectedFile(input.workspaceRoot, relative, content, {
      preserveExisting: PRESERVE_EXISTING_WORKSPACE_TARGETS.has(relative),
    })
    if (!written)
      continue
    entries.push(receiptEntry(input, 'workspace-file', source, relative, content))
  }
  return entries
}

async function projectNativeSkills(input: EngineAssetProjectionInput & { generatedAt: string, sourceRoot: string, workspaceRoot: string }): Promise<SoulAppProjectionReceiptEntry[]> {
  const root = path.join(input.sourceRoot, 'engine-assets', 'skills')
  const skillDirs = await readdirOrEmpty(root)
  const entries: SoulAppProjectionReceiptEntry[] = []
  const configuredTargets = new Set<SoulAppEngineTarget>(input.engineAssets?.skills?.targets ?? ['codex', 'claude-code'])
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
  return entries
}

async function projectMcpClients(input: EngineAssetProjectionInput & { generatedAt: string, sourceRoot: string, workspaceRoot: string }): Promise<SoulAppProjectionReceiptEntry[]> {
  if (!input.engineTarget)
    return []

  const clients = (input.engineAssets?.mcpClients ?? []).filter(client => client.target === input.engineTarget)
  const adapter = mcpClientAdapter(input.engineTarget)
  const entries: SoulAppProjectionReceiptEntry[] = []

  for (const client of clients) {
    const sourceDir = appLocalSourcePath(client.source)
    const source = path.posix.join(sourceDir, adapter.sourceFile)
    const file = path.join(input.sourceRoot, ...source.split('/'))
    if (!await isFile(file))
      throw new Error(`MCP client config not found for ${input.engineTarget}: ${source}`)

    const content = await readFile(file, 'utf8')
    assertNoLiteralMcpSecrets(content, source)
    await writeProjectedFile(input.workspaceRoot, adapter.targetPath, content)
    entries.push(receiptEntry(input, 'mcp-client', source, adapter.targetPath, content, input.engineTarget))
  }

  return entries
}

function mcpClientAdapter(engineTarget: SoulAppEngineTarget): { sourceFile: string, targetPath: string } {
  if (engineTarget === 'codex')
    return { sourceFile: 'config.toml', targetPath: path.posix.join('.codex', 'config.toml') }
  return { sourceFile: '.mcp.json', targetPath: '.mcp.json' }
}

function appLocalSourcePath(source: string): string {
  return source.replace(/^\.\//, '').split('/').filter(Boolean).join('/')
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
