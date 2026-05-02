import { WorkerEventBus } from '@zonease/aiworker-core'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

/**
 * BUG-005 回归覆盖：`aiworker run` 监听的终态事件必须与 runtime 实际 emit 的契约对齐
 * （`orchestrator.finished` → exit 0，`orchestrator.error` → exit 1）。
 *
 * 实现策略：通过 runRun 的依赖注入传入 stub runtime（含真实 `WorkerEventBus`
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
  it('orchestrator.finished → exit 0', async () => {
    const { runRun } = await import('./run')
    ingestImpl = async () => {
      // 模拟 orchestrator 完成：先发一次中间 text 再发 finished
      runtime.bus.emit('orchestrator.text', { conversationId: 'c1', delta: 'hi' })
      runtime.bus.emit('orchestrator.finished', { conversationId: 'c1' })
    }
    const code = await runRun({ message: 'hello', timeoutMs: 5_000 }, deps)
    expect(code).toBe(0)
    expect(disposed).toBe(1)
  })

  it('orchestrator.error → exit 1', async () => {
    const { runRun } = await import('./run')
    ingestImpl = async () => {
      runtime.bus.emit('orchestrator.error', { conversationId: 'c1', error: 'boom' })
    }
    const code = await runRun({ message: 'hello', timeoutMs: 5_000 }, deps)
    expect(code).toBe(1)
    expect(disposed).toBe(1)
  })

  it('timeout 时退出 124', async () => {
    const { runRun } = await import('./run')
    ingestImpl = async () => {
      // 故意不 emit 任何终态事件
    }
    const code = await runRun({ message: 'hello', timeoutMs: 80 }, deps)
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
    const code = await runRun({ message: 'hello', dryRun: true }, deps)
    expect(code).toBe(0)
    expect(ingested).toBe(false)
    expect(disposed).toBe(1)
  })
})
