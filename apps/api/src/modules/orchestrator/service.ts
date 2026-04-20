import type {
  BrainProvider,
  ChatMessage,
  ChatRunInput,
  ExecutorProvider,
  ToolCall,
} from '@aiworker/shared'
import type { AgentTaskDTO, MessageDTO, TaskDetailResponse, ToolCallDTO } from './types'
import consola from 'consola'
import { and, desc, eq, lt, sql } from 'drizzle-orm'
import { config } from '../../config'
import { getDb } from '../../db'
import { agentTasks, conversations, executionLogs, messages } from '../../db/schema'
import { getBrainProvider, getExecutorProvider } from '../../providers'
import { AppError } from '../../shared'
import { eventBus } from '../events'
import { AsyncQueue } from './queue'
import { executeTool, orchestratorToolDefinitions } from './tools'
import { ORCHESTRATOR_EVENT } from './types'

const SYSTEM_SKILL_LIMIT = 10
const MESSAGE_LIMIT_PER_TASK = 500

interface SubmitTaskInput {
  prompt: string
  autoWriteback?: boolean
}

interface RunOptions {
  autoWriteback: boolean
}

interface RunContext {
  brain: BrainProvider
  executor: ExecutorProvider
  hermesHome: string
  model: string
}

const queue = new AsyncQueue()
const abortControllers = new Map<string, AbortController>()
const runOptionsByTask = new Map<string, RunOptions>()

export function submitTask(input: SubmitTaskInput): AgentTaskDTO {
  const db = getDb()
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const autoWriteback = input.autoWriteback ?? true

  db.insert(agentTasks).values({
    id,
    prompt: input.prompt,
    status: 'queued',
    createdAt,
  }).run()

  runOptionsByTask.set(id, { autoWriteback })
  void queue.enqueue(() => runTask(id)).catch((err) => {
    consola.error(`[orchestrator] runTask(${id}) threw:`, err)
  })

  return {
    id,
    prompt: input.prompt,
    status: 'queued',
    createdAt,
  }
}

export function getTask(id: string): AgentTaskDTO | null {
  const db = getDb()
  const row = db.select().from(agentTasks).where(eq(agentTasks.id, id)).get()
  return row ? rowToTaskDto(row) : null
}

export function getTaskDetail(id: string): TaskDetailResponse | null {
  const task = getTask(id)
  if (!task)
    return null

  const db = getDb()
  const transcript = task.conversationId
    ? db.select()
        .from(messages)
        .where(eq(messages.conversationId, task.conversationId))
        .orderBy(messages.id)
        .limit(MESSAGE_LIMIT_PER_TASK)
        .all()
    : []

  const toolLogs = task.conversationId
    ? db.select()
        .from(executionLogs)
        .where(eq(executionLogs.conversationId, task.conversationId))
        .orderBy(executionLogs.id)
        .all()
    : []

  return {
    task,
    messages: transcript.map(rowToMessageDto),
    toolCalls: toolLogs.map(rowToToolCallDto),
  }
}

export function listTasks(options: { limit: number, cursor?: string }): {
  tasks: AgentTaskDTO[]
  nextCursor?: string
} {
  const db = getDb()
  const condition = options.cursor ? lt(agentTasks.createdAt, options.cursor) : undefined
  const query = db.select().from(agentTasks)
  const filtered = condition ? query.where(condition) : query
  const rows = filtered
    .orderBy(desc(agentTasks.createdAt), desc(agentTasks.id))
    .limit(options.limit + 1)
    .all()

  const hasMore = rows.length > options.limit
  const page = hasMore ? rows.slice(0, options.limit) : rows
  const nextCursor = hasMore ? page[page.length - 1]!.createdAt : undefined
  return {
    tasks: page.map(rowToTaskDto),
    nextCursor,
  }
}

export function cancelTask(id: string): AgentTaskDTO {
  const db = getDb()
  const row = db.select().from(agentTasks).where(eq(agentTasks.id, id)).get()
  if (!row)
    throw AppError.notFound(`Task not found: ${id}`)

  if (row.status === 'succeeded' || row.status === 'failed' || row.status === 'cancelled')
    return rowToTaskDto(row)

  const controller = abortControllers.get(id)
  if (controller)
    controller.abort()

  const finishedAt = new Date().toISOString()
  db.update(agentTasks)
    .set({ status: 'cancelled', finishedAt })
    .where(and(eq(agentTasks.id, id), eq(agentTasks.status, row.status)))
    .run()

  eventBus.publish({
    type: ORCHESTRATOR_EVENT.TaskCancelled,
    payload: { taskId: id },
  })

  const updated = db.select().from(agentTasks).where(eq(agentTasks.id, id)).get()
  return rowToTaskDto(updated!)
}

