import type {
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcResponseError,
} from './types'

/**
 * Bi-directional JSON-RPC 2.0 peer over a line-oriented transport. ACP sits
 * on top of stdio with ndjson framing, so this peer is transport-agnostic:
 * callers supply a `writeLine` and feed inbound lines via `handleLine`.
 *
 * Responsibilities:
 * 1. Map outbound requests to incoming responses by id.
 * 2. Dispatch inbound notifications to `onNotification`.
 * 3. Dispatch inbound requests (agent → client, e.g. `session/request_permission`)
 *    to `onRequest`, auto-replying with either the handler's result or a
 *    `-32601 method not found` when no handler is configured.
 * 4. Respect per-request timeouts and caller `AbortSignal`s so a stuck agent
 *    can't wedge the orchestrator forever.
 */

export interface JsonRpcPeerOptions {
  /** Writes one fully-framed line (caller is responsible for the trailing `\n`). */
  writeLine: (line: string) => void
  /** Inbound notifications (no id); never produces a reply. */
  onNotification?: (notification: JsonRpcNotification) => void
  /** Inbound requests (has id); return value becomes the response result. */
  onRequest?: (request: JsonRpcRequest) => Promise<unknown>
  /** Best-effort callback for transport / parse errors. */
  onError?: (err: Error) => void
  /** Default per-request timeout; ignored when falsy. */
  requestTimeoutMs?: number
}

interface PendingEntry {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout | null
  abortHandler: (() => void) | null
  signal: AbortSignal | null
}

export class JsonRpcPeer {
  private nextId = 1
  private readonly pending = new Map<number | string, PendingEntry>()
  private disposed = false

  constructor(private readonly options: JsonRpcPeerOptions) {}

  /**
   * Send a JSON-RPC request and await its matching response.
   * `signal` cancels the waiter (the wire message is not retracted — ACP
   * callers follow up with `session/cancel` at the protocol level when they
   * want the agent to stop).
   */
  async request<T = unknown>(method: string, params?: unknown, signal?: AbortSignal): Promise<T> {
    if (this.disposed)
      throw new Error('json-rpc peer disposed')
    if (signal?.aborted)
      throw new Error(`json-rpc request ${method} aborted before send`)

    const id = this.nextId++
    const envelope: JsonRpcRequest = params === undefined
      ? { jsonrpc: '2.0', id, method }
      : { jsonrpc: '2.0', id, method, params }

    return new Promise<T>((resolve, reject) => {
      const timeoutMs = this.options.requestTimeoutMs
      const timer = timeoutMs && timeoutMs > 0
        ? setTimeout(() => {
            this.rejectPending(id, new Error(`json-rpc request ${method} timed out after ${timeoutMs}ms`))
          }, timeoutMs)
        : null

      const abortHandler = signal
        ? () => this.rejectPending(id, new Error(`json-rpc request ${method} aborted`))
        : null

      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timer,
        abortHandler,
        signal: signal ?? null,
      })

      if (abortHandler && signal)
        signal.addEventListener('abort', abortHandler, { once: true })

      try {
        this.options.writeLine(`${JSON.stringify(envelope)}\n`)
      }
      catch (err) {
        this.rejectPending(id, err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  /** Fire-and-forget notification (no response expected). */
  notify(method: string, params?: unknown): void {
    if (this.disposed)
      return
    const envelope: JsonRpcNotification = params === undefined
      ? { jsonrpc: '2.0', method }
      : { jsonrpc: '2.0', method, params }
    try {
      this.options.writeLine(`${JSON.stringify(envelope)}\n`)
    }
    catch (err) {
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }

  /** Dispatch one inbound line. Malformed lines are routed to `onError`. */
  handleLine(line: string): void {
    if (this.disposed)
      return
    const trimmed = line.trim()
    if (trimmed.length === 0)
      return
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    }
    catch (err) {
      this.options.onError?.(new Error(`json-rpc parse error: ${err instanceof Error ? err.message : String(err)}`))
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return
    const msg = parsed as JsonRpcMessage

    if ('id' in msg && ('result' in msg || 'error' in msg)) {
      this.handleResponse(msg as JsonRpcResponse)
      return
    }
    if ('id' in msg && 'method' in msg) {
      void this.handleRequest(msg as JsonRpcRequest)
      return
    }
    if ('method' in msg)
      this.options.onNotification?.(msg as JsonRpcNotification)
  }

  /**
   * Reject every pending request and release timers / abort listeners.
   * Callers must invoke this when the underlying transport closes so
   * awaiting coroutines don't hang.
   */
  dispose(reason?: string): void {
    if (this.disposed)
      return
    this.disposed = true
    const err = new Error(reason ?? 'json-rpc peer disposed')
    const entries = Array.from(this.pending.entries())
    this.pending.clear()
    for (const [, entry] of entries) {
      if (entry.timer)
        clearTimeout(entry.timer)
      if (entry.signal && entry.abortHandler)
        entry.signal.removeEventListener('abort', entry.abortHandler)
      entry.reject(err)
    }
  }

  private rejectPending(id: number | string, err: Error): void {
    const entry = this.pending.get(id)
    if (!entry)
      return
    this.pending.delete(id)
    if (entry.timer)
      clearTimeout(entry.timer)
    if (entry.signal && entry.abortHandler)
      entry.signal.removeEventListener('abort', entry.abortHandler)
    entry.reject(err)
  }

  private handleResponse(resp: JsonRpcResponse): void {
    const entry = this.pending.get(resp.id)
    if (!entry)
      return
    this.pending.delete(resp.id)
    if (entry.timer)
      clearTimeout(entry.timer)
    if (entry.signal && entry.abortHandler)
      entry.signal.removeEventListener('abort', entry.abortHandler)
    if ('error' in resp) {
      const e = (resp as JsonRpcResponseError).error
      entry.reject(new Error(`json-rpc error ${e.code}: ${e.message}`))
      return
    }
    entry.resolve(resp.result)
  }

  private async handleRequest(req: JsonRpcRequest): Promise<void> {
    const handler = this.options.onRequest
    if (!handler) {
      this.writeResponse(req.id, undefined, { code: -32601, message: `Method not found: ${req.method}` })
      return
    }
    try {
      const result = await handler(req)
      this.writeResponse(req.id, result)
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.writeResponse(req.id, undefined, { code: -32000, message })
    }
  }

  private writeResponse(
    id: number | string,
    result: unknown,
    error?: { code: number, message: string, data?: unknown },
  ): void {
    const envelope = error
      ? { jsonrpc: '2.0' as const, id, error }
      : { jsonrpc: '2.0' as const, id, result: result ?? null }
    try {
      this.options.writeLine(`${JSON.stringify(envelope)}\n`)
    }
    catch (err) {
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }
}

/**
 * Chunk an arbitrary inbound buffer into whole NDJSON lines plus a remainder.
 * Callers pass the returned `remainder` back in with the next chunk so an
 * envelope that straddles a chunk boundary isn't dropped.
 */
export function splitNdjson(buffer: string, chunk: string): { lines: string[], remainder: string } {
  const combined = buffer + chunk
  const parts = combined.split(/\r?\n/)
  const remainder = parts.pop() ?? ''
  return { lines: parts.filter(l => l.trim().length > 0), remainder }
}
