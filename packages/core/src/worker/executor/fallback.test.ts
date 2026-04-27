import type {
  AgentEvent,
  AgentRunInput,
  ExecutorProvider,
  ExecutorTool,
  ServiceStatus,
} from '@zonease/aiworker-shared'
import { describe, expect, it } from 'bun:test'
import { FallbackExecutor, inferErrorKind } from './fallback'

/**
 * Test executor whose `run` is driven by a queue of behaviours. Each call to
 * `run` consumes the next behaviour. Behaviours can throw immediately or yield
 * a fixed event sequence.
 */
type Behaviour
  = | { kind: 'throw', error: unknown }
    | { kind: 'yield', events: AgentEvent[] }

class StubExecutor implements ExecutorProvider {
  readonly name: string
  callCount = 0
  private readonly script: Behaviour[]

  constructor(name: string, script: Behaviour[]) {
    this.name = name
    this.script = script
  }

  health(): Promise<ServiceStatus> {
    return Promise.resolve({ name: this.name, status: 'healthy', lastChecked: '2026-01-01T00:00:00Z' })
  }

  listTools(): Promise<ExecutorTool[]> {
    return Promise.resolve([])
  }

  run(_input: AgentRunInput): AsyncIterable<AgentEvent> {
    const idx = this.callCount++
    const next = this.script[idx] ?? this.script[this.script.length - 1]
    return this.iterate(next!)
  }

  private async* iterate(behaviour: Behaviour): AsyncGenerator<AgentEvent> {
    if (behaviour.kind === 'throw')
      throw behaviour.error
    for (const ev of behaviour.events)
      yield ev
  }
}

const SAMPLE_INPUT: AgentRunInput = {
  messages: [{ role: 'user', content: 'hello' }],
}

const FINISH_OK: AgentEvent[] = [
  { type: 'assistant_message_delta', delta: 'hi' },
  { type: 'finish', reason: 'stop' },
]

async function collect(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const ev of stream)
    events.push(ev)
  return events
}

describe('inferErrorKind', () => {
  it('classifies rate-limit by status 429 or message text', () => {
    expect(inferErrorKind(Object.assign(new Error('quota'), { status: 429 }))).toBe('rate-limit')
    expect(inferErrorKind(new Error('hit rate limit on tier'))).toBe('rate-limit')
    expect(inferErrorKind(new Error('rate_limit_exceeded'))).toBe('rate-limit')
  })

  it('classifies timeout by AbortError / 408 / timeout text', () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' })
    expect(inferErrorKind(aborted)).toBe('timeout')
    expect(inferErrorKind(Object.assign(new Error('slow'), { status: 408 }))).toBe('timeout')
    expect(inferErrorKind(new Error('engine stall: codex 60s'))).toBe('timeout')
    expect(inferErrorKind(new Error('request timeout reached'))).toBe('timeout')
  })

  it('classifies auth by 401 / 403 / unauthorized / invalid api key', () => {
    expect(inferErrorKind(Object.assign(new Error('nope'), { status: 401 }))).toBe('auth')
    expect(inferErrorKind(Object.assign(new Error('nope'), { status: 403 }))).toBe('auth')
    expect(inferErrorKind(new Error('Unauthorized'))).toBe('auth')
    expect(inferErrorKind(new Error('invalid api key'))).toBe('auth')
  })

  it('classifies network by ECONNREFUSED / ENOTFOUND / fetch failed', () => {
    expect(inferErrorKind(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))).toBe('network')
    expect(inferErrorKind(Object.assign(new Error('dns'), { code: 'ENOTFOUND' }))).toBe('network')
    const fetchFailed = Object.assign(new TypeError('fetch failed'), { name: 'TypeError' })
    expect(inferErrorKind(fetchFailed)).toBe('network')
  })

  it('classifies server-5xx by status 500-599', () => {
    expect(inferErrorKind(Object.assign(new Error('boom'), { status: 500 }))).toBe('server-5xx')
    expect(inferErrorKind(Object.assign(new Error('busy'), { status: 503 }))).toBe('server-5xx')
    expect(inferErrorKind(Object.assign(new Error('boom'), { status: 599 }))).toBe('server-5xx')
  })

  it('falls back to unknown for unrecognised shapes', () => {
    expect(inferErrorKind(new Error('mystery'))).toBe('unknown')
    expect(inferErrorKind('plain string error')).toBe('unknown')
    expect(inferErrorKind(null)).toBe('unknown')
  })

  it('prioritises auth over server-5xx when both signals clash', () => {
    // Synthetic: 401 with text "internal server error". Auth wins.
    const conflict = Object.assign(new Error('internal server error'), { status: 401 })
    expect(inferErrorKind(conflict)).toBe('auth')
  })

  it('prioritises timeout over network when AbortError fires after a fetch', () => {
    const aborted = Object.assign(new Error('fetch failed'), {
      name: 'AbortError',
      // Some runtimes leave ECONNREFUSED on the cause; AbortError still wins.
      code: 'ECONNREFUSED',
    })
    expect(inferErrorKind(aborted)).toBe('timeout')
  })
})

