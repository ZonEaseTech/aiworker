import { createHash } from 'node:crypto'
import { realpathSync, statSync } from 'node:fs'
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

/**
 * `~/.aiworker/` (user scope) or `<project>/.aiworker/` (project scope) layout
 * owned by aiworker. Project scope keeps Project Brain governance/memory/state
 * under `.aiworker/`; executor-native project skills live in the executor's own
 * project directory.
 *
 * User-scope layout (legacy, multi-worker per host):
 *
 *   <home>/
 *     workers/
 *       <workerId>/
 *         AGENT.md / SOUL.md / USER.md / brain/{MEMORY.md, memories/, skills/}
 *         workspaces/
 *
 * Project-scope layout (PLAN-023, one worker per project):
 *
 *   <project>/.aiworker/
 *     SOUL.md / USER.md / MEMORY.md / ROLLUP.md               # team-shared Project Brain
 *     policy.json / brain-capabilities.json                   # governance + Brain capability drafts
 *     executor-capabilities.json                              # project executor overlay / bootstrap hint
 *     memories/                                               # file-first Brain memory assets
 *     local/                                                  # gitignored
 *       worker.db / identity.json / .env / workspaces/
 */

const DEFAULT_HOME_ENV = 'AIWORKER_HOME'
const DEFAULT_HOME_DIR = '.aiworker'
const PROJECT_LOCAL_DIR = 'local'
export const MANAGED_NATIVE_SKILL_PREFIX = 'aiworker-'
export const NATIVE_SKILL_PROJECTION_MANIFEST = 'native-skill-projections.json'

export const NATIVE_PROJECT_SKILL_TARGETS = [
  {
    directory: '.agents/skills',
    engine: 'codex',
    label: 'Codex project skills',
  },
  {
    directory: '.claude/skills',
    engine: 'claude-code',
    label: 'Claude Code project skills',
  },
] as const

export type NativeProjectSkillEngine = (typeof NATIVE_PROJECT_SKILL_TARGETS)[number]['engine']

export type NativeSkillProjectionSourceKind = 'builtin' | 'admission'

export type NativeSkillProjectionStatus
  = | 'active'
    | 'deprecated'
    | 'drifted'
    | 'missing'
    | 'orphaned'
    | 'outdated'
    | 'removed'

export interface NativeSkillProjectionSeed {
  content: string
  logicalId: string
  sourceKind?: NativeSkillProjectionSourceKind
  sourcePath?: string
  sourceVersion?: string
}

export interface NativeSkillProjectionRecord {
  actualHash?: string
  deprecatedAt?: string
  directory: string
  engine: NativeProjectSkillEngine
  lastAppliedHash?: string
  logicalId: string
  removedAt?: string
  slug: string
  sourceHash: string
  sourceKind: NativeSkillProjectionSourceKind
  sourcePath?: string
  sourceVersion?: string
  status: NativeSkillProjectionStatus
  targetPath: string
  updatedAt: string
}

export interface NativeSkillProjectionManifest {
  projections: NativeSkillProjectionRecord[]
  schemaVersion: 1
  tombstones?: NativeSkillProjectionRecord[]
  updatedAt: string
}

export type AiworkerScope = 'explicit' | 'project' | 'user'

export interface AiworkerScopeResult {
  scope: AiworkerScope
  /** Absolute path to the aiworker home that downstream APIs treat as the root. */
  home: string
  /** Project root (parent of `.aiworker/`) when `scope === 'project'`. */
  projectRoot?: string
  source: 'cli-flag' | 'env' | 'project-detect' | 'user-default'
}

export interface ResolveScopeOptions {
  /** Defaults to `process.cwd()`. */
  cwd?: string
  /** Explicit `--aiworker-home <path>` from a CLI flag. Highest priority. */
  explicitHome?: string
  /** Skip the cwd → up-walk project detection (used for `--global`). */
  disableProjectDetect?: boolean
}

