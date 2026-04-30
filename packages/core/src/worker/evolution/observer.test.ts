import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeWorkerDb, evolutionObservations, getWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'

import { beforeEach, describe, expect, it } from 'bun:test'
import { WorkerEventBus } from '../events/bus'
import { attachEvolutionObserver } from './observer'

describe('attachEvolutionObserver', () => {
  beforeEach(() => {
    closeWorkerDb()
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-observer-'))
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
  })

  it('persists observe-only orchestrator decision events', () => {
    const bus = new WorkerEventBus()
    const detach = attachEvolutionObserver(bus)

    bus.emit('orchestrator.intent_decision', {
      conversationId: 'conv-1',
      mode: 'observe_only',
      intent: 'unknown',
    })
    bus.emit('orchestrator.capability_decision', {
      conversationId: 'conv-1',
      mode: 'observe_only',
      selectedSkills: [],
    })
    bus.emit('orchestrator.quality_gate', {
      conversationId: 'conv-1',
      mode: 'observe_only',
      status: 'not_evaluated',
    })
    bus.emit('channel.inbound', {
      conversationId: 'conv-1',
    })
    detach()

    const rows = getWorkerDb().select().from(evolutionObservations).all()
    expect(rows.map(row => row.kind)).toEqual([
      'orchestrator.intent_decision',
      'orchestrator.capability_decision',
      'orchestrator.quality_gate',
    ])
    expect(rows.every(row => row.conversationId === 'conv-1')).toBe(true)
  })
})
