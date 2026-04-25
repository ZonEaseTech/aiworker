import type {
  ProcessManagerOptions,
  ProcessRunRequest,
} from './process-manager'
import { describe, expect, it } from 'bun:test'

import { ProcessManager } from './process-manager'

function defaultOpts(overrides: Partial<ProcessManagerOptions> = {}): ProcessManagerOptions {
  return {
    maxConcurrentTotal: 4,
    perEngineLimits: {},
    stallTimeoutMs: 60_000,
    killTimeoutMs: 5_000,
    autoCleanupDelayMs: 60_000,
    gcIntervalMs: 0,
    ...overrides,
  }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (v: T | PromiseLike<T>) => void
  reject: (err: unknown) => void
}

function defer<T>(): Deferred<T> {
  let resolve!: (v: T | PromiseLike<T>) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

interface JobCapture {
  /** 通过 request.job() 拿到的 deferred；外部 resolve 后 job 才结束。 */
  deferred: Deferred<void>
  spawnedAt: number
  cancelled: boolean
  cancelCount: number
  emitActivity: () => void
}

function jobReq(opts: {
  group: string
  engine?: string
  cls?: ProcessRunRequest['class']
  signal?: AbortSignal
  capture?: JobCapture
}): { req: ProcessRunRequest, capture: JobCapture, started: Promise<void> } {
  const startedSignal = defer<void>()
  const capture: JobCapture = opts.capture ?? {
    deferred: defer<void>(),
    spawnedAt: 0,
    cancelled: false,
    cancelCount: 0,
    emitActivity: () => {},
  }
  let activityCb: (() => void) | null = null
  capture.emitActivity = () => activityCb?.()

  const req: ProcessRunRequest = {
    group: opts.group,
    engine: opts.engine ?? 'http',
    ...(opts.cls === undefined ? {} : { class: opts.cls }),
    ...(opts.signal === undefined ? {} : { signal: opts.signal }),
    onSpawn: async () => {
      capture.spawnedAt = Date.now()
      return {
        cancel: async () => {
          capture.cancelled = true
          capture.cancelCount += 1
        },
        onActivity: (cb: () => void) => {
          activityCb = cb
          return () => {
            activityCb = null
          }
        },
      }
    },
    job: async () => {
      startedSignal.resolve()
      await capture.deferred.promise
    },
  }
  return { req, capture, started: startedSignal.promise }
}

describe('ProcessManager — slot accounting', () => {
  it('全局 slot 限制：total=2 时第三个 job 入队', async () => {
    const pm = new ProcessManager(defaultOpts({ maxConcurrentTotal: 2 }))
    const a = jobReq({ group: 'g1' })
    const b = jobReq({ group: 'g2' })
    const c = jobReq({ group: 'g3' })
    pm.run(a.req).catch(() => undefined)
    pm.run(b.req).catch(() => undefined)
    pm.run(c.req).catch(() => undefined)

    await a.started
    await b.started
    await new Promise(r => setTimeout(r, 30))
    expect(c.capture.spawnedAt).toBe(0)

    let snap = pm.snapshot()
    expect(snap.totalActive).toBe(2)
    expect(snap.totalQueued).toBe(1)
    expect(snap.availableSlots).toBe(0)

    a.capture.deferred.resolve()
    await c.started
    snap = pm.snapshot()
    expect(snap.totalActive).toBe(2)
    expect(snap.totalQueued).toBe(0)

    b.capture.deferred.resolve()
    c.capture.deferred.resolve()
    await new Promise(r => setTimeout(r, 10))
    pm.dispose()
  })

  it('per-engine 限制：claude-code 限 1 时同 engine 第二个排队，其它 engine 不受影响', async () => {
    const pm = new ProcessManager(defaultOpts({
      maxConcurrentTotal: 4,
      perEngineLimits: { 'claude-code': 1 },
    }))
    const cc1 = jobReq({ group: 'g-cc-1', engine: 'claude-code' })
    const cc2 = jobReq({ group: 'g-cc-2', engine: 'claude-code' })
    const http1 = jobReq({ group: 'g-h-1', engine: 'http' })

    pm.run(cc1.req).catch(() => undefined)
    pm.run(cc2.req).catch(() => undefined)
    pm.run(http1.req).catch(() => undefined)

    await cc1.started
    await http1.started
    await new Promise(r => setTimeout(r, 30))
    expect(cc2.capture.spawnedAt).toBe(0)

    const snap = pm.snapshot()
    expect(snap.perEngine['claude-code']!.active).toBe(1)
    expect(snap.perEngine['claude-code']!.queued).toBe(1)
    expect(snap.perEngine['claude-code']!.available).toBe(0)
    expect(snap.perEngine.http!.active).toBe(1)

    cc1.capture.deferred.resolve()
    await cc2.started
    cc2.capture.deferred.resolve()
    http1.capture.deferred.resolve()
    await new Promise(r => setTimeout(r, 10))
    pm.dispose()
  })
})

describe('ProcessManager — group FIFO', () => {
  it('同 group 两个 job 即便 slot 空闲也按入队顺序串行', async () => {
    const pm = new ProcessManager(defaultOpts({ maxConcurrentTotal: 4 }))
    const a = jobReq({ group: 'same' })
    const b = jobReq({ group: 'same' })

    pm.run(a.req).catch(() => undefined)
    pm.run(b.req).catch(() => undefined)
    await a.started

    await new Promise(r => setTimeout(r, 30))
    expect(b.capture.spawnedAt).toBe(0)

    a.capture.deferred.resolve()
    await b.started
    expect(a.capture.spawnedAt).toBeLessThanOrEqual(b.capture.spawnedAt)

    b.capture.deferred.resolve()
    await new Promise(r => setTimeout(r, 10))
    pm.dispose()
  })
})

describe('ProcessManager — priority', () => {
  it('background 入队后 interactive 入队，interactive 先跑（不同 group）', async () => {
    const pm = new ProcessManager(defaultOpts({ maxConcurrentTotal: 1 }))
    const blocker = jobReq({ group: 'block' })
    pm.run(blocker.req).catch(() => undefined)
    await blocker.started

    const bg = jobReq({ group: 'bg', cls: 'background' })
    const inter = jobReq({ group: 'inter', cls: 'interactive' })
    pm.run(bg.req).catch(() => undefined)
    pm.run(inter.req).catch(() => undefined)

    blocker.capture.deferred.resolve()
    await inter.started
    expect(bg.capture.spawnedAt).toBe(0)

    inter.capture.deferred.resolve()
    await bg.started

    bg.capture.deferred.resolve()
    await new Promise(r => setTimeout(r, 10))
    pm.dispose()
  })
})

describe('ProcessManager — stall detection', () => {
  it('无 onActivity，超时后 cancel 被调，state 变 cancelled', async () => {
    const pm = new ProcessManager(defaultOpts({
      maxConcurrentTotal: 1,
      stallTimeoutMs: 30,
      killTimeoutMs: 10_000,
    }))
    const a = jobReq({ group: 'g1' })
    const promise = pm.run(a.req).catch(err => err)
    await a.started
    await new Promise(r => setTimeout(r, 80))
    expect(a.capture.cancelled).toBe(true)
    a.capture.deferred.resolve()
    const result = await promise
    expect(result).toBeInstanceOf(Error)
    const snap = pm.snapshot()
    expect(snap.byState.cancelled).toBeGreaterThanOrEqual(1)
    pm.dispose()
  })

  it('emitActivity 持续喂活，stall 不触发', async () => {
    const pm = new ProcessManager(defaultOpts({
      maxConcurrentTotal: 1,
      stallTimeoutMs: 50,
      killTimeoutMs: 10_000,
    }))
    const a = jobReq({ group: 'g1' })
    pm.run(a.req).catch(() => undefined)
    await a.started

    let beats = 0
    const ticker = setInterval(() => {
      a.capture.emitActivity()
      beats += 1
    }, 15)
    await new Promise(r => setTimeout(r, 200))
    clearInterval(ticker)
    expect(beats).toBeGreaterThan(5)
    expect(a.capture.cancelled).toBe(false)

    a.capture.deferred.resolve()
    await new Promise(r => setTimeout(r, 10))
    pm.dispose()
  })
})

describe('ProcessManager — kill escalation', () => {
  it('cancel 后 killTimeout 触发硬 kill（cancel 再被调一次）', async () => {
    const pm = new ProcessManager(defaultOpts({
      maxConcurrentTotal: 1,
      stallTimeoutMs: 30,
      killTimeoutMs: 40,
    }))
    const a = jobReq({ group: 'g1' })
    pm.run(a.req).catch(() => undefined)
    await a.started

    await new Promise(r => setTimeout(r, 120))
    expect(a.capture.cancelCount).toBeGreaterThanOrEqual(2)

    a.capture.deferred.resolve()
    await new Promise(r => setTimeout(r, 10))
    pm.dispose()
  })
})

describe('ProcessManager — setLimits hot-reload', () => {
  it('提高 total 容量后被阻塞的 job 立刻起', async () => {
    const pm = new ProcessManager(defaultOpts({ maxConcurrentTotal: 1 }))
    const a = jobReq({ group: 'g1' })
    const b = jobReq({ group: 'g2' })
    pm.run(a.req).catch(() => undefined)
    pm.run(b.req).catch(() => undefined)
    await a.started
    await new Promise(r => setTimeout(r, 30))
    expect(b.capture.spawnedAt).toBe(0)

    pm.setLimits({ maxConcurrentTotal: 2 })
    await b.started

    a.capture.deferred.resolve()
    b.capture.deferred.resolve()
    await new Promise(r => setTimeout(r, 10))
    pm.dispose()
  })

  it('提高 per-engine 容量后该 engine 阻塞的 job 立刻起', async () => {
    const pm = new ProcessManager(defaultOpts({
      maxConcurrentTotal: 4,
      perEngineLimits: { 'claude-code': 1 },
    }))
    const a = jobReq({ group: 'g-a', engine: 'claude-code' })
    const b = jobReq({ group: 'g-b', engine: 'claude-code' })
    pm.run(a.req).catch(() => undefined)
    pm.run(b.req).catch(() => undefined)
    await a.started
    await new Promise(r => setTimeout(r, 30))
    expect(b.capture.spawnedAt).toBe(0)

    pm.setLimits({ perEngineLimits: { 'claude-code': 2 } })
    await b.started

    a.capture.deferred.resolve()
    b.capture.deferred.resolve()
    await new Promise(r => setTimeout(r, 10))
    pm.dispose()
  })
})

describe('ProcessManager — cancelGroup', () => {
  it('取消同 group 所有 queued + running 任务', async () => {
    const pm = new ProcessManager(defaultOpts({ maxConcurrentTotal: 4, killTimeoutMs: 50 }))
    const a = jobReq({ group: 'g1' })
    const b = jobReq({ group: 'g1' })
    const other = jobReq({ group: 'other' })
    const aP = pm.run(a.req).catch(err => err)
    const bP = pm.run(b.req).catch(err => err)
    const otherP = pm.run(other.req).catch(err => err)
    await a.started
    await other.started

    await pm.cancelGroup('g1')

    const bResult = await bP
    expect(bResult).toBeInstanceOf(Error)
    expect(a.capture.cancelled).toBe(true)

    a.capture.deferred.resolve()
    const aResult = await aP
    expect(aResult).toBeInstanceOf(Error)

    other.capture.deferred.resolve()
    await otherP
    pm.dispose()
  })
})

describe('ProcessManager — snapshot', () => {
  it('snapshot 反映当前 active / queued / per-engine / byState', async () => {
    const pm = new ProcessManager(defaultOpts({
      maxConcurrentTotal: 2,
      perEngineLimits: { 'http': 2, 'claude-code': 1 },
    }))
    const h1 = jobReq({ group: 'h1', engine: 'http' })
    const h2 = jobReq({ group: 'h2', engine: 'http' })
    const cc = jobReq({ group: 'cc', engine: 'claude-code' })
    pm.run(h1.req).catch(() => undefined)
    pm.run(h2.req).catch(() => undefined)
    pm.run(cc.req).catch(() => undefined)
    await h1.started
    await h2.started

    const snap = pm.snapshot()
    expect(snap.maxConcurrentTotal).toBe(2)
    expect(snap.totalActive).toBe(2)
    expect(snap.totalQueued).toBe(1)
    expect(snap.availableSlots).toBe(0)
    expect(snap.perEngine.http!.active).toBe(2)
    expect(snap.perEngine.http!.queued).toBe(0)
    expect(snap.perEngine['claude-code']!.queued).toBe(1)
    expect(snap.byState.running).toBe(2)
    expect(snap.byState.queued).toBe(1)

    h1.capture.deferred.resolve()
    h2.capture.deferred.resolve()
    await cc.started
    cc.capture.deferred.resolve()
    await new Promise(r => setTimeout(r, 20))
    const snap2 = pm.snapshot()
    expect(snap2.byState.completed).toBe(3)
    expect(snap2.recentTerminal.length).toBe(3)
    expect(snap2.recentTerminal[0]!.state).toBe('completed')
    pm.dispose()
  })
})

describe('ProcessManager — abort signal & onSpawn failure', () => {
  it('外部 AbortSignal 触发 cancel', async () => {
    const pm = new ProcessManager(defaultOpts({ maxConcurrentTotal: 1, killTimeoutMs: 50 }))
    const ctl = new AbortController()
    const a = jobReq({ group: 'g1', signal: ctl.signal })
    const p = pm.run(a.req).catch(err => err)
    await a.started
    ctl.abort()
    await new Promise(r => setTimeout(r, 30))
    expect(a.capture.cancelled).toBe(true)
    a.capture.deferred.resolve()
    const result = await p
    expect(result).toBeInstanceOf(Error)
    pm.dispose()
  })

  it('onSpawn 抛错 => job 不跑，state=failed，slot 释放', async () => {
    const pm = new ProcessManager(defaultOpts({ maxConcurrentTotal: 1 }))
    const failing: ProcessRunRequest = {
      group: 'g1',
      engine: 'http',
      onSpawn: async () => { throw new Error('spawn boom') },
      job: async () => {},
    }

    const result = await pm.run(failing).catch(err => err as Error)
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toContain('spawn boom')

    const next = jobReq({ group: 'g2' })
    pm.run(next.req).catch(() => undefined)
    await next.started
    next.capture.deferred.resolve()
    await new Promise(r => setTimeout(r, 10))
    pm.dispose()
  })
})

describe('ProcessManager — dispose', () => {
  it('dispose 后 run() reject，已 running 的 cancel 被请求', async () => {
    const pm = new ProcessManager(defaultOpts({ maxConcurrentTotal: 1, killTimeoutMs: 50 }))
    const a = jobReq({ group: 'g1' })
    pm.run(a.req).catch(() => undefined)
    await a.started

    await pm.cancelAll()
    pm.dispose()

    const next = jobReq({ group: 'g2' })
    const result = await pm.run(next.req).catch(err => err as Error)
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toContain('disposed')

    a.capture.deferred.resolve()
  })
})