function expandTilde(p: string): string {
  return p.startsWith('~') ? path.join(currentHomeDir(), p.slice(1)) : p
}

function currentHomeDir(): string {
  return process.env.HOME && process.env.HOME.length > 0 ? process.env.HOME : homedir()
}

async function isDir(p: string): Promise<boolean> {
  try {
    const s = await stat(p)
    return s.isDirectory()
  }
  catch {
    return false
  }
}

function isDirSync(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  }
  catch {
    return false
  }
}

function isFileSync(p: string): boolean {
  try {
    return statSync(p).isFile()
  }
  catch {
    return false
  }
}

function realPathOrResolve(p: string): string {
  try {
    return realpathSync(p)
  }
  catch {
    return path.resolve(p)
  }
}

function isSamePath(left: string, right: string): boolean {
  return realPathOrResolve(left) === realPathOrResolve(right)
}

function hasProjectScopeMarkers(projectRoot: string): boolean {
  const aiworkerDir = path.join(projectRoot, DEFAULT_HOME_DIR)
  return isFileSync(path.join(aiworkerDir, 'SOUL.md'))
}

function isUnmarkedHomeAiworkerDir(projectRoot: string): boolean {
  return isSamePath(projectRoot, currentHomeDir()) && !hasProjectScopeMarkers(projectRoot)
}

/**
 * Walk from `cwd` upward looking for the closest ancestor that contains a
 * `.aiworker/` directory. Stops at:
 *   - the filesystem root, OR
 *   - a directory that contains `.git/` but NOT `.aiworker/`
 *     (so detection never crosses git repository boundaries).
 *
 * Returns the matching ancestor (the *project root*), or `null` if none found.
 * Sync intentionally — called from sync code paths (zod default factories).
 */
export function resolveProjectRoot(cwd?: string): string | null {
  let cur = path.resolve(cwd ?? process.cwd())
  // Guard against degenerate inputs.
  if (!cur)
    return null

  while (true) {
    const aiworkerDir = path.join(cur, DEFAULT_HOME_DIR)
    if (isDirSync(aiworkerDir)) {
      if (isUnmarkedHomeAiworkerDir(cur))
        return null
      return cur
    }

    // git boundary: stop if this dir has .git but no .aiworker (already
    // checked above), so we never escape into a parent repo / sibling project.
    const gitDir = path.join(cur, '.git')
    if (isDirSync(gitDir))
      return null

    const parent = path.dirname(cur)
    if (parent === cur)
      return null
    cur = parent
  }
}

/**
 * Resolve the active aiworker scope. Priority (high → low):
 *   1. `opts.explicitHome` (CLI `--aiworker-home <path>`)
 *   2. `process.env.AIWORKER_HOME` (legacy systemd / docker)
 *   3. `resolveProjectRoot(cwd)` non-null
 *   4. `~/.aiworker/` user default
 *
 * Pure function — no caching. Caller (CLI entrypoint) may memoise.
 */
export function resolveAiworkerScope(opts: ResolveScopeOptions = {}): AiworkerScopeResult {
  if (opts.explicitHome && opts.explicitHome.length > 0) {
    return {
      scope: 'explicit',
      home: path.resolve(expandTilde(opts.explicitHome)),
      source: 'cli-flag',
    }
  }

  const envHome = process.env[DEFAULT_HOME_ENV]
  if (envHome && envHome.length > 0) {
    return {
      scope: 'explicit',
      home: path.resolve(expandTilde(envHome)),
      source: 'env',
    }
  }

  if (!opts.disableProjectDetect) {
    const projectRoot = resolveProjectRoot(opts.cwd)
    if (projectRoot) {
      const localHome = path.join(projectRoot, DEFAULT_HOME_DIR, PROJECT_LOCAL_DIR)
      return {
        scope: 'project',
        home: localHome,
        projectRoot,
        source: 'project-detect',
      }
    }
  }

  return {
    scope: 'user',
    home: path.resolve(currentHomeDir(), DEFAULT_HOME_DIR),
    source: 'user-default',
  }
}

