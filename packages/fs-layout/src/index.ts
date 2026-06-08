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
  /** Explicit `--aiworker-home <path>` from a CLI flag. Highest priority. */
  explicitHome?: string
  /** Caller-selected fallback directory name when neither flag nor env exists. */
  defaultHomeDir?: string
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

function defaultHomePath(defaultHomeDir: string): string {
  return path.resolve(currentHomeDir(), expandTilde(defaultHomeDir))
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
    home: defaultHomePath(defaultHomeDir),
    source: 'user-default',
  }
}

export function resolveAiworkerHome(opts: ResolveScopeOptions = {}): string {
  return resolveAiworkerScope(opts).home
}

function assertSafeWorkerId(workerId: string): string {
  // 首字符为 \w,后续仅允许 \w 与 . -;并拒绝空串、含 /、绝对路径、
  // 尾随 . 或 -、连续 ..(避免 Windows 文件系统剥尾点导致目录碰撞)
  if (
    !/^\w[\w.-]*$/.test(workerId)
    || workerId.endsWith('.')
    || workerId.endsWith('-')
    || workerId.includes('..')
  ) {
    throw new Error(`Invalid worker id: ${JSON.stringify(workerId)}`)
  }
  return workerId
}

export function resolveWorkerHome(workerId: string): string {
  return path.join(resolveAiworkerHome(), 'workers', assertSafeWorkerId(workerId))
}

export function resolveWorkspacesRoot(workerId: string): string {
  return path.join(resolveWorkerHome(workerId), 'workspaces')
}

/**
 * Worker-owned overlay content store, sibling of `workspaces/`:
 * `<worker-home>/overlays`. Holds editable skill / mcp / entry-file content
 * referenced by `worker-overlay://<kind>/<path>` sourceRefs in the worker config
 * envelope (the envelope itself stays content-free).
 */
export function resolveWorkerOverlaysRoot(workerId: string): string {
  return path.join(resolveWorkerHome(workerId), 'overlays')
}

export type WorkerOverlayKind = 'skills' | 'mcp' | 'entry-files'

const WORKER_OVERLAY_KINDS = new Set<WorkerOverlayKind>(['skills', 'mcp', 'entry-files'])

function assertSafeOverlayKind(kind: string): WorkerOverlayKind {
  if (!WORKER_OVERLAY_KINDS.has(kind as WorkerOverlayKind))
    throw new Error(`Invalid worker overlay kind: ${JSON.stringify(kind)}`)
  return kind as WorkerOverlayKind
}

function safeOverlaySegments(relativePath: string): string[] {
  const segments = relativePath.split(/[\\/]/).filter(Boolean)
  if (
    segments.length === 0
    || path.isAbsolute(relativePath)
    || segments.some(segment => segment === '.' || segment === '..' || segment.includes('\0'))
  ) {
    throw new Error(`Invalid worker overlay path: ${JSON.stringify(relativePath)}`)
  }
  return segments
}

/**
 * Resolve an absolute file path inside the worker overlay store from a
 * `kind ∈ skills|mcp|entry-files` and a relative content path. Rejects path
 * traversal, absolute paths, and unknown kinds so a `worker-overlay://` sourceRef
 * can never escape `<overlaysRoot>/<kind>/`.
 */
export function resolveWorkerOverlayFile(overlaysRoot: string, kind: string, relativePath: string): string {
  const safeKind = assertSafeOverlayKind(kind)
  return path.join(path.resolve(overlaysRoot), safeKind, ...safeOverlaySegments(relativePath))
}

/**
 * Worker identity, Soul binding, and engine defaults live
 * in `aiworker.db`. Worker init creates only the filesystem root an external
 * engine can actually use: workspaces.
 */
export async function ensureWorkerHome(workerId: string): Promise<void> {
  await mkdir(resolveWorkspacesRoot(workerId), { recursive: true })
}
