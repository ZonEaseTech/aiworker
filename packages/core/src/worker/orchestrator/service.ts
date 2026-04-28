import type {
  BrainProvider,
  ChannelType,
  ChatMessage,
  ConversationState,
  Envelope,
  ExecutorProvider,
  OrchestratorCompactionConfig,
  ToolCall,
  WorkerConfig,
} from '@zonease/aiworker-shared'
import type { WorkerEventBus } from '../events/bus'
import type { WorkspaceHandle, WorkspaceManager } from '../executor/workspace'
import type { ApprovalDecision, ApprovalStore } from './approvals'
import type { ProcessManager } from './process-manager'

import { DEFAULT_MAX_HISTORY_MESSAGES } from '@zonease/aiworker-shared'
import { agentTasks, conversations, getWorkerDb, messages, recordSessionCompaction, rotateSessionConversation, touchSessionEntry, upsertSessionEntry } from '@zonease/aiworker-storage-sqlite/worker'

import consola from 'consola'
import { and, asc, desc, eq, gt } from 'drizzle-orm'
import { getChannelAdapter } from '../channels/registry'
import { classifyContinuation, findOpenConversation, findSessionConversation, hasSessionEntryForRoute, loadRecentMessages, resolveSessionKey } from '../conversation/router'
import { DEFAULT_APPROVAL_TIMEOUT_MS } from './approvals'
import {
  assembleTokenBudgetContext,
  DEFAULT_TOKEN_BUDGET_HISTORY_SCAN_MESSAGES,
  estimateChatMessagesTokens,
  estimateChatMessageTokens,
  resolveContextBudget,
  resolveExecutorModel,
} from './context'
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

type ConversationRow = typeof conversations.$inferSelect
interface ResolvedConversation {
  conversation: ConversationState
  sessionKey: string
}

interface TranscriptRow {
  id: number
  role: ChatMessage['role']
  content: string
  toolCalls: ToolCall[] | null
  toolCallId: string | null
  richMetadata: string | null
}

interface CompactionCheckpoint {
  messageId: number
  compactedThroughMessageId: number
}

interface MemoryFlushResult {
  attempted: boolean
  at?: string
  status?: 'succeeded' | 'failed' | 'empty'
  content?: string
  error?: string
}

interface CompactionOutcome {
  conversation: ConversationState
  compacted: boolean
}

interface ExecutorTextResult {
  ok: boolean
  text: string
  error?: string
}