/** The aiworker root dir. Equivalent to `resolveAiworkerScope().home`. */
export function resolveAiworkerHome(): string {
  return resolveAiworkerScope().home
}

/**
 * Worker home for the per-worker assets (worker.db is NOT here — it lives at
 * `<AIWORKER_HOME>/worker.db`, see `WORKER_DB_PATH` default in
 * `packages/core/src/config/worker.ts`).
 *
 * Behaviour by scope:
 *   - `explicit` / `user` → `<home>/workers/<workerId>/` (legacy multi-worker)
 *   - `project` → `<projectRoot>/.aiworker/` (one project = one worker; no
 *     `workers/<id>/` sublevel)
 */
export function resolveWorkerHome(workerId: string): string {
  const result = resolveAiworkerScope()
  if (result.scope === 'project' && result.projectRoot) {
    // Project scope: Project Brain docs live in the .aiworker/ directory
    // itself, NOT inside local/. The `home` field points at local/ so
    // worker.db et al are gitignored, but Brain files need the
    // git-tracked parent.
    return path.join(result.projectRoot, DEFAULT_HOME_DIR)
  }
  return path.join(result.home, 'workers', workerId)
}

export function resolveBrainHome(workerId: string): string {
  const result = resolveAiworkerScope()
  if (result.scope === 'project' && result.projectRoot) {
    // Project scope: Brain governance and memories share the project
    // .aiworker/ root. Executor-native project skills are outside .aiworker/.
    return path.join(result.projectRoot, DEFAULT_HOME_DIR)
  }
  return path.join(resolveWorkerHome(workerId), 'brain')
}

export function resolveSkillsDir(workerId: string): string {
  return path.join(resolveBrainHome(workerId), 'skills')
}

export function resolveMemoriesDir(workerId: string): string {
  return path.join(resolveBrainHome(workerId), 'memories')
}

export function resolveMemoryIndexPath(workerId: string): string {
  return path.join(resolveBrainHome(workerId), 'MEMORY.md')
}

export function resolveWorkspacesRoot(workerId: string): string {
  const result = resolveAiworkerScope()
  if (result.scope === 'project' && result.projectRoot) {
    // Workspaces are ephemeral worker state → keep them gitignored under local/.
    return path.join(result.home, 'workspaces')
  }
  return path.join(resolveWorkerHome(workerId), 'workspaces')
}

export function resolveConfigYamlPath(workerId: string): string {
  return path.join(resolveWorkerHome(workerId), 'config.yaml')
}

export function resolveAgentMdPath(workerId: string): string {
  return path.join(resolveWorkerHome(workerId), 'AGENT.md')
}

export function resolveSoulMdPath(workerId: string): string {
  return path.join(resolveWorkerHome(workerId), 'SOUL.md')
}

export function resolveUserMdPath(workerId: string): string {
  return path.join(resolveWorkerHome(workerId), 'USER.md')
}

/** Long-running rollup distilled by the evolution cron job (PLAN-021 Phase E). */
export function resolveRollupMdPath(workerId: string): string {
  return path.join(resolveWorkerHome(workerId), 'ROLLUP.md')
}

/** Project Brain capability manifest. Project scope only. */
export function resolveBrainCapabilitiesPath(workerId: string): string {
  return path.join(resolveWorkerHome(workerId), 'brain-capabilities.json')
}

/** Per-worker MCP server registry (legacy user scope; project scope uses brain-capabilities.json). */
export function resolveMcpJsonPath(workerId: string): string {
  return path.join(resolveWorkerHome(workerId), 'mcp.json')
}

/**
 * Scope manifest path (PLAN-098). Lives at `<project>/.aiworker/scope.json`
 * for project scope; for user / explicit scope returns the resolved location
 * even though the bootstrap may not seed it (doctor reports `missing`).
 */
