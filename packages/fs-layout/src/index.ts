import { access, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

/**
 * `~/.aiworker/` layout owned by aiworker. Mirrors the Hermes / OpenClaw
 * convention (per-agent home directory with brain/memory/skills + persona
 * documents) but under an aiworker-owned root so we don't fight a neighbour
 * project's conventions.
 *
 * Layout:
 *
 *   <home>/
 *     workers/
 *       <workerId>/
 *         AGENT.md          # persona / role document
 *         SOUL.md           # voice + style guide
 *         USER.md           # user profile the agent maintains
 *         config.yaml       # redacted worker config mirror (advisory)
 *         brain/
 *           MEMORY.md       # human-readable memory index
 *           memories/*.md   # individual memory notes
 *           skills/<n>/SKILL.md  # agentskills.io skills
 *         worker.db         # SQLite: identity + FTS index + runtime state
 *         worker.db-wal
 *         worker.db-shm
 *         workspaces/       # per-conversation ephemeral workspaces
 *         logs/             # consola spool (future)
 */

const DEFAULT_HOME_ENV = 'AIWORKER_HOME'
const DEFAULT_HOME_DIR = '.aiworker'

function expandTilde(p: string): string {
  return p.startsWith('~') ? path.join(homedir(), p.slice(1)) : p
}

/** The aiworker root dir. `AIWORKER_HOME` env override, else `~/.aiworker`. */
export function resolveAiworkerHome(): string {
  const raw = process.env[DEFAULT_HOME_ENV]
  if (raw && raw.length > 0)
    return path.resolve(expandTilde(raw))
  return path.resolve(homedir(), DEFAULT_HOME_DIR)
}

export function resolveWorkerHome(workerId: string): string {
  return path.join(resolveAiworkerHome(), 'workers', workerId)
}

export function resolveBrainHome(workerId: string): string {
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

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

async function seedIfAbsent(filePath: string, content: string): Promise<void> {
  try {
    await access(filePath)
  }
  catch {
    await writeFile(filePath, content, { encoding: 'utf8' })
  }
}

/**
 * Create the worker's home tree if it does not yet exist. Safe to call on
 * every boot — every step is idempotent and seed files are only written
 * when absent.
 */
export async function ensureWorkerHome(workerId: string): Promise<void> {
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
