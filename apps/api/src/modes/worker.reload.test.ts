import type { WorkerModeState } from '@zonease/aiworker-core'
import type { WorkerConfig } from '@zonease/aiworker-shared'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {
  DEFAULT_EMPTY_CONFIG,
  getSecretsVault,
  resetSecretsVaultForTests,
} from '@zonease/aiworker-core'
import { closeWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { __resetWorkerEnvCacheForTest } from '../../../../packages/core/src/config/worker'
import { bootstrapWorkerApp } from './worker'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (err: unknown) => void
}

function defer<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function reloadConfig(): WorkerConfig {
  return {
    ...structuredClone(DEFAULT_EMPTY_CONFIG),
    executor: {
      engine: 'http',
      variant: 'default',
      overrides: {
        baseUrl: 'http://localhost:4000',
        apiKey: '',
        model: 'gpt-4o-mini',
        timeoutMs: 30_000,
      },
    },
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (predicate())
      return
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  throw new Error('timed out waiting for condition')
}

describe('worker reloadRuntime serialization (BUG-006)', () => {
  let tmpHome: string
  let originalEnv: Record<string, string | undefined>

  beforeEach(async () => {
    originalEnv = snapshotEnv([
      'AIWORKER_HOME',
      'AIWORKER_MASTER_KEY',
      'WORKER_DB_PATH',
      'WORKER_DATA_ROOT',
      'WORKER_MIGRATIONS_FOLDER',
      'WORKER_WORKSPACE_GIT_ORIGIN',
      'AIWORKER_FORCE_ID',
      'AIWORKER_FORCE_TOKEN',
    ])
    tmpHome = await mkdtemp(path.join(tmpdir(), 'aiworker-reload-runtime-'))
    closeWorkerDb()
    resetSecretsVaultForTests()
    process.env.AIWORKER_HOME = tmpHome
    process.env.AIWORKER_MASTER_KEY = MASTER_KEY
    process.env.WORKER_DB_PATH = path.join(tmpHome, 'worker.db')
    process.env.WORKER_DATA_ROOT = path.join(tmpHome, 'data-root')
    delete process.env.WORKER_MIGRATIONS_FOLDER
    delete process.env.WORKER_WORKSPACE_GIT_ORIGIN
    delete process.env.AIWORKER_FORCE_ID
    delete process.env.AIWORKER_FORCE_TOKEN
    __resetWorkerEnvCacheForTest()
  })

  afterEach(async () => {
    closeWorkerDb()
    resetSecretsVaultForTests()
    restoreEnv(originalEnv)
    __resetWorkerEnvCacheForTest()
    await rm(tmpHome, { recursive: true, force: true })
  })

  it('runs concurrent reloadRuntime calls serially through hydrate, swap, and dispose', async () => {
    const events: string[] = []
    let stateRef: WorkerModeState | null = null

    const boot = await bootstrapWorkerApp({
      onRuntimeReloaded: () => {
        const state = stateRef
        if (!state)
          throw new Error('stateRef missing')
        const version = state.configVersion
        events.push(`swap:${version}`)
        if (version === 2) {
          const runtimeV2 = state.runtime
          const disposeV2 = runtimeV2.dispose.bind(runtimeV2)
          runtimeV2.dispose = () => {
            events.push('dispose:2')
            disposeV2()
          }
        }
      },
    })
    stateRef = boot.state

    const disposeV1 = boot.state.runtime.dispose.bind(boot.state.runtime)
    boot.state.runtime.dispose = () => {
      events.push('dispose:1')
      disposeV1()
    }

    const vault = getSecretsVault()
    const originalGet = vault.get.bind(vault)
    const firstHydrate = defer<void>()
    let hydrateCalls = 0
    vault.get = async (key: string) => {
      hydrateCalls += 1
      events.push(`hydrate:${hydrateCalls}:${key}`)
      if (hydrateCalls === 1)
        await firstHydrate.promise
      return originalGet(key)
    }

    try {
      const first = boot.reloadRuntime(reloadConfig(), 2)
      await waitFor(() => hydrateCalls === 1)

      const second = boot.reloadRuntime(reloadConfig(), 3)
      const hydrateCallsAfterSecondStart = hydrateCalls

      firstHydrate.resolve()
      await Promise.all([first, second])

      expect(hydrateCallsAfterSecondStart).toBe(1)
      expect(boot.state.configVersion).toBe(3)
      expect(events.indexOf('swap:2')).toBeLessThan(events.indexOf('dispose:1'))
      expect(events.indexOf('dispose:1')).toBeLessThan(events.indexOf('hydrate:2:executor.overrides.apiKey'))
      expect(events.indexOf('hydrate:2:executor.overrides.apiKey')).toBeLessThan(events.indexOf('swap:3'))
      expect(events.indexOf('swap:3')).toBeLessThan(events.indexOf('dispose:2'))
    }
    finally {
      firstHydrate.resolve()
      vault.get = originalGet
      boot.state.runtime.dispose()
      boot.state.runtime.processes.dispose()
    }
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
