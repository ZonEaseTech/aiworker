import type {
  ChatRunInput,
  ChatStreamChunk,
  ExecutorProvider,
  ExecutorTool,
  ServiceStatus,
  ToolCall,
} from '@aiworker/shared'
import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { closeDb, getDb, initDb } from '../../db'
import { agentTasks } from '../../db/schema'
import { HermesProvider } from '../../providers/brain/hermes'
import { eventBus } from '../events'
import * as service from './service'
import { runMigrationsForTesting } from './test-utils'

/**
 * End-to-end orchestrator demo mirroring the PLAN-002 acceptance scenario:
 * user asks the agent to remember a preference, the executor responds with a
 * write_memory tool call, the orchestrator persists a memory file under
 * HERMES_HOME/memories, and the task transitions to succeeded with a full
 * transcript and SSE event trail.
 *
 * The executor is scripted (no OpenAI credentials required) so the test is
 * reproducible in CI. Run with:
 *   bun test apps/api/src/modules/orchestrator/e2e.test.ts
 */

interface ScriptedChunk {
  chunk: ChatStreamChunk
}

function scriptedExecutor(scripts: ScriptedChunk[][]): ExecutorProvider {
  let callIndex = 0
  return {
    name: 'scripted-e2e',
    async health(): Promise<ServiceStatus> {
      return { name: 'scripted-e2e', status: 'healthy', lastChecked: new Date().toISOString() }
    },
    async listTools(): Promise<ExecutorTool[]> {
      return []
    },
    runChat(input: ChatRunInput) {
      const script = scripts[callIndex] ?? scripts[scripts.length - 1] ?? []
      callIndex++
      return (async function* () {
        for (const step of script) {
          if (input.signal?.aborted)
            return
          yield step.chunk
        }
      })()
    },
  }
}

function toolCall(id: string, name: string, args: Record<string, unknown>): ToolCall {
  return { id, name, arguments: args }
}

function seedQueuedTask(prompt: string): string {
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
  tempHome = await mkdtemp(path.join(tmpdir(), 'aiworker-e2e-'))
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

describe('orchestrator e2e — remember preference via write_memory', () => {
  it('persists a memory file, transcript, and lifecycle events for the scenario prompt', async () => {
    const brain = new HermesProvider({ apiUrl: 'http://invalid.local', home: tempHome })
    const executor = scriptedExecutor([
      [
        {
          chunk: {
            type: 'tool_call',
            call: toolCall('call-write', 'write_memory', {
              content: 'User prefers TypeScript strict mode.',
              tags: ['preference', 'typescript'],
            }),
          },
        },
        { chunk: { type: 'finish', reason: 'tool' } },
      ],
      [
        { chunk: { type: 'text', delta: 'Saved your TypeScript strict mode preference.' } },
        { chunk: { type: 'finish', reason: 'stop' } },
      ],
    ])

    const taskId = seedQueuedTask('Remember that I prefer TypeScript strict mode')

    await service.runTask(taskId, {
      brain,
      executor,
      hermesHome: tempHome,
      model: 'scripted-model',
    })

    const detail = service.getTaskDetail(taskId)!
    expect(detail.task.status).toBe('succeeded')
    expect(detail.task.conversationId).toBeString()
    expect(detail.task.finishedAt).toBeString()

    const roles = detail.messages.map(m => m.role)
    expect(roles).toEqual(['system', 'user', 'assistant', 'tool', 'assistant'])

    const writeCall = detail.toolCalls.find(c => c.toolName === 'write_memory')
    expect(writeCall).toBeDefined()
    expect(writeCall!.params).toEqual({
      content: 'User prefers TypeScript strict mode.',
      tags: ['preference', 'typescript'],
    })

    const memoryDir = path.join(tempHome, 'memories')
    const memoryFiles = (await readdir(memoryDir)).filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
    expect(memoryFiles.length).toBeGreaterThanOrEqual(1)

    const bodies = await Promise.all(
      memoryFiles.map(f => readFile(path.join(memoryDir, f), 'utf8')),
    )
    expect(bodies.some(b => b.includes('User prefers TypeScript strict mode.'))).toBe(true)

    const eventTypes = capturedEvents.map(e => e.type)
    expect(eventTypes).toContain('orchestrator.task.started')
    expect(eventTypes).toContain('orchestrator.task.tool_call')
    expect(eventTypes).toContain('orchestrator.task.finished')
  })
})
