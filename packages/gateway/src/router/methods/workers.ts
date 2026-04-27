import type { WorkerApiToken } from '@zonease/aiworker-shared'
import type { HandlerResult, LocalHandler } from '../context'
import { pairResultSchema, workerSummarySchema } from '@zonease/aiworker-gateway-proto'
import { WORKER_API_TOKEN_PATTERN } from '@zonease/aiworker-shared'
import { z } from 'zod'
import {
  WorkerClient,
  WorkerClientAuthError,
  WorkerClientInvalidResponseError,
  WorkerClientNetworkError,
} from '../../registry/worker-client'
import { LaunchFailedError, LaunchTimeoutError } from '../../supervisor/errors'

/** fleet.db 存 ISO 字符串;proto 里 `lastSeenAt` 要毫秒戳。转换失败时返回 null。 */
function parseIsoToMs(iso: string | undefined): number | null {
  if (!iso)
    return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t))
    return null
  return t
}

/**
 * `workers.list`:列出 fleet.db 中所有已注册 worker。
 *
 * 对每个注册行:
 * - `online` = node registry 中是否存在该 workerId。
 * - `lastSeenAt`:若在线 → 取 node registry 的 pairedAt(最准);否则尝试解析
 *   fleet.db 的 `lastSeenAt`(ISO 字符串)为毫秒戳。
 */
export const handleWorkersList: LocalHandler = (ctx): HandlerResult => {
  const rows = ctx.persistence.listRegisteredWorkers()
  const workers = rows.map((row) => {
    const online = ctx.nodes.has(row.id)
    const node = online ? ctx.nodes.get(row.id) : undefined
    const lastSeenAt = node
      ? node.pairedAt
      : parseIsoToMs(row.lastSeenAt)
    return {
      workerId: row.id,
      displayName: row.displayName,
      online,
      deviceId: node?.deviceId,
      baseUrl: row.baseUrl,
      lastSeenAt,
    }
  })
  const parsed = z.object({ workers: z.array(workerSummarySchema) }).safeParse({ workers })
  if (!parsed.success) {
    return {
      ok: false,
      code: 'internal_error',
      message: `workers.list 构造的 result 不符合 schema: ${parsed.error.message}`,
    }
  }
  return { ok: true, result: parsed.data }
}

/**
 * `workers.remove`:把 worker 从 fleet.db 里摘除,同时若该 node 在线则强制
 * 踢下线。
 *
 * - 404:fleet.db 没有这个 workerId,返回 `not_found`(与 REST 旧语义一致)。
 * - 成功:删除 row + 若 node 在线则 close(1000, 'removed_from_fleet')。
 */
export const handleWorkersRemove: LocalHandler = (ctx, params): HandlerResult => {
  const parsed = z.object({ workerId: z.string().min(1) }).safeParse(params)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid_params',
      message: 'workers.remove 缺少 workerId',
      details: parsed.error.flatten(),
    }
  }
  const { workerId } = parsed.data
  const existing = ctx.persistence.getRegisteredWorker(workerId)
  if (!existing) {
    return { ok: false, code: 'not_found', message: `worker ${workerId} 不在 fleet 中` }
  }

  const online = ctx.nodes.get(workerId)
  const removed = ctx.persistence.removeRegisteredWorker(workerId)
  if (online) {
    // 取消该 workerId 的所有在途 forward(operator 回错误)后再 close 连接。
    ctx.forwards.cancelByWorker(workerId)
    ctx.nodes.unregisterByWs(online.ws)
    try {
      online.ws.close(1000, 'removed_from_fleet')
    }
    catch (err) {
      ctx.logger.warn(`[gateway] workers.remove 关闭在线 node 时报错 (workerId=${workerId})`, err)
    }
  }
  ctx.persistence.recordAudit({
    actor: 'gateway',
    action: 'gateway.worker.removed',
    workerId,
    detail: { displayName: existing.displayName, baseUrl: existing.baseUrl },
  })
  return { ok: true, result: { removed } }
}