export function resolveScopeManifestPath(workerId: string): string {
  return path.join(resolveWorkerHome(workerId), 'scope.json')
}

/** Resolve `<project>/.aiworker/scope.json` directly from a project root. */
export function projectScopeManifestPath(projectRoot: string): string {
  return path.join(projectRoot, DEFAULT_HOME_DIR, 'scope.json')
}

async function ensureDir(dir: string, mode?: number): Promise<void> {
  await mkdir(dir, { recursive: true, ...(mode === undefined ? {} : { mode }) })
}

async function seedIfAbsent(filePath: string, content: string): Promise<void> {
  try {
    await access(filePath)
  }
  catch {
    await writeFile(filePath, content, { encoding: 'utf8' })
  }
}

export interface ProjectAiworkerSeed {
  brainCapabilitiesJson?: string
  /**
   * Explicit fallback prompt-skill files under `.aiworker/skills/`. Project
   * init should not use this by default for native-skill executors.
   */
  brainSkillFiles?: Record<string, string>
  executorCapabilitiesJson?: string
  memoryMd?: string
  /** Executor-native project skill seed files, relative to the project root. */
  nativeSkillFiles?: Record<string, string>
  /** AIWorker-managed native skill projections with manifest evidence. */
  nativeSkillProjections?: NativeSkillProjectionSeed[]
  policyJson?: string
  rollupMd?: string
  /**
   * PLAN-098 scope manifest content. Only written when explicitly provided
   * (project init with a Soul selection); user/explicit scope or re-init
   * without --soul leaves this absent.
   */
  scopeJson?: string
  soulMd?: string
  userMd?: string
  /** OD-style worker workbench pack assets, relative to `.aiworker/`. */
  workerPackFiles?: Record<string, string>
}

type RequiredDefaultSeed = Required<Omit<ProjectAiworkerSeed, 'scopeJson'>>

const DEFAULT_PROJECT_AIWORKER_SEED: RequiredDefaultSeed = {
  brainCapabilitiesJson: `${JSON.stringify({
    schemaVersion: 1,
    status: 'draft',
    defaultToolsets: [],
    packs: [],
    mcp: {
      servers: {},
    },
    validation: {
      status: 'pending',
      issues: [],
    },
  }, null, 2)}\n`,
  brainSkillFiles: {},
  nativeSkillFiles: {},
  nativeSkillProjections: [],
  workerPackFiles: {},
  soulMd: `# Voice & style\n\n> Voice / style guide. Influences how the agent phrases responses across channels.\n`,
  userMd: `# User profile\n\n> The agent writes learned facts about the primary user here over time. Edit by hand to bootstrap.\n`,
  memoryMd: `# Long-term memory\n\n> Durable facts, decisions, preferences. Loaded into every session.\n`,
  rollupMd: `# Continuity rollup\n\n> Auto-distilled by the evolution cron job. Recent decisions / todos / context that survive session compaction.\n`,
  policyJson: `${JSON.stringify({
    schemaVersion: 1,
    status: 'draft',
    risk: {
      highRiskRequiresApproval: true,
    },
    outOfScope: {
      default: 'ask-for-operator-direction',
    },
  }, null, 2)}\n`,
  executorCapabilitiesJson: `${JSON.stringify({
    schemaVersion: 1,
    engines: {},
  }, null, 2)}\n`,
}

/**
 * Create the worker's home tree if it does not yet exist. Safe to call on
 * every boot — every step is idempotent and seed files are only written
 * when absent.
 *
 * In **project scope** this becomes a no-op for persona docs (those are
 * created by `ensureProjectAiworker` once via `aiworker init`); only the
 * workspaces root is ensured so the executor can write to it.
 */