const DEFAULT_COMPACTION_MAX_SUMMARY_MESSAGES = 120
const TRANSCRIPT_METADATA_VERSION = 1

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
    const resolved = await this.resolveConversation(envelope)
    const { conversation, sessionKey } = resolved
    const workspace = await this.provisionWorkspace(conversation.id)
    const userMessage = this.persistUserMessage(conversation.id, envelope, sessionKey)
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
      job: () => this.run(conversation, envelope, workspace, controller.signal, () => activityCb?.(), sessionKey),
    })
  }

  private async run(
    conversation: ConversationState,
    envelope: Envelope,
    workspace: WorkspaceHandle | null,
    signal: AbortSignal,
    notifyActivity: () => void,
    sessionKey: string,
  ): Promise<void> {
    const db = getWorkerDb()
    let activeConversation = (await this.maybeCompactConversation({
      conversation,
      sessionKey,
      workspace,
      signal,
      notifyActivity,
    })).conversation
    let systemPrompt = await this.buildSystemPrompt(activeConversation.summary ?? null)
    let chatMessages = await this.buildRunContext(activeConversation.id, systemPrompt)
    touchSessionEntry(sessionKey, { contextTokens: estimateChatMessagesTokens(chatMessages) })

    const model = resolveExecutorModel(this.deps.config.executor)
    const taskId = taskIdFromEnvelope(envelope)
    let runInput = {
      messages: chatMessages,
      ...(model ? { model } : {}),
      ...(workspace ? { workspacePath: workspace.path } : {}),
      signal,
    }
    let result = await this.collectAssistantText(runInput, activeConversation.id, taskId, notifyActivity)
    if (!result.ok && this.isContextOverflowError(result.error)) {
      const retryCompaction = await this.maybeCompactConversation({
        conversation: activeConversation,
        sessionKey,
        workspace,
        signal,
        notifyActivity,
        force: true,
      })
      if (retryCompaction.compacted) {
        activeConversation = retryCompaction.conversation
        systemPrompt = await this.buildSystemPrompt(activeConversation.summary ?? null)
        chatMessages = await this.buildRunContext(activeConversation.id, systemPrompt)
        touchSessionEntry(sessionKey, { contextTokens: estimateChatMessagesTokens(chatMessages) })
        runInput = {
          messages: chatMessages,
          ...(model ? { model } : {}),
          ...(workspace ? { workspacePath: workspace.path } : {}),
          signal,
        }
        result = await this.collectAssistantText(runInput, activeConversation.id, taskId, notifyActivity)
      }
    }
    if (!result.ok) {
      const error = result.error ?? 'executor error'
      consola.warn(`[orchestrator] executor error: ${error}`)
      this.deps.bus.emit('orchestrator.error', {
        conversationId: activeConversation.id,
        ...(taskId === undefined ? {} : { taskId }),
        error,
      })
      return
    }

    const assistantText = result.text
    const now = new Date().toISOString()
    db.insert(messages).values({
      conversationId: activeConversation.id,
      role: 'assistant',
      content: assistantText,
      createdAt: now,
    }).run()
    db.update(conversations).set({ lastActiveAt: now }).where(eq(conversations.id, activeConversation.id)).run()
    touchSessionEntry(sessionKey, { at: now })
    this.deps.bus.emit('orchestrator.finished', {
      conversationId: activeConversation.id,
      ...(taskId === undefined ? {} : { taskId }),
    })

    await this.deliver(envelope.channel, activeConversation, assistantText)
  }

  private async collectAssistantText(
    runInput: Parameters<ExecutorProvider['run']>[0],
    conversationId: string,
    taskId: string | undefined,
    notifyActivity: () => void,
  ): Promise<ExecutorTextResult> {
    let assistantText = ''
    try {
      for await (const event of this.deps.executor.run(runInput)) {
        // Each AgentEvent counts as a stdout heartbeat for ProcessManager
        // stall detection — keeps a chatty agent alive and lets a silent one
        // get reaped after stallTimeoutMs.
        notifyActivity()
        if (event.type === 'assistant_message_delta') {
          assistantText += event.delta
          this.deps.bus.emit('orchestrator.text', {
            conversationId,
            ...(taskId === undefined ? {} : { taskId }),
            delta: event.delta,
          })
        }
        else if (event.type === 'tool_use') {
          this.deps.bus.emit('orchestrator.tool_call', {
            conversationId,
            ...(taskId === undefined ? {} : { taskId }),
            call: { id: event.id, name: event.name, arguments: event.arguments },
          })
        }
        else if (event.type === 'error') {
          return { ok: false, text: assistantText, error: event.error }
        }
      }
      return { ok: true, text: assistantText }
    }
    catch (err) {
      consola.error(`[orchestrator] run failed: ${String(err)}`)
      return { ok: false, text: assistantText, error: String(err) }
    }
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

  private async resolveConversation(envelope: Envelope): Promise<ResolvedConversation> {
    const sessionKey = resolveSessionKey(envelope)
    const sessionConversation = await findSessionConversation(sessionKey)
    const routeHasSessionEntry = sessionConversation ? true : await hasSessionEntryForRoute(envelope)
    const legacyConversation = routeHasSessionEntry ? null : await findOpenConversation(envelope)
    const existing = sessionConversation ?? legacyConversation
    if (!existing) {
      const conversation = this.createConversation(envelope)
      this.upsertSession(sessionKey, envelope, conversation.id)
      return { conversation, sessionKey }
    }

    if (legacyConversation)
      this.upsertSession(sessionKey, envelope, existing.id)

    if (isGatewaySessionReset(envelope)) {
      this.closeConversation(existing)
      const conversation = this.createConversation(envelope)
      this.rotateSession(sessionKey, envelope, conversation.id, gatewayResetReason(envelope))
      return { conversation, sessionKey }
    }

    const existingWorkspace = await this.provisionWorkspace(existing.id)
    const recent = await loadRecentMessages(existing.id)
    const model = resolveExecutorModel(this.deps.config.executor)
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
      return { conversation: rowToState(existing), sessionKey }

    this.closeConversation(existing)
    const conversation = this.createConversation(envelope)
    this.rotateSession(sessionKey, envelope, conversation.id, 'classifier:new-topic')
    return { conversation, sessionKey }
  }

  private closeConversation(existing: ConversationRow): void {
    const db = getWorkerDb()
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
    const taskId = taskIdFromEnvelope(envelope)
    this.deps.bus.emit('conversation.created', {
      conversationId: id,
      channel: envelope.channel,
      chatId: envelope.chatId,
      ...(taskId === undefined ? {} : { taskId }),
    })
    return rowToState(rowRaw)
  }

  private upsertSession(sessionKey: string, envelope: Envelope, conversationId: string): void {
    upsertSessionEntry({
      sessionKey,
      currentConversationId: conversationId,
      channel: envelope.channel,
      chatId: envelope.chatId,
      ...(envelope.threadId === undefined ? {} : { threadId: envelope.threadId }),
      accountId: envelope.accountId,
    })
  }

  private rotateSession(sessionKey: string, envelope: Envelope, conversationId: string, resetReason: string): void {
    const rotated = rotateSessionConversation({
      sessionKey,
      currentConversationId: conversationId,
      resetReason,
    })
    if (!rotated)
      this.upsertSession(sessionKey, envelope, conversationId)
  }

  private persistUserMessage(conversationId: string, envelope: Envelope, sessionKey: string) {
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
    touchSessionEntry(sessionKey, { at: now })
    return { id: res[0]?.id ?? -1 }
  }

  private async maybeCompactConversation(input: {
    conversation: ConversationState
    sessionKey: string
    workspace: WorkspaceHandle | null
    signal: AbortSignal
    notifyActivity: () => void
    force?: boolean
  }): Promise<CompactionOutcome> {
    const compaction = this.deps.config.orchestrator?.compaction
    if (compaction?.enabled !== true)
      return { conversation: input.conversation, compacted: false }

    const budget = resolveContextBudget(this.deps.config.orchestrator, this.deps.config.executor)
    if (!budget)
      return { conversation: input.conversation, compacted: false }

    const checkpoint = this.loadLatestCompactionCheckpoint(input.conversation.id)
    const rows = this.loadPromptTranscriptRows(input.conversation.id, checkpoint?.compactedThroughMessageId)
    if (rows.length <= 1)
      return { conversation: input.conversation, compacted: false }

    const systemPrompt = await this.buildSystemPrompt(input.conversation.summary ?? null)
    const systemTokens = estimateChatMessageTokens({ role: 'system', content: systemPrompt })
    const currentTokens = systemTokens
      + rows.reduce((sum, row) => sum + estimateChatMessageTokens(rowToChatMessage(row)), 0)
    const triggerTokens = compaction.triggerTokens ?? Math.max(0, budget.contextWindowTokens - budget.reserveTokens)
    if (!input.force && currentTokens <= triggerTokens)
      return { conversation: input.conversation, compacted: false }

    const recentTokenBudget = Math.min(budget.keepRecentTokens, Math.max(0, triggerTokens - systemTokens))
    const { candidateRows } = splitRowsForCompaction(rows, recentTokenBudget)
    if (candidateRows.length === 0)
      return { conversation: input.conversation, compacted: false }

    const fromId = candidateRows[0]!.id
    const throughId = candidateRows[candidateRows.length - 1]!.id
    const memoryFlush = await this.runPreCompactionMemoryFlush({
      conversationId: input.conversation.id,
      previousSummary: input.conversation.summary ?? null,
      rows: candidateRows,
      compaction,
      workspace: input.workspace,
      signal: input.signal,
      notifyActivity: input.notifyActivity,
      fromId,
      throughId,
    })

    let summary: string
    try {
      summary = await this.generateCompactionSummary({
        previousSummary: input.conversation.summary ?? null,
        rows: candidateRows,
        compaction,
        workspace: input.workspace,
        signal: input.signal,
        notifyActivity: input.notifyActivity,
      })
    }
    catch (err) {
      consola.warn(`[orchestrator] compaction summary failed: ${String(err)}`)
      return { conversation: input.conversation, compacted: false }
    }

    const now = new Date().toISOString()
    const db = getWorkerDb()
    db.insert(messages).values({
      conversationId: input.conversation.id,
      role: 'system',
      content: summary,
      richMetadata: JSON.stringify({
        kind: 'compaction',
        version: TRANSCRIPT_METADATA_VERSION,
        compactedFromMessageId: fromId,
        compactedThroughMessageId: throughId,
        sourceMessageCount: candidateRows.length,
        previousCompactionMessageId: checkpoint?.messageId ?? null,
        memoryFlush: memoryFlush.attempted
          ? {
              status: memoryFlush.status,
              at: memoryFlush.at,
              ...(memoryFlush.error === undefined ? {} : { error: memoryFlush.error }),
            }
          : { status: 'disabled' },
      }),
      createdAt: now,
    }).run()
    db.update(conversations).set({
      summary,
      lastActiveAt: now,
    }).where(eq(conversations.id, input.conversation.id)).run()
    recordSessionCompaction(input.sessionKey, {
      at: now,
      ...(memoryFlush.attempted && memoryFlush.at !== undefined ? { memoryFlushAt: memoryFlush.at } : {}),
    })

    const row = db.select().from(conversations).where(eq(conversations.id, input.conversation.id)).get()
    return {
      conversation: row ? rowToState(row) : { ...input.conversation, summary, lastActiveAt: now },
      compacted: true,
    }
  }

  private async runPreCompactionMemoryFlush(input: {
    conversationId: string
    previousSummary: string | null
    rows: TranscriptRow[]
    compaction: OrchestratorCompactionConfig
    workspace: WorkspaceHandle | null
    signal: AbortSignal
    notifyActivity: () => void
    fromId: number
    throughId: number
  }): Promise<MemoryFlushResult> {
    if (input.compaction.memoryFlush?.enabled !== true)
      return { attempted: false }

    const at = new Date().toISOString()
    const baseMetadata = {
      kind: 'memory-flush',
      version: TRANSCRIPT_METADATA_VERSION,
      compactedFromMessageId: input.fromId,
      compactedThroughMessageId: input.throughId,
    }

    try {
      const content = await this.runSuppressedExecutor({
        messages: buildMemoryFlushPrompt(input.previousSummary, input.rows, input.compaction),
        workspace: input.workspace,
        signal: input.signal,
        notifyActivity: input.notifyActivity,
      })
      const trimmed = content.trim()
      if (trimmed.length === 0 || /^none\.?$/i.test(trimmed)) {
        this.persistAuditMessage(input.conversationId, 'No durable memory changes requested by pre-compaction flush.', {
          ...baseMetadata,
          status: 'empty',
        }, at)
        return { attempted: true, at, status: 'empty' }
      }

      await this.deps.brain.writeMemory({
        content: trimmed,
        metadata: {
          name: `pre-compaction-${input.conversationId}-${input.throughId}`,
          description: 'Pre-compaction memory flush',
          type: 'memory',
          conversationId: input.conversationId,
          compactedFromMessageId: input.fromId,
          compactedThroughMessageId: input.throughId,
        },
        tags: ['aiworker', 'session-compaction'],
      })
      this.persistAuditMessage(input.conversationId, trimmed, {
        ...baseMetadata,
        status: 'succeeded',
      }, at)
      return { attempted: true, at, status: 'succeeded', content: trimmed }
    }
    catch (err) {
      const error = String(err)
      consola.warn(`[orchestrator] pre-compaction memory flush failed: ${error}`)
      this.persistAuditMessage(input.conversationId, error, {
        ...baseMetadata,
        status: 'failed',
        error,
      }, at)
      return { attempted: true, at, status: 'failed', error }
    }
  }

  private async generateCompactionSummary(input: {
    previousSummary: string | null
    rows: TranscriptRow[]
    compaction: OrchestratorCompactionConfig
    workspace: WorkspaceHandle | null
    signal: AbortSignal
    notifyActivity: () => void
  }): Promise<string> {
    const generated = await this.runSuppressedExecutor({
      messages: buildCompactionPrompt(input.previousSummary, input.rows, input.compaction),
      workspace: input.workspace,
      signal: input.signal,
      notifyActivity: input.notifyActivity,
    })
    const trimmed = generated.trim()
    if (trimmed.length > 0)
      return trimmed

    return fallbackCompactionSummary(input.previousSummary, input.rows)
  }

  private async runSuppressedExecutor(input: {
    messages: ChatMessage[]
    workspace: WorkspaceHandle | null
    signal: AbortSignal
    notifyActivity: () => void
  }): Promise<string> {
    const model = resolveExecutorModel(this.deps.config.executor)
    let text = ''
    for await (const event of this.deps.executor.run({
      messages: input.messages,
      ...(model ? { model } : {}),
      ...(input.workspace ? { workspacePath: input.workspace.path } : {}),
      signal: input.signal,
      temperature: 0,
    })) {
      input.notifyActivity()
      if (event.type === 'assistant_message_delta')
        text += event.delta
      else if (event.type === 'error')
        throw new Error(event.error)
    }
    return text
  }

  private persistAuditMessage(conversationId: string, content: string, metadata: Record<string, unknown>, at: string): void {
    getWorkerDb().insert(messages).values({
      conversationId,
      role: 'system',
      content,
      richMetadata: JSON.stringify(metadata),
      createdAt: at,
    }).run()
  }

  private loadLatestCompactionCheckpoint(conversationId: string): CompactionCheckpoint | null {
    const db = getWorkerDb()
    const rows = db.select({
      id: messages.id,
      role: messages.role,
      richMetadata: messages.richMetadata,
    }).from(messages).where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'system'))).orderBy(desc(messages.id)).all()

    for (const row of rows) {
      const metadata = parseTranscriptMetadata(row)
      if (metadata?.kind !== 'compaction')
        continue
      const compactedThroughMessageId = positiveNumber(metadata.compactedThroughMessageId)
      if (compactedThroughMessageId !== null)
        return { messageId: row.id, compactedThroughMessageId }
    }
    return null
  }

  private loadPromptTranscriptRows(conversationId: string, afterMessageId: number | undefined): TranscriptRow[] {
    const where = afterMessageId === undefined
      ? eq(messages.conversationId, conversationId)
      : and(eq(messages.conversationId, conversationId), gt(messages.id, afterMessageId))
    const db = getWorkerDb()
    return db.select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      toolCalls: messages.toolCalls,
      toolCallId: messages.toolCallId,
      richMetadata: messages.richMetadata,
    }).from(messages).where(where).orderBy(asc(messages.id)).all().filter(row => !isTranscriptAuditEntry(row))
  }

  private loadPromptTranscriptRowsNewestFirst(conversationId: string, afterMessageId: number | undefined, limit: number): TranscriptRow[] {
    const where = afterMessageId === undefined
      ? eq(messages.conversationId, conversationId)
      : and(eq(messages.conversationId, conversationId), gt(messages.id, afterMessageId))
    const db = getWorkerDb()
    return db.select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      toolCalls: messages.toolCalls,
      toolCallId: messages.toolCallId,
      richMetadata: messages.richMetadata,
    }).from(messages).where(where).orderBy(desc(messages.id)).limit(limit * 3).all().filter(row => !isTranscriptAuditEntry(row)).slice(0, limit)
  }

  private isContextOverflowError(error: string | undefined): boolean {
    if (error === undefined)
      return false
    return /context|token|too large|maximum length|maximum prompt|prompt is too long/i.test(error)
  }

  private async buildRunContext(conversationId: string, systemPrompt: string): Promise<ChatMessage[]> {
    const systemMessage: ChatMessage = { role: 'system', content: systemPrompt }
    const budget = resolveContextBudget(this.deps.config.orchestrator, this.deps.config.executor)
    if (!budget) {
      const history = await this.loadHistoryWindow(conversationId)
      return [systemMessage, ...history]
    }

    const historyNewestFirst = await this.loadBudgetHistory(conversationId, budget.maxHistoryMessages)
    return assembleTokenBudgetContext({
      systemMessage,
      historyNewestFirst,
      budget,
    }).messages
  }

  /**
   * Backward-compatible recent-message window. Used when no token budget field
   * is configured; preserves the REFACTOR-006 `maxHistoryMessages` behavior.
   */
  private async loadHistoryWindow(conversationId: string): Promise<ChatMessage[]> {
    const limit = this.deps.config.orchestrator?.maxHistoryMessages ?? DEFAULT_MAX_HISTORY_MESSAGES
    const checkpoint = this.loadLatestCompactionCheckpoint(conversationId)
    if (!checkpoint) {
      const rows = await loadRecentMessages(conversationId, limit)
      return rows.map(r => ({ role: r.role, content: r.content }))
    }
    return this.loadPromptTranscriptRowsNewestFirst(conversationId, checkpoint.compactedThroughMessageId, limit).reverse().map(rowToChatMessage)
  }

  private async loadBudgetHistory(conversationId: string, maxHistoryMessages: number | undefined): Promise<ChatMessage[]> {
    const checkpoint = this.loadLatestCompactionCheckpoint(conversationId)
    const rows = this.loadPromptTranscriptRowsNewestFirst(
      conversationId,
      checkpoint?.compactedThroughMessageId,
      maxHistoryMessages ?? DEFAULT_TOKEN_BUDGET_HISTORY_SCAN_MESSAGES,
    )
    return rows.map(rowToChatMessage)
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

function taskIdFromEnvelope(envelope: Envelope): string | undefined {
  if (!envelope.raw || typeof envelope.raw !== 'object' || Array.isArray(envelope.raw))
    return undefined
  const taskId = (envelope.raw as Record<string, unknown>).taskId
  return typeof taskId === 'string' && taskId.length > 0 ? taskId : undefined
}

function rowToChatMessage(row: Pick<TranscriptRow, 'role' | 'content' | 'toolCalls' | 'toolCallId'>): ChatMessage {
  return {
    role: row.role,
    content: row.content,
    ...(row.toolCalls === null ? {} : { toolCalls: row.toolCalls }),
    ...(row.toolCallId === null ? {} : { toolCallId: row.toolCallId }),
  }
}

function splitRowsForCompaction(rows: TranscriptRow[], keepRecentTokens: number): { candidateRows: TranscriptRow[], recentRows: TranscriptRow[] } {
  const recentNewestFirst: TranscriptRow[] = []
  let recentTokens = 0
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!
    const rowTokens = estimateChatMessageTokens(rowToChatMessage(row))
    if (recentNewestFirst.length > 0 && recentTokens + rowTokens > keepRecentTokens)
      break
    recentNewestFirst.push(row)
    recentTokens += rowTokens
  }

  const recentRows = expandRecentRowsForToolPairs(rows, recentNewestFirst.reverse())
  const firstRecentId = recentRows[0]?.id
  if (firstRecentId === undefined)
    return { candidateRows: rows, recentRows: [] }
  return {
    candidateRows: rows.filter(row => row.id < firstRecentId),
    recentRows,
  }
}

