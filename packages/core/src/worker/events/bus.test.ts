import { describe, expect, it, mock } from 'bun:test'
import consola from 'consola'
import { WorkerEventBus } from './bus'

describe('WorkerEventBus', () => {
  it('emit 把事件投递给所有 listener，并自动填 type / at', () => {
    const bus = new WorkerEventBus()
    const seen: Array<{ type: string, payload: Record<string, unknown> }> = []
    bus.on(e => seen.push({ type: e.type, payload: e.payload }))
    bus.emit('orchestrator.tick', { n: 1 })
    expect(seen).toEqual([{ type: 'orchestrator.tick', payload: { n: 1 } }])
  })

  it('一个 listener 抛错不应阻断其他 listener，并通过 consola.warn 上报', () => {
    const bus = new WorkerEventBus()
    const ok = mock<(e: { type: string }) => void>(() => {})
    const original = consola.warn
    const warnings: unknown[][] = []
    consola.warn = ((...args: unknown[]) => {
      warnings.push(args)
    }) as typeof consola.warn
    try {
      bus.on(() => {
        throw new Error('boom')
      })
      bus.on(ok)
      bus.emit('evolution.proposal.appended', { id: 'p1' })
      expect(ok).toHaveBeenCalledTimes(1)
      expect(warnings).toHaveLength(1)
      const [msg, err] = warnings[0]!
      expect(String(msg)).toContain('evolution.proposal.appended')
      expect((err as Error).message).toBe('boom')
    }
    finally {
      consola.warn = original
    }
  })

  it('on 返回 unsubscribe，调用后该 listener 不再被触发', () => {
    const bus = new WorkerEventBus()
    const calls: string[] = []
    const off = bus.on(e => calls.push(e.type))
    bus.emit('a', {})
    off()
    bus.emit('b', {})
    expect(calls).toEqual(['a'])
  })
})
