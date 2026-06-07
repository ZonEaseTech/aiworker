import { mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { defaultWorkerMigrationsFolder } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { __resetWorkerEnvCacheForTest, getWorkerEnv } from './worker'

describe('getWorkerEnv', () => {
  const originalEnv = { ...process.env }
  const originalCwd = process.cwd()
  let tmpCwd: string

  beforeEach(() => {
    tmpCwd = mkdtempSync(path.join(tmpdir(), 'aiworker-worker-env-'))
    process.chdir(tmpCwd)
    __resetWorkerEnvCacheForTest()
    for (const key of [
      'AIWORKER_HOME',
      'AIWORKER_LOCAL_TOKEN',
      'AIWORKER_WORKER_HOST',
      'PORT',
      'WORKER_DB_PATH',
      'WORKER_MIGRATIONS_FOLDER',
      'WORKER_WORKSPACE_ROOT',
    ]) {
      delete process.env[key]
    }
  })

  afterEach(() => {
    process.chdir(originalCwd)
    __resetWorkerEnvCacheForTest()
    for (const key of Object.keys(process.env))
      delete process.env[key]
    Object.assign(process.env, originalEnv)
    rmSync(tmpCwd, { recursive: true, force: true })
  })

  it('uses local daemon defaults without mandatory secrets', () => {
    const env = getWorkerEnv()

    expect(env.PORT).toBe(9217)
    expect(env.AIWORKER_WORKER_HOST).toBe('127.0.0.1')
    expect(env.WORKER_DB_PATH).toBe(path.resolve(homedir(), '.aiworker', 'aiworker.db'))
    expect(env.WORKER_WORKSPACE_ROOT).toBe(path.resolve(homedir(), '.aiworker', 'workers'))
    expect(env.WORKER_MIGRATIONS_FOLDER).toBe(defaultWorkerMigrationsFolder)
  })

  it('treats blank dotenv placeholders as unset for optional and defaulted values', () => {
    process.env.PORT = ''
    process.env.AIWORKER_WORKER_HOST = ''
    process.env.WORKER_DB_PATH = ''
    process.env.WORKER_MIGRATIONS_FOLDER = ''
    process.env.WORKER_WORKSPACE_ROOT = ''
    process.env.AIWORKER_LOCAL_TOKEN = ''
    __resetWorkerEnvCacheForTest()

    const env = getWorkerEnv()

    expect(env.PORT).toBe(9217)
    expect(env.AIWORKER_WORKER_HOST).toBe('127.0.0.1')
    expect(env.WORKER_DB_PATH).toBe(path.resolve(homedir(), '.aiworker', 'aiworker.db'))
    expect(env.WORKER_WORKSPACE_ROOT).toBe(path.resolve(homedir(), '.aiworker', 'workers'))
    expect(env.WORKER_MIGRATIONS_FOLDER).toBe(defaultWorkerMigrationsFolder)
    expect(env.AIWORKER_LOCAL_TOKEN).toBeUndefined()
  })

  it('respects explicit local daemon paths', () => {
    process.env.AIWORKER_HOME = '/tmp/aiworker-home'
    process.env.WORKER_DB_PATH = '/tmp/custom-worker.db'
    process.env.WORKER_WORKSPACE_ROOT = '/tmp/custom-workspace'
    process.env.WORKER_MIGRATIONS_FOLDER = '/tmp/migrations'
    __resetWorkerEnvCacheForTest()

    const env = getWorkerEnv()

    expect(env.WORKER_DB_PATH).toBe('/tmp/custom-worker.db')
    expect(env.WORKER_WORKSPACE_ROOT).toBe('/tmp/custom-workspace')
    expect(env.WORKER_MIGRATIONS_FOLDER).toBe('/tmp/migrations')
  })

  it('accepts an optional local bearer token', () => {
    process.env.AIWORKER_LOCAL_TOKEN = 'local-token-123456'
    __resetWorkerEnvCacheForTest()

    expect(getWorkerEnv().AIWORKER_LOCAL_TOKEN).toBe('local-token-123456')
  })

  it('rejects a non-empty local bearer token that is too short', () => {
    process.env.AIWORKER_LOCAL_TOKEN = 'short'
    __resetWorkerEnvCacheForTest()

    expect(() => getWorkerEnv()).toThrow(/at least 16 character/)
  })
})
