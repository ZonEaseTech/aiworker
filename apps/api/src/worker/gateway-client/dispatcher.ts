import type { RequestFrame, ResponseFrame } from '@aiworker/gateway-proto'
import type { Envelope } from '@aiworker/shared'
import type { CronJobInput, CronJobPatch, CronJobRecord } from '../cron/types'
import type { WorkerEventBus } from '../events/bus'

import { getMethodDef, METHODS } from '@aiworker/gateway-proto'
import consola from 'consola'

import { CronJobNotFoundError } from './methods/cron'

/**
 * Orchestrator 的最小接口——gateway-client 不需要持有整个 WorkerRuntime，
 * 这样 smoke / 单测用 stub runtime 就能跑。
 */
export interface OrchestratorLike {
  ingest: (envelope: Envelope) => Promise<void>
}

/**
 * 一个 node 能回答的 method handler 集合。所有 handler 都是可选的：
 * 缺失的方法一律回 `method_not_implemented`，避免把未实现的 config/token
 * 路径暴露给 gateway。
 */
export interface NodeHandlers {
  /** 读 config + 当前 version。 */
  configGet?: () => Promise<{ version: number, config: unknown }>
  /**
   * 写 config：实现方负责做 If-Match 校验、secret 分离、reload runtime。
   * 成功后返回新版本与应用时间戳（毫秒）。
   */
  configPut?: (input: { ifMatch: number, config: unknown }) => Promise<{ version: number, appliedAt: number }>
  /** 轮换 device/node bearer token，返回新 token 明文（只返一次）。 */
  tokenRotate?: () => Promise<{ deviceToken: string }>
  /**
   * 订阅日志尾部。实现方通常会把历史 N 行立即通过 event 帧回推，
   * follow=true 时后续新行也继续推。handler 只需返回 subscribed 布尔。
   */
  logsTail?: (input: { follow?: boolean, lines?: number }) => Promise<{ subscribed: boolean }>
  /** PLAN-014 §F4：cron CRUD 走 gateway。下层调本地 CronService。 */
  cronList?: () => Promise<{ jobs: CronJobRecord[] }>
  cronAdd?: (input: { job: CronJobInput }) => Promise<{ job: CronJobRecord }>
  cronRemove?: (input: { jobId: string }) => Promise<{ removed: boolean }>
  /** 找不到 jobId 时抛 `CronJobNotFoundError`（dispatcher 转 not_found）。 */
  cronUpdate?: (input: { jobId: string, patch: CronJobPatch }) => Promise<{ job: CronJobRecord }>
}

export interface DispatcherDeps {
  workerId: string
  /**
   * 懒取 runtime—和 HTTP 路由一致；hot-reload 之后必须拿到 fresh bus /
   * orchestrator，不能把旧 runtime 冻进闭包。
   */
  getRuntime: () => { bus: WorkerEventBus, orchestrator: OrchestratorLike }
  /** 其它节点级操作。 */
  handlers?: NodeHandlers
  /** 发送 response 帧的 transport（client.send 的薄封装）。 */
  sendResponse: (frame: ResponseFrame) => void
}

/**
 * 接收 gateway 下发的 request 帧，校验 + 路由 + 回 response。
 * 所有错误都被 catch，转成 `response ok=false` 形态——绝不让异常冒出 WS 循环。
 */
export class GatewayDispatcher {
  constructor(private readonly deps: DispatcherDeps) {}