function expandRecentRowsForToolPairs(rows: TranscriptRow[], recentRows: TranscriptRow[]): TranscriptRow[] {
  const firstRecentId = recentRows[0]?.id
  if (firstRecentId === undefined)
    return recentRows

  let startIndex = rows.findIndex(row => row.id === firstRecentId)
  if (startIndex < 0)
    return recentRows

  while (startIndex > 0) {
    const missingAssistantIndex = findMissingToolCallAssistantIndex(rows, startIndex)
    if (missingAssistantIndex === null || missingAssistantIndex >= startIndex)
      break
    startIndex = missingAssistantIndex
  }
  return rows.slice(startIndex)
}

function findMissingToolCallAssistantIndex(rows: TranscriptRow[], startIndex: number): number | null {
  const availableToolCallIds = new Set<string>()
  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index]!
    for (const toolCall of row.toolCalls ?? [])
      availableToolCallIds.add(toolCall.id)
    if (row.role !== 'tool' || row.toolCallId === null || availableToolCallIds.has(row.toolCallId))
      continue
    for (let candidateIndex = startIndex - 1; candidateIndex >= 0; candidateIndex -= 1) {
      const candidate = rows[candidateIndex]!
      if (candidate.toolCalls?.some(toolCall => toolCall.id === row.toolCallId) === true)
        return candidateIndex
    }
  }
  return null
}

