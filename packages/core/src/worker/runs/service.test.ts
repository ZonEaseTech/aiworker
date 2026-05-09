import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { agentTasks, closeWorkerDb, conversations, getWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { WorkerRunService } from './service'

describe('WorkerRunService', () => {
  let tmp: string
  let cancelledGroup: string | null

  beforeEach(() => {
    closeWorkerDb()
    tmp = mkdtempSync(join(tmpdir(), 'aiworker-run-service-'))
    initWorkerDb(join(tmp, 'worker.db'))
    runWorkerMigrations()
    cancelledGroup = null
  })

  afterEach(async () => {
    closeWorkerDb()
    await fs.rm(tmp, { recursive: true, force: true })
  })

  function service(overrides: {
    submitTask?: (prompt: string) => Promise<{ id: string }>
    continueConversation?: (conversationId: string, prompt: string) => Promise<{ id: string }>
  } = {}) {
    return new WorkerRunService({
      orchestrator: {
        submitTask: overrides.submitTask ?? (async (prompt) => {
          seedRun({ id: 'run-created', prompt })
          return { id: 'run-created' }
        }),
        continueConversation: overrides.continueConversation ?? (async (conversationId, prompt) => {
          seedRun({ conversationId, id: 'run-continued', prompt })
          return { id: 'run-continued' }
        }),
      },
      processes: {
        cancelGroup: async (group) => {
          cancelledGroup = group
        },
      },
    })
  }

  it('lists runs from newest to oldest and normalizes nullable fields', () => {
    seedRun({ createdAt: '2026-05-09T01:00:00.000Z', id: 'run-old', prompt: 'old' })
    seedRun({ createdAt: '2026-05-09T02:00:00.000Z', id: 'run-new', prompt: 'new', result: { ok: true } })

    const runs = service().listRuns()

    expect(runs.map(run => run.id)).toEqual(['run-new', 'run-old'])
    expect(runs[0]).toMatchObject({
      conversationId: null,
      error: null,
      result: { ok: true },
    })
  })

  it('creates a new run through orchestrator.submitTask', async () => {
    const run = await service().createRun({ prompt: '  ship it  ' })

    expect(run).toMatchObject({
      id: 'run-created',
      prompt: 'ship it',
      status: 'queued',
    })
  })

  it('continues a conversation through orchestrator.continueConversation', async () => {
    const run = await service().createRun({ conversationId: 'conv-1', prompt: '  continue  ' })

    expect(run).toMatchObject({
      id: 'run-continued',
      conversationId: 'conv-1',
      prompt: 'continue',
    })
  })

  it('cancels a non-terminal run by conversation group', async () => {
    seedConversation('conv-1')
    seedRun({ conversationId: 'conv-1', id: 'run-cancel', prompt: 'cancel me', status: 'running' })

    const run = await service().cancelRun('run-cancel')

    expect(run.id).toBe('run-cancel')
    expect(cancelledGroup).toBe('conv-1')
  })

  it('rejects cancellation before a run is bound to a conversation', async () => {
    seedRun({ id: 'run-queued', prompt: 'cancel me' })

    await expect(service().cancelRun('run-queued')).rejects.toThrow('run has not been bound')
    expect(cancelledGroup).toBeNull()
  })
})

function seedRun(input: {
  id: string
  prompt: string
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  conversationId?: string
  createdAt?: string
  result?: Record<string, unknown>
}) {
  getWorkerDb().insert(agentTasks).values({
    id: input.id,
    prompt: input.prompt,
    status: input.status ?? 'queued',
    createdAt: input.createdAt ?? '2026-05-09T00:00:00.000Z',
    ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
    ...(input.result === undefined ? {} : { result: input.result }),
  }).run()
}

function seedConversation(id: string) {
  getWorkerDb().insert(conversations).values({
    id,
    channel: 'web',
    chatId: `task:${id}`,
    status: 'open',
    startedAt: '2026-05-09T00:00:00.000Z',
    lastActiveAt: '2026-05-09T00:00:00.000Z',
  }).run()
}
