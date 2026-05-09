import type { WorkerRuntime } from '@zonease/aiworker-core'

import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkerEventBus } from '@zonease/aiworker-core'
import { agentTasks, closeWorkerDb, getWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { buildRunRoutes } from './routes'

describe('worker run routes', () => {
  let tmp: string
  let bus: WorkerEventBus
  let cancelledGroup: string | null

  beforeEach(() => {
    closeWorkerDb()
    tmp = mkdtempSync(join(tmpdir(), 'aiworker-run-routes-'))
    initWorkerDb(join(tmp, 'worker.db'))
    runWorkerMigrations()
    bus = new WorkerEventBus()
    cancelledGroup = null
  })

  afterEach(async () => {
    closeWorkerDb()
    await fs.rm(tmp, { recursive: true, force: true })
  })

  function routes() {
    return buildRunRoutes(() => ({
      bus,
      orchestrator: {
        submitTask: async (prompt: string) => {
          seedRun({ id: 'run-created', prompt })
          return { id: 'run-created' }
        },
        continueConversation: async (conversationId: string, prompt: string) => {
          seedRun({ conversationId, id: 'run-continued', prompt })
          return { id: 'run-continued' }
        },
      },
      processes: {
        cancelGroup: async (group: string) => {
          cancelledGroup = group
        },
      },
    } as unknown as WorkerRuntime), { keepaliveMs: 10 })
  }

  it('POST / creates a run and trims prompt', async () => {
    const res = await routes().fetch(new Request('http://w/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '  hello  ' }),
    }))

    expect(res.status).toBe(201)
    const body = await res.json() as { run: { id: string, prompt: string } }
    expect(body.run).toMatchObject({ id: 'run-created', prompt: 'hello' })
  })

  it('POST / with conversationId continues that conversation', async () => {
    const res = await routes().fetch(new Request('http://w/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 'conv-1', prompt: '  continue  ' }),
    }))

    expect(res.status).toBe(201)
    const body = await res.json() as { run: { conversationId: string, id: string, prompt: string } }
    expect(body.run).toMatchObject({ conversationId: 'conv-1', id: 'run-continued', prompt: 'continue' })
  })

  it('GET / lists runs', async () => {
    seedRun({ createdAt: '2026-05-09T01:00:00.000Z', id: 'run-old', prompt: 'old' })
    seedRun({ createdAt: '2026-05-09T02:00:00.000Z', id: 'run-new', prompt: 'new' })

    const res = await routes().fetch(new Request('http://w/?limit=1'))

    expect(res.status).toBe(200)
    const body = await res.json() as { runs: Array<{ id: string }> }
    expect(body.runs.map(run => run.id)).toEqual(['run-new'])
  })

  it('POST /:id/cancel cancels by conversation group', async () => {
    seedRun({ conversationId: 'conv-1', id: 'run-cancel', prompt: 'cancel', status: 'running' })

    const res = await routes().fetch(new Request('http://w/run-cancel/cancel', { method: 'POST' }))

    expect(res.status).toBe(200)
    expect(cancelledGroup).toBe('conv-1')
  })

  it('GET /:id/events filters SSE by run id', async () => {
    const ctrl = new AbortController()
    const res = await routes().fetch(new Request('http://w/run-1/events', { signal: ctrl.signal }))

    expect(res.status).toBe(200)
    const reader = res.body!.getReader()
    try {
      await readUntil(reader, ': connected')
      bus.emit('orchestrator.text', { delta: 'skip', taskId: 'run-2' })
      bus.emit('orchestrator.text', { delta: 'take', taskId: 'run-1' })
      const eventText = await readUntil(reader, 'orchestrator.text')
      expect(eventText).toContain('"delta":"take"')
      expect(eventText).not.toContain('"delta":"skip"')
    }
    finally {
      await reader.cancel().catch(() => undefined)
      ctrl.abort()
    }
  })
})

function seedRun(input: {
  id: string
  prompt: string
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  conversationId?: string
  createdAt?: string
}) {
  getWorkerDb().insert(agentTasks).values({
    id: input.id,
    prompt: input.prompt,
    status: input.status ?? 'queued',
    createdAt: input.createdAt ?? '2026-05-09T00:00:00.000Z',
    ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
  }).run()
}

function delay(ms: number): Promise<'timeout'> {
  return new Promise(resolve => setTimeout(() => resolve('timeout'), ms))
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  marker: string,
  timeoutMs = 1_000,
): Promise<string> {
  const decoder = new TextDecoder()
  let text = ''
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now())
    const result = await Promise.race([reader.read(), delay(remaining)])
    if (result === 'timeout')
      break
    if (result.done)
      break
    text += decoder.decode(result.value, { stream: true })
    if (text.includes(marker))
      return text
  }
  throw new Error(`timed out waiting for ${marker}; received: ${JSON.stringify(text)}`)
}
