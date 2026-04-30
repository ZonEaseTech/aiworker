import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  resolveWorkspacePath,
  WorkspaceEscapeError,
  WorkspaceManager,
} from './workspace'

describe('resolveWorkspacePath', () => {
  const root = '/var/aiworker'

  it('resolves a legal conversationId under the default subdir', () => {
    expect(resolveWorkspacePath(root, 'workspaces', 'abc-123'))
      .toBe('/var/aiworker/workspaces/abc-123')
  })

  it('rejects path-escape via "..": dot-dot', () => {
    expect(() => resolveWorkspacePath(root, 'workspaces', '../etc'))
      .toThrow(WorkspaceEscapeError)
  })

  it('rejects path-escape via "/"', () => {
    expect(() => resolveWorkspacePath(root, 'workspaces', 'a/b'))
      .toThrow(WorkspaceEscapeError)
  })

  it('rejects empty or too-long ids', () => {
    expect(() => resolveWorkspacePath(root, 'workspaces', ''))
      .toThrow(WorkspaceEscapeError)
    expect(() => resolveWorkspacePath(root, 'workspaces', 'x'.repeat(129)))
      .toThrow(WorkspaceEscapeError)
  })
})

describe('WorkspaceManager (no git origin)', () => {
  let tmpRoot: string
  let manager: WorkspaceManager

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aiworker-ws-'))
    manager = new WorkspaceManager({ root: tmpRoot })
  })

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  it('creates a plain directory for a conversation', async () => {
    const handle = await manager.createWorkspace('conv-1')
    expect(handle.path).toBe(path.join(tmpRoot, 'workspaces', 'conv-1'))
    expect(handle.isGitWorktree).toBe(false)
    const stat = await fs.stat(handle.path)
    expect(stat.isDirectory()).toBe(true)
  })

  it('is idempotent on repeated calls', async () => {
    const a = await manager.createWorkspace('conv-2')
    const b = await manager.createWorkspace('conv-2')
    expect(a.path).toBe(b.path)
    // still only one directory on disk
    const entries = await fs.readdir(path.join(tmpRoot, 'workspaces'))
    expect(entries).toEqual(['conv-2'])
  })

  it('concurrent creates for the same id dedupe without races', async () => {
    const [a, b, c] = await Promise.all([
      manager.createWorkspace('conv-3'),
      manager.createWorkspace('conv-3'),
      manager.createWorkspace('conv-3'),
    ])
    expect(a.path).toBe(b.path)
    expect(b.path).toBe(c.path)
  })

  it('disposeWorkspace removes the directory and is idempotent', async () => {
    await manager.createWorkspace('conv-4')
    await manager.disposeWorkspace('conv-4')
    await manager.disposeWorkspace('conv-4') // second call is a no-op
    expect(await fs.readdir(path.join(tmpRoot, 'workspaces'))).toEqual([])
  })

  it('disposeWorkspace rejects escape attempts before touching disk', async () => {
    await expect(manager.disposeWorkspace('../escape')).rejects.toThrow(WorkspaceEscapeError)
  })

  it('purgeAll cleans every workspace under the subdir', async () => {
    await manager.createWorkspace('conv-a')
    await manager.createWorkspace('conv-b')
    await manager.purgeAll()
    expect(await fs.readdir(path.join(tmpRoot, 'workspaces'))).toEqual([])
  })
})

describe('WorkspaceManager (shared project root)', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aiworker-ws-project-'))
  })

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  it('returns the project root as cwd and never removes it', async () => {
    const projectRoot = path.join(tmpRoot, 'project')
    const sentinel = path.join(projectRoot, 'AGENTS.md')
    await fs.mkdir(projectRoot, { recursive: true })
    await fs.writeFile(sentinel, '# Project instructions\n')

    const manager = new WorkspaceManager({ root: path.join(tmpRoot, 'state'), projectRoot })
    const handle = await manager.createWorkspace('conv-project')

    expect(handle).toEqual({
      conversationId: 'conv-project',
      path: projectRoot,
      isGitWorktree: false,
      isSharedProjectRoot: true,
    })

    await manager.disposeWorkspace('conv-project')
    await manager.purgeAll()

    expect(await fs.readFile(sentinel, 'utf8')).toBe('# Project instructions\n')
  })

  it('still validates conversation ids before returning the project root', async () => {
    const projectRoot = path.join(tmpRoot, 'project')
    await fs.mkdir(projectRoot, { recursive: true })

    const manager = new WorkspaceManager({ root: path.join(tmpRoot, 'state'), projectRoot })

    await expect(manager.createWorkspace('../escape')).rejects.toThrow(WorkspaceEscapeError)
    await expect(manager.disposeWorkspace('../escape')).rejects.toThrow(WorkspaceEscapeError)
  })
})

