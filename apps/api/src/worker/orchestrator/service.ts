import type {
  BrainProvider,
  ChannelType,
  ChatMessage,
  ConversationState,
  Envelope,
  ExecutorConfig,
  ExecutorProvider,
  WorkerConfig,
} from '@aiworker/shared'
import type { WorkerEventBus } from '../events/bus'
import type { WorkspaceHandle, WorkspaceManager } from '../executor/workspace'

import consola from 'consola'
import { eq } from 'drizzle-orm'

import { getWorkerDb } from '../../db/worker'
import { agentTasks, conversations, messages } from '../../db/worker/schema'
import { getChannelAdapter } from '../channels/registry'
import { classifyContinuation, findOpenConversation, loadRecentMessages } from '../conversation/router'
import { resolveVariant } from '../executor/default-profiles'
import { AsyncQueue } from './queue'

interface OrchestratorDeps {
  config: WorkerConfig
  brain: BrainProvider
  executor: ExecutorProvider
  bus: WorkerEventBus
  workerId: string
  workspaces: WorkspaceManager
}

export class Orchestrator {
  private readonly queue = new AsyncQueue()
  constructor(private readonly deps: OrchestratorDeps) {}

  /** Entry point for inbound envelopes from any channel. */
  async ingest(envelope: Envelope): Promise<void> {
    this.deps.bus.emit('channel.inbound', { channel: envelope.channel, chatId: envelope.chatId, text: envelope.text })
    const conversation = await this.resolveConversation(envelope)
    const workspace = await this.provisionWorkspace(conversation.id)
    const userMessage = this.persistUserMessage(conversation.id, envelope)
    this.deps.bus.emit('conversation.message', { conversationId: conversation.id, messageId: userMessage.id, role: 'user' })
    await this.queue.enqueue(() => this.run(conversation, envelope, workspace))
  }

  private async run(conversation: ConversationState, envelope: Envelope, workspace: WorkspaceHandle | null): Promise<void> {
    const db = getWorkerDb()
    const history = await this.loadConversationMessages(conversation.id)
    const systemPrompt = await this.buildSystemPrompt()

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
    ]

    const model = executorModel(this.deps.config.executor)
    const runInput = {
      messages: chatMessages,
      ...(model ? { model } : {}),
      ...(workspace ? { workspacePath: workspace.path } : {}),
    }
    let assistantText = ''
    try {
      for await (const event of this.deps.executor.run(runInput)) {
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
    // Defer workspace dispose behind the FIFO queue so any in-flight run
    // that was enqueued on the prior conversation completes before the
    // directory (or git worktree) goes away.
    const closedId = existing.id
    void this.queue.enqueue(() => this.disposeWorkspace(closedId))
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
    const res = db.insert(messages).values({
      conversationId,
      role: 'user',
      content: envelope.text,
      createdAt: now,
    }).returning({ id: messages.id }).all()
    db.update(conversations).set({ lastActiveAt: now }).where(eq(conversations.id, conversationId)).run()
    return { id: res[0]?.id ?? -1 }
  }

  private async loadConversationMessages(conversationId: string): Promise<ChatMessage[]> {
    const db = getWorkerDb()
    const rows = db.select({
      role: messages.role,
      content: messages.content,
    })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .all()
    return rows.map(r => ({ role: r.role, content: r.content }))
  }

  private async buildSystemPrompt(): Promise<string> {
    const skills = await this.deps.brain.listSkills().catch(() => [])
    const lines = [
      `You are worker ${this.deps.workerId}.`,
      'Respond concisely and helpfully.',
    ]
    if (skills.length > 0) {
      lines.push('Available brain skills:')
      for (const s of skills.slice(0, 10))
        lines.push(`- ${s.name}: ${s.description}`)
    }
    return lines.join('\n')
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