export async function ensureWorkerHome(workerId: string): Promise<void> {
  const result = resolveAiworkerScope()
  if (result.scope === 'project') {
    // Persona docs + memories already seeded by ensureProjectAiworker.
    // Executor-native project skills are owned by their native directories.
    // Only ensure ephemeral dirs that the runtime writes to.
    await ensureDir(result.home, 0o700)
    await ensureDir(resolveWorkspacesRoot(workerId))
    return
  }

  const workerHome = resolveWorkerHome(workerId)
  await ensureDir(workerHome)
  await ensureDir(resolveBrainHome(workerId))
  await ensureDir(resolveSkillsDir(workerId))
  await ensureDir(resolveMemoriesDir(workerId))
  await ensureDir(resolveWorkspacesRoot(workerId))

  await seedIfAbsent(
    resolveAgentMdPath(workerId),
    `# Agent ${workerId}\n\n> Draft persona document. Describe the role, responsibilities, and tone that this agent should adopt. The orchestrator may inject this file into the system prompt.\n`,
  )
  await seedIfAbsent(
    resolveSoulMdPath(workerId),
    `# Voice of ${workerId}\n\n> Draft voice / style guide. Influences how the agent phrases responses across channels.\n`,
  )
  await seedIfAbsent(
    resolveUserMdPath(workerId),
    `# User profile (maintained by ${workerId})\n\n> The agent writes learned facts about the primary user here over time. Edit by hand to bootstrap.\n`,
  )
  await seedIfAbsent(
    resolveMemoryIndexPath(workerId),
    `# Memory index\n\n> One line per memory: \`- [Title](filename.md) — short description.\`\n`,
  )
}

/**
 * Materialise `<projectRoot>/.aiworker/` with the project-scope template:
 *   - Project Brain docs (SOUL.md / USER.md / MEMORY.md / ROLLUP.md)
 *   - governance/capability drafts (policy.json / brain-capabilities.json)
 *   - executor-capabilities.json placeholder for project executor overlay / hint
 *   - memories/ dir
 *   - executor-native project skill files when seed.nativeSkillFiles is set
 *   - local/ (chmod 0700) with `* + !.gitignore` to silently ignore everything
 *   - .aiworker/.gitignore that ignores `local/`
 *
 * Idempotent: existing files are not overwritten.
 */
export async function ensureProjectAiworker(projectRoot: string, seed: ProjectAiworkerSeed = {}): Promise<void> {
  const root = path.resolve(projectRoot)
  const aiworker = path.join(root, DEFAULT_HOME_DIR)
  const localDir = path.join(aiworker, PROJECT_LOCAL_DIR)
  const mergedSeed = { ...DEFAULT_PROJECT_AIWORKER_SEED, ...seed }

  await ensureDir(aiworker)
  await ensureDir(path.join(aiworker, 'memories'))
  await ensureDir(localDir, 0o700)
  await ensureDir(path.join(localDir, 'workspaces'))

  await seedIfAbsent(
    path.join(aiworker, 'SOUL.md'),
    mergedSeed.soulMd,
  )
  await seedIfAbsent(
    path.join(aiworker, 'USER.md'),
    mergedSeed.userMd,
  )
  await seedIfAbsent(
    path.join(aiworker, 'MEMORY.md'),
    mergedSeed.memoryMd,
  )
  await seedIfAbsent(
    path.join(aiworker, 'ROLLUP.md'),
    mergedSeed.rollupMd,
  )
  await seedIfAbsent(
    path.join(aiworker, 'policy.json'),
    mergedSeed.policyJson,
  )
  await seedIfAbsent(
    path.join(aiworker, 'brain-capabilities.json'),
    mergedSeed.brainCapabilitiesJson,
  )
  await seedIfAbsent(
    path.join(aiworker, 'executor-capabilities.json'),
    mergedSeed.executorCapabilitiesJson,
  )
  if (mergedSeed.scopeJson !== undefined) {
    await seedIfAbsent(
      path.join(aiworker, 'scope.json'),
      mergedSeed.scopeJson,
    )
  }
  for (const [relativePath, content] of Object.entries(mergedSeed.nativeSkillFiles ?? {})) {
    const target = resolveProjectNativeSkillSeedPath(root, relativePath)
    await ensureDir(path.dirname(target))
    await seedIfAbsent(target, content)
  }
  if ((mergedSeed.nativeSkillProjections ?? []).length > 0)
    await materializeNativeSkillProjectionSeeds(root, mergedSeed.nativeSkillProjections ?? [])
  for (const [relativePath, content] of Object.entries(mergedSeed.workerPackFiles ?? {})) {
    const target = resolveProjectWorkerPackSeedPath(aiworker, relativePath)
    await ensureDir(path.dirname(target))
    await seedIfAbsent(target, content)
  }
  for (const [relativePath, content] of Object.entries(mergedSeed.brainSkillFiles ?? {})) {
    const target = resolveProjectBrainSkillSeedPath(aiworker, relativePath)
    await ensureDir(path.dirname(target))
    await seedIfAbsent(target, content)
  }
  await seedIfAbsent(
    path.join(aiworker, '.gitignore'),
    `${PROJECT_LOCAL_DIR}/\n`,
  )
  await seedIfAbsent(
    path.join(localDir, '.gitignore'),
    `*\n!.gitignore\n`,
  )
}

