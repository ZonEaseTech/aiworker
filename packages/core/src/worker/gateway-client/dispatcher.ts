import type { RequestFrame, ResponseFrame } from '@zonease/aiworker-gateway-proto'
import type {
  BrainAdmissionStatus,
  BrainArtifactSensitivity,
  BrainArtifactStatus,
  ChannelType,
  Envelope,
  WorkerInfo,
} from '@zonease/aiworker-shared'
import type { CronJobInput, CronJobPatch, CronJobRecord } from '../cron/types'
import type { WorkerEventBus } from '../events/bus'
import type { ApprovalStore } from '../orchestrator/approvals'

import { getMethodDef, METHODS } from '@zonease/aiworker-gateway-proto'
import { AppError } from '@zonease/aiworker-shared'
import consola from 'consola'

import { ConfigVersionConflictError, InvalidConfigError } from '../management/config'
import { CronJobNotFoundError } from './methods/cron'

/**
 * Orchestrator 的最小接口——gateway-client 不需要持有整个 WorkerRuntime，
 * 这样 smoke / 单测用 stub runtime 就能跑。
 */
export interface OrchestratorLike {
  ingest: (envelope: Envelope) => Promise<void>
}

/**
 * gateway-client 看到的最小 runtime 视图。比 OrchestratorLike 多一个
 * `approvals` ——`approval.list` / `approval.grant` 直接桥到 store。
 */
export interface RuntimeLike {
  bus: WorkerEventBus
  orchestrator: OrchestratorLike
  approvals?: ApprovalStore
}

/**
 * 一个 node 能回答的 method handler 集合。所有 handler 都是可选的：
 * 缺失的方法一律回 `method_not_implemented`，避免把未实现的 config/token
 * 路径暴露给 gateway。
 */
export interface NodeHandlers {
  /** 返回当前 worker 运行时快照。 */
  workersInfo?: () => Promise<WorkerInfo>
  /** 优雅停止当前 worker。成功后 dispatcher 回 `{ stopped: true }`。 */
  workersStop?: () => Promise<void>
  /** 读 config + 当前 version。 */
  configGet?: () => Promise<{ version: number, config: unknown }>
  /**
   * 写 config：实现方负责做 If-Match 校验、secret 分离、reload runtime。
   * 成功后返回新版本与应用时间戳（毫秒）。`runtimeReload` 透出 hot-reload
   * 是否成功——失败时配置已落库，操作员可走 `POST /api/worker/reload` 重试。
   * Validation / version 错误必须以 `InvalidConfigError` /
   * `ConfigVersionConflictError` 抛出，dispatcher 会映射到对应 wire code。
   */
  configPut?: (input: { ifMatch: number, config: unknown }) => Promise<{
    version: number
    appliedAt: number
    runtimeReload?: 'ok' | 'failed'
  }>
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
  secretsList?: () => Promise<{ keys: string[] }>
  secretsPut?: (input: { key: string, value: string }) => Promise<{ ok: true }>
  secretsDelete?: (input: { key: string }) => Promise<{ ok: true }>
  enginesList?: (input: { refresh?: boolean }) => Promise<{ engines: unknown[] }>
  brainTest?: () => Promise<unknown>
  brainSummary?: () => Promise<unknown>
  brainAdmissionList?: (input: {
    status?: BrainAdmissionStatus
    kind?: string
    scopeId?: string
    soulId?: string
    limit?: number
    showSensitive?: boolean
  }) => Promise<unknown>
  brainAdmissionShow?: (input: { id: string, showSensitive?: boolean }) => Promise<unknown>
  brainAdmissionApprove?: (input: { id: string, decidedBy: string, reason?: string }) => Promise<unknown>
  brainAdmissionReject?: (input: { id: string, decidedBy: string, reason?: string }) => Promise<unknown>
  brainAdmissionApply?: (input: {
    id: string
    decidedBy: string
    commit?: boolean
    allowSecretBody?: 'block' | 'redact' | 'raw'
  }) => Promise<unknown>
  brainArtifactsList?: (input: {
    scopeId?: string
    type?: string
    status?: BrainArtifactStatus
    minSensitivity?: BrainArtifactSensitivity
    limit?: number
    showSensitive?: boolean
  }) => Promise<unknown>
  brainArtifactsShow?: (input: { id: string, showSensitive?: boolean }) => Promise<unknown>
  casesList?: (input: { limit?: number }) => Promise<{ cases: unknown[] }>
  casesShow?: (input: { taskId: string }) => Promise<{ case: unknown }>
  casesRerun?: (input: { taskId: string, prompt?: string }) => Promise<{ task: unknown }>
  casesLessonsPropose?: (input: { taskId: string, scopeId?: string, soulId?: string }) => Promise<unknown>
  executorTest?: (input: { probe?: boolean }) => Promise<unknown>
  channelTest?: (input: { channel: ChannelType, body?: { chatId?: string, text?: string } }) => Promise<unknown>
  tasksList?: () => Promise<{ tasks: unknown[] }>
  tasksCreate?: (input: { prompt: string }) => Promise<{ task: unknown }>
  taskJournal?: (input: { taskId: string }) => Promise<{ journal: unknown }>
  taskRerun?: (input: { taskId: string, prompt?: string }) => Promise<{ task: unknown }>
  conversationsList?: () => Promise<{ conversations: unknown[] }>
  messagesList?: (input: { conversationId: string }) => Promise<{ messages: unknown[] }>
}

