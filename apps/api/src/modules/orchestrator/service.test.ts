import type {
  ChatRunInput,
  ChatStreamChunk,
  ExecutorProvider,
  ExecutorTool,
  ServiceStatus,
  ToolCall,
} from '@aiworker/shared'
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { closeDb, getDb, initDb } from '../../db'
import { agentTasks, conversations, executionLogs, messages } from '../../db/schema'
import { HermesProvider } from '../../providers/brain/hermes'
import { eventBus } from '../events'
import * as service from './service'
import { runMigrationsForTesting } from './test-utils'

interface ScriptedChunk {
  chunk: ChatStreamChunk
  delayMs?: number
}

function scriptedExecutor(
  scripts: ScriptedChunk[][] | ScriptedChunk[],
): ExecutorProvider & { lastInput?: ChatRunInput } {
  const runs: ScriptedChunk[][] = Array.isArray(scripts[0]) ? scripts as ScriptedChunk[][] : [scripts as ScriptedChunk[]]
  let callIndex = 0

  const exec: ExecutorProvider & { lastInput?: ChatRunInput } = {
    name: 'scripted',
    async health(): Promise<ServiceStatus> {
      return { name: 'scripted', status: 'healthy', lastChecked: new Date().toISOString() }
    },
    async listTools(): Promise<ExecutorTool[]> {
      return []
    },
    runChat(input: ChatRunInput) {
      exec.lastInput = input
      const script = runs[callIndex] ?? runs[runs.length - 1] ?? []
      callIndex++
      return (async function* () {
        for (const step of script) {
          if (step.delayMs) {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, step.delayMs)
              input.signal?.addEventListener('abort', () => {
                clearTimeout(timer)
                reject(new Error('aborted'))
              }, { once: true })
            })
          }
          if (input.signal?.aborted)
            return
          yield step.chunk
        }
      })()
    },
  }

  return exec
}

function makeToolCall(id: string, name: string, args: Record<string, unknown>): ToolCall {
  return { id, name, arguments: args }
}

async function seedTask(prompt: string): Promise<string> {
  const db = getDb()
  const id = crypto.randomUUID()
  db.insert(agentTasks).values({
    id,
    prompt,
    status: 'queued',
    createdAt: new Date().toISOString(),
  }).run()
  return id
}

let tempHome: string
let capturedEvents: Array<{ type: string, payload: unknown }>
let unsubscribe: () => void

beforeEach(async () => {
  initDb(':memory:')
  runMigrationsForTesting()
  tempHome = await mkdtemp(path.join(tmpdir(), 'aiworker-orch-'))
  await mkdir(path.join(tempHome, 'memories'), { recursive: true })
  capturedEvents = []
  unsubscribe = eventBus.subscribe((event) => {
    if (event.type.startsWith('orchestrator.'))
      capturedEvents.push({ type: event.type, payload: event.payload })
  })
})

afterEach(() => {
  unsubscribe()
  closeDb()
})

