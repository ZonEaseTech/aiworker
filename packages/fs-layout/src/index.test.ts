import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  ensureWorkerHome,
  resolveAiworkerHome,
  resolveAiworkerScope,
  resolveProjectRoot,
  resolveWorkerHome,
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

      expect(resolveProjectRoot(path.join(tmp, 'project'))).toBe(null)
      expect(resolveAiworkerScope({ cwd: path.join(tmp, 'project') })).toEqual({
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

    expect(resolveWorkerHome('hr-worker')).toBe('/tmp/aiworker-home/workers/hr-worker')
    expect(resolveWorkspacesRoot('hr-worker')).toBe('/tmp/aiworker-home/workers/hr-worker/workspaces')
  })

  it('initializes only the workspace root for a worker', async () => {
    const tmp = await makeTmpDir()
    try {
      process.env.AIWORKER_HOME = path.join(tmp, '.aiworker')

      await ensureWorkerHome('qa-worker')

      const workspaces = await stat(path.join(tmp, '.aiworker', 'workers', 'qa-worker', 'workspaces'))
      expect(workspaces.isDirectory()).toBe(true)
      await expect(stat(path.join(tmp, '.aiworker', 'workers', 'qa-worker', 'SOUL.md'))).rejects.toThrow()
      await expect(stat(path.join(tmp, 'project', '.aiworker'))).rejects.toThrow()
    }
    finally {
      await cleanup(tmp)
    }
  })
})