  async handleRequest(frame: RequestFrame): Promise<void> {
    const { id, method, params } = frame
    try {
      const def = getMethodDef(method)
      if (!def) {
        this.replyError(id, 'unknown_method', `unknown method: ${method}`)
        return
      }
      // 本 node 只负责 routing=operator-to-node 的方法；operator-to-gateway
      // 方法（workers.list / pair / launch / remove / presence）不应该抵达
      // 这里，回 wrong_routing 让调用方排查。
      if (def.routing !== 'operator-to-node') {
        this.replyError(id, 'wrong_routing', `method ${method} should be handled by gateway, not node`)
        return
      }

      const parsed = def.params.safeParse(params ?? {})
      if (!parsed.success) {
        this.replyError(id, 'invalid_params', `params schema mismatch for ${method}`, parsed.error.issues)
        return
      }
      const p = parsed.data as Record<string, unknown>

      switch (method) {
        case METHODS['chat.send'].method:
          await this.handleChatSend(id, p)
          break
        case METHODS['config.get'].method:
          await this.handleConfigGet(id)
          break
        case METHODS['config.put'].method:
          await this.handleConfigPut(id, p)
          break
        case METHODS['token.rotate'].method:
          await this.handleTokenRotate(id)
          break
        case METHODS['logs.tail'].method:
          await this.handleLogsTail(id, p)
          break
        case METHODS['cron.list'].method:
          await this.handleCronList(id, p)
          break
        case METHODS['cron.add'].method:
          await this.handleCronAdd(id, p)
          break
        case METHODS['cron.remove'].method:
          await this.handleCronRemove(id, p)
          break
        case METHODS['cron.update'].method:
          await this.handleCronUpdate(id, p)
          break
        case METHODS['workers.info'].method:
          // workers.info 暂不实现；S5 会在删 HTTP 路由时一并迁过来。
          this.replyError(id, 'method_not_implemented', `${method} is not yet implemented on node side`)
          break
        case METHODS['workers.stop'].method:
          this.replyError(id, 'method_not_implemented', `${method} is not yet implemented on node side`)
          break
        default:
          this.replyError(id, 'method_not_implemented', `${method} not routed`)
      }
    }
    catch (err) {
      consola.error(`[gateway-dispatcher ${this.deps.workerId}] handler threw: ${String(err)}`)
      this.replyError(id, 'internal_error', err instanceof Error ? err.message : String(err))
    }
  }

  // ---- chat.send ----

  private async handleChatSend(id: string, params: Record<string, unknown>): Promise<void> {
    const workerId = String(params.workerId)
    if (workerId !== this.deps.workerId) {
      this.replyError(id, 'worker_mismatch', `chat.send targeted workerId=${workerId}, this node is ${this.deps.workerId}`)
      return
    }
    const content = String(params.content)
    const conversationIdHint = typeof params.conversationId === 'string' ? params.conversationId : undefined

    // chatId 映射约定：
    // - 带 conversationId hint → `gw:conv:<id>`（同会话会持续命中 findOpenConversation）
    // - 否则 → `gw:<workerId>:<uuid>`（每次都是新会话；避免跨消息错并）
    // 选用现有的 `web` channel 以满足 Envelope.channel 类型；gateway 语义
    // 已经在 chatId 前缀里编码，后续若要专有 channel 可另起 type。
    const chatId = conversationIdHint
      ? `gw:conv:${conversationIdHint}`
      : `gw:${this.deps.workerId}:${crypto.randomUUID()}`
    const envelope: Envelope = {
      workerId: this.deps.workerId,
      channel: 'web',
      // gateway 推送过来的 chat.send 用保留前缀 `sys:gateway` accountId，
      // 与用户的 web binding.id 形成命名空间隔离。
      accountId: 'sys:gateway',
      chatId,
      text: content,
      receivedAt: new Date().toISOString(),
      raw: {
        source: 'gateway',
        ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
      },
    }
    // 立即 ACK：事件通过 bus→subscriber 上行；不在这里 await orchestrator 跑完。
    void this.deps.getRuntime().orchestrator.ingest(envelope).catch((err) => {
      consola.warn(`[gateway-dispatcher ${this.deps.workerId}] orchestrator.ingest failed: ${String(err)}`)
    })
    this.replyOk(id, { conversationId: chatId, accepted: true })
  }

  // ---- config.get / config.put ----