function buildCompactionPrompt(previousSummary: string | null, rows: TranscriptRow[], config: OrchestratorCompactionConfig): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You compact an AIWorker conversation transcript for future prompt context.',
        'Return a concise durable summary only.',
        'Merge the previous durable summary with the new transcript rows.',
        'Preserve user preferences, decisions, open tasks, constraints, named entities, and tool outcomes.',
        'Do not invent facts. Do not mention that this is a summary unless needed for clarity.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Previous durable summary:',
        previousSummary?.trim() || '(none)',
        '',
        'Transcript rows to compact. Raw rows remain stored for audit:',
        formatTranscriptExcerpt(rows, config.maxSummaryMessages ?? DEFAULT_COMPACTION_MAX_SUMMARY_MESSAGES),
      ].join('\n'),
    },
  ]
}

function buildMemoryFlushPrompt(previousSummary: string | null, rows: TranscriptRow[], config: OrchestratorCompactionConfig): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are running a pre-compaction memory flush for AIWorker.',
        'This turn is not delivered to the user.',
        'Return only durable facts, preferences, decisions, or todos that should be written to long-term memory.',
        'If there is nothing durable to write, return NONE.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Previous durable summary:',
        previousSummary?.trim() || '(none)',
        '',
        'Transcript rows about to be compacted:',
        formatTranscriptExcerpt(rows, config.maxSummaryMessages ?? DEFAULT_COMPACTION_MAX_SUMMARY_MESSAGES),
      ].join('\n'),
    },
  ]
}