/**
 * `workers.pair` handler 构造器。注入 WorkerClient factory 方便测试替换 fetch。
 *
 * 流程:
 *   1. 校验 params + masterKey 可用;
 *   2. 调 worker `/info` 验证 bootstrap token 真的能鉴权 + 拿到 workerId;
 *   3. 检查 fleet.db 里是否已注册(409);
 *   4. 检查 maxWorkers 配额(409);
 *   5. 把 `(workerId, baseUrl, apiToken, displayName)` 加密落库。
 */
export interface PairHandlerDeps {
  buildClient?: (baseUrl: string, apiToken: string) => Pick<WorkerClient, 'info'>
}

const pairParamsSchema = z.object({
  workerBaseUrl: z.string().min(1),
  bootstrapToken: z.string().regex(WORKER_API_TOKEN_PATTERN, 'bootstrapToken must match wtk_<base64url>'),
  displayName: z.string().min(1).max(80).optional(),
})

export function createWorkersPairHandler(deps: PairHandlerDeps = {}): LocalHandler {
  return async (ctx, params): Promise<HandlerResult> => {
    if (!ctx.masterKeyHex) {
      return {
        ok: false,
        code: 'master_key_missing',
        message: 'gateway 未配置 AIWORKER_MASTER_KEY,无法加密 worker token',
      }
    }
    const parsed = pairParamsSchema.safeParse(params)
    if (!parsed.success) {
      return {
        ok: false,
        code: 'invalid_params',
        message: 'workers.pair 参数校验失败',
        details: parsed.error.flatten(),
      }
    }
    const input = parsed.data

    // 配额先查:调用 worker /info 是昂贵的网络调用,配额命中时立即短路。
    if (ctx.maxWorkers !== undefined) {
      const current = ctx.persistence.countRegisteredWorkers()
      if (current >= ctx.maxWorkers) {
        return {
          ok: false,
          code: 'quota_exceeded',
          message: `fleet 已达 ${ctx.maxWorkers} worker 上限`,
          details: { limit: ctx.maxWorkers, current },
        }
      }
    }

    const client = deps.buildClient
      ? deps.buildClient(input.workerBaseUrl, input.bootstrapToken)
      : new WorkerClient({ baseUrl: input.workerBaseUrl, apiToken: input.bootstrapToken })
    let info: { workerId: string, configVersion: number }
    try {
      info = await client.info()
    }
    catch (err) {
      if (err instanceof WorkerClientAuthError) {
        return { ok: false, code: 'auth_failed', message: 'worker 拒绝 bootstrap token' }
      }
      if (err instanceof WorkerClientNetworkError) {
        return { ok: false, code: 'worker_unreachable', message: err.message }
      }
      if (err instanceof WorkerClientInvalidResponseError) {
        return { ok: false, code: 'invalid_worker_info', message: err.message }
      }
      throw err
    }

    const existing = ctx.persistence.getRegisteredWorker(info.workerId)
    if (existing) {
      return {
        ok: false,
        code: 'already_registered',
        message: `worker ${info.workerId} 已在 fleet 中`,
        details: { workerId: info.workerId },
      }
    }

    const row = ctx.persistence.createRegisteredWorker(
      {
        workerId: info.workerId,
        baseUrl: input.workerBaseUrl,
        apiToken: input.bootstrapToken,
        displayName: input.displayName ?? info.workerId,
        addedBy: 'manual',
        configVersion: info.configVersion,
      },
      ctx.masterKeyHex,
    )

    // pair 成功后把 bootstrap token 作为 deviceToken 返回一次——与 proto 语义对齐。
    // 后续 operator / aim 可选择立即 rotate 换新 token。
    const result = pairResultSchema.safeParse({
      workerId: row.id,
      deviceToken: input.bootstrapToken,
    })
    if (!result.success) {
      return {
        ok: false,
        code: 'internal_error',
        message: `workers.pair 构造的 result 不符合 schema: ${result.error.message}`,
      }
    }
    return { ok: true, result: result.data }
  }
}

/** 向后兼容 import 形式——没注入 deps 的路径走默认 WorkerClient。 */
export const handleWorkersPair: LocalHandler = createWorkersPairHandler()

