import type { WorkerApiToken, WorkerInfo } from '@zonease/aiworker-shared'
import { isWorkerApiToken } from '@zonease/aiworker-shared'

/**
 * gateway 侧 HTTP 客户端——用来直连一个已知 worker 的 `/api/worker/*` 表面。
 *
 * `workers.pair` handler 在真正把 worker 写入 fleet.db 前,会用 operator 递过来的
 * `(baseUrl, bootstrapToken)` 组合先调 worker `/info`,用以校验 token 真的匹配
 * 并拿到 `workerId`。
 *
 * `token.rotate` handler 在 node 已经轮换好 token 后,若 gateway 希望同步更新
 * fleet.db 的加密 token,也会走这个 client 发 `POST /token/rotate`(但当前
 * 实现是 gateway 通过 WS forward 到 node,新 token 直接回到 gateway,不会再走
 * HTTP——此文件留 `rotateToken` 仅作为备用路径 + 测试方便)。
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
  /** 请求超时,毫秒。默认 10 000。 */
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

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
    }
    const init: RequestInit = { method, headers, signal: controller.signal }
    if (body !== undefined) {
      init.body = JSON.stringify(body)
      headers['Content-Type'] = 'application/json'
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
   * `GET /api/worker/info`。401 → `WorkerClientAuthError`; 其它非 2xx →
   * `WorkerClientNetworkError`; body 非合法 `WorkerInfo` → `WorkerClientInvalidResponseError`。
   */
  async info(): Promise<WorkerInfo> {
    const res = await this.request('GET', 'info')
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
   * `POST /api/worker/token/rotate`。备用同步路径,用于 S5 之外的运维脚本。
   * gateway 内的 `token.rotate` handler 走的是 WS forward,而不是这条 HTTP 路径。
   */
  async rotateToken(): Promise<{ newToken: WorkerApiToken }> {
    const res = await this.request('POST', 'token/rotate')
    if (res.status === 401)
      throw new WorkerClientAuthError()
    if (!res.ok)
      throw new WorkerClientNetworkError(`worker ${this.baseUrl} returned HTTP ${res.status} from /token/rotate`)
    let data: unknown
    try {
      data = await res.json()
    }
    catch (err) {
      throw new WorkerClientInvalidResponseError(`worker ${this.baseUrl} /token/rotate returned non-JSON body: ${(err as Error).message}`)
    }
    if (!data || typeof data !== 'object' || !('newToken' in data))
      throw new WorkerClientInvalidResponseError(`worker ${this.baseUrl} /token/rotate response missing newToken`)
    const newToken = (data as { newToken: unknown }).newToken
    if (!isWorkerApiToken(newToken))
      throw new WorkerClientInvalidResponseError(`worker ${this.baseUrl} /token/rotate returned a token that does not match wtk_<base64url>`)
    return { newToken }
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