function formatTranscriptExcerpt(rows: TranscriptRow[], limit: number): string {
  if (rows.length <= limit)
    return rows.map(formatTranscriptRow).join('\n')

  const headCount = Math.ceil(limit / 2)
  const tailCount = Math.floor(limit / 2)
  const omitted = rows.length - headCount - tailCount
  return [
    ...rows.slice(0, headCount).map(formatTranscriptRow),
    `... ${omitted} transcript rows omitted from summarizer prompt ...`,
    ...rows.slice(rows.length - tailCount).map(formatTranscriptRow),
  ].join('\n')
}

function formatTranscriptRow(row: TranscriptRow): string {
  const toolCallIds = row.toolCalls?.map(toolCall => toolCall.id).join(', ')
  const suffix = [
    toolCallIds ? ` toolCalls=${toolCallIds}` : '',
    row.toolCallId ? ` toolCallId=${row.toolCallId}` : '',
  ].join('')
  return `#${row.id} ${row.role}${suffix}: ${row.content.slice(0, 1_500)}`
}

function fallbackCompactionSummary(previousSummary: string | null, rows: TranscriptRow[]): string {
  const range = rows.length === 0 ? 'no rows' : `rows #${rows[0]!.id}-#${rows[rows.length - 1]!.id}`
  return [
    previousSummary?.trim() || '',
    `Compacted ${range}.`,
    formatTranscriptExcerpt(rows, Math.min(12, DEFAULT_COMPACTION_MAX_SUMMARY_MESSAGES)),
  ].filter(part => part.length > 0).join('\n\n')
}

function isTranscriptAuditEntry(row: { role: ChatMessage['role'], richMetadata: string | null }): boolean {
  if (row.role !== 'system')
    return false
  const metadata = parseTranscriptMetadata(row)
  return metadata?.kind === 'compaction' || metadata?.kind === 'memory-flush'
}

function parseTranscriptMetadata(row: { role: string, richMetadata: string | null }): Record<string, unknown> | null {
  if (row.role !== 'system' || row.richMetadata === null)
    return null
  try {
    const parsed = JSON.parse(row.richMetadata) as unknown
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  }
  catch {
    return null
  }
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function isGatewaySessionReset(envelope: Envelope): boolean {
  if (!envelope.raw || typeof envelope.raw !== 'object' || Array.isArray(envelope.raw))
    return false
  const raw = envelope.raw as Record<string, unknown>
  return raw.source === 'gateway' && raw.sessionReset === true
}

function gatewayResetReason(envelope: Envelope): string {
  if (!envelope.raw || typeof envelope.raw !== 'object' || Array.isArray(envelope.raw))
    return 'manual'
  const command = (envelope.raw as Record<string, unknown>).resetCommand
  return command === '/new' || command === '/reset' ? `manual:${command}` : 'manual'
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