/**
 * `workers.launch` handler 构造器。通过 supervisor 拉起 worker 容器后自动 pair。
 */
export interface LaunchHandlerDeps extends PairHandlerDeps {
  /** 覆盖 forceId 字段的校验范围(测试用)。默认按 proto 的 WORKER_ID_PATTERN 强校验。 */
}

const launchParamsSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  image: z.string().optional(),
  env: z.record(z.string()).optional(),
  forceId: z.string().optional(),
})

export function createWorkersLaunchHandler(deps: LaunchHandlerDeps = {}): LocalHandler {
  return async (ctx, params): Promise<HandlerResult> => {
    if (!ctx.supervisor) {
      return {
        ok: false,
        code: 'feature_disabled',
        message: 'gateway 未开启 launch 能力 (AIWORKER_GATEWAY_CAN_LAUNCH=false)',
      }
    }
    if (!ctx.masterKeyHex) {
      return {
        ok: false,
        code: 'master_key_missing',
        message: 'gateway 未配置 AIWORKER_MASTER_KEY,无法加密 worker token',
      }
    }
    const parsed = launchParamsSchema.safeParse(params)
    if (!parsed.success) {
      return {
        ok: false,
        code: 'invalid_params',
        message: 'workers.launch 参数校验失败',
        details: parsed.error.flatten(),
      }
    }
    const input = parsed.data
    const displayName = input.displayName ?? 'worker'

    // 配额先查——避免 spawn 了再回滚。
    if (ctx.maxWorkers !== undefined) {
      const current = ctx.persistence.countRegisteredWorkers()
      if (current >= ctx.maxWorkers) {
        return {
          ok: false,
          code: 'quota_exceeded',
          message: `fleet 已达 ${ctx.maxWorkers} worker 上限`,
          details: { limit: ctx.maxWorkers, current },
        }
      }
    }

    let launched: {
      workerId: string
      baseUrl: string
      apiToken: WorkerApiToken
      containerId: string
      containerName: string
    }
    try {
      launched = await ctx.supervisor.launchLocal({
        displayName,
        ...(input.forceId === undefined ? {} : { forceId: input.forceId }),
      })
    }
    catch (err) {
      if (err instanceof LaunchTimeoutError) {
        return { ok: false, code: 'launch_timeout', message: err.message }
      }
      if (err instanceof LaunchFailedError) {
        return { ok: false, code: 'launch_failed', message: err.message }
      }
      throw err
    }

    // 若 supervisor 返回的 id 已经在 fleet.db 里(forceId 场景),直接返回 409。
    const existing = ctx.persistence.getRegisteredWorker(launched.workerId)
    if (existing) {
      return {
        ok: false,
        code: 'already_registered',
        message: `worker ${launched.workerId} 已在 fleet 中`,
        details: { workerId: launched.workerId, containerName: launched.containerName },
      }
    }

    // supervisor 已经在容器内完成 bootstrap,不需要再 `/info` 验证一次。
    // 直接加密落库;configVersion 等 poller(后续补)再刷新。
    const row = ctx.persistence.createRegisteredWorker(
      {
        workerId: launched.workerId,
        baseUrl: launched.baseUrl,
        apiToken: launched.apiToken,
        displayName,
        addedBy: 'launch-local',
      },
      ctx.masterKeyHex,
    )
    ctx.persistence.recordAudit({
      actor: 'gateway',
      action: 'gateway.worker.launched',
      workerId: row.id,
      detail: { containerId: launched.containerId, containerName: launched.containerName, baseUrl: launched.baseUrl },
    })

    const result = pairResultSchema.safeParse({
      workerId: row.id,
      deviceToken: launched.apiToken,
    })
    if (!result.success) {
      return {
        ok: false,
        code: 'internal_error',
        message: `workers.launch 构造的 result 不符合 schema: ${result.error.message}`,
      }
    }
    // deps 形参暂未使用,保留签名便于后续注入 pair 风格的 client。
    void deps
    return { ok: true, result: result.data }
  }
}

/** 向后兼容 import 形式。 */
export const handleWorkersLaunch: LocalHandler = createWorkersLaunchHandler()
