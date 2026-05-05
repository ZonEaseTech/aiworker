import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { closeWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { recordBrainGovernanceBypassWarning, resetBrainGovernanceBypassWarnings } from './governance-bypass'
import { buildBrainSummary } from './summary'

describe('buildBrainSummary governance warnings (PLAN-117)', () => {
  let dir: string

  beforeEach(() => {
    closeWorkerDb()
    resetBrainGovernanceBypassWarnings()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-brain-summary-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(() => {
    closeWorkerDb()
    resetBrainGovernanceBypassWarnings()
  })

  it('reports no admission bypass risk by default', () => {
    const summary = buildBrainSummary()
    expect(summary.admissions.bypassRisk).toEqual({
      recentCount: 0,
      status: 'none',
    })
  })

  it('reports the latest suspected bypass warning', () => {
    recordBrainGovernanceBypassWarning({
      at: '2026-05-06T00:45:00.000Z',
      conversationId: 'c-1',
      engine: 'claude-code',
      reason: 'assistant-claimed-admission-without-db-delta',
      sessionKey: 'web:test:chat',
    })

    const summary = buildBrainSummary()
    expect(summary.admissions.bypassRisk).toEqual({
      lastDetectedAt: '2026-05-06T00:45:00.000Z',
      reason: 'assistant-claimed-admission-without-db-delta',
      recentCount: 1,
      status: 'suspected',
    })
  })
})