describe('WorkspaceManager (git origin)', () => {
  const envKeys = [
    'AIWORKER_JOIN_TOKEN',
    'AIWORKER_MASTER_KEY',
    'ANTHROPIC_API_KEY',
    'GIT_AUTHOR_EMAIL',
    'GIT_AUTHOR_NAME',
    'GIT_SSH_COMMAND',
    'GITHUB_TOKEN',
    'HOME',
    'INTERNAL_SHARED_SECRET',
    'PATH',
    'SSH_AUTH_SOCK',
    'WORKER_DB_PATH',
  ] as const

  let tmpRoot: string
  let originalEnv: Record<string, string | undefined>

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aiworker-ws-git-'))
    originalEnv = snapshotEnv(envKeys)
  })

  afterEach(async () => {
    restoreEnv(originalEnv)
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  it('runs git helper children with a safe env that preserves git basics', async () => {
    const binDir = path.join(tmpRoot, 'bin')
    const repoDir = path.join(tmpRoot, 'repo')
    const homeDir = path.join(tmpRoot, 'home')
    await fs.mkdir(binDir, { recursive: true })
    await fs.mkdir(repoDir, { recursive: true })
    await fs.mkdir(homeDir, { recursive: true })

    await fs.writeFile(
      path.join(binDir, 'git'),
      [
        '#!/bin/sh',
        'env | sort > git-env.txt',
        'mkdir -p "$4"',
        'exit 0',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )

    process.env.PATH = [binDir, originalEnv.PATH ?? '/usr/bin:/bin'].join(path.delimiter)
    process.env.HOME = homeDir
    process.env.SSH_AUTH_SOCK = '/tmp/aiworker-test-ssh-agent.sock'
    process.env.GIT_AUTHOR_NAME = 'AIWorker Test'
    process.env.GIT_AUTHOR_EMAIL = 'worker@example.test'
    process.env.GIT_SSH_COMMAND = 'ssh -i /tmp/aiworker-test-key'
    process.env.AIWORKER_MASTER_KEY = 'deadbeef'.repeat(8)
    process.env.AIWORKER_JOIN_TOKEN = 'join-token'
    process.env.INTERNAL_SHARED_SECRET = 'internal-secret'
    process.env.WORKER_DB_PATH = '/var/lib/aiworker/worker.db'
    process.env.GITHUB_TOKEN = 'gh-token'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-redacted'

    const manager = new WorkspaceManager({ root: tmpRoot, gitOrigin: repoDir })
    const handle = await manager.createWorkspace('conv-git')

    expect(handle).toEqual({
      conversationId: 'conv-git',
      path: path.join(tmpRoot, 'workspaces', 'conv-git'),
      isGitWorktree: true,
    })

    const captured = await fs.readFile(path.join(repoDir, 'git-env.txt'), 'utf8')
    expect(captured).toContain(`PATH=${process.env.PATH}\n`)
    expect(captured).toContain(`HOME=${homeDir}\n`)
    expect(captured).toContain('SSH_AUTH_SOCK=/tmp/aiworker-test-ssh-agent.sock\n')
    expect(captured).toContain('GIT_AUTHOR_NAME=AIWorker Test\n')
    expect(captured).toContain('GIT_AUTHOR_EMAIL=worker@example.test\n')
    expect(captured).toContain('GIT_SSH_COMMAND=ssh -i /tmp/aiworker-test-key\n')
    expect(captured).not.toContain('AIWORKER_MASTER_KEY=')
    expect(captured).not.toContain('AIWORKER_JOIN_TOKEN=')
    expect(captured).not.toContain('INTERNAL_SHARED_SECRET=')
    expect(captured).not.toContain('WORKER_DB_PATH=')
    expect(captured).not.toContain('GITHUB_TOKEN=')
    expect(captured).not.toContain('ANTHROPIC_API_KEY=')
  })
})

function snapshotEnv(keys: readonly string[]): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {}
  for (const key of keys)
    snapshot[key] = process.env[key]
  return snapshot
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined)
      delete process.env[key]
    else
      process.env[key] = value
  }
}
