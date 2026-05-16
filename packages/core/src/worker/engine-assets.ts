import type { SoulAppProjectionReceipt, SoulAppProjectionReceiptEntry } from '@zonease/aiworker-shared'

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const SKILL_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SKILL_FILE = 'SKILL.md'
const PROJECTION_RECEIPT = path.posix.join('.aiworker', 'projections.json')

export interface EngineAssetSource {
  appId: string
  sourceRoot: string
}

export interface EngineAssetProjectionInput {
  appId: string
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

async function projectWorkspaceFiles(input: EngineAssetProjectionInput & { generatedAt: string, sourceRoot: string, workspaceRoot: string }): Promise<SoulAppProjectionReceiptEntry[]> {
  const root = path.join(input.sourceRoot, 'engine-assets', 'workspace')
  const files = await listFiles(root)
  const entries: SoulAppProjectionReceiptEntry[] = []
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/')
    const source = path.posix.join('engine-assets', 'workspace', relative)
    const content = renderTemplate(await readFile(file, 'utf8'), input.variables)
    await writeProjectedFile(input.workspaceRoot, relative, content)
    entries.push(receiptEntry(input, 'workspace-file', source, relative, content))
  }
  return entries
}

async function projectNativeSkills(input: EngineAssetProjectionInput & { generatedAt: string, sourceRoot: string, workspaceRoot: string }): Promise<SoulAppProjectionReceiptEntry[]> {
  const root = path.join(input.sourceRoot, 'engine-assets', 'skills')
  const skillDirs = await readdirOrEmpty(root)
  const entries: SoulAppProjectionReceiptEntry[] = []
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
    ]
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

async function writeProjectedFile(root: string, relativePath: string, content: string): Promise<void> {
  const targetPath = path.join(root, ...relativePath.split('/'))
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content, 'utf8')
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
