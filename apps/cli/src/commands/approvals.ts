import process from 'node:process'

import { workerEnv } from '@zonease/aiworker-core'
import consola from 'consola'

import { loadWorkerContext } from '../context'

/**
 * `aiworker approvals` 子命令——直接走 **本地** worker HTTP（不经 gateway）：
 * GET  /api/worker/approvals                              → 列表
 * POST /api/worker/approvals/:taskId/:toolCallId/grant    → 解锁
 *
 * dev 场景常用：管理员 ssh 进 worker 容器，跑 `aiworker approvals list` 立刻
 * 看到当前挂起请求；不需要 gateway / operator 链路。
 *
 * 端口与 token 的获取：
 * - port 取 `workerEnv.PORT`（env 或 .env，默认 9217）。
 * - token 由 `loadWorkerContext()` 从 worker.db / vault 解密拿到。
 */

function baseUrl(): string {
  const overrideHost = process.env.AIW_LOCAL_WORKER_HOST ?? 'localhost'
  return `http://${overrideHost}:${workerEnv.PORT}`
}

async function authFetch(path: string, init: RequestInit = {}): Promise<{ status: number, body: unknown }> {
  const ctx = await loadWorkerContext({ silent: true })
  const url = `${baseUrl()}${path}`
  const headers = new Headers(init.headers ?? {})
  headers.set('Authorization', `Bearer ${ctx.token}`)
  if (init.body !== undefined && !headers.has('content-type'))
    headers.set('content-type', 'application/json')
  const res = await fetch(url, { ...init, headers })
  let body: unknown = null
  try {
    body = await res.json()
  }
  catch {
    body = null
  }
  return { status: res.status, body }
}

export async function runApprovalsList(): Promise<number> {
  try {
    const { status, body } = await authFetch('/api/worker/approvals')
    if (status !== 200) {
      consola.error(`approvals list HTTP ${status}: ${JSON.stringify(body)}`)
      return 1
    }
    process.stdout.write(`${JSON.stringify(body, null, 2)}\n`)
    return 0
  }
  catch (err) {
    consola.error(`approvals list 失败: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}

export interface ApprovalsGrantOptions {
  taskId: string
  toolCallId: string
  deny?: boolean
}

export async function runApprovalsGrant(opts: ApprovalsGrantOptions): Promise<number> {
  try {
    const decision = opts.deny === true ? 'deny' : 'allow'
    const { status, body } = await authFetch(
      `/api/worker/approvals/${encodeURIComponent(opts.taskId)}/${encodeURIComponent(opts.toolCallId)}/grant`,
      {
        method: 'POST',
        body: JSON.stringify({ decision }),
      },
    )
    if (status !== 200) {
      consola.error(`approvals grant HTTP ${status}: ${JSON.stringify(body)}`)
      return 1
    }
    process.stdout.write(`${JSON.stringify(body, null, 2)}\n`)
    return 0
  }
  catch (err) {
    consola.error(`approvals grant 失败: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}