export async function runTask(id: string, overrides?: Partial<RunContext>): Promise<void> {
  const db = getDb()
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, id)).get()
  if (!task || task.status !== 'queued')
    return

  const options = runOptionsByTask.get(id) ?? { autoWriteback: true }

  const ctx: RunContext = {
    brain: overrides?.brain ?? getBrainProvider(),
    executor: overrides?.executor ?? getExecutorProvider(),
    hermesHome: overrides?.hermesHome ?? config.HERMES_HOME,
    model: overrides?.model ?? config.OPENAI_MODEL,
  }

  const abortController = new AbortController()
  abortControllers.set(id, abortController)

  db.update(agentTasks).set({ status: 'running' }).where(eq(agentTasks.id, id)).run()

  let conversationId = task.conversationId
  if (!conversationId) {
    conversationId = crypto.randomUUID()
    db.insert(conversations).values({
      id: conversationId,
      taskId: id,
      createdAt: new Date().toISOString(),
    }).run()
    db.update(agentTasks)
      .set({ conversationId })
      .where(eq(agentTasks.id, id))
      .run()
  }

  eventBus.publish({
    type: ORCHESTRATOR_EVENT.TaskStarted,
    payload: { taskId: id, conversationId },
  })

  const transcript: ChatMessage[] = []

  try {
    const systemPrompt = await buildSystemPrompt(ctx.brain)
    persistMessage(id, conversationId, { role: 'system', content: systemPrompt })
    transcript.push({ role: 'system', content: systemPrompt })

    persistMessage(id, conversationId, { role: 'user', content: task.prompt })
    transcript.push({ role: 'user', content: task.prompt })

    const allowedToolNames = orchestratorToolDefinitions.map(t => t.name)

    let finalAssistantContent = ''

    while (true) {
      if (abortController.signal.aborted) {
        finalizeCancelled(id)
        return
      }

      const input: ChatRunInput = {
        messages: transcript,
        model: ctx.model,
        tools: allowedToolNames,
        toolDefinitions: orchestratorToolDefinitions,
        signal: abortController.signal,
      }

      let buffer = ''
      const pendingToolCalls: ToolCall[] = []
      let finishReason: string | null = null
      let streamError: string | null = null

      for await (const chunk of ctx.executor.runChat(input)) {
        if (abortController.signal.aborted) {
          finalizeCancelled(id)
          return
        }

        if (chunk.type === 'text') {
          buffer += chunk.delta
          continue
        }

        if (chunk.type === 'tool_call') {
          pendingToolCalls.push(chunk.call)
          const assistantContent = buffer
          buffer = ''
          persistMessage(id, conversationId, {
            role: 'assistant',
            content: assistantContent,
            toolCalls: [chunk.call],
          })
          transcript.push({
            role: 'assistant',
            content: assistantContent,
            toolCalls: [chunk.call],
          })

          const { content: toolContent, durationMs, params } = await runTool(chunk.call, ctx)

          persistMessage(id, conversationId, {
            role: 'tool',
            content: toolContent,
            toolCallId: chunk.call.id,
            name: chunk.call.name,
          })
          transcript.push({
            role: 'tool',
            content: toolContent,
            toolCallId: chunk.call.id,
            name: chunk.call.name,
          })

          const logRow = db.insert(executionLogs).values({
            issueId: id,
            toolName: chunk.call.name,
            params,
            result: { content: toolContent },
            duration: durationMs,
            conversationId,
          }).returning().get()

          eventBus.publish({
            type: ORCHESTRATOR_EVENT.TaskToolCall,
            payload: {
              taskId: id,
              conversationId,
              call: rowToToolCallDto(logRow),
            },
          })
          continue
        }

        if (chunk.type === 'finish') {
          finishReason = chunk.reason
          if (buffer.length > 0) {
            finalAssistantContent = buffer
            persistMessage(id, conversationId, {
              role: 'assistant',
              content: buffer,
            })
            transcript.push({ role: 'assistant', content: buffer })
            buffer = ''
          }
          break
        }

        if (chunk.type === 'error') {
          streamError = chunk.error
          break
        }
      }

      if (streamError) {
        finalizeFailure(id, streamError)
        return
      }

      if (finishReason === 'tool' || pendingToolCalls.length > 0)
        continue

      break
    }

    if (abortController.signal.aborted) {
      finalizeCancelled(id)
      return
    }

    const finishedAt = new Date().toISOString()
    const result: Record<string, unknown> = { summary: finalAssistantContent }
    db.update(agentTasks)
      .set({ status: 'succeeded', finishedAt, result })
      .where(eq(agentTasks.id, id))
      .run()

    eventBus.publish({
      type: ORCHESTRATOR_EVENT.TaskFinished,
      payload: { taskId: id, result },
    })

    if (options.autoWriteback && finalAssistantContent.trim().length > 0) {
      try {
        await ctx.brain.writeMemory({
          content: finalAssistantContent,
          tags: ['orchestrator-session'],
        })
      }
      catch (err) {
        consola.warn(`[orchestrator] auto-writeback failed for ${id}:`, err)
      }
    }
  }
  catch (err) {
    if (abortController.signal.aborted) {
      finalizeCancelled(id)
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    finalizeFailure(id, message)
  }
  finally {
    abortControllers.delete(id)
    runOptionsByTask.delete(id)
  }
}

