import type {
  AgentEvent,
  EngineKind,
  ExecutorConfig,
  ServiceStatus,
} from '@aiworker/shared'
import type { WorkerModeState } from '../../modes/worker'

/** Max milliseconds we'll spend on the probe before aborting. */
const PROBE_TIMEOUT_MS = 5_000

/** Truncation cap on the probe's returned text. */
const PROBE_TEXT_LIMIT = 100

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

async function runTinyProbe(
  state: WorkerModeState,
): Promise<{ ok: boolean, latencyMs: number, output?: string, error?: string }> {
  const start = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const stream = state.runtime.executor.run({
      messages: [{ role: 'user', content: 'ping' }],
      signal: controller.signal,
    })
    let output = ''
    for await (const event of stream as AsyncIterable<AgentEvent>) {
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
    clearTimeout(timer)
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
  options: { probe?: boolean } = {},
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

  const probe = await runTinyProbe(state)
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