  private async handleConfigGet(id: string): Promise<void> {
    if (!this.deps.handlers?.configGet) {
      this.replyError(id, 'method_not_implemented', 'config.get handler not wired')
      return
    }
    const result = await this.deps.handlers.configGet()
    this.replyOk(id, result)
  }

  private async handleConfigPut(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.configPut) {
      this.replyError(id, 'method_not_implemented', 'config.put handler not wired')
      return
    }
    const ifMatch = Number(params.ifMatch)
    const config = params.config
    const result = await this.deps.handlers.configPut({ ifMatch, config })
    this.replyOk(id, result)
  }

  // ---- token.rotate ----

  private async handleTokenRotate(id: string): Promise<void> {
    if (!this.deps.handlers?.tokenRotate) {
      this.replyError(id, 'method_not_implemented', 'token.rotate handler not wired')
      return
    }
    const result = await this.deps.handlers.tokenRotate()
    this.replyOk(id, result)
  }

  // ---- logs.tail ----

  private async handleLogsTail(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.logsTail) {
      // 没接日志源时兜底回 subscribed=false，保持 method 存在但表明 no-op。
      this.replyOk(id, { subscribed: false })
      return
    }
    const input: { follow?: boolean, lines?: number } = {}
    if (typeof params.follow === 'boolean')
      input.follow = params.follow
    if (typeof params.lines === 'number')
      input.lines = params.lines
    const result = await this.deps.handlers.logsTail(input)
    this.replyOk(id, result)
  }

  // ---- cron.* (PLAN-014 §F4) ----

  /**
   * cron 方法都要求 `params.workerId === this.deps.workerId`：gateway 在转发
   * 时会以 workerId 寻路，但这里再做一次防御，避免操作员误把 cron 任务挂到
   * 错的 worker（gateway 路由表错乱时也能被这里拦下）。
   */
  private ensureWorkerMatch(id: string, params: Record<string, unknown>): boolean {
    const workerId = String(params.workerId)
    if (workerId !== this.deps.workerId) {
      this.replyError(id, 'worker_mismatch', `targeted workerId=${workerId}, this node is ${this.deps.workerId}`)
      return false
    }
    return true
  }

  private async handleCronList(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.cronList) {
      this.replyError(id, 'method_not_implemented', 'cron.list handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    const result = await this.deps.handlers.cronList()
    this.replyOk(id, result)
  }

  private async handleCronAdd(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.cronAdd) {
      this.replyError(id, 'method_not_implemented', 'cron.add handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    try {
      const result = await this.deps.handlers.cronAdd({ job: params.job as CronJobInput })
      this.replyOk(id, result)
    }
    catch (err) {
      // cron-parser / accountId 校验等输入错统一回 invalid_cron。
      this.replyError(id, 'invalid_cron', err instanceof Error ? err.message : String(err))
    }
  }

  private async handleCronRemove(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.cronRemove) {
      this.replyError(id, 'method_not_implemented', 'cron.remove handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    const result = await this.deps.handlers.cronRemove({ jobId: String(params.jobId) })
    this.replyOk(id, result)
  }

  private async handleCronUpdate(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.cronUpdate) {
      this.replyError(id, 'method_not_implemented', 'cron.update handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    try {
      const result = await this.deps.handlers.cronUpdate({
        jobId: String(params.jobId),
        patch: params.patch as CronJobPatch,
      })
      this.replyOk(id, result)
    }
    catch (err) {
      if (err instanceof CronJobNotFoundError) {
        this.replyError(id, 'not_found', err.message, { jobId: err.jobId })
        return
      }
      this.replyError(id, 'invalid_cron', err instanceof Error ? err.message : String(err))
    }
  }

  // ---- helpers ----

  private replyOk(id: string, result: unknown): void {
    this.deps.sendResponse({ type: 'response', id, ok: true, result })
  }

  private replyError(id: string, code: string, message: string, details?: unknown): void {
    this.deps.sendResponse({
      type: 'response',
      id,
      ok: false,
      error: details === undefined ? { code, message } : { code, message, details },
    })
  }
}