async function runTool(
  call: ToolCall,
  ctx: RunContext,
): Promise<{ content: string, durationMs: number, params: Record<string, unknown> }> {
  const start = performance.now()
  try {
    const result = await executeTool(call.name, call.arguments, {
      brain: ctx.brain,
      hermesHome: ctx.hermesHome,
    })
    const durationMs = Math.round(performance.now() - start)
    return { content: result.content, durationMs, params: call.arguments }
  }
  catch (err) {
    const durationMs = Math.round(performance.now() - start)
    const message = err instanceof Error ? err.message : String(err)
    return {
      content: JSON.stringify({ error: message }),
      durationMs,
      params: call.arguments,
    }
  }
}

async function buildSystemPrompt(brain: BrainProvider): Promise<string> {
  let skillLines = ''
  try {
    const skills = await brain.listSkills()
    const top = skills.slice(0, SYSTEM_SKILL_LIMIT)
    if (top.length > 0) {
      skillLines = top.map(s => `- ${s.name}: ${s.description}`).join('\n')
    }
  }
  catch (err) {
    consola.warn('[orchestrator] listSkills failed, omitting from system prompt:', err)
  }

  const header = [
    'You are the AIWorker orchestrator assistant.',
    'You have access to three tools: search_memory, write_memory, read_file.',
    'Use them when helpful. Keep responses concise.',
  ].join(' ')

  return skillLines
    ? `${header}\n\nAvailable skills:\n${skillLines}`
    : header
}

function persistMessage(
  taskId: string,
  conversationId: string,
  msg: ChatMessage,
): void {
  const db = getDb()
  const row = db.insert(messages).values({
    conversationId,
    role: msg.role,
    content: msg.content,
    toolCalls: msg.toolCalls,
    toolCallId: msg.toolCallId,
  }).returning().get()

  eventBus.publish({
    type: ORCHESTRATOR_EVENT.TaskMessage,
    payload: {
      taskId,
      conversationId,
      message: rowToMessageDto(row),
    },
  })
}

function finalizeFailure(id: string, error: string): void {
  const db = getDb()
  const finishedAt = new Date().toISOString()
  db.update(agentTasks)
    .set({ status: 'failed', finishedAt, result: { error } })
    .where(eq(agentTasks.id, id))
    .run()

  eventBus.publish({
    type: ORCHESTRATOR_EVENT.TaskFailed,
    payload: { taskId: id, error },
  })
}

function finalizeCancelled(id: string): void {
  const db = getDb()
  const finishedAt = new Date().toISOString()
  db.update(agentTasks)
    .set({ status: 'cancelled', finishedAt })
    .where(and(eq(agentTasks.id, id), sql`${agentTasks.status} != 'cancelled'`))
    .run()

  eventBus.publish({
    type: ORCHESTRATOR_EVENT.TaskCancelled,
    payload: { taskId: id },
  })
}

type TaskRow = typeof agentTasks.$inferSelect
type MessageRow = typeof messages.$inferSelect
type ExecutionLogRow = typeof executionLogs.$inferSelect

function rowToTaskDto(row: TaskRow): AgentTaskDTO {
  const dto: AgentTaskDTO = {
    id: row.id,
    prompt: row.prompt,
    status: row.status,
    createdAt: row.createdAt,
  }
  if (row.conversationId)
    dto.conversationId = row.conversationId
  if (row.finishedAt)
    dto.finishedAt = row.finishedAt
  if (row.result) {
    dto.result = row.result
    const err = row.result.error
    if (typeof err === 'string')
      dto.error = err
  }
  return dto
}

function rowToMessageDto(row: MessageRow): MessageDTO {
  const dto: MessageDTO = {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
  }
  if (row.toolCalls)
    dto.toolCalls = row.toolCalls
  if (row.toolCallId)
    dto.toolCallId = row.toolCallId
  return dto
}

function rowToToolCallDto(row: ExecutionLogRow): ToolCallDTO {
  return {
    id: row.id,
    conversationId: row.conversationId ?? null,
    toolName: row.toolName,
    params: row.params ?? null,
    result: row.result ?? null,
    durationMs: row.duration ?? null,
    createdAt: row.createdAt,
  }
}
