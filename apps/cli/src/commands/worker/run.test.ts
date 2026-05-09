import { WorkerEventBus } from '@zonease/aiworker-core'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

/**
 * `aiworker run` 默认通过 daemon `/api/worker/runs` 提交；`--local` 保留旧的
 * in-process 路径。终态事件契约保持不变：
 * `orchestrator.finished` → exit 0，`orchestrator.error` → exit 1。
 *
 * local path 测试通过 runRun 的依赖注入传入 stub runtime（含真实 `WorkerEventBus`
 * + stub orchestrator + dispose），让被测代码在 ingest 之后直接 emit 终态事件。
 */

interface StubRuntime {
  bus: WorkerEventBus
  orchestrator: { ingest: (envelope: unknown) => Promise<void> }
  dispose: () => void
}

let runtime: StubRuntime
let ingestImpl: (envelope: unknown) => Promise<void>
let disposed = 0

const deps = {
  loadWorkerContext: async () => ({
    workerId: 'w-test',
    token: 'tok',
    configVersion: 1,
    hydrated: { executor: { engine: 'http', variant: 'default' } },
  }),
  buildRuntime: () => runtime,
}

beforeEach(() => {
  disposed = 0
  ingestImpl = async () => {}
  runtime = {
    bus: new WorkerEventBus(),
    orchestrator: { ingest: envelope => ingestImpl(envelope) },
    dispose: () => { disposed++ },
  }
})

afterEach(() => {
  // bun:test mock.module 是文件级——保留默认 stub，case 间通过 beforeEach 重置状态
})

describe('runRun terminal event mapping (BUG-005)', () => {
  it('daemon path posts a run and streams run-scoped events', async () => {
    const calls: Array<{ init?: RequestInit, url: string }> = []
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      calls.push({ url, init })
      if (url.endsWith('/api/worker/runs')) {
        return new Response(JSON.stringify({ run: { id: 'run-1' } }), {
          headers: { 'Content-Type': 'application/json' },
          status: 201,
        })
      }
      if (url.endsWith('/api/worker/runs/run-1/events')) {
        return sseResponse([
          ': connected\r\n\r\n',
          'event: orchestrator.text\r\n',
          'data: {"taskId":"run-1","delta":"hi","at":"2026-05-09T08:00:00.000Z"}\r\n\r\n',
          'event: orchestrator.finished\r\n',
          'data: {"taskId":"run-1","conversationId":"conv-1","at":"2026-05-09T08:00:01.000Z"}\r\n\r\n',
        ])
      }
      return new Response(JSON.stringify({ error: { message: 'unexpected' } }), { status: 404 })
    }

    const { runRun } = await import('./run')
    const code = await runRun({ message: 'hello', timeoutMs: 5_000 }, { ...deps, fetch: fetchImpl })

    expect(code).toBe(0)
    expect(calls[0]?.url).toBe('http://localhost:9217/api/worker/runs')
    const headers = calls[0]?.init?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer tok')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ prompt: 'hello' }))
    expect(calls[1]?.url).toBe('http://localhost:9217/api/worker/runs/run-1/events')
  })

  it('daemon path returns 1 when create run fails', async () => {
    const fetchImpl = async (): Promise<Response> => new Response(JSON.stringify({ error: { message: 'down' } }), {
      headers: { 'Content-Type': 'application/json' },
      status: 503,
    })

    const { runRun } = await import('./run')
    const code = await runRun({ message: 'hello', timeoutMs: 5_000 }, { ...deps, fetch: fetchImpl })

    expect(code).toBe(1)
  })

  it('daemon path exits 124 when run event stream does not reach a terminal event', async () => {
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      if (url.endsWith('/api/worker/runs')) {
        return new Response(JSON.stringify({ run: { id: 'run-timeout' } }), {
          headers: { 'Content-Type': 'application/json' },
          status: 201,
        })
      }
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
    }

    const { runRun } = await import('./run')
    const code = await runRun({ message: 'hello', timeoutMs: 20 }, { ...deps, fetch: fetchImpl })

    expect(code).toBe(124)
  })

  it('orchestrator.finished → exit 0', async () => {
    const { runRun } = await import('./run')
    ingestImpl = async () => {
      // 模拟 orchestrator 完成：先发一次中间 text 再发 finished
      runtime.bus.emit('orchestrator.text', { conversationId: 'c1', delta: 'hi' })
      runtime.bus.emit('orchestrator.finished', { conversationId: 'c1' })
    }
    const code = await runRun({ message: 'hello', local: true, timeoutMs: 5_000 }, deps)
    expect(code).toBe(0)
    expect(disposed).toBe(1)
  })

  it('orchestrator.error → exit 1', async () => {
    const { runRun } = await import('./run')
    ingestImpl = async () => {
      runtime.bus.emit('orchestrator.error', { conversationId: 'c1', error: 'boom' })
    }
    const code = await runRun({ message: 'hello', local: true, timeoutMs: 5_000 }, deps)
    expect(code).toBe(1)
    expect(disposed).toBe(1)
  })

  it('timeout 时退出 124', async () => {
    const { runRun } = await import('./run')
    ingestImpl = async () => {
      // 故意不 emit 任何终态事件
    }
    const code = await runRun({ message: 'hello', local: true, timeoutMs: 80 }, deps)
    expect(code).toBe(124)
    expect(disposed).toBe(1)
  })

  it('--message 缺失时退出 2，且不构造 runtime', async () => {
    const { runRun } = await import('./run')
    const code = await runRun({}, deps)
    expect(code).toBe(2)
    expect(disposed).toBe(0)
  })

  it('--dry-run 不 ingest 直接 exit 0', async () => {
    const { runRun } = await import('./run')
    let ingested = false
    ingestImpl = async () => {
      ingested = true
    }
    const code = await runRun({ message: 'hello', dryRun: true, local: true }, deps)
    expect(code).toBe(0)
    expect(ingested).toBe(false)
    expect(disposed).toBe(1)
  })
})

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  }), {
    headers: { 'Content-Type': 'text/event-stream' },
    status: 200,
  })
}
