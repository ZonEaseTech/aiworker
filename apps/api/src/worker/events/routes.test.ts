import type { WorkerRuntime } from '@zonease/aiworker-core'
import { WorkerEventBus } from '@zonease/aiworker-core'
import { describe, expect, it } from 'bun:test'
import { buildEventRoutes } from './routes'

function stubRuntime(bus: WorkerEventBus): WorkerRuntime {
  return {
    bus,
  } as unknown as WorkerRuntime
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

describe('worker event stream', () => {
  it('keeps an idle SSE connection alive and delivers a later bus event', async () => {
    const bus = new WorkerEventBus()
    const routes = buildEventRoutes(() => stubRuntime(bus), { keepaliveMs: 10 })
    const ctrl = new AbortController()
    const res = await routes.fetch(new Request('http://w/stream', { signal: ctrl.signal }))

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')

    const reader = res.body!.getReader()
    try {
      const keepaliveText = await readUntil(reader, ': keepalive')
      expect(keepaliveText).toContain(': connected')
      expect(keepaliveText).toContain(': keepalive')

      bus.emit('orchestrator.finished', { conversationId: 'conv-1', taskId: 'task-1' })
      const eventText = await readUntil(reader, 'orchestrator.finished')

      expect(eventText).toContain('event: orchestrator.finished')
      expect(eventText).toContain('"conversationId":"conv-1"')
      expect(eventText).toContain('"taskId":"task-1"')
    }
    finally {
      await reader.cancel().catch(() => undefined)
      ctrl.abort()
    }
  })
})
