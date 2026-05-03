import type {
  AgentEvent,
  EngineKind,
  ExecutorConfig,
  ServiceStatus,
} from '@zonease/aiworker-shared'
import type { WorkerModeState } from './state'

/** Max milliseconds we'll spend on the probe before aborting. */
const PROBE_TIMEOUT_MS = 5_000

/** Truncation cap on the probe's returned text. */
const PROBE_TEXT_LIMIT = 100

const PROBE_NEXT_TIMEOUT = Symbol('probe-next-timeout')

export interface ExecutorTestRow {
  type: EngineKind
  status: ServiceStatus['status'] | 'unknown' | 'degraded'
  tinyProbe?: {
    ok: boolean
    latencyMs: number
    /** First PROBE_TEXT_LIMIT characters of the streamed text. */
    output?: string
  }
  probeError?: string
}

export interface ExecutorTestResponse {
  executor: ExecutorTestRow
}

function errorMessage(err: unknown): string {
  if (err instanceof Error)
    return err.message
  return String(err)
}

function timeoutErrorMessage(timeoutMs: number): string {
  return `executor tiny probe timed out after ${timeoutMs}ms`
}

function closeIterator(iterator: AsyncIterator<AgentEvent>): void {
  if (!iterator.return)
    return
  void Promise.resolve(iterator.return()).catch(() => {})
}

async function readNextWithDeadline(
  iterator: AsyncIterator<AgentEvent>,
  controller: AbortController,
  deadline: number,
): Promise<IteratorResult<AgentEvent> | typeof PROBE_NEXT_TIMEOUT> {
  const remainingMs = Math.ceil(deadline - performance.now())
  if (remainingMs <= 0) {
    controller.abort()
    return PROBE_NEXT_TIMEOUT
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<typeof PROBE_NEXT_TIMEOUT>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(PROBE_NEXT_TIMEOUT)
    }, remainingMs)
  })

  try {
    return await Promise.race([iterator.next(), timeout])
  }
  finally {
    if (timer !== undefined)
      clearTimeout(timer)
  }
}

async function runTinyProbe(
  state: WorkerModeState,
  options: { timeoutMs?: number } = {},
): Promise<{ ok: boolean, latencyMs: number, output?: string, error?: string }> {
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS
  const start = performance.now()
  const deadline = start + timeoutMs
  const controller = new AbortController()
  let iterator: AsyncIterator<AgentEvent> | undefined
  let iteratorClosed = false
  function closeProbeIterator(): void {
    if (!iterator || iteratorClosed)
      return
    iteratorClosed = true
    closeIterator(iterator)
  }

  try {
    const stream = state.runtime.executor.run({
      messages: [{ role: 'user', content: 'ping' }],
      signal: controller.signal,
    })
    iterator = (stream as AsyncIterable<AgentEvent>)[Symbol.asyncIterator]()
    let output = ''
    while (true) {
      const next = await readNextWithDeadline(iterator, controller, deadline)
      if (next === PROBE_NEXT_TIMEOUT) {
        closeProbeIterator()
        return {
          ok: false,
          latencyMs: Math.round(performance.now() - start),
          error: timeoutErrorMessage(timeoutMs),
        }
      }
      if (next.done)
        break

      const event = next.value
      if (event.type === 'assistant_message_delta') {
        output += event.delta
        if (output.length >= PROBE_TEXT_LIMIT)
          break
      }
      else if (event.type === 'error') {
        return {
          ok: false,
          latencyMs: Math.round(performance.now() - start),
          error: event.error,
        }
      }
      else if (event.type === 'finish') {
        break
      }
    }
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - start),
      output: output.slice(0, PROBE_TEXT_LIMIT),
    }
  }
  catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: errorMessage(err),
    }
  }
  finally {
    closeProbeIterator()
  }
}

/**
 * Probe `runtime.executor.health()` and optionally run a short chat completion
 * against the configured executor. When the probe is requested but fails, the
 * response still returns 200 with `status: 'degraded'` and the caller-visible
 * error under `probeError` — a failing probe is still an informative outcome.
 */
export async function handleExecutorTest(
  state: WorkerModeState,
  storedConfig: { executor: ExecutorConfig },
  options: { probe?: boolean, probeTimeoutMs?: number } = {},
): Promise<ExecutorTestResponse> {
  const type = storedConfig.executor.engine
  let healthStatus: ServiceStatus['status'] | 'unknown' = 'unknown'
  try {
    const health = await state.runtime.executor.health()
    healthStatus = health.status
  }
  catch {
    healthStatus = 'unknown'
  }

  if (!options.probe)
    return { executor: { type, status: healthStatus } }

  const probe = await runTinyProbe(state, { timeoutMs: options.probeTimeoutMs })
  if (!probe.ok) {
    return {
      executor: {
        type,
        status: 'degraded',
        tinyProbe: { ok: false, latencyMs: probe.latencyMs },
        ...(probe.error === undefined ? {} : { probeError: probe.error }),
      },
    }
  }

  return {
    executor: {
      type,
      status: healthStatus,
      tinyProbe: {
        ok: true,
        latencyMs: probe.latencyMs,
        ...(probe.output === undefined ? {} : { output: probe.output }),
      },
    },
  }
}
