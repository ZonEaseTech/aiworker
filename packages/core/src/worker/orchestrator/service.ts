import type {
  BrainProvider,
  ChannelType,
  ChatMessage,
  ConversationState,
  Envelope,
  ExecutorConfig,
  ExecutorProvider,
  WorkerConfig,
} from '@zonease/aiworker-shared'
import type { WorkerEventBus } from '../events/bus'
import type { WorkspaceHandle, WorkspaceManager } from '../executor/workspace'
import type { ApprovalDecision, ApprovalStore } from './approvals'
import type { ProcessManager } from './process-manager'

import { DEFAULT_MAX_HISTORY_MESSAGES } from '@zonease/aiworker-shared'
import { agentTasks, conversations, getWorkerDb, messages } from '@zonease/aiworker-storage-sqlite/worker'

import consola from 'consola'
import { eq } from 'drizzle-orm'
import { getChannelAdapter } from '../channels/registry'
import { classifyContinuation, findOpenConversation, loadRecentMessages } from '../conversation/router'
import { resolveVariant } from '../executor/default-profiles'
import { DEFAULT_APPROVAL_TIMEOUT_MS } from './approvals'
import { evaluateToolPolicy } from './policy'

interface OrchestratorDeps {
  config: WorkerConfig
  brain: BrainProvider
  executor: ExecutorProvider
  bus: WorkerEventBus
  workerId: string
  workspaces: WorkspaceManager
  /**
   * 进程级集中管控（FEAT-015）。`ingest` 与 `disposeWorkspace` 都走
   * `processes.run`：group=conversationId 保证同会话 FIFO；engine 取自
   * `config.executor.engine`，class=interactive（人类 envelope）或
   * background（清理）。stall 检测通过 onActivity（每个 AgentEvent 触发）
   * + cancel（AbortController.abort() → engine 内部 SIGTERM/SIGKILL）实现。
   */
  processes: ProcessManager
  /**
   * Per-tool approval store（PLAN-014 F2）。runtime 跨 reload 重建一次；
   * `runTool()` 命中 `ask` 时挂在这里等 operator 解锁，dispose 时全部 reject。
   */
  approvals: ApprovalStore
}

/** `runTool` 输入。`taskId` / `toolCallId` 用作 ApprovalStore 的 key。 */
export interface RunToolInput {
  taskId: string
  toolCallId: string
  toolName: string
  params: Record<string, unknown>
  /** 仅用于把 deny 短路 message 落库；缺省时不写库。 */
  conversationId?: string
  /** 覆盖默认 60s 超时；测试用。 */
  timeoutMs?: number
}

export type RunToolDecision = 'allow' | 'deny'

export interface RunToolResult {
  decision: RunToolDecision
  /** 命中的 policy action（auto / ask / deny）。 */
  policy: 'auto' | 'ask' | 'deny'
  /** 当 policy=deny 时合成的 assistant 文本；其余情况为 undefined。 */
  syntheticAssistantMessage?: string
}

