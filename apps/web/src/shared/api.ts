/**
 * 跨视角共享的 API 基础类型与小工具。
 *
 * fleet 视角与 worker 视角分别有各自的 `api.ts`：
 * - `fleet/api.ts` 走 gateway WS（operator 视角）
 * - `worker/api.ts` 走 HTTP `/api/worker/*`（单 worker bearer）
 *
 * 本文件只放两边都会复用的最薄共识——错误形态、HTTP 帮助函数等。
 * 视角私有的请求方法、entity 形态严禁迁来这里。
 */

/** 视角共享的 API 错误基类——业务侧 try/catch 用 instanceof 收敛。 */
export class WebApiError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'WebApiError'
    this.code = code
    this.details = details
  }
}

/** 把 fetch 的失败统一收敛成 `WebApiError`。 */
export async function jsonFetch<T>(
  input: string | URL,
  init?: RequestInit,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(input, init)
  }
  catch (err) {
    throw new WebApiError('network', err instanceof Error ? err.message : String(err))
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new WebApiError(`http_${res.status}`, body || res.statusText)
  }
  return await res.json() as T
}
