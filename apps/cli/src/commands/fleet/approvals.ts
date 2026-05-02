import consola from 'consola'

import { errorToExitCode, printJson, withSession } from './common'

/**
 * `aiworker fleet approvals list [--worker <id>]` — 列出某个或所有 worker 的挂起审批。
 *
 * 当前 gateway 协议 `approval.list` 的 routing 是 operator-to-node，必须指定
 * 单个 workerId；当用户没传 --worker 时，回落到先 `workers.list` 拿全部 online
 * worker，再并行查每个 worker 的 approvals 并合并。
 */
export interface ApprovalsListOptions {
  workerId?: string
}

export async function runApprovalsList(opts: ApprovalsListOptions = {}): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      if (opts.workerId !== undefined && opts.workerId.length > 0) {
        const r = await client.request('approval.list', { workerId: opts.workerId })
        return r as { approvals: unknown[] }
      }
      const list = await client.request('workers.list', {}) as { workers: Array<{ workerId: string, online: boolean }> }
      const online = list.workers.filter(w => w.online).map(w => w.workerId)
      const all: unknown[] = []
      for (const id of online) {
        try {
          const r = await client.request('approval.list', { workerId: id }) as { approvals: unknown[] }
          for (const a of r.approvals) all.push(a)
        }
        catch (err) {
          consola.warn(`approval.list ${id} 失败: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      return { approvals: all }
    })
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`fleet approvals list 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}

/**
 * `aiworker fleet approvals grant <workerId> <taskId> <toolCallId> [--deny]` — 解锁某条挂起。
 *
 * decision 默认 allow；带 --deny 时下发 deny。worker 立刻短路并合成
 * 助手消息（`tool {name} blocked by policy`）。
 */
export interface ApprovalsGrantOptions {
  workerId: string
  taskId: string
  toolCallId: string
  deny?: boolean
}

export async function runApprovalsGrant(opts: ApprovalsGrantOptions): Promise<number> {
  try {
    const res = await withSession(async ({ client }) => {
      return await client.request('approval.grant', {
        workerId: opts.workerId,
        taskId: opts.taskId,
        toolCallId: opts.toolCallId,
        decision: opts.deny === true ? 'deny' : 'allow',
      })
    })
    printJson(res)
    return 0
  }
  catch (err) {
    consola.error(`fleet approvals grant 失败: ${err instanceof Error ? err.message : String(err)}`)
    return errorToExitCode(err)
  }
}