describe('FallbackExecutor.run', () => {
  it('passes through primary success without consulting fallbacks', async () => {
    const primary = new StubExecutor('primary', [{ kind: 'yield', events: FINISH_OK }])
    const fallback = new StubExecutor('fallback', [{ kind: 'yield', events: FINISH_OK }])
    const wrapper = new FallbackExecutor(primary, [
      { executor: fallback, onErrorKinds: ['rate-limit'], maxRetries: 1 },
    ])

    const events = await collect(wrapper.run(SAMPLE_INPUT))
    expect(events).toEqual(FINISH_OK)
    expect(primary.callCount).toBe(1)
    expect(fallback.callCount).toBe(0)
  })

  it('routes 429 to a rate-limit fallback', async () => {
    const err = Object.assign(new Error('quota'), { status: 429 })
    const primary = new StubExecutor('primary', [{ kind: 'throw', error: err }])
    const fallback = new StubExecutor('fallback', [{ kind: 'yield', events: FINISH_OK }])
    const wrapper = new FallbackExecutor(primary, [
      { executor: fallback, onErrorKinds: ['rate-limit'], maxRetries: 1 },
    ])

    const events = await collect(wrapper.run(SAMPLE_INPUT))
    expect(events).toEqual(FINISH_OK)
    expect(fallback.callCount).toBe(1)
  })

  it('routes AbortError timeout to a timeout fallback', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const primary = new StubExecutor('primary', [{ kind: 'throw', error: aborted }])
    const fallback = new StubExecutor('fallback', [{ kind: 'yield', events: FINISH_OK }])
    const wrapper = new FallbackExecutor(primary, [
      { executor: fallback, onErrorKinds: ['timeout'], maxRetries: 1 },
    ])

    const events = await collect(wrapper.run(SAMPLE_INPUT))
    expect(events).toEqual(FINISH_OK)
    expect(fallback.callCount).toBe(1)
  })

  it('routes 401 to an auth fallback', async () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 })
    const primary = new StubExecutor('primary', [{ kind: 'throw', error: err }])
    const fallback = new StubExecutor('fallback', [{ kind: 'yield', events: FINISH_OK }])
    const wrapper = new FallbackExecutor(primary, [
      { executor: fallback, onErrorKinds: ['auth'], maxRetries: 1 },
    ])

    const events = await collect(wrapper.run(SAMPLE_INPUT))
    expect(events).toEqual(FINISH_OK)
    expect(fallback.callCount).toBe(1)
  })

  it('routes ECONNREFUSED to a network fallback', async () => {
    const err = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })
    const primary = new StubExecutor('primary', [{ kind: 'throw', error: err }])
    const fallback = new StubExecutor('fallback', [{ kind: 'yield', events: FINISH_OK }])
    const wrapper = new FallbackExecutor(primary, [
      { executor: fallback, onErrorKinds: ['network'], maxRetries: 1 },
    ])

    const events = await collect(wrapper.run(SAMPLE_INPUT))
    expect(events).toEqual(FINISH_OK)
    expect(fallback.callCount).toBe(1)
  })

  it('routes 503 to a server-5xx fallback', async () => {
    const err = Object.assign(new Error('busy'), { status: 503 })
    const primary = new StubExecutor('primary', [{ kind: 'throw', error: err }])
    const fallback = new StubExecutor('fallback', [{ kind: 'yield', events: FINISH_OK }])
    const wrapper = new FallbackExecutor(primary, [
      { executor: fallback, onErrorKinds: ['server-5xx'], maxRetries: 1 },
    ])

    const events = await collect(wrapper.run(SAMPLE_INPUT))
    expect(events).toEqual(FINISH_OK)
    expect(fallback.callCount).toBe(1)
  })

  it('bubbles unknown errors when no fallback lists `unknown`', async () => {
    const err = new Error('mystery')
    const primary = new StubExecutor('primary', [{ kind: 'throw', error: err }])
    const fallback = new StubExecutor('fallback', [{ kind: 'yield', events: FINISH_OK }])
    const wrapper = new FallbackExecutor(primary, [
      { executor: fallback, onErrorKinds: ['rate-limit'], maxRetries: 1 },
    ])

    let captured: unknown
    try {
      await collect(wrapper.run(SAMPLE_INPUT))
    }
    catch (e) {
      captured = e
    }
    expect(captured).toBe(err)
    expect(fallback.callCount).toBe(0)
  })

  it('routes unknown errors when a fallback lists `unknown`', async () => {
    const err = new Error('mystery')
    const primary = new StubExecutor('primary', [{ kind: 'throw', error: err }])
    const fallback = new StubExecutor('fallback', [{ kind: 'yield', events: FINISH_OK }])
    const wrapper = new FallbackExecutor(primary, [
      { executor: fallback, onErrorKinds: ['unknown'], maxRetries: 1 },
    ])

    const events = await collect(wrapper.run(SAMPLE_INPUT))
    expect(events).toEqual(FINISH_OK)
    expect(fallback.callCount).toBe(1)
  })

  it('nested chain: outer fallback delegates to its own primary', async () => {
    // outer: primary1 → wrapper2(primary2 → fallback3)
    // primary1 throws 429 → outer catches → calls wrapper2.run
    // wrapper2.primary (= primary2) throws 503 → wrapper2 catches via its own
    // server-5xx fallback (= fallback3) → fallback3 succeeds.
    const primary1 = new StubExecutor('p1', [
      { kind: 'throw', error: Object.assign(new Error('quota'), { status: 429 }) },
    ])
    const primary2 = new StubExecutor('p2', [
      { kind: 'throw', error: Object.assign(new Error('busy'), { status: 503 }) },
    ])
    const fallback3 = new StubExecutor('f3', [{ kind: 'yield', events: FINISH_OK }])

    const inner = new FallbackExecutor(primary2, [
      { executor: fallback3, onErrorKinds: ['server-5xx'], maxRetries: 1 },
    ])
    const outer = new FallbackExecutor(primary1, [
      { executor: inner, onErrorKinds: ['rate-limit'], maxRetries: 1 },
    ])

    const events = await collect(outer.run(SAMPLE_INPUT))
    expect(events).toEqual(FINISH_OK)
    expect(primary1.callCount).toBe(1)
    expect(primary2.callCount).toBe(1)
    expect(fallback3.callCount).toBe(1)
  })

  it('exhausts maxRetries on a fallback before bubbling the last error', async () => {
    const primaryErr = Object.assign(new Error('quota'), { status: 429 })
    const fallbackErr = Object.assign(new Error('still rate-limited'), { status: 429 })
    const primary = new StubExecutor('primary', [{ kind: 'throw', error: primaryErr }])
    const fallback = new StubExecutor('fallback', [
      { kind: 'throw', error: fallbackErr },
      { kind: 'throw', error: fallbackErr },
      { kind: 'throw', error: fallbackErr },
    ])
    const wrapper = new FallbackExecutor(primary, [
      { executor: fallback, onErrorKinds: ['rate-limit'], maxRetries: 3 },
    ])

    let captured: unknown
    try {
      await collect(wrapper.run(SAMPLE_INPUT))
    }
    catch (e) {
      captured = e
    }
    expect(captured).toBe(fallbackErr)
    expect(fallback.callCount).toBe(3)
  })

  it('walks to the next matching link when one fallback is exhausted', async () => {
    const primaryErr = Object.assign(new Error('quota'), { status: 429 })
    const firstFallbackErr = Object.assign(new Error('still 429'), { status: 429 })
    const primary = new StubExecutor('primary', [{ kind: 'throw', error: primaryErr }])
    const first = new StubExecutor('first', [
      { kind: 'throw', error: firstFallbackErr },
      { kind: 'throw', error: firstFallbackErr },
    ])
    const second = new StubExecutor('second', [{ kind: 'yield', events: FINISH_OK }])

    const wrapper = new FallbackExecutor(primary, [
      { executor: first, onErrorKinds: ['rate-limit'], maxRetries: 2 },
      { executor: second, onErrorKinds: ['rate-limit'], maxRetries: 1 },
    ])

    const events = await collect(wrapper.run(SAMPLE_INPUT))
    expect(events).toEqual(FINISH_OK)
    expect(first.callCount).toBe(2)
    expect(second.callCount).toBe(1)
  })
})