export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  /** Entry point for inbound envelopes from any channel. */
  async ingest(envelope: Envelope): Promise<void> {
    this.deps.bus.emit('channel.inbound', { channel: envelope.channel, chatId: envelope.chatId, text: envelope.text })
    const conversation = await this.resolveConversation(envelope)
    const workspace = await this.provisionWorkspace(conversation.id)
    const userMessage = this.persistUserMessage(conversation.id, envelope)
    this.deps.bus.emit('conversation.message', { conversationId: conversation.id, messageId: userMessage.id, role: 'user' })

    // ProcessManager controls cancellation via an AbortController; its `cancel`
    // hook flips this controller, which propagates through `input.signal` to
    // the engine and triggers SIGTERM/SIGKILL on any spawned child process.
    const controller = new AbortController()
    let activityCb: (() => void) | null = null
    await this.deps.processes.run({
      group: conversation.id,
      engine: this.deps.config.executor.engine,
      class: 'interactive',
      meta: { conversationId: conversation.id, channel: envelope.channel },
      onSpawn: async () => ({
        cancel: async () => controller.abort(),
        onActivity: (cb) => {
          activityCb = cb
          return () => {
            if (activityCb === cb)
              activityCb = null
          }
        },
      }),
      job: () => this.run(conversation, envelope, workspace, controller.signal, () => activityCb?.()),
    })
  }

  private async run(
    conversation: ConversationState,
    envelope: Envelope,
    workspace: WorkspaceHandle | null,
    signal: AbortSignal,
    notifyActivity: () => void,
  ): Promise<void> {
    const db = getWorkerDb()
    const history = await this.loadHistoryWindow(conversation.id)
    const systemPrompt = await this.buildSystemPrompt(conversation.summary ?? null)

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
    ]

    const model = executorModel(this.deps.config.executor)
    const runInput = {
      messages: chatMessages,
      ...(model ? { model } : {}),
      ...(workspace ? { workspacePath: workspace.path } : {}),
      signal,
    }
    let assistantText = ''
    try {
      for await (const event of this.deps.executor.run(runInput)) {
        // Each AgentEvent counts as a stdout heartbeat for ProcessManager
        // stall detection — keeps a chatty agent alive and lets a silent one
        // get reaped after stallTimeoutMs.
        notifyActivity()
        if (event.type === 'assistant_message_delta') {
          assistantText += event.delta
          this.deps.bus.emit('orchestrator.text', { conversationId: conversation.id, delta: event.delta })
        }
        else if (event.type === 'tool_use') {
          this.deps.bus.emit('orchestrator.tool_call', {
            conversationId: conversation.id,
            call: { id: event.id, name: event.name, arguments: event.arguments },
          })
        }
        else if (event.type === 'error') {
          consola.warn(`[orchestrator] executor error: ${event.error}`)
          this.deps.bus.emit('orchestrator.error', { conversationId: conversation.id, error: event.error })
          return
        }
      }
    }
    catch (err) {
      consola.error(`[orchestrator] run failed: ${String(err)}`)
      this.deps.bus.emit('orchestrator.error', { conversationId: conversation.id, error: String(err) })
      return
    }

    const now = new Date().toISOString()
    db.insert(messages).values({
      conversationId: conversation.id,
      role: 'assistant',
      content: assistantText,
      createdAt: now,
    }).run()
    db.update(conversations).set({ lastActiveAt: now }).where(eq(conversations.id, conversation.id)).run()
    this.deps.bus.emit('orchestrator.finished', { conversationId: conversation.id })

    await this.deliver(envelope.channel, conversation, assistantText)
  }

  private async deliver(channel: ChannelType, conversation: ConversationState, text: string) {
    const binding = this.deps.config.channels.find(c => c.channel === channel && c.enabled)
    if (!binding)
      return
    const adapter = getChannelAdapter(channel)
    try {
      await adapter.send(binding, {
        channel,
        chatId: conversation.chatId,
        ...(conversation.threadId === undefined ? {} : { threadId: conversation.threadId }),
        text,
      })
    }
    catch (err) {
      consola.warn(`[orchestrator] deliver to ${channel} failed: ${String(err)}`)
    }
  }

  private async resolveConversation(envelope: Envelope): Promise<ConversationState> {
    const db = getWorkerDb()
    const existing = await findOpenConversation(envelope)
    if (!existing)
      return this.createConversation(envelope)

    const existingWorkspace = await this.provisionWorkspace(existing.id)
    const recent = await loadRecentMessages(existing.id)
    const model = executorModel(this.deps.config.executor)
    const decision = await classifyContinuation(
      this.deps.executor,
      model,
      existing.summary ?? null,
      recent,
      envelope.text,
      existingWorkspace?.path,
    )
    this.deps.bus.emit('conversation.classifier', { conversationId: existing.id, decision })
    if (decision.continue)
      return rowToState(existing)

    const closedAt = new Date().toISOString()
    db.update(conversations).set({ status: 'closed', closedAt }).where(eq(conversations.id, existing.id)).run()
    // Defer workspace dispose behind the same group key so any in-flight run
    // for the closed conversation completes before the directory (or git
    // worktree) goes away. ProcessManager guarantees per-group FIFO, so
    // background-class dispose still queues after pending interactive runs.
    const closedId = existing.id
    void this.deps.processes.run({
      group: closedId,
      engine: this.deps.config.executor.engine,
      class: 'background',
      meta: { conversationId: closedId, kind: 'workspace.dispose' },
      onSpawn: async () => ({
        cancel: async () => {},
        onActivity: () => () => {},
      }),
      job: () => this.disposeWorkspace(closedId),
    }).catch(err => consola.warn(`[orchestrator] dispose workspace job failed: ${String(err)}`))
    return this.createConversation(envelope)
  }

  /**
   * Create (or return existing) workspace for a conversation. `null` is
   * returned when provisioning fails so the caller can still proceed with
   * executors that don't require a workspace (http / mcp).
   */
  private async provisionWorkspace(conversationId: string): Promise<WorkspaceHandle | null> {
    try {
      return await this.deps.workspaces.createWorkspace(conversationId)
    }
    catch (err) {
      consola.warn(`[orchestrator] workspace create failed for ${conversationId}: ${String(err)}`)
      return null
    }
  }

  private async disposeWorkspace(conversationId: string): Promise<void> {
    try {
      await this.deps.workspaces.disposeWorkspace(conversationId)
    }
    catch (err) {
      consola.warn(`[orchestrator] workspace dispose failed for ${conversationId}: ${String(err)}`)
    }
  }

  private createConversation(envelope: Envelope): ConversationState {
    const db = getWorkerDb()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    db.insert(conversations).values({
      id,
      channel: envelope.channel,
      chatId: envelope.chatId,
      ...(envelope.threadId === undefined ? {} : { threadId: envelope.threadId }),
      status: 'open',
      startedAt: now,
      lastActiveAt: now,
    }).run()
    const rowRaw = db.select().from(conversations).where(eq(conversations.id, id)).get()!
    this.deps.bus.emit('conversation.created', { conversationId: id, channel: envelope.channel, chatId: envelope.chatId })
    return rowToState(rowRaw)
  }

  private persistUserMessage(conversationId: string, envelope: Envelope) {
    const db = getWorkerDb()
    const now = new Date().toISOString()
    const richMetadata = envelope.richMetadata ? JSON.stringify(envelope.richMetadata) : null
    const res = db.insert(messages).values({
      conversationId,
      role: 'user',
      content: envelope.text,
      ...(richMetadata === null ? {} : { richMetadata }),
      createdAt: now,
    }).returning({ id: messages.id }).all()
    db.update(conversations).set({ lastActiveAt: now }).where(eq(conversations.id, conversationId)).run()
    return { id: res[0]?.id ?? -1 }
  }

  /**
   * REFACTOR-006 P2：取最近 N 条消息塞进 LLM context。N 来自 worker config
   * 的 `orchestrator.maxHistoryMessages`，缺省 `DEFAULT_MAX_HISTORY_MESSAGES`
   * (20)。`loadRecentMessages` 复用 conversation router 的实现：按 id desc
   * 取 limit 然后 reverse，保证顺序仍是早→晚。
   */
  private async loadHistoryWindow(conversationId: string): Promise<ChatMessage[]> {
    const limit = this.deps.config.orchestrator?.maxHistoryMessages ?? DEFAULT_MAX_HISTORY_MESSAGES
    const rows = await loadRecentMessages(conversationId, limit)
    return rows.map(r => ({ role: r.role, content: r.content }))
  }

  /**
   * 构造 system prompt。当 conversation 已经积累过 summary（来自将来某个
   * 总结 trick）时把它带进 system，弥补 history 窗口被截断丢掉的早期上下文。
   */
  private async buildSystemPrompt(priorSummary: string | null): Promise<string> {
    const skills = await this.deps.brain.listSkills().catch(() => [])
    const lines = [
      `You are worker ${this.deps.workerId}.`,
      'Respond concisely and helpfully.',
    ]
    if (priorSummary && priorSummary.trim().length > 0)
      lines.push(`Conversation summary so far: ${priorSummary.trim()}`)
    if (skills.length > 0) {
      lines.push('Available brain skills:')
      for (const s of skills.slice(0, 10))
        lines.push(`- ${s.name}: ${s.description}`)
    }
    return lines.join('\n')
  }

  /**
   * Per-tool approval gate（PLAN-014 F2）。在 executor 真正执行 tool 前调用：
   *
   * - `auto` → 立即返回 `allow`，调用方可直接进 executor。
   * - `ask`  → 在 bus 上发 `approval.requested` 事件，挂起 promise 等
   *            `approval.grant`；超时（默认 60s）按 deny 处理。
   * - `deny` → 短路：合成一条 `tool {name} blocked by policy` 助手消息；
   *            如果传了 `conversationId` 也会写入 `messages` 表。
   */
  async runTool(input: RunToolInput): Promise<RunToolResult> {
    const policy = evaluateToolPolicy(input.toolName, this.deps.config.toolPolicy)
    if (policy === 'auto')
      return { decision: 'allow', policy: 'auto' }

    if (policy === 'deny') {
      const text = `tool ${input.toolName} blocked by policy`
      if (input.conversationId !== undefined)
        this.persistAssistantMessage(input.conversationId, text)
      this.deps.bus.emit('approval.denied', {
        taskId: input.taskId,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        reason: 'policy',
      })
      return { decision: 'deny', policy: 'deny', syntheticAssistantMessage: text }
    }

    // policy === 'ask'：发事件后挂起，等 grant；超时视作 deny。
    const timeoutMs = input.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS
    const expiresAt = Date.now() + timeoutMs
    this.deps.bus.emit('approval.requested', {
      workerId: this.deps.workerId,
      taskId: input.taskId,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      params: input.params,
      expiresAt,
    })

    let decision: ApprovalDecision
    try {
      decision = await this.deps.approvals.wait({
        taskId: input.taskId,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        params: input.params,
        timeoutMs,
      })
    }
    catch {
      // dispose 期间 reject —— 当成 deny 处理，调用方走短路分支。
      decision = 'deny'
    }

    if (decision === 'allow')
      return { decision: 'allow', policy: 'ask' }

    const text = `tool ${input.toolName} blocked by policy`
    if (input.conversationId !== undefined)
      this.persistAssistantMessage(input.conversationId, text)
    return { decision: 'deny', policy: 'ask', syntheticAssistantMessage: text }
  }

  private persistAssistantMessage(conversationId: string, text: string): void {
    const db = getWorkerDb()
    const now = new Date().toISOString()
    db.insert(messages).values({
      conversationId,
      role: 'assistant',
      content: text,
      createdAt: now,
    }).run()
    db.update(conversations).set({ lastActiveAt: now }).where(eq(conversations.id, conversationId)).run()
  }

  // Convenience: submit a free-form task not tied to a channel.
  async submitTask(prompt: string): Promise<{ id: string }> {
    const db = getWorkerDb()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    db.insert(agentTasks).values({
      id,
      prompt,
      status: 'queued',
      createdAt: now,
    }).run()

    const envelope: Envelope = {
      workerId: this.deps.workerId,
      channel: 'web',
      // 系统派发的任务流不来自任何 web binding，使用保留前缀 `sys:` 避免与
      // 用户配置的 binding.id 冲突。
      accountId: 'sys:task',
      chatId: `task:${id}`,
      text: prompt,
      receivedAt: now,
      raw: { taskId: id },
    }
    void this.ingest(envelope).catch(err => consola.error(`[orchestrator] submitTask ingest failed: ${String(err)}`))

    return { id }
  }
}