function resolveProjectBrainSkillSeedPath(aiworkerRoot: string, relativePath: string): string {
  const normalized = normalizeSkillSeedRelativePath(relativePath)
  if (!isSafeSkillSeedRelativePath(normalized))
    throw new Error(`Invalid Project Brain skill seed path: ${relativePath}`)

  return path.join(aiworkerRoot, 'skills', ...normalized.split('/'))
}

function resolveProjectWorkerPackSeedPath(aiworkerRoot: string, relativePath: string): string {
  const normalized = normalizeSkillSeedRelativePath(relativePath)
  const parts = normalized.split('/')
  const packId = parts[1]
  const validSkill = parts.length === 3 && parts[0] === 'worker-packs' && parts[2] === 'SKILL.md'
  const validDomain = parts.length === 3 && parts[0] === 'domain-systems' && parts[2] === 'DOMAIN.md'
  if (!isSafeProjectRelativePath(normalized) || !(validSkill || validDomain) || !isSafeWorkerPackId(packId))
    throw new Error(`Invalid worker pack seed path: ${relativePath}`)

  return path.join(aiworkerRoot, ...parts)
}

export function resolveProjectNativeSkillsDir(projectRoot: string, engine: NativeProjectSkillEngine): string {
  const target = NATIVE_PROJECT_SKILL_TARGETS.find(item => item.engine === engine)
  if (!target)
    throw new Error(`Unsupported native project skill engine: ${engine}`)
  return path.join(path.resolve(projectRoot), ...target.directory.split('/'))
}

export function resolveProjectNativeSkillPath(projectRoot: string, engine: NativeProjectSkillEngine, skillId: string): string {
  const slug = nativeProjectSkillSlug(skillId)
  if (!isManagedNativeSkillSlug(slug))
    throw new Error(`Invalid native project skill id: ${skillId}`)
  return path.join(resolveProjectNativeSkillsDir(projectRoot, engine), slug, 'SKILL.md')
}

export function resolveAllProjectNativeSkillPaths(projectRoot: string, skillId: string): Array<{ engine: NativeProjectSkillEngine, path: string }> {
  return NATIVE_PROJECT_SKILL_TARGETS.map(target => ({
    engine: target.engine,
    path: resolveProjectNativeSkillPath(projectRoot, target.engine, skillId),
  }))
}