describe('orchestrator service', () => {
  it('runs a simple task: user prompt → assistant response → succeeded', async () => {
    const brain = new HermesProvider({ apiUrl: 'http://invalid.local', home: tempHome })
    const executor = scriptedExecutor([
      { chunk: { type: 'text', delta: 'Hello' } },
      { chunk: { type: 'text', delta: ' world' } },
      { chunk: { type: 'finish', reason: 'stop' } },
    ])

    const id = await seedTask('say hi')
    await service.runTask(id, { brain, executor, hermesHome: tempHome, model: 'test-model' })

    const detail = service.getTaskDetail(id)
    expect(detail).not.toBeNull()
    expect(detail!.task.status).toBe('succeeded')
    expect(detail!.task.conversationId).toBeString()
    expect(detail!.task.finishedAt).toBeString()

    const roles = detail!.messages.map(m => m.role)
    expect(roles).toEqual(['system', 'user', 'assistant'])
    const assistant = detail!.messages.find(m => m.role === 'assistant')!
    expect(assistant.content).toBe('Hello world')

    const startedEvent = capturedEvents.find(e => e.type === 'orchestrator.task.started')
    const finishedEvent = capturedEvents.find(e => e.type === 'orchestrator.task.finished')
    expect(startedEvent).toBeDefined()
    expect(finishedEvent).toBeDefined()
  })

  it('executes search_memory tool and feeds result back into the conversation', async () => {
    const memContent = 'TypeScript rocks for structural typing.'
    await writeFile(
      path.join(tempHome, 'memories', 'note.md'),
      `---\nname: note\ndescription: test note\ntype: user\n---\n${memContent}\n`,
    )

    const brain = new HermesProvider({ apiUrl: 'http://invalid.local', home: tempHome })
    const executor = scriptedExecutor([
      [
        {
          chunk: {
            type: 'tool_call',
            call: makeToolCall('call-1', 'search_memory', { query: 'TypeScript' }),
          },
        },
        { chunk: { type: 'finish', reason: 'tool' } },
      ],
      [
        { chunk: { type: 'text', delta: 'Done.' } },
        { chunk: { type: 'finish', reason: 'stop' } },
      ],
    ])

    const id = await seedTask('what do we know about TypeScript?')
    await service.runTask(id, { brain, executor, hermesHome: tempHome, model: 'test-model' })

    const detail = service.getTaskDetail(id)!
    expect(detail.task.status).toBe('succeeded')

    const roles = detail.messages.map(m => m.role)
    expect(roles).toEqual(['system', 'user', 'assistant', 'tool', 'assistant'])

    const toolMsg = detail.messages.find(m => m.role === 'tool')!
    expect(toolMsg.toolCallId).toBe('call-1')
    expect(toolMsg.content).toContain('TypeScript')

    const assistantWithCall = detail.messages.find(
      m => m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0,
    )!
    expect(assistantWithCall.toolCalls?.[0]?.name).toBe('search_memory')

    expect(detail.toolCalls).toHaveLength(1)
    expect(detail.toolCalls[0]!.toolName).toBe('search_memory')
    expect(detail.toolCalls[0]!.params).toEqual({ query: 'TypeScript' })

    const toolCallEvents = capturedEvents.filter(e => e.type === 'orchestrator.task.tool_call')
    expect(toolCallEvents).toHaveLength(1)
  })

  it('executes write_memory and persists a new memory file in HERMES_HOME', async () => {
    const brain = new HermesProvider({ apiUrl: 'http://invalid.local', home: tempHome })
    const executor = scriptedExecutor([
      [
        {
          chunk: {
            type: 'tool_call',
            call: makeToolCall('call-w', 'write_memory', {
              content: 'I prefer kebab-case for filenames.',
              tags: ['orchestrator-test'],
            }),
          },
        },
        { chunk: { type: 'finish', reason: 'tool' } },
      ],
      [
        { chunk: { type: 'text', delta: 'Saved.' } },
        { chunk: { type: 'finish', reason: 'stop' } },
      ],
    ])

    const id = await seedTask('remember my filename preference')
    await service.runTask(id, { brain, executor, hermesHome: tempHome, model: 'test-model' })

    const detail = service.getTaskDetail(id)!
    expect(detail.task.status).toBe('succeeded')

    const memoryFiles = (await readdir(path.join(tempHome, 'memories')))
      .filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
    expect(memoryFiles.length).toBeGreaterThanOrEqual(1)

    expect(detail.toolCalls[0]!.toolName).toBe('write_memory')
  })

  it('cancellation mid-stream marks the task as cancelled', async () => {
    const brain = new HermesProvider({ apiUrl: 'http://invalid.local', home: tempHome })
    const executor = scriptedExecutor([
      { chunk: { type: 'text', delta: 'streaming...' } },
      { chunk: { type: 'text', delta: 'more' }, delayMs: 200 },
      { chunk: { type: 'finish', reason: 'stop' } },
    ])

    const id = await seedTask('long task')
    const runPromise = service.runTask(id, {
      brain,
      executor,
      hermesHome: tempHome,
      model: 'test-model',
    })

    await new Promise(resolve => setTimeout(resolve, 50))
    service.cancelTask(id)
    await runPromise

    const db = getDb()
    const row = db.select().from(agentTasks).where(eq(agentTasks.id, id)).get()
    expect(row?.status).toBe('cancelled')

    const cancelEvents = capturedEvents.filter(e => e.type === 'orchestrator.task.cancelled')
    expect(cancelEvents.length).toBeGreaterThanOrEqual(1)

    const convoRows = db.select().from(conversations).where(eq(conversations.taskId, id)).all()
    expect(convoRows).toHaveLength(1)
    const msgRows = db.select().from(messages).where(eq(messages.conversationId, convoRows[0]!.id)).all()
    expect(msgRows.some(m => m.role === 'user')).toBe(true)
    expect(msgRows.some(m => m.role === 'system')).toBe(true)

    // No tool executions should have been recorded.
    const logs = db.select().from(executionLogs).where(eq(executionLogs.issueId, id)).all()
    expect(logs).toHaveLength(0)
  })
})
