import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  ensureWorkerHome,
  resolveAiworkerHome,
  resolveAiworkerScope,
  resolveWorkerHome,
  resolveWorkerOverlayFile,
  resolveWorkerOverlaysRoot,
  resolveWorkspacesRoot,
} from './index'

const ENV_KEYS = ['AIWORKER_HOME', 'HOME']

async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'aiworker-fs-layout-test-'))
}

async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

describe('host-local AIWorker home resolution', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined)
        delete process.env[key]
      else
        process.env[key] = savedEnv[key]
    }
  })

  it('uses explicit AIWorker home before env and default home', () => {
    process.env.AIWORKER_HOME = '/tmp/ignored-aiworker-home'

    const result = resolveAiworkerScope({ explicitHome: '/tmp/explicit-aiworker-home' })

    expect(result.scope).toBe('explicit')
    expect(result.home).toBe('/tmp/explicit-aiworker-home')
    expect(result.source).toBe('cli-flag')
  })

  it('uses AIWORKER_HOME env when no explicit home is provided', () => {
    process.env.AIWORKER_HOME = '/tmp/env-aiworker-home'

    const result = resolveAiworkerScope()

    expect(result.scope).toBe('explicit')
    expect(result.home).toBe('/tmp/env-aiworker-home')
    expect(result.source).toBe('env')
  })

  it('uses a caller-provided default home directory when no explicit home exists', () => {
    process.env.HOME = '/tmp/aiworker-home-owner'

    const result = resolveAiworkerScope({ defaultHomeDir: '.aiworker-dev' })

    expect(result.scope).toBe('user')
    expect(result.home).toBe('/tmp/aiworker-home-owner/.aiworker-dev')
    expect(result.source).toBe('user-default')
  })

  it('expands tilde in a caller-provided default home directory', () => {
    process.env.HOME = '/tmp/aiworker-home-owner'

    const result = resolveAiworkerScope({ defaultHomeDir: '~/aiworker-dev' })

    expect(result.scope).toBe('user')
    expect(result.home).toBe('/tmp/aiworker-home-owner/aiworker-dev')
    expect(result.source).toBe('user-default')
  })

  it('keeps explicit env priority over a caller-provided default home directory', () => {
    process.env.HOME = '/tmp/aiworker-home-owner'
    process.env.AIWORKER_HOME = '/tmp/env-aiworker-home'

    const result = resolveAiworkerScope({ defaultHomeDir: '.aiworker-dev' })

    expect(result.scope).toBe('explicit')
    expect(result.home).toBe('/tmp/env-aiworker-home')
    expect(result.source).toBe('env')
  })

  it('defaults to ~/.aiworker and ignores cwd project markers', async () => {
    const tmp = await makeTmpDir()
    try {
      process.env.HOME = tmp
      await mkdir(path.join(tmp, 'project', '.aiworker'), { recursive: true })

      expect(resolveAiworkerScope()).toEqual({
        scope: 'user',
        home: path.join(tmp, '.aiworker'),
        source: 'user-default',
      })
      expect(resolveAiworkerHome()).toBe(path.join(tmp, '.aiworker'))
    }
    finally {
      await cleanup(tmp)
    }
  })

  it('expands tilde in explicit and env homes', () => {
    expect(resolveAiworkerScope({ explicitHome: '~/custom-aiworker' }).home).toBe(path.join(homedir(), 'custom-aiworker'))

    process.env.AIWORKER_HOME = '~/env-aiworker'
    expect(resolveAiworkerScope().home).toBe(path.join(homedir(), 'env-aiworker'))
  })
})

describe('worker workspace roots', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined)
        delete process.env[key]
      else
        process.env[key] = savedEnv[key]
    }
  })

  it('places each worker under the host home workers directory', () => {
    process.env.AIWORKER_HOME = '/tmp/aiworker-home'

    expect(resolveWorkerHome('demo-worker')).toBe('/tmp/aiworker-home/workers/demo-worker')
    expect(resolveWorkspacesRoot('demo-worker')).toBe('/tmp/aiworker-home/workers/demo-worker/workspaces')
  })

  it('places the worker overlay store as a sibling of workspaces', () => {
    process.env.AIWORKER_HOME = '/tmp/aiworker-home'

    expect(resolveWorkerOverlaysRoot('demo-worker')).toBe('/tmp/aiworker-home/workers/demo-worker/overlays')
  })

  it('resolves overlay files under the kind directory and rejects unsafe paths', () => {
    const overlaysRoot = '/tmp/aiworker-home/workers/demo-worker/overlays'

    expect(resolveWorkerOverlayFile(overlaysRoot, 'skills', 'freeform-session/SKILL.md'))
      .toBe('/tmp/aiworker-home/workers/demo-worker/overlays/skills/freeform-session/SKILL.md')
    expect(resolveWorkerOverlayFile(overlaysRoot, 'entry-files', 'NOTES.md'))
      .toBe('/tmp/aiworker-home/workers/demo-worker/overlays/entry-files/NOTES.md')
    expect(resolveWorkerOverlayFile(overlaysRoot, 'mcp', 'codex/config.toml'))
      .toBe('/tmp/aiworker-home/workers/demo-worker/overlays/mcp/codex/config.toml')

    expect(() => resolveWorkerOverlayFile(overlaysRoot, 'plugins', 'x.md')).toThrow()
    expect(() => resolveWorkerOverlayFile(overlaysRoot, 'skills', '../../etc/passwd')).toThrow()
    expect(() => resolveWorkerOverlayFile(overlaysRoot, 'skills', '/abs/path')).toThrow()
    expect(() => resolveWorkerOverlayFile(overlaysRoot, 'skills', '')).toThrow()
  })

  it('rejects worker ids that escape the home root', () => {
    expect(() => resolveWorkerHome('../../etc')).toThrow()
    expect(() => resolveWorkerHome('/abs/path')).toThrow()
    expect(() => resolveWorkerHome('a/b')).toThrow()
    expect(() => resolveWorkerHome('')).toThrow()
    // #7: 尾随ドット・連続ドットは Windows FS の衝突を招くので拒否
    expect(() => resolveWorkerHome('build.')).toThrow()
    expect(() => resolveWorkerHome('a..b')).toThrow()
  })

  it('accepts a well-formed worker id', () => {
    process.env.AIWORKER_HOME = '/tmp/aiworker-home'
    expect(resolveWorkerHome('demo-worker').endsWith(path.join('workers', 'demo-worker'))).toBe(true)
    // #7: 中間のドット・アンダースコアは合法
    expect(resolveWorkerHome('my.worker_1').endsWith(path.join('workers', 'my.worker_1'))).toBe(true)
  })

  it('initializes only the workspace root for a worker', async () => {
    const tmp = await makeTmpDir()
    try {
      process.env.AIWORKER_HOME = path.join(tmp, '.aiworker')

      await ensureWorkerHome('sample-worker')

      const workspaces = await stat(path.join(tmp, '.aiworker', 'workers', 'sample-worker', 'workspaces'))
      expect(workspaces.isDirectory()).toBe(true)
      await expect(stat(path.join(tmp, '.aiworker', 'workers', 'sample-worker', 'SOUL.md'))).rejects.toThrow()
      await expect(stat(path.join(tmp, 'project', '.aiworker'))).rejects.toThrow()
    }
    finally {
      await cleanup(tmp)
    }
  })
})