export interface DispatcherDeps {
  workerId: string
  /**
   * 懒取 runtime—和 HTTP 路由一致；hot-reload 之后必须拿到 fresh bus /
   * orchestrator / approvals，不能把旧 runtime 冻进闭包。
   */
  getRuntime: () => RuntimeLike
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
        case METHODS['approval.list'].method:
          this.handleApprovalList(id)
          break
        case METHODS['approval.grant'].method:
          this.handleApprovalGrant(id, p)
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
        case METHODS['secrets.list'].method:
          await this.handleSecretsList(id, p)
          break
        case METHODS['secrets.put'].method:
          await this.handleSecretsPut(id, p)
          break
        case METHODS['secrets.delete'].method:
          await this.handleSecretsDelete(id, p)
          break
        case METHODS['engines.list'].method:
          await this.handleEnginesList(id, p)
          break
        case METHODS['brain.test'].method:
          await this.handleBrainTest(id, p)
          break
        case METHODS['brain.summary'].method:
          await this.handleBrainSummary(id, p)
          break
        case METHODS['brain.admission.list'].method:
          await this.handleBrainAdmissionList(id, p)
          break
        case METHODS['brain.admission.show'].method:
          await this.handleBrainAdmissionShow(id, p)
          break
        case METHODS['brain.admission.approve'].method:
          await this.handleBrainAdmissionApprove(id, p)
          break
        case METHODS['brain.admission.reject'].method:
          await this.handleBrainAdmissionReject(id, p)
          break
        case METHODS['brain.admission.apply'].method:
          await this.handleBrainAdmissionApply(id, p)
          break
        case METHODS['brain.artifacts.list'].method:
          await this.handleBrainArtifactsList(id, p)
          break
        case METHODS['brain.artifacts.show'].method:
          await this.handleBrainArtifactsShow(id, p)
          break
        case METHODS['cases.list'].method:
          await this.handleCasesList(id, p)
          break
        case METHODS['cases.show'].method:
          await this.handleCasesShow(id, p)
          break
        case METHODS['cases.rerun'].method:
          await this.handleCasesRerun(id, p)
          break
        case METHODS['cases.lessons.propose'].method:
          await this.handleCasesLessonsPropose(id, p)
          break
        case METHODS['executor.test'].method:
          await this.handleExecutorTest(id, p)
          break
        case METHODS['channel.test'].method:
          await this.handleChannelTest(id, p)
          break
        case METHODS['orchestrator.tasks.list'].method:
          await this.handleTasksList(id, p)
          break
        case METHODS['orchestrator.tasks.create'].method:
          await this.handleTasksCreate(id, p)
          break
        case METHODS['orchestrator.tasks.journal'].method:
          await this.handleTaskJournal(id, p)
          break
        case METHODS['orchestrator.tasks.rerun'].method:
          await this.handleTaskRerun(id, p)
          break
        case METHODS['orchestrator.conversations.list'].method:
          await this.handleConversationsList(id, p)
          break
        case METHODS['orchestrator.messages.list'].method:
          await this.handleMessagesList(id, p)
          break
        case METHODS['workers.info'].method:
          await this.handleWorkersInfo(id, p)
          break
        case METHODS['workers.stop'].method:
          await this.handleWorkersStop(id, p)
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
    const resetCommand = parseSessionResetCommand(String(params.content))
    const content = resetCommand?.body && resetCommand.body.length > 0
      ? resetCommand.body
      : resetCommand
        ? 'A new session has started. Reply briefly to confirm.'
        : String(params.content)
    const conversationIdHint = typeof params.conversationId === 'string' ? params.conversationId : undefined

