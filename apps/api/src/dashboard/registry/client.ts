import type { WorkerInfo } from '@aiworker/shared'

/**
 * HTTP client the manager uses to reach a registered worker's `/api/worker/*`
 * surface. Every method issues its call against `${baseUrl}/api/worker/<path>`
 * with `Authorization: Bearer <apiToken>`. See PLAN-004 §Auth model.
 *
 * This 3.1 cut only implements `info()` (for register-time validation) and a
 * generic `passThrough()` that 3.2's proxy route will forward raw Responses
 * from.
 */

export class WorkerClientAuthError extends Error {
  constructor(message = 'worker rejected bearer token') {
    super(message)
    this.name = 'WorkerClientAuthError'
  }
}

export class WorkerClientNetworkError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'WorkerClientNetworkError'
  }
}

export class WorkerClientInvalidResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkerClientInvalidResponseError'
  }
}

export interface WorkerClientOptions {
  baseUrl: string
  apiToken: string
  fetchImpl?: typeof fetch
  /** Request timeout in milliseconds. Defaults to 10 000 (see PLAN-004 3.1). */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

export class WorkerClient {
  private readonly baseUrl: string
  private readonly apiToken: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(options: WorkerClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.apiToken = options.apiToken
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  private buildUrl(path: string): string {
    const relative = path.replace(/^\/+/, '')
    return `${this.baseUrl}/api/worker/${relative}`
  }

  /**
   * Run a request through an AbortController-bound timeout. Network failures
   * (DNS, refused connection, TLS, timeout, etc.) are normalised to
   * `WorkerClientNetworkError`; HTTP responses pass through untouched so
   * callers can inspect `status`.
   */
  private async request(
    method: string,
    path: string,
    body: unknown,
    extraHeaders: Record<string, string>,
  ): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      ...extraHeaders,
    }
    const init: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    }
    if (body !== undefined) {
      if (typeof body === 'string') {
        init.body = body
      }
      else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
        // Proxy pass-through: preserve the exact bytes + caller-supplied
        // Content-Type. Do not set application/json here.
        init.body = body as BodyInit
      }
      else {
        init.body = JSON.stringify(body)
        if (!headers['Content-Type'])
          headers['Content-Type'] = 'application/json'
      }
    }
    try {
      return await this.fetchImpl(this.buildUrl(path), init)
    }
    catch (err) {
      if ((err as { name?: string }).name === 'AbortError')
        throw new WorkerClientNetworkError(`worker ${this.baseUrl} request timed out after ${this.timeoutMs}ms`, err)
      throw new WorkerClientNetworkError(`worker ${this.baseUrl} unreachable: ${(err as Error).message ?? String(err)}`, err)
    }
    finally {
      clearTimeout(timeout)
    }
  }

  /**
   * `GET /api/worker/info`. Throws `WorkerClientAuthError` on 401,
   * `WorkerClientNetworkError` on any non-2xx other than 401, and
   * `WorkerClientInvalidResponseError` when the body is not a valid
   * `WorkerInfo` shape (missing workerId/configVersion or wrong types).
   */
  async info(): Promise<WorkerInfo> {
    const res = await this.request('GET', 'info', undefined, {})
    if (res.status === 401)
      throw new WorkerClientAuthError()
    if (!res.ok)
      throw new WorkerClientNetworkError(`worker ${this.baseUrl} returned HTTP ${res.status}`)

    let data: unknown
    try {
      data = await res.json()
    }
    catch (err) {
      throw new WorkerClientInvalidResponseError(`worker ${this.baseUrl} /info returned non-JSON body: ${(err as Error).message}`)
    }

    if (!isWorkerInfoShape(data))
      throw new WorkerClientInvalidResponseError(`worker ${this.baseUrl} /info response missing required fields`)

    return data
  }

  /**
   * Forward an arbitrary request to the worker and hand the raw `Response`
   * back to the caller. 3.2's `/api/workers/:id/proxy/*` route uses this
   * untouched so the manager never has to parse worker config/secrets
   * traffic.
   */
  async passThrough(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    return this.request(method, path, body, headers)
  }
}

function isWorkerInfoShape(value: unknown): value is WorkerInfo {
  if (!value || typeof value !== 'object')
    return false
  const v = value as Record<string, unknown>
  return typeof v.workerId === 'string'
    && v.workerId.length > 0
    && typeof v.configVersion === 'number'
    && Number.isFinite(v.configVersion)
}
