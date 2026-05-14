import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

/**
 * Host-local AIWorker filesystem contract.
 *
 * AIWorker no longer auto-detects or initializes arbitrary project-scope
 * `.aiworker/` directories. The local daemon owns a single host home and all
 * workers/workspaces are rooted below it.
 */

const DEFAULT_HOME_ENV = 'AIWORKER_HOME'
export const DEFAULT_AIWORKER_HOME_DIR = '.aiworker'

export type AiworkerScope = 'explicit' | 'user'

export interface AiworkerScopeResult {
  scope: AiworkerScope
  /** Absolute path to the host-local AIWorker home. */
  home: string
  source: 'cli-flag' | 'env' | 'user-default'
}

export interface ResolveScopeOptions {
  /** Deprecated compatibility input. CWD never affects scope resolution. */
  cwd?: string
  /** Explicit `--aiworker-home <path>` from a CLI flag. Highest priority. */
  explicitHome?: string
  /** Caller-selected fallback directory name when neither flag nor env exists. */
  defaultHomeDir?: string
  /** Deprecated compatibility input. Project detection is always disabled. */
  disableProjectDetect?: boolean
}

function currentHomeDir(): string {
  return process.env.HOME && process.env.HOME.length > 0 ? process.env.HOME : homedir()
}

function expandTilde(p: string): string {
  return p.startsWith('~') ? path.join(currentHomeDir(), p.slice(1)) : p
}

function hostHomePath(p: string): string {
  return path.resolve(expandTilde(p))
}

/**
 * Project-scope autodetection is removed. The function remains exported so old
 * callers fail closed to host-local behaviour instead of silently binding a
 * daemon to an arbitrary cwd.
 */
export function resolveProjectRoot(_cwd?: string): string | null {
  return null
}

/**
 * Resolve the host-local AIWorker home. Priority:
 * 1. explicit CLI flag
 * 2. `AIWORKER_HOME`
 * 3. `~/.aiworker`
 */
export function resolveAiworkerScope(opts: ResolveScopeOptions = {}): AiworkerScopeResult {
  if (opts.explicitHome && opts.explicitHome.length > 0) {
    return {
      scope: 'explicit',
      home: hostHomePath(opts.explicitHome),
      source: 'cli-flag',
    }
  }

  const envHome = process.env[DEFAULT_HOME_ENV]
  if (envHome && envHome.length > 0) {
    return {
      scope: 'explicit',
      home: hostHomePath(envHome),
      source: 'env',
    }
  }

  const defaultHomeDir = opts.defaultHomeDir && opts.defaultHomeDir.length > 0
    ? opts.defaultHomeDir
    : DEFAULT_AIWORKER_HOME_DIR

  return {
    scope: 'user',
    home: path.resolve(currentHomeDir(), defaultHomeDir),
    source: 'user-default',
  }
}

export function resolveAiworkerHome(opts: ResolveScopeOptions = {}): string {
  return resolveAiworkerScope(opts).home
}

export function resolveWorkerHome(workerId: string): string {
  return path.join(resolveAiworkerHome(), 'workers', workerId)
}

export function resolveWorkspacesRoot(workerId: string): string {
  return path.join(resolveWorkerHome(workerId), 'workspaces')
}

/**
 * Worker identity, Soul binding, enabled capabilities, engine defaults, review
 * policy, and memory namespace live in `aiworker.db`. Worker init creates only
 * the filesystem root an external engine can actually use: workspaces.
 */
export async function ensureWorkerHome(workerId: string): Promise<void> {
  await mkdir(resolveWorkspacesRoot(workerId), { recursive: true })
}