export function buildNativeProjectSkillSeedFiles(skillFiles: Record<string, string>): Record<string, string> {
  const nativeFiles: Record<string, string> = {}
  for (const [relativePath, content] of Object.entries(skillFiles)) {
    const normalized = normalizeSkillSeedRelativePath(relativePath)
    if (!isSafeSkillSeedRelativePath(normalized))
      throw new Error(`Invalid native project skill seed path: ${relativePath}`)
    const logicalId = nativeSkillLogicalIdFromSeedPath(normalized)
    const slug = nativeProjectSkillSlug(logicalId)
    for (const target of NATIVE_PROJECT_SKILL_TARGETS)
      nativeFiles[`${target.directory}/${slug}/SKILL.md`] = content
  }
  return nativeFiles
}

export function resolveProjectNativeSkillSeedPath(projectRoot: string, relativePath: string): string {
  const normalized = normalizeSkillSeedRelativePath(relativePath)
  if (
    !isSafeProjectRelativePath(normalized)
    || !normalized.endsWith('/SKILL.md')
    || !NATIVE_PROJECT_SKILL_TARGETS.some(target => normalized.startsWith(`${target.directory}/`))
    || !isManagedNativeSkillSlug(path.posix.basename(path.posix.dirname(normalized)))
  ) {
    throw new Error(`Invalid native project skill seed path: ${relativePath}`)
  }
  return path.join(path.resolve(projectRoot), ...normalized.split('/'))
}

export function nativeProjectSkillSlug(logicalId: string): string {
  const body = logicalId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (body.length === 0)
    throw new Error(`Invalid native project skill id: ${logicalId}`)
  return `${MANAGED_NATIVE_SKILL_PREFIX}${body}`
}

export function isManagedNativeSkillSlug(slug: string): boolean {
  return slug.startsWith(MANAGED_NATIVE_SKILL_PREFIX) && slug.length > MANAGED_NATIVE_SKILL_PREFIX.length
}

export function resolveNativeSkillProjectionManifestPath(projectRoot: string): string {
  return path.join(path.resolve(projectRoot), DEFAULT_HOME_DIR, NATIVE_SKILL_PROJECTION_MANIFEST)
}

export function hashNativeSkillContent(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

export async function readNativeSkillProjectionManifest(projectRoot: string): Promise<NativeSkillProjectionManifest | null> {
  const manifestPath = resolveNativeSkillProjectionManifestPath(projectRoot)
  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf8')
  }
  catch (error) {
    if (isNotFoundError(error))
      return null
    throw error
  }

  const parsed = JSON.parse(raw) as Partial<NativeSkillProjectionManifest>
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.projections))
    throw new Error(`Invalid native skill projection manifest: ${manifestPath}`)

  return {
    projections: parsed.projections,
    schemaVersion: 1,
    tombstones: Array.isArray(parsed.tombstones) ? parsed.tombstones : [],
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
  }
}

