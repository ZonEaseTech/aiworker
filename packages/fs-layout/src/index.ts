import { realpathSync, statSync } from 'node:fs'
import { access, mkdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

/**
 * `~/.aiworker/` (user scope) or `<project>/.aiworker/` (project scope) layout
 * owned by aiworker. Mirrors the Hermes / OpenClaw convention (per-agent home
 * directory with brain/memory/skills + persona documents) but under an
 * aiworker-owned root so we don't fight a neighbour project's conventions.
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
 *     AGENT.md / SOUL.md / USER.md / MEMORY.md / ROLLUP.md   # team-shared persona
 *     policy.json / toolsets.json / capability-packs.json     # brain/runtime drafts
 *     executor-capabilities.json                              # executor-native projection state
 *     skills/  memories/  mcp.json                            # brain/runtime descriptors
 *     local/                                                  # gitignored
 *       worker.db / identity.json / .env / workspaces/
 */

const DEFAULT_HOME_ENV = 'AIWORKER_HOME'
const DEFAULT_HOME_DIR = '.aiworker'
const PROJECT_LOCAL_DIR = 'local'

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
  return isFileSync(path.join(aiworkerDir, 'AGENT.md'))
    && isFileSync(path.join(aiworkerDir, 'SOUL.md'))
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
    // Project scope: persona docs (AGENT.md etc.) live in the .aiworker/
    // directory itself, NOT inside local/. The `home` field points at
    // local/ so worker.db et al are gitignored, but persona docs need the
    // git-tracked parent.
    return path.join(result.projectRoot, DEFAULT_HOME_DIR)
  }
  return path.join(result.home, 'workers', workerId)
}

export function resolveBrainHome(workerId: string): string {
  const result = resolveAiworkerScope()
  if (result.scope === 'project' && result.projectRoot) {
    // Project scope: brain artifacts share the project .aiworker/ root
    // (skills/ and memories/ live at .aiworker/skills, .aiworker/memories).
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

/** Per-worker MCP server registry (PLAN-021 Phase D). Project scope only. */
export function resolveMcpJsonPath(workerId: string): string {
  return path.join(resolveWorkerHome(workerId), 'mcp.json')
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
  agentMd?: string
  capabilityPacksJson?: string
  executorCapabilitiesJson?: string
  mcpJson?: string
  memoryMd?: string
  policyJson?: string
  rollupMd?: string
  soulMd?: string
  toolsetsJson?: string
  userMd?: string
}

const DEFAULT_PROJECT_AIWORKER_SEED: Required<ProjectAiworkerSeed> = {
  agentMd: `# Agent\n\n> Persona / role document for the agent that lives in this project. The orchestrator injects this file into the system prompt.\n`,
  soulMd: `# Voice & style\n\n> Voice / style guide. Influences how the agent phrases responses across channels.\n`,
  userMd: `# User profile\n\n> The agent writes learned facts about the primary user here over time. Edit by hand to bootstrap.\n`,
  memoryMd: `# Long-term memory\n\n> Durable facts, decisions, preferences. Loaded into every session.\n`,
  rollupMd: `# Continuity rollup\n\n> Auto-distilled by the evolution cron job. Recent decisions / todos / context that survive session compaction.\n`,
  mcpJson: `${JSON.stringify({ servers: {} }, null, 2)}\n`,
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
  toolsetsJson: `${JSON.stringify({
    schemaVersion: 1,
    status: 'draft',
    defaultToolsets: [],
    validation: {
      status: 'pending',
      issues: [],
    },
  }, null, 2)}\n`,
  capabilityPacksJson: `${JSON.stringify({
    schemaVersion: 1,
    status: 'draft',
    packs: [],
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
    // Persona docs + skills/memories already seeded by ensureProjectAiworker.
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
 *   - persona docs (AGENT.md / SOUL.md / USER.md / MEMORY.md / ROLLUP.md)
 *   - governance drafts (policy.json / toolsets.json / capability-packs.json)
 *   - executor-capabilities.json placeholder for engine-native projection
 *   - empty skills/ memories/ dirs
 *   - mcp.json placeholder
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
  await ensureDir(path.join(aiworker, 'skills'))
  await ensureDir(path.join(aiworker, 'memories'))
  await ensureDir(localDir, 0o700)
  await ensureDir(path.join(localDir, 'workspaces'))

  await seedIfAbsent(
    path.join(aiworker, 'AGENT.md'),
    mergedSeed.agentMd,
  )
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
    path.join(aiworker, 'mcp.json'),
    mergedSeed.mcpJson,
  )
  await seedIfAbsent(
    path.join(aiworker, 'policy.json'),
    mergedSeed.policyJson,
  )
  await seedIfAbsent(
    path.join(aiworker, 'toolsets.json'),
    mergedSeed.toolsetsJson,
  )
  await seedIfAbsent(
    path.join(aiworker, 'capability-packs.json'),
    mergedSeed.capabilityPacksJson,
  )
  await seedIfAbsent(
    path.join(aiworker, 'executor-capabilities.json'),
    mergedSeed.executorCapabilitiesJson,
  )
  await seedIfAbsent(
    path.join(aiworker, '.gitignore'),
    `${PROJECT_LOCAL_DIR}/\n`,
  )
  await seedIfAbsent(
    path.join(localDir, '.gitignore'),
    `*\n!.gitignore\n`,
  )
}

/** Test-only helper. */
export async function projectAiworkerExists(projectRoot: string): Promise<boolean> {
  return isDir(path.join(projectRoot, DEFAULT_HOME_DIR))
}
