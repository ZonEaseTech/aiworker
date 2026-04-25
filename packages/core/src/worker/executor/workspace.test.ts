import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
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
