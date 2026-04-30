import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'

import { buildSafeGitEnv } from './safe-env'

/**
 * Per-conversation workspace lifecycle. Every agentic-CLI executor runs inside
 * either the project root (project-scope default) or an isolated directory
 * under `WORKER_DATA_ROOT/workspaces/<conversationId>/`. When
 * `WORKER_WORKSPACE_GIT_ORIGIN` is set the isolated workspace is provisioned
 * as a `git worktree add`; otherwise it is a plain empty dir.
 */

export interface WorkspaceHandle {
  conversationId: string
  /** Absolute path that the CLI should be invoked with as `cwd`. */
  path: string
  /** `true` when this dir is backed by a git worktree. */
  isGitWorktree: boolean
  /** `true` when `path` is the shared project root and must not be removed. */
  isSharedProjectRoot?: boolean
}

export interface WorkspaceManagerOptions {
  /**
   * Absolute root; workspace directories live under `<root>/workspaces/`.
   * Any attempt to resolve outside this root is rejected. Typically the
   * `WORKER_DATA_ROOT` env value.
   */
  root: string
  /**
   * Optional git repo URL or path. When set, `createWorkspace` runs
   * `git worktree add` inside this repo to provision each directory.
   */
  gitOrigin?: string
  /**
   * Override the workspace dir name when the caller wants to nest under a
   * custom sub-root (e.g. for tests). Defaults to `workspaces`.
   */
  subdir?: string
  /**
   * Project-scope default cwd. When set, every conversation runs in this root
   * so engine-native project files such as AGENTS.md / CLAUDE.md remain visible.
   */
  projectRoot?: string
}

const CONVERSATION_ID_PATTERN = /^[\w-]{1,128}$/

/**
 * Validate a conversationId and resolve its canonical workspace path,
 * rejecting anything that escapes the root. Exposed so the orchestrator /
 * tests can call the guard independently.
 */
export function resolveWorkspacePath(root: string, subdir: string, conversationId: string): string {
  assertConversationId(conversationId)

  const absoluteRoot = path.resolve(root)
  const parent = path.resolve(absoluteRoot, subdir)
  if (!isInside(absoluteRoot, parent))
    throw new WorkspaceEscapeError(`workspace subdir "${subdir}" escapes root`)

  const target = path.resolve(parent, conversationId)
  if (!isInside(parent, target))
    throw new WorkspaceEscapeError(`workspace "${conversationId}" escapes parent`)

  return target
}

function assertConversationId(conversationId: string): void {
  if (!CONVERSATION_ID_PATTERN.test(conversationId))
    throw new WorkspaceEscapeError(`invalid conversation id: ${conversationId}`)
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export class WorkspaceEscapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceEscapeError'
  }
}

export class WorkspaceManager {
  private readonly root: string
  private readonly subdir: string
  private readonly gitOrigin: string | undefined
  private readonly projectRoot: string | undefined
  /** Serializes create/dispose per conversation so concurrent ingests don't race. */
  private readonly inflight = new Map<string, Promise<WorkspaceHandle>>()

  constructor(options: WorkspaceManagerOptions) {
    this.root = path.resolve(options.root)
    this.subdir = options.subdir ?? 'workspaces'
    this.gitOrigin = options.gitOrigin
    this.projectRoot = options.projectRoot === undefined ? undefined : path.resolve(options.projectRoot)
  }

  /**
   * Idempotent: if the workspace already exists on disk, return the handle
   * without recreating it. Concurrent calls for the same conversationId
   * deduplicate via `inflight`.
   */
  async createWorkspace(conversationId: string): Promise<WorkspaceHandle> {
    if (this.projectRoot) {
      assertConversationId(conversationId)
      return {
        conversationId,
        path: this.projectRoot,
        isGitWorktree: false,
        isSharedProjectRoot: true,
      }
    }

    const existing = this.inflight.get(conversationId)
    if (existing)
      return existing

    const promise = this.provision(conversationId)
      .finally(() => this.inflight.delete(conversationId))
    this.inflight.set(conversationId, promise)
    return promise
  }

  private async provision(conversationId: string): Promise<WorkspaceHandle> {
    const target = resolveWorkspacePath(this.root, this.subdir, conversationId)

    if (await exists(target)) {
      // Trust existing dir; we don't re-clone or re-worktree it.
      const isGit = await exists(path.join(target, '.git'))
      return { conversationId, path: target, isGitWorktree: isGit }
    }

    await fs.mkdir(path.dirname(target), { recursive: true })

    if (this.gitOrigin) {
      await this.addGitWorktree(this.gitOrigin, target)
      return { conversationId, path: target, isGitWorktree: true }
    }

    await fs.mkdir(target, { recursive: true })
    return { conversationId, path: target, isGitWorktree: false }
  }

  /**
   * Remove a conversation's workspace. Path-escape guard runs first; if the
   * resolved path lives outside the root it throws before touching disk.
   * Silent on ENOENT (already disposed). When `isGitWorktree` we try
   * `git worktree remove --force` first and fall back to `rm -rf` if the
   * worktree metadata is gone.
   */
  async disposeWorkspace(conversationId: string): Promise<void> {
    if (this.projectRoot) {
      assertConversationId(conversationId)
      return
    }

    const target = resolveWorkspacePath(this.root, this.subdir, conversationId)
    if (!(await exists(target)))
      return

    if (this.gitOrigin) {
      const ok = await this.removeGitWorktree(this.gitOrigin, target)
      if (ok)
        return
    }

    await fs.rm(target, { recursive: true, force: true })
  }

  /**
   * Purge every workspace. Used during integration tests; production code
   * shouldn't call this — it's a sledgehammer.
   */
  async purgeAll(): Promise<void> {
    if (this.projectRoot)
      return

    const parent = path.resolve(this.root, this.subdir)
    if (!(await exists(parent)))
      return
    const entries = await fs.readdir(parent)
    await Promise.all(entries.map(async (name) => {
      if (!CONVERSATION_ID_PATTERN.test(name))
        return
      await this.disposeWorkspace(name).catch(() => undefined)
    }))
  }

  private async addGitWorktree(repoPath: string, target: string): Promise<void> {
    const result = await runGit(['worktree', 'add', '--detach', target], repoPath)
    if (result.code !== 0) {
      // Fall back to a plain dir so the executor can still start; bubble up
      // enough detail for the operator to fix the repo config.
      await fs.mkdir(target, { recursive: true })
      throw new Error(`git worktree add failed (code=${result.code}): ${result.stderr.trim()}`)
    }
  }

  private async removeGitWorktree(repoPath: string, target: string): Promise<boolean> {
    const result = await runGit(['worktree', 'remove', '--force', target], repoPath)
    return result.code === 0
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  }
  catch {
    return false
  }
}

interface GitResult {
  code: number | null
  stdout: string
  stderr: string
}

async function runGit(args: string[], cwd: string): Promise<GitResult> {
  const child = spawn('git', args, {
    cwd,
    env: buildSafeGitEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  child.stdout.on('data', (d: Buffer) => stdoutChunks.push(d))
  child.stderr.on('data', (d: Buffer) => stderrChunks.push(d))
  const [code] = await once(child, 'exit') as [number | null]
  return {
    code,
    stdout: Buffer.concat(stdoutChunks).toString('utf8'),
    stderr: Buffer.concat(stderrChunks).toString('utf8'),
  }
}
