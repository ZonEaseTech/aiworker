import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { resetSecretsVaultForTests } from '@zonease/aiworker-core'
import { closeWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { __resetWorkerEnvCacheForTest } from '../../../../packages/core/src/config/worker'
import { bootstrapWorkerApp } from './worker'

const MASTER_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

interface OpenApiDoc {
  openapi: string
  info: { title: string, version: string }
  paths: Record<string, Record<string, { summary?: string, tags?: string[] }>>
  components?: { schemas?: Record<string, unknown>, securitySchemes?: Record<string, unknown> }
}

describe('worker /openapi.json registration (BUG-065)', () => {
  let tmpHome: string
  let originalEnv: Record<string, string | undefined>

  beforeEach(async () => {
    originalEnv = snapshotEnv([
      'AIWORKER_HOME',
      'AIWORKER_MASTER_KEY',
      'WORKER_DB_PATH',
      'WORKER_DATA_ROOT',
      'WORKER_MIGRATIONS_FOLDER',
      'AIWORKER_FORCE_ID',
      'AIWORKER_FORCE_TOKEN',
    ])
    tmpHome = await mkdtemp(path.join(tmpdir(), 'aiworker-openapi-doc-'))
    closeWorkerDb()
    resetSecretsVaultForTests()
    process.env.AIWORKER_HOME = tmpHome
    process.env.AIWORKER_MASTER_KEY = MASTER_KEY
    process.env.WORKER_DB_PATH = path.join(tmpHome, 'worker.db')
    process.env.WORKER_DATA_ROOT = path.join(tmpHome, 'data-root')
    delete process.env.WORKER_MIGRATIONS_FOLDER
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

  it('publishes >= 10 path entries with security + tags metadata', async () => {
    const boot = await bootstrapWorkerApp({})
    try {
      const res = await boot.app.fetch(new Request('http://w/openapi.json'))
      expect(res.status).toBe(200)
      const doc = await res.json() as OpenApiDoc
      const paths = Object.keys(doc.paths ?? {})
      expect(paths.length).toBeGreaterThanOrEqual(10)
      // Spot-check the operator-facing surface mentioned in BUG-065.
      expect(paths).toContain('/health')
      expect(paths).toContain('/api/worker/info')
      expect(paths).toContain('/api/worker/brain/summary')
      expect(paths).toContain('/api/worker/brain/admission')
      expect(paths).toContain('/api/worker/brain/admission/{id}')
      expect(paths).toContain('/api/worker/reviews')
      expect(paths).toContain('/api/worker/reviews/{taskId}')
      expect(paths).toContain('/api/worker/reviews/{taskId}/rerun')
      expect(paths).toContain('/api/worker/reviews/{taskId}/lessons/promote')
      expect(paths).toContain('/api/worker/runs')
      expect(paths).toContain('/api/worker/runs/{id}')
      expect(paths).toContain('/api/worker/runs/{id}/events')
      expect(paths).toContain('/api/worker/runs/{id}/cancel')
      expect(paths).toContain('/api/worker/artifacts')
      expect(paths).toContain('/api/worker/artifacts/{id}')
      expect(paths).toContain('/api/worker/orchestrator/tasks')
      expect(paths).toContain('/api/worker/orchestrator/conversations')
      expect(paths).toContain('/api/worker/orchestrator/conversations/{id}/messages')
      expect(paths).not.toContain('/api/worker/cases')
      expect(paths).not.toContain('/api/worker/cases/{taskId}')
      expect(paths).not.toContain('/api/worker/cases/{taskId}/rerun')
      expect(paths).not.toContain('/api/worker/cases/{taskId}/lessons/propose')
      expect(paths).not.toContain('/api/worker/orchestrator/chat')

      // Health stays public; brain admission requires bearer auth.
      const healthEntry = doc.paths['/health']?.get
      expect(healthEntry?.tags).toContain('health')
      const brainEntry = doc.paths['/api/worker/brain/admission']?.get as { security?: unknown[] } | undefined
      expect(Array.isArray(brainEntry?.security)).toBe(true)
      const reviewEntry = doc.paths['/api/worker/reviews']?.get as { tags?: string[], security?: unknown[] } | undefined
      expect(reviewEntry?.tags).toContain('reviews')
      expect(Array.isArray(reviewEntry?.security)).toBe(true)
      const runsEntry = doc.paths['/api/worker/runs']?.post as { tags?: string[], security?: unknown[] } | undefined
      expect(runsEntry?.tags).toContain('runs')
      expect(Array.isArray(runsEntry?.security)).toBe(true)
      const artifactsEntry = doc.paths['/api/worker/artifacts']?.get as { tags?: string[], security?: unknown[] } | undefined
      expect(artifactsEntry?.tags).toContain('artifacts')
      expect(Array.isArray(artifactsEntry?.security)).toBe(true)

      const securitySchemes = doc.components?.securitySchemes ?? {}
      expect(securitySchemes.bearerAuth).toBeDefined()
    }
    finally {
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
