import type {
  AgentEvent,
  AgentRunInput,
  ExecutorErrorKind,
  ExecutorProvider,
  ExecutorTool,
  ServiceStatus,
} from '@zonease/aiworker-shared'

/**
 * One link in a `FallbackExecutor` chain. `executor` may itself be a
 * `FallbackExecutor`, so chains nest arbitrarily.
 */
export interface FallbackLink {
  executor: ExecutorProvider
  onErrorKinds: ExecutorErrorKind[]
  /** Total attempts on this fallback before bubbling to the next link. */
  maxRetries: number
}

/**
 * Wraps a primary `ExecutorProvider` with an ordered fallback chain. When the
 * primary throws during a `run`, the wrapper classifies the error via
 * `inferErrorKind` and walks `fallbacks` for the first link whose
 * `onErrorKinds` includes the kind, then retries up to `link.maxRetries` times
 * before bubbling to the next matching link. Iteration that has already
 * yielded events cannot fall back — once any event reaches the consumer the
 * stream is committed to the current executor.
 *
 * `health` and `listTools` delegate to the primary; the chain only changes
 * `run` semantics.
 */
export class FallbackExecutor implements ExecutorProvider {
  readonly name: string

  constructor(
    private readonly primary: ExecutorProvider,
    private readonly fallbacks: FallbackLink[],
  ) {
    this.name = `fallback(${primary.name})`
  }

  health(): Promise<ServiceStatus> {
    return this.primary.health()
  }

  listTools(): Promise<ExecutorTool[]> {
    return this.primary.listTools()
  }

  run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    return this.runIterable(input)
  }

  private async* runIterable(input: AgentRunInput): AsyncGenerator<AgentEvent> {
    const result = yield* tryExecutor(this.primary, input)
    if (result.kind === 'ok')
      return

    if (result.yielded) {
      // Stream already committed to primary — bubbling is the only safe move.
      throw result.error
    }

    const errorKind = inferErrorKind(result.error)
    let lastError: unknown = result.error

    for (const link of this.fallbacks) {
      if (!link.onErrorKinds.includes(errorKind))
        continue

      const totalAttempts = Math.max(1, link.maxRetries)
      for (let attempt = 0; attempt < totalAttempts; attempt++) {
        const fallbackResult = yield* tryExecutor(link.executor, input)
        if (fallbackResult.kind === 'ok')
          return
        if (fallbackResult.yielded)
          throw fallbackResult.error
        lastError = fallbackResult.error
      }
      // Exhausted this link; fall through to the next matching link.
    }

    throw lastError
  }
}

type AttemptResult
  = | { kind: 'ok' }
    | { kind: 'error', error: unknown, yielded: boolean }

/**
 * Drives one executor's iteration and reports back whether anything was
 * yielded before a failure. Implemented as a generator so callers `yield*` it
 * to forward events to the consumer in real time.
 */
async function* tryExecutor(
  executor: ExecutorProvider,
  input: AgentRunInput,
): AsyncGenerator<AgentEvent, AttemptResult> {
  let yielded = false
  try {
    for await (const ev of executor.run(input)) {
      yielded = true
      yield ev
    }
    return { kind: 'ok' }
  }
  catch (error) {
    return { kind: 'error', error, yielded }
  }
}

/**
 * Classifies an unknown thrown value into an `ExecutorErrorKind`. Order
 * matters: `auth` outranks `server-5xx` when both signals are present (a 401
 * also has `status >= 400`), and `timeout` (AbortError / `timeout` text)
 * outranks `network` (fetch failed / ECONNREFUSED) so that aborted fetches
 * don't get miscategorised.
 */
export function inferErrorKind(err: unknown): ExecutorErrorKind {
  if (err === null || err === undefined)
    return 'unknown'

  const status = readNumberLike(err, 'status') ?? readNumberLike(err, 'statusCode')
  const code = readString(err, 'code')
  const name = readString(err, 'name')
  const message = readString(err, 'message') ?? toErrorString(err)
  const lowered = message.toLowerCase()

  if (status === 429 || lowered.includes('rate limit') || lowered.includes('rate_limit'))
    return 'rate-limit'

  if (
    status === 408
    || name === 'AbortError'
    || code === 'ETIMEDOUT'
    || lowered.includes('timeout')
    || lowered.includes('engine stall')
  ) {
    return 'timeout'
  }

  if (
    status === 401
    || status === 403
    || lowered.includes('invalid api key')
    || lowered.includes('unauthorized')
  ) {
    return 'auth'
  }

  if (
    code === 'ECONNREFUSED'
    || code === 'ENOTFOUND'
    || code === 'ECONNRESET'
    || code === 'EAI_AGAIN'
    || (name === 'TypeError' && lowered.includes('fetch failed'))
  ) {
    return 'network'
  }

  if (typeof status === 'number' && status >= 500 && status < 600)
    return 'server-5xx'

  return 'unknown'
}

function readNumberLike(err: unknown, key: string): number | undefined {
  if (typeof err !== 'object' || err === null)
    return undefined
  const value = (err as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : undefined
}

function readString(err: unknown, key: string): string | undefined {
  if (typeof err !== 'object' || err === null)
    return undefined
  const value = (err as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function toErrorString(err: unknown): string {
  if (typeof err === 'string')
    return err
  if (err instanceof Error)
    return err.message
  try {
    return String(err)
  }
  catch {
    return ''
  }
}