    // chatId 映射约定：
    // - 已归一化的 gateway id（`gw:` 前缀）→ 原样复用；
    // - 普通 conversationId hint → `gw:conv:<id>`；
    // - 无 hint → `gw:<workerId>:<uuid>`。
    // 选用现有的 `web` channel 以满足 Envelope.channel 类型；gateway 语义
    // 已经在 chatId 前缀里编码，后续若要专有 channel 可另起 type。
    const chatId = normalizeGatewayChatId(this.deps.workerId, conversationIdHint)
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
        ...(resetCommand ? { sessionReset: true, resetCommand: resetCommand.command } : {}),
        ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
      },
    }
    // 立即 ACK：事件通过 bus→subscriber 上行；不在这里 await orchestrator 跑完。
    void this.deps.getRuntime().orchestrator.ingest(envelope).catch((err) => {
      consola.warn(`[gateway-dispatcher ${this.deps.workerId}] orchestrator.ingest failed: ${String(err)}`)
    })
    this.replyOk(id, { conversationId: chatId, accepted: true })
  }

  // ---- workers.info / workers.stop ----

  private async handleWorkersInfo(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.ensureWorkerMatch(id, params))
      return
    if (!this.deps.handlers?.workersInfo) {
      this.replyError(id, 'method_not_implemented', 'workers.info handler not wired')
      return
    }
    const result = await this.deps.handlers.workersInfo()
    this.replyOk(id, result)
  }

  private async handleWorkersStop(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.ensureWorkerMatch(id, params))
      return
    if (!this.deps.handlers?.workersStop) {
      this.replyError(id, 'method_not_implemented', 'workers.stop handler not wired')
      return
    }
    await this.deps.handlers.workersStop()
    this.replyOk(id, { stopped: true })
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
    try {
      const result = await this.deps.handlers.configPut({ ifMatch, config })
      this.replyOk(id, result)
    }
    catch (err) {
      if (err instanceof InvalidConfigError) {
        this.replyError(id, 'invalid_config', err.message, { issues: err.issues })
        return
      }
      if (err instanceof ConfigVersionConflictError) {
        this.replyError(id, 'version_conflict', err.message, { expected: err.expected, actual: err.actual })
        return
      }
      throw err
    }
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

  // ---- approval.list / approval.grant（PLAN-014 F2）----

  private handleApprovalList(id: string): void {
    const approvals = this.deps.getRuntime().approvals
    if (!approvals) {
      this.replyError(id, 'method_not_implemented', 'approval store not wired')
      return
    }
    const list = approvals.list().map(p => ({
      workerId: this.deps.workerId,
      taskId: p.taskId,
      toolCallId: p.toolCallId,
      toolName: p.toolName,
      params: p.params,
      expiresAt: p.expiresAt,
    }))
    this.replyOk(id, { approvals: list })
  }

  private handleApprovalGrant(id: string, params: Record<string, unknown>): void {
    const approvals = this.deps.getRuntime().approvals
    if (!approvals) {
      this.replyError(id, 'method_not_implemented', 'approval store not wired')
      return
    }
    const taskId = String(params.taskId)
    const toolCallId = String(params.toolCallId)
    const decision = params.decision === 'allow' ? 'allow' : 'deny'
    const granted = approvals.grant(taskId, toolCallId, decision)
    this.replyOk(id, { granted })
  }

  // ---- cron.* (PLAN-014 §F4) ----

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

  // ---- secrets.* / probes / orchestrator.* ----

  private async handleSecretsList(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.secretsList) {
      this.replyError(id, 'method_not_implemented', 'secrets.list handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    const result = await this.deps.handlers.secretsList()
    this.replyOk(id, result)
  }

  private async handleSecretsPut(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.secretsPut) {
      this.replyError(id, 'method_not_implemented', 'secrets.put handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    try {
      const result = await this.deps.handlers.secretsPut({
        key: String(params.key),
        value: String(params.value),
      })
      this.replyOk(id, result)
    }
    catch (err) {
      this.replyAppError(id, err)
    }
  }

  private async handleSecretsDelete(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.secretsDelete) {
      this.replyError(id, 'method_not_implemented', 'secrets.delete handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    try {
      const result = await this.deps.handlers.secretsDelete({ key: String(params.key) })
      this.replyOk(id, result)
    }
    catch (err) {
      this.replyAppError(id, err)
    }
  }

  private async handleEnginesList(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.enginesList) {
      this.replyError(id, 'method_not_implemented', 'engines.list handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    const result = await this.deps.handlers.enginesList({
      ...(typeof params.refresh === 'boolean' ? { refresh: params.refresh } : {}),
    })
    this.replyOk(id, result)
  }

  private async handleBrainTest(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.brainTest) {
      this.replyError(id, 'method_not_implemented', 'brain.test handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    this.replyOk(id, await this.deps.handlers.brainTest())
  }

  private async handleBrainSummary(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.brainSummary) {
      this.replyError(id, 'method_not_implemented', 'brain.summary handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    this.replyOk(id, await this.deps.handlers.brainSummary())
  }

  private async handleBrainAdmissionList(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.brainAdmissionList) {
      this.replyError(id, 'method_not_implemented', 'brain.admission.list handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    this.replyOk(id, await this.deps.handlers.brainAdmissionList({
      ...(params.status === undefined ? {} : { status: params.status as BrainAdmissionStatus }),
      ...(params.kind === undefined ? {} : { kind: String(params.kind) }),
      ...(params.scopeId === undefined ? {} : { scopeId: String(params.scopeId) }),
      ...(params.soulId === undefined ? {} : { soulId: String(params.soulId) }),
      ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
      ...(typeof params.showSensitive === 'boolean' ? { showSensitive: params.showSensitive } : {}),
    }))
  }

  private async handleBrainAdmissionShow(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.brainAdmissionShow) {
      this.replyError(id, 'method_not_implemented', 'brain.admission.show handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    try {
      this.replyOk(id, await this.deps.handlers.brainAdmissionShow({
        id: String(params.id),
        ...(typeof params.showSensitive === 'boolean' ? { showSensitive: params.showSensitive } : {}),
      }))
    }
    catch (err) {
      this.replyBrainError(id, err)
    }
  }

  private async handleBrainAdmissionApprove(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.brainAdmissionApprove) {
      this.replyError(id, 'method_not_implemented', 'brain.admission.approve handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    try {
      this.replyOk(id, await this.deps.handlers.brainAdmissionApprove({
        id: String(params.id),
        decidedBy: String(params.decidedBy),
        ...(params.reason === undefined ? {} : { reason: String(params.reason) }),
      }))
    }
    catch (err) {
      this.replyBrainError(id, err)
    }
  }

  private async handleBrainAdmissionReject(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.brainAdmissionReject) {
      this.replyError(id, 'method_not_implemented', 'brain.admission.reject handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    try {
      this.replyOk(id, await this.deps.handlers.brainAdmissionReject({
        id: String(params.id),
        decidedBy: String(params.decidedBy),
        ...(params.reason === undefined ? {} : { reason: String(params.reason) }),
      }))
    }
    catch (err) {
      this.replyBrainError(id, err)
    }
  }

  private async handleBrainAdmissionApply(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.brainAdmissionApply) {
      this.replyError(id, 'method_not_implemented', 'brain.admission.apply handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    try {
      this.replyOk(id, await this.deps.handlers.brainAdmissionApply({
        id: String(params.id),
        decidedBy: String(params.decidedBy),
        ...(typeof params.commit === 'boolean' ? { commit: params.commit } : {}),
        ...(params.allowSecretBody === undefined ? {} : { allowSecretBody: params.allowSecretBody as 'block' | 'redact' | 'raw' }),
      }))
    }
    catch (err) {
      this.replyBrainError(id, err)
    }
  }

  private async handleBrainArtifactsList(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.brainArtifactsList) {
      this.replyError(id, 'method_not_implemented', 'brain.artifacts.list handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    this.replyOk(id, await this.deps.handlers.brainArtifactsList({
      ...(params.scopeId === undefined ? {} : { scopeId: String(params.scopeId) }),
      ...(params.type === undefined ? {} : { type: String(params.type) }),
      ...(params.status === undefined ? {} : { status: params.status as BrainArtifactStatus }),
      ...(params.minSensitivity === undefined ? {} : { minSensitivity: params.minSensitivity as BrainArtifactSensitivity }),
      ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
      ...(typeof params.showSensitive === 'boolean' ? { showSensitive: params.showSensitive } : {}),
    }))
  }

  private async handleBrainArtifactsShow(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.brainArtifactsShow) {
      this.replyError(id, 'method_not_implemented', 'brain.artifacts.show handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    try {
      this.replyOk(id, await this.deps.handlers.brainArtifactsShow({
        id: String(params.id),
        ...(typeof params.showSensitive === 'boolean' ? { showSensitive: params.showSensitive } : {}),
      }))
    }
    catch (err) {
      this.replyBrainError(id, err)
    }
  }

  private async handleCasesList(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.casesList) {
      this.replyError(id, 'method_not_implemented', 'cases.list handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    this.replyOk(id, await this.deps.handlers.casesList({
      ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
    }))
  }

  private async handleCasesShow(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.casesShow) {
      this.replyError(id, 'method_not_implemented', 'cases.show handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    try {
      this.replyOk(id, await this.deps.handlers.casesShow({ taskId: String(params.taskId) }))
    }
    catch (err) {
      this.replyBrainError(id, err)
    }
  }

  private async handleCasesRerun(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.casesRerun) {
      this.replyError(id, 'method_not_implemented', 'cases.rerun handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    try {
      this.replyOk(id, await this.deps.handlers.casesRerun({
        taskId: String(params.taskId),
        ...(typeof params.prompt === 'string' ? { prompt: params.prompt } : {}),
      }))
    }
    catch (err) {
      this.replyAppError(id, err)
    }
  }

  private async handleCasesLessonsPropose(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.casesLessonsPropose) {
      this.replyError(id, 'method_not_implemented', 'cases.lessons.propose handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    try {
      this.replyOk(id, await this.deps.handlers.casesLessonsPropose({
        taskId: String(params.taskId),
        ...(params.scopeId === undefined ? {} : { scopeId: String(params.scopeId) }),
        ...(params.soulId === undefined ? {} : { soulId: String(params.soulId) }),
      }))
    }
    catch (err) {
      this.replyBrainError(id, err)
    }
  }

  private async handleExecutorTest(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.executorTest) {
      this.replyError(id, 'method_not_implemented', 'executor.test handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    const result = await this.deps.handlers.executorTest({
      ...(typeof params.probe === 'boolean' ? { probe: params.probe } : {}),
    })
    this.replyOk(id, result)
  }

  private async handleChannelTest(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.channelTest) {
      this.replyError(id, 'method_not_implemented', 'channel.test handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    try {
      const body = params.body && typeof params.body === 'object'
        ? params.body as { chatId?: string, text?: string }
        : undefined
      const result = await this.deps.handlers.channelTest({
        channel: params.channel as ChannelType,
        ...(body === undefined ? {} : { body }),
      })
      this.replyOk(id, result)
    }
    catch (err) {
      this.replyAppError(id, err)
    }
  }

  private async handleTasksList(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.tasksList) {
      this.replyError(id, 'method_not_implemented', 'orchestrator.tasks.list handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    this.replyOk(id, await this.deps.handlers.tasksList())
  }

  private async handleTasksCreate(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.tasksCreate) {
      this.replyError(id, 'method_not_implemented', 'orchestrator.tasks.create handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    this.replyOk(id, await this.deps.handlers.tasksCreate({ prompt: String(params.prompt) }))
  }

  private async handleTaskJournal(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.taskJournal) {
      this.replyError(id, 'method_not_implemented', 'orchestrator.tasks.journal handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    this.replyOk(id, await this.deps.handlers.taskJournal({
      taskId: String(params.taskId),
    }))
  }

  private async handleTaskRerun(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.taskRerun) {
      this.replyError(id, 'method_not_implemented', 'orchestrator.tasks.rerun handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    this.replyOk(id, await this.deps.handlers.taskRerun({
      taskId: String(params.taskId),
      ...(typeof params.prompt === 'string' ? { prompt: params.prompt } : {}),
    }))
  }

  private async handleConversationsList(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.conversationsList) {
      this.replyError(id, 'method_not_implemented', 'orchestrator.conversations.list handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    this.replyOk(id, await this.deps.handlers.conversationsList())
  }

  private async handleMessagesList(id: string, params: Record<string, unknown>): Promise<void> {
    if (!this.deps.handlers?.messagesList) {
      this.replyError(id, 'method_not_implemented', 'orchestrator.messages.list handler not wired')
      return
    }
    if (!this.ensureWorkerMatch(id, params))
      return
    this.replyOk(id, await this.deps.handlers.messagesList({
      conversationId: String(params.conversationId),
    }))
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

  private replyBrainError(id: string, err: unknown): void {
    const code = (err as { code?: string }).code
    const message = err instanceof Error ? err.message : String(err)
    if (code === 'not-found') {
      this.replyError(id, 'not_found', message)
      return
    }
    if (code === 'invalid-transition') {
      this.replyError(id, 'invalid_transition', message)
      return
    }
    if (code === 'duplicate-id') {
      this.replyError(id, 'conflict', message)
      return
    }
    if (code === 'invalid-payload') {
      this.replyError(id, 'invalid_state', message)
      return
    }
    throw err
  }

  private replyAppError(id: string, err: unknown): void {
    if (err instanceof AppError) {
      const code = err.status === 404
        ? 'not_found'
        : err.status === 400
          ? 'invalid_params'
          : 'internal_error'
      this.replyError(id, code, err.message)
      return
    }
    throw err
  }
}

function parseSessionResetCommand(content: string): { command: '/new' | '/reset', body: string } | null {
  const trimmed = content.trim()
  const lower = trimmed.toLowerCase()
  for (const command of ['/new', '/reset'] as const) {
    if (lower === command)
      return { command, body: '' }
    if (lower.startsWith(command) && /\s/.test(trimmed.charAt(command.length)))
      return { command, body: trimmed.slice(command.length).trimStart() }
  }
  return null
}

function normalizeGatewayChatId(workerId: string, conversationIdHint: string | undefined): string {
  if (conversationIdHint === undefined)
    return `gw:${workerId}:${crypto.randomUUID()}`
  if (conversationIdHint.startsWith('gw:'))
    return conversationIdHint
  return `gw:conv:${conversationIdHint}`
}