export async function writeNativeSkillProjectionManifest(projectRoot: string, manifest: NativeSkillProjectionManifest): Promise<void> {
  const manifestPath = resolveNativeSkillProjectionManifestPath(projectRoot)
  await ensureDir(path.dirname(manifestPath))
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

export function relativeNativeSkillProjectionTargetPath(projectRoot: string, targetPath: string): string {
  return path.relative(path.resolve(projectRoot), targetPath).replace(/\\/g, '/')
}

export function buildNativeSkillProjectionRecord(
  projectRoot: string,
  engine: NativeProjectSkillEngine,
  seed: NativeSkillProjectionSeed,
  status: NativeSkillProjectionStatus,
  updatedAt: string,
  actualHash?: string,
): NativeSkillProjectionRecord {
  const target = NATIVE_PROJECT_SKILL_TARGETS.find(item => item.engine === engine)
  if (!target)
    throw new Error(`Unsupported native project skill engine: ${engine}`)

  const sourceHash = hashNativeSkillContent(seed.content)
  return {
    actualHash,
    directory: target.directory,
    engine,
    lastAppliedHash: actualHash === sourceHash ? sourceHash : undefined,
    logicalId: seed.logicalId,
    slug: nativeProjectSkillSlug(seed.logicalId),
    sourceHash,
    sourceKind: seed.sourceKind ?? 'builtin',
    ...(seed.sourcePath ? { sourcePath: seed.sourcePath } : {}),
    ...(seed.sourceVersion ? { sourceVersion: seed.sourceVersion } : {}),
    status,
    targetPath: relativeNativeSkillProjectionTargetPath(projectRoot, resolveProjectNativeSkillPath(projectRoot, engine, seed.logicalId)),
    updatedAt,
  }
}

async function materializeNativeSkillProjectionSeeds(projectRoot: string, seeds: NativeSkillProjectionSeed[]): Promise<void> {
  const existingManifest = await readNativeSkillProjectionManifest(projectRoot)
  const updatedAt = new Date().toISOString()
  const nextRecords = new Map<string, NativeSkillProjectionRecord>()

  for (const record of existingManifest?.projections ?? [])
    nextRecords.set(nativeSkillProjectionRecordKey(record), record)

  for (const seed of seeds) {
    for (const target of NATIVE_PROJECT_SKILL_TARGETS) {
      const targetPath = resolveProjectNativeSkillPath(projectRoot, target.engine, seed.logicalId)
      await ensureDir(path.dirname(targetPath))
      await seedIfAbsent(targetPath, seed.content)
      const actual = await readFile(targetPath, 'utf8')
      const actualHash = hashNativeSkillContent(actual)
      const sourceHash = hashNativeSkillContent(seed.content)
      const previous = nextRecords.get(nativeSkillProjectionRecordKey({ engine: target.engine, logicalId: seed.logicalId }))
      const status: NativeSkillProjectionStatus = actualHash === sourceHash ? 'active' : 'drifted'
      nextRecords.set(
        nativeSkillProjectionRecordKey({ engine: target.engine, logicalId: seed.logicalId }),
        {
          ...buildNativeSkillProjectionRecord(projectRoot, target.engine, seed, status, updatedAt, actualHash),
          lastAppliedHash: actualHash === sourceHash ? sourceHash : previous?.lastAppliedHash,
        },
      )
    }
  }

  await writeNativeSkillProjectionManifest(projectRoot, {
    projections: [...nextRecords.values()].sort(compareNativeSkillProjectionRecords),
    schemaVersion: 1,
    tombstones: existingManifest?.tombstones ?? [],
    updatedAt,
  })
}

function nativeSkillLogicalIdFromSeedPath(relativePath: string): string {
  const parts = normalizeSkillSeedRelativePath(relativePath).split('/')
  if (parts.length < 2 || parts.at(-1) !== 'SKILL.md')
    throw new Error(`Invalid native project skill seed path: ${relativePath}`)
  return parts.slice(0, -1).join('/')
}

export function nativeSkillProjectionRecordKey(record: Pick<NativeSkillProjectionRecord, 'engine' | 'logicalId'>): string {
  return `${record.engine}:${record.logicalId}`
}

function compareNativeSkillProjectionRecords(left: NativeSkillProjectionRecord, right: NativeSkillProjectionRecord): number {
  return nativeSkillProjectionRecordKey(left).localeCompare(nativeSkillProjectionRecordKey(right))
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT'
}

function normalizeSkillSeedRelativePath(relativePath: string): string {
  return path.posix.normalize(relativePath.replace(/\\/g, '/'))
}

function isSafeSkillSeedRelativePath(relativePath: string): boolean {
  return isSafeProjectRelativePath(relativePath) && relativePath.endsWith('/SKILL.md')
}

function isSafeProjectRelativePath(relativePath: string): boolean {
  return !(
    relativePath.startsWith('../')
    || relativePath === '..'
    || relativePath.startsWith('/')
    || relativePath.includes('\0')
  )
}

function isSafeWorkerPackId(id: string | undefined): boolean {
  return typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id)
}

/** Test-only helper. */
export async function projectAiworkerExists(projectRoot: string): Promise<boolean> {
  return isDir(path.join(projectRoot, DEFAULT_HOME_DIR))
}