function executorModel(config: ExecutorConfig): string | undefined {
  // Resolve through the variant catalogue so a user who picks a preset (e.g.
  // http/deepseek without an `overrides.model`) still surfaces the variant's
  // baked-in model id. Failures (unknown engine / variant) are swallowed —
  // the executor itself will still error and the orchestrator just omits the
  // per-request model hint.
  let resolved: ReturnType<typeof resolveVariant> | null = null
  try {
    resolved = resolveVariant(config)
  }
  catch {
    return undefined
  }
  if (!resolved)
    return undefined
  if (resolved.modelId !== undefined && resolved.modelId.length > 0)
    return resolved.modelId
  const body = resolved.body as Record<string, unknown>
  if (typeof body.model === 'string' && body.model.length > 0)
    return body.model
  if (typeof body.defaultModel === 'string' && body.defaultModel.length > 0)
    return body.defaultModel
  return undefined
}

function rowToState(row: typeof conversations.$inferSelect): ConversationState {
  return {
    id: row.id,
    ...(row.taskId === null ? {} : { taskId: row.taskId }),
    channel: row.channel,
    chatId: row.chatId,
    ...(row.threadId === null ? {} : { threadId: row.threadId }),
    status: row.status,
    ...(row.summary === null ? {} : { summary: row.summary }),
    startedAt: row.startedAt,
    lastActiveAt: row.lastActiveAt,
    ...(row.closedAt === null ? {} : { closedAt: row.closedAt }),
  }
}
