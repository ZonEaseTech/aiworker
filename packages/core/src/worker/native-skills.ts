import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const SKILL_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SKILL_FILE = 'SKILL.md'
const PROJECTION_MANIFEST = path.posix.join('.aiworker', 'native-skill-projections.json')

export interface NativeSkillSource {
  appId: string
  sourceRoot: string
}

export interface NativeSkillProjection {
  projectionId: string
  sha256: string
  skillId: string
  source: string
  targets: string[]
}

export interface NativeSkillProjectionManifest {
  appId: string
  generatedAt: string
  skills: NativeSkillProjection[]
  sourceRoot: string
}

interface NativeSkillFile {
  content: string
  skillId: string
  sourcePath: string
}

export async function projectNativeSkillsToWorkspace(input: {
  appId: string
  now: string
  sourceRoot: string
  workspaceRoot: string
}): Promise<NativeSkillProjectionManifest> {
  const sourceRoot = path.resolve(input.sourceRoot)
  const workspaceRoot = path.resolve(input.workspaceRoot)
  const skills = await discoverNativeSkillFiles(sourceRoot)
  const projections: NativeSkillProjection[] = []

  await mkdir(path.join(workspaceRoot, '.aiworker'), { recursive: true })

  for (const skill of skills) {
    const projectionId = `${input.appId}-${skill.skillId}`
    const targets = [
      path.posix.join('.agents', 'skills', projectionId, SKILL_FILE),
      path.posix.join('.claude', 'skills', projectionId, SKILL_FILE),
    ]

    for (const target of targets) {
      const targetPath = path.join(workspaceRoot, ...target.split('/'))
      await mkdir(path.dirname(targetPath), { recursive: true })
      await writeFile(targetPath, skill.content, 'utf8')
    }

    projections.push({
      projectionId,
      sha256: createHash('sha256').update(skill.content).digest('hex'),
      skillId: skill.skillId,
      source: path.relative(sourceRoot, skill.sourcePath).split(path.sep).join('/'),
      targets,
    })
  }

  const manifest: NativeSkillProjectionManifest = {
    appId: input.appId,
    generatedAt: input.now,
    skills: projections,
    sourceRoot,
  }
  await writeFile(path.join(workspaceRoot, ...PROJECTION_MANIFEST.split('/')), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

export function nativeSkillProjectionManifestPath(): string {
  return PROJECTION_MANIFEST
}

async function discoverNativeSkillFiles(sourceRoot: string): Promise<NativeSkillFile[]> {
  const skillsRoot = path.join(sourceRoot, 'skills')
  const entries = await readdirOrEmpty(skillsRoot)
  const skills: NativeSkillFile[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || !SKILL_ID_RE.test(entry.name))
      continue
    const sourcePath = path.join(skillsRoot, entry.name, SKILL_FILE)
    if (!await isFile(sourcePath))
      continue
    skills.push({
      content: await readFile(sourcePath, 'utf8'),
      skillId: entry.name,
      sourcePath,
    })
  }

  return skills.sort((left, right) => left.skillId.localeCompare(right.skillId))
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
