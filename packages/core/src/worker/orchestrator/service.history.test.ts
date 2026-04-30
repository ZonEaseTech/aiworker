import type {
  AgentRunInput,
  BrainProvider,
  BrainSkill,
  ChatMessage,
  Envelope,
  ExecutorProvider,
  WorkerConfig,
  WriteMemoryInput,
} from '@zonease/aiworker-shared'
import type { WorkspaceManager } from '../executor/workspace'

import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { closeWorkerDb, conversations, getSessionEntry, getWorkerDb, initWorkerDb, messages, runWorkerMigrations, upsertSessionEntry } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { resolveSessionKey } from '../conversation/router'
import { WorkerEventBus } from '../events/bus'
import { WorkspaceManager as RealWorkspaceManager } from '../executor/workspace'
import { ApprovalStore } from './approvals'
import { estimateChatMessagesTokens } from './context'
import { ProcessManager } from './process-manager'
import { Orchestrator } from './service'

/**
 * REFACTOR-006 P2 — orchestrator.run() 历史消息窗口。长会话不能把全部
 * messages 一次性灌进 LLM；上限来自 worker config，缺省 20。
 */

function stubBrain(): BrainProvider {
  return {
    name: 'stub',
    health: async () => ({ name: 'stub', status: 'healthy', lastChecked: 'x' }),
    listSkills: async () => [],
    listMemories: async () => [],
    searchMemories: async () => [],
    writeMemory: async () => { throw new Error('unused') },
  }
}

function skillsBrain(skills: BrainSkill[]): BrainProvider {
  return {
    ...stubBrain(),
    listSkills: async () => skills,
  }
}

interface RecordingBrain extends BrainProvider {
  writes: WriteMemoryInput[]
}

function recordingBrain(options: { failWrites?: boolean } = {}): RecordingBrain {
  const writes: WriteMemoryInput[] = []
  return {
    name: 'recording',
    writes,
    health: async () => ({ name: 'recording', status: 'healthy', lastChecked: 'x' }),
    listSkills: async () => [],
    listMemories: async () => [],
    searchMemories: async () => [],
    writeMemory: async (input) => {
      if (options.failWrites)
        throw new Error('memory write failed')
      writes.push(input)
      return {
        id: `memory-${writes.length}`,
        content: input.content,
        metadata: input.metadata ?? {},
        createdAt: '2026-04-28T12:00:00.000Z',
        updatedAt: '2026-04-28T12:00:00.000Z',
      }
    },
  }
}

interface CapturingExecutor extends ExecutorProvider {
  captured: ChatMessage[][]
  inputs: AgentRunInput[]
}

type ExecutorStep = string | { error: string } | { binding: Record<string, unknown> | null, engine?: string, error?: string, text?: string }

function capturingExecutor(outputs: string[] = ['ok']): CapturingExecutor {
  return scriptedExecutor(outputs)
}

function scriptedExecutor(outputs: ExecutorStep[] = ['ok']): CapturingExecutor {
  const captured: ChatMessage[][] = []
  const inputs: AgentRunInput[] = []
  let nextOutput = 0
  const exec: CapturingExecutor = {
    name: 'capture',
    captured,
    inputs,
    health: async () => ({ name: 'capture', status: 'healthy', lastChecked: 'x' }),
    listTools: async () => [],
    run: (input: AgentRunInput) => {
      inputs.push(input)
      captured.push(input.messages.map(m => ({ role: m.role, content: m.content })))
      const output = outputs[nextOutput] ?? outputs[outputs.length - 1] ?? 'ok'
      nextOutput += 1
      return (async function* () {
        if (typeof output === 'string') {
          yield { type: 'assistant_message_delta' as const, delta: output }
        }
        else if ('binding' in output) {
          yield {
            type: 'engine_binding' as const,
            engine: output.engine ?? 'http',
            binding: output.binding,
          }
          if (output.text !== undefined) {
            yield { type: 'assistant_message_delta' as const, delta: output.text }
          }
          if (output.error !== undefined) {
            yield { type: 'error' as const, error: output.error }
          }
        }
        else {
          yield { type: 'error' as const, error: output.error }
        }
      })()
    },
  }
  return exec
}

function silentBus(): WorkerEventBus {
  return {
    emit: () => undefined,
    on: () => () => undefined,
  } as unknown as WorkerEventBus
}

class RecordingBus extends WorkerEventBus {
  readonly events: Array<{ type: string, payload: Record<string, unknown> }> = []

  override emit(type: string, payload: Record<string, unknown>): void {
    this.events.push({ type, payload })
    super.emit(type, payload)
  }
}

function recordingBus(): RecordingBus {
  return new RecordingBus()
}

function buildConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    brains: [],
    brainWriteTarget: '',
    brainRetrieval: 'first-match',
    executor: { engine: 'http', variant: 'openai-compatible' },
    channels: [],
    evolution: { enabled: false, observationRetentionDays: 7 },
    ...overrides,
  }
}

async function seedConversation(id: string, channel = 'web', chatId = 'chat-history', threadId?: string, summary?: string) {
  const db = getWorkerDb()
  const now = new Date().toISOString()
  await db.insert(conversations).values({
    id,
    channel: channel as 'web',
    chatId,
    ...(threadId === undefined ? {} : { threadId }),
    ...(summary === undefined ? {} : { summary }),
    status: 'open',
    startedAt: now,
    lastActiveAt: now,
  }).run()
}

async function seedMessages(conversationId: string, count: number) {
  const db = getWorkerDb()
  // 用 i 排序，stamps 不同保证 id 单调；orderBy desc(messages.id) 取最大的一批
  for (let i = 0; i < count; i++) {
    await db.insert(messages).values({
      conversationId,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${i}`,
      createdAt: new Date(Date.now() - (count - i) * 1000).toISOString(),
    }).run()
  }
}

function parseAuditMetadata(row: { richMetadata: string | null }): Record<string, unknown> | null {
  if (row.richMetadata === null)
    return null
  return JSON.parse(row.richMetadata) as Record<string, unknown>
}

describe('Orchestrator.run() — history window (REFACTOR-006 P2)', () => {
  let tmpRoot: string
  let workspaces: WorkspaceManager
  let processes: ProcessManager

  beforeEach(() => {
    closeWorkerDb()
    tmpRoot = mkdtempSync(path.join(tmpdir(), 'aiworker-history-'))
    initWorkerDb(path.join(tmpRoot, 'worker.db'))
    runWorkerMigrations()
    workspaces = new RealWorkspaceManager({ root: tmpRoot })
    processes = new ProcessManager({
      maxConcurrentTotal: 4,
      perEngineLimits: {},
      stallTimeoutMs: 60_000,
      killTimeoutMs: 5_000,
      autoCleanupDelayMs: 60_000,
      gcIntervalMs: 0,
    })
  })

  afterEach(async () => {
    closeWorkerDb()
    processes.dispose()
    await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  function envelope(text = 'incoming new turn'): Envelope {
    return {
      workerId: 'w_history_test',
      channel: 'web',
      accountId: 'sys:task',
      chatId: 'chat-history',
      text,
      receivedAt: new Date().toISOString(),
      raw: {},
    }
  }

  async function runIngestAndCapture(opts: {
    config: WorkerConfig
    seedCount: number
    summary?: string
  }): Promise<{ executor: CapturingExecutor }> {
    // 注意：我们要让 ingest 命中"已存在 conversation"分支，避免触发分类器；
    // 直接预 seed 一个 open conversation + 大量历史消息。
    await seedConversation('conv-history', 'web', 'chat-history', undefined, opts.summary)
    await seedMessages('conv-history', opts.seedCount)

    const executor = capturingExecutor()
    const orch = new Orchestrator({
      config: opts.config,
      brain: stubBrain(),
      executor,
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })
    await orch.ingest(envelope())
    return { executor }
  }

  it('caps history at default 20 messages when config.orchestrator is omitted', async () => {
    // seed 50 历史 + ingest 再写一条 user message → 总共 51；run() 取最新 20
    const { executor } = await runIngestAndCapture({
      config: buildConfig(),
      seedCount: 50,
    })

    // 第一次 capture 来自分类器（resolveConversation 走 classifyContinuation
    // 而我们的 capturingExecutor 不返回 JSON，分类器走 fallback 视作 continue
    // → 进 run()，第二次 capture 才是 run()。
    expect(executor.captured.length).toBeGreaterThanOrEqual(2)
    const runMessages = executor.captured[executor.captured.length - 1]!
    // run() 拼了 1 条 system + 最近 20 条 history
    expect(runMessages.length).toBe(21)
    expect(runMessages[0]!.role).toBe('system')
    // 历史窗口是按 id 倒序取最新 20 后再正序，所以应包含刚 ingest 写入的
    // user message 'incoming new turn' + 之前若干条
    const last = runMessages[runMessages.length - 1]!
    expect(last.role).toBe('user')
    expect(last.content).toBe('incoming new turn')
  })

  it('respects custom orchestrator.maxHistoryMessages', async () => {
    const { executor } = await runIngestAndCapture({
      config: buildConfig({ orchestrator: { maxHistoryMessages: 5 } }),
      seedCount: 50,
    })

    const runMessages = executor.captured[executor.captured.length - 1]!
    // 1 system + 最近 5 history
    expect(runMessages.length).toBe(6)
    expect(runMessages[0]!.role).toBe('system')
    expect(runMessages[runMessages.length - 1]!.content).toBe('incoming new turn')
  })

  it('does not truncate when total messages are below the cap', async () => {
    const { executor } = await runIngestAndCapture({
      config: buildConfig({ orchestrator: { maxHistoryMessages: 20 } }),
      seedCount: 3,
    })

    const runMessages = executor.captured[executor.captured.length - 1]!
    // 1 system + 3 seeded + 1 ingested user = 5
    expect(runMessages.length).toBe(5)
  })

  it('caps very long histories by token budget when token budgeting is enabled', async () => {
    const { executor } = await runIngestAndCapture({
      config: buildConfig({
        orchestrator: {
          contextWindowTokens: 120,
          reserveTokens: 40,
          keepRecentTokens: 40,
          maxHistoryMessages: 200,
        },
      }),
      seedCount: 50,
    })

    const runMessages = executor.captured[executor.captured.length - 1]!
    const history = runMessages.slice(1)
    expect(history.length).toBeLessThan(20)
    expect(history.length).toBeGreaterThan(1)
    expect(history[history.length - 1]!.content).toBe('incoming new turn')
    expect(history.some(message => message.content === 'msg-0')).toBe(false)
  })

  it('prefers recent messages and keeps selected history chronological', async () => {
    const { executor } = await runIngestAndCapture({
      config: buildConfig({
        orchestrator: {
          contextWindowTokens: 120,
          reserveTokens: 40,
          keepRecentTokens: 40,
        },
      }),
      seedCount: 50,
    })

    const runMessages = executor.captured[executor.captured.length - 1]!
    const history = runMessages.slice(1)
    const numbered = history
      .map(message => /^msg-(\d+)$/.exec(message.content)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number)
    expect(numbered.length).toBeGreaterThan(0)
    expect(numbered).toEqual([...numbered].sort((a, b) => a - b))
    expect(history[history.length - 1]!.content).toBe('incoming new turn')
  })

  it('keeps bootstrap and summary in the system prompt when history budget is tight', async () => {
    const { executor } = await runIngestAndCapture({
      config: buildConfig({
        orchestrator: {
          contextWindowTokens: 90,
          reserveTokens: 20,
          keepRecentTokens: 40,
        },
      }),
      seedCount: 20,
      summary: 'prior-summary '.repeat(80),
    })

    const runMessages = executor.captured[executor.captured.length - 1]!
    expect(runMessages[0]!.role).toBe('system')
    expect(runMessages[0]!.content).toContain('Conversation summary so far:')
    expect(runMessages[0]!.content).toContain('prior-summary')
    expect(runMessages.slice(1).some(message => message.content.startsWith('msg-'))).toBe(false)
    expect(runMessages[runMessages.length - 1]!.content).toBe('incoming new turn')
  })

  it('injects project-scope persona and memory docs into the system prompt', async () => {
    const projectRoot = path.join(tmpRoot, 'project')
    const aiworkerRoot = path.join(projectRoot, '.aiworker')
    const originalCwd = process.cwd()
    const originalHome = process.env.AIWORKER_HOME
    try {
      await fs.mkdir(aiworkerRoot, { recursive: true })
      await fs.writeFile(path.join(aiworkerRoot, 'AGENT.md'), '# Agent\n\nFollow project agent rules.\n')
      await fs.writeFile(path.join(aiworkerRoot, 'SOUL.md'), '# Soul\n\nUse project voice.\n')
      await fs.writeFile(path.join(aiworkerRoot, 'USER.md'), '# User\n\nPrimary user prefers concise answers.\n')
      await fs.writeFile(path.join(aiworkerRoot, 'MEMORY.md'), '# Memory\n\nRemember project decisions.\n')
      await fs.writeFile(path.join(aiworkerRoot, 'ROLLUP.md'), '# Rollup\n\nRecent project continuity.\n')
      delete process.env.AIWORKER_HOME
      process.chdir(projectRoot)

      const { executor } = await runIngestAndCapture({
        config: buildConfig({ orchestrator: { maxHistoryMessages: 5 } }),
        seedCount: 1,
      })

      const systemPrompt = executor.captured[executor.captured.length - 1]![0]!.content
      expect(systemPrompt).toContain('Project agent instructions:')
      expect(systemPrompt).toContain('Follow project agent rules.')
      expect(systemPrompt).toContain('Project soul / voice:')
      expect(systemPrompt).toContain('Use project voice.')
      expect(systemPrompt).toContain('Project user profile:')
      expect(systemPrompt).toContain('Primary user prefers concise answers.')
      expect(systemPrompt).toContain('Project memory index:')
      expect(systemPrompt).toContain('Remember project decisions.')
      expect(systemPrompt).toContain('Project continuity rollup:')
      expect(systemPrompt).toContain('Recent project continuity.')
    }
    finally {
      process.chdir(originalCwd)
      if (originalHome === undefined)
        delete process.env.AIWORKER_HOME
      else
        process.env.AIWORKER_HOME = originalHome
    }
  })

  it('emits observe-only decision events without changing the delivered run', async () => {
    const bus = recordingBus()
    const executor = capturingExecutor(['decision response'])
    const orch = new Orchestrator({
      config: buildConfig(),
      brain: skillsBrain([
        { id: 'skill-1', name: 'research', description: 'Research helper', version: '1.0.0' },
      ]),
      executor,
      bus,
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    await orch.ingest(envelope('decision turn'))

    expect(executor.captured).toHaveLength(1)
    const eventTypes = bus.events.map(event => event.type)
    expect(eventTypes.indexOf('orchestrator.intent_decision')).toBeGreaterThan(eventTypes.indexOf('conversation.message'))
    expect(eventTypes.indexOf('orchestrator.capability_decision')).toBeGreaterThan(eventTypes.indexOf('orchestrator.intent_decision'))
    expect(eventTypes.indexOf('orchestrator.quality_gate')).toBeLessThan(eventTypes.indexOf('orchestrator.finished'))

    const intent = bus.events.find(event => event.type === 'orchestrator.intent_decision')!.payload
    expect(intent.mode).toBe('observe_only')
    expect(intent.intent).toBe('answer')
    expect(intent.sessionAction).toBe('new_topic')
    expect(intent.source).toBe('intent-heuristic')

    const capability = bus.events.find(event => event.type === 'orchestrator.capability_decision')!.payload
    expect(capability.mode).toBe('observe_only')
    expect(capability.availableSkillCount).toBe(1)
    expect(capability.selectedSkills).toEqual([
      { id: 'skill-1', name: 'research', description: 'Research helper', version: '1.0.0' },
    ])

    const gate = bus.events.find(event => event.type === 'orchestrator.quality_gate')!.payload
    expect(gate.mode).toBe('observe_only')
    expect(gate.gateMode).toBe('observe')
    expect(gate.status).toBe('passed')
    expect(gate.action).toBe('pass')
    expect(gate.finalAnswerLength).toBe('decision response'.length)
  })

  it('repairs a low-scoring answer once when quality gate retry mode is enabled', async () => {
    const bus = recordingBus()
    const executor = capturingExecutor(['ok', 'repaired response with enough detail'])
    const orch = new Orchestrator({
      config: buildConfig({
        orchestrator: {
          decisionPipeline: {
            qualityGate: { mode: 'retry', threshold: 7 },
          },
        },
      }),
      brain: stubBrain(),
      executor,
      bus,
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    await orch.ingest(envelope('repair this answer'))

    expect(executor.captured).toHaveLength(2)
    const repair = bus.events.find(event => event.type === 'orchestrator.repair_attempted')
    expect(repair?.payload.status).toBe('succeeded')
    const db = getWorkerDb()
    const assistantRows = db.select().from(messages).where(eq(messages.role, 'assistant')).all()
    expect(assistantRows.at(-1)?.content).toBe('repaired response with enough detail')
  })

  it('updates session_entries.contextTokens from the assembled context', async () => {
    const { executor } = await runIngestAndCapture({
      config: buildConfig({
        orchestrator: {
          contextWindowTokens: 120,
          reserveTokens: 40,
          keepRecentTokens: 40,
        },
      }),
      seedCount: 20,
    })

    const runMessages = executor.captured[executor.captured.length - 1]!
    const entry = getSessionEntry(resolveSessionKey(envelope()))
    expect(entry?.contextTokens).toBe(estimateChatMessagesTokens(runMessages))
  })

  it('compacts long conversations into a persisted summary and keeps raw messages for audit', async () => {
    await seedConversation('conv-history', 'web', 'chat-history')
    await seedMessages('conv-history', 30)

    const executor = capturingExecutor([
      '{"continue":true,"reason":"same topic"}',
      'durable compacted summary',
      'first final',
      '{"continue":true,"reason":"same topic"}',
      'second final',
    ])
    const orch = new Orchestrator({
      config: buildConfig({
        orchestrator: {
          contextWindowTokens: 160,
          reserveTokens: 40,
          keepRecentTokens: 35,
          maxHistoryMessages: 200,
          compaction: {
            enabled: true,
            triggerTokens: 130,
          },
        },
      }),
      brain: stubBrain(),
      executor,
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    await orch.ingest(envelope('incoming after long history'))
    await orch.ingest(envelope('next turn after compaction'))

    const db = getWorkerDb()
    const conversation = db.select().from(conversations).where(eq(conversations.id, 'conv-history')).get()
    expect(conversation?.summary).toBe('durable compacted summary')

    const auditRows = db.select().from(messages).where(eq(messages.conversationId, 'conv-history')).all()
    const compactionRows = auditRows.filter(row => parseAuditMetadata(row)?.kind === 'compaction')
    expect(compactionRows).toHaveLength(1)
    const metadata = parseAuditMetadata(compactionRows[0]!)!
    expect(typeof metadata.compactedThroughMessageId).toBe('number')
    expect(auditRows.some(row => row.content === 'msg-0')).toBe(true)

    const latestRunMessages = executor.captured[executor.captured.length - 1]!
    expect(latestRunMessages[0]!.content).toContain('Conversation summary so far:')
    expect(latestRunMessages[0]!.content).toContain('durable compacted summary')
    expect(latestRunMessages.slice(1).some(message => message.content === 'msg-0')).toBe(false)
    expect(latestRunMessages.slice(1).filter(message => message.content === 'durable compacted summary')).toHaveLength(0)
    expect(latestRunMessages[latestRunMessages.length - 1]!.content).toBe('next turn after compaction')

    const entry = getSessionEntry(resolveSessionKey(envelope()))
    expect(entry?.compactionCount).toBe(1)
    expect(entry?.contextTokens).toBe(estimateChatMessagesTokens(latestRunMessages))
  })

  it('runs a suppressed pre-compaction memory flush before writing the compaction checkpoint', async () => {
    await seedConversation('conv-history', 'web', 'chat-history')
    await seedMessages('conv-history', 30)

    const brain = recordingBrain()
    const bus = recordingBus()
    const executor = capturingExecutor([
      '{"continue":true,"reason":"same topic"}',
      'remember this durable preference',
      'summary after memory flush',
      'visible final answer',
    ])
    const orch = new Orchestrator({
      config: buildConfig({
        orchestrator: {
          contextWindowTokens: 160,
          reserveTokens: 40,
          keepRecentTokens: 35,
          maxHistoryMessages: 200,
          compaction: {
            enabled: true,
            triggerTokens: 130,
            memoryFlush: { enabled: true },
          },
        },
      }),
      brain,
      executor,
      bus,
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    await orch.ingest(envelope('incoming with flush'))

    expect(brain.writes.map(write => write.content)).toEqual(['remember this durable preference'])
    const textEvents = bus.events.filter(event => event.type === 'orchestrator.text').map(event => (event.payload as { delta: string }).delta)
    expect(textEvents).toEqual(['visible final answer'])

    const rows = getWorkerDb().select().from(messages).where(eq(messages.conversationId, 'conv-history')).all()
    const memoryFlushRow = rows.find(row => parseAuditMetadata(row)?.kind === 'memory-flush')
    const compactionRow = rows.find(row => parseAuditMetadata(row)?.kind === 'compaction')
    expect(memoryFlushRow).toBeDefined()
    expect(compactionRow).toBeDefined()
    expect(memoryFlushRow!.id).toBeLessThan(compactionRow!.id)
    expect(parseAuditMetadata(memoryFlushRow!)?.status).toBe('succeeded')
    expect((parseAuditMetadata(compactionRow!)?.memoryFlush as { status?: string }).status).toBe('succeeded')

    const entry = getSessionEntry(resolveSessionKey(envelope()))
    expect(entry?.compactionCount).toBe(1)
    expect(entry?.memoryFlushAt).not.toBeNull()
    expect(entry?.memoryFlushCompactionCount).toBe(1)
  })

  it('keeps compaction safe when pre-compaction memory flush persistence fails', async () => {
    await seedConversation('conv-history', 'web', 'chat-history')
    await seedMessages('conv-history', 30)

    const executor = capturingExecutor([
      '{"continue":true,"reason":"same topic"}',
      'memory that cannot be persisted',
      'summary despite flush failure',
      'final after failure',
    ])
    const orch = new Orchestrator({
      config: buildConfig({
        orchestrator: {
          contextWindowTokens: 160,
          reserveTokens: 40,
          keepRecentTokens: 35,
          maxHistoryMessages: 200,
          compaction: {
            enabled: true,
            triggerTokens: 130,
            memoryFlush: { enabled: true },
          },
        },
      }),
      brain: recordingBrain({ failWrites: true }),
      executor,
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    await orch.ingest(envelope('incoming with failing flush'))

    const db = getWorkerDb()
    const conversation = db.select().from(conversations).where(eq(conversations.id, 'conv-history')).get()
    expect(conversation?.summary).toBe('summary despite flush failure')

    const rows = db.select().from(messages).where(eq(messages.conversationId, 'conv-history')).all()
    const memoryFlushRow = rows.find(row => parseAuditMetadata(row)?.kind === 'memory-flush')
    const compactionRow = rows.find(row => parseAuditMetadata(row)?.kind === 'compaction')
    expect(parseAuditMetadata(memoryFlushRow!)?.status).toBe('failed')
    expect((parseAuditMetadata(compactionRow!)?.memoryFlush as { status?: string }).status).toBe('failed')
    expect(rows.some(row => row.content === 'msg-0')).toBe(true)

    const entry = getSessionEntry(resolveSessionKey(envelope()))
    expect(entry?.compactionCount).toBe(1)
    expect(entry?.memoryFlushAt).not.toBeNull()
    expect(entry?.memoryFlushCompactionCount).toBe(1)
  })

  it('compacts and retries once after an executor context-overflow error', async () => {
    await seedConversation('conv-history', 'web', 'chat-history')
    await seedMessages('conv-history', 30)

    const bus = recordingBus()
    const executor = scriptedExecutor([
      '{"continue":true,"reason":"same topic"}',
      { error: 'context length exceeded' },
      'summary after overflow',
      'retried final answer',
    ])
    const orch = new Orchestrator({
      config: buildConfig({
        orchestrator: {
          contextWindowTokens: 20_000,
          reserveTokens: 1_000,
          keepRecentTokens: 35,
          maxHistoryMessages: 200,
          compaction: {
            enabled: true,
            triggerTokens: 10_000,
          },
        },
      }),
      brain: stubBrain(),
      executor,
      bus,
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    await orch.ingest(envelope('incoming before overflow'))

    const db = getWorkerDb()
    const conversation = db.select().from(conversations).where(eq(conversations.id, 'conv-history')).get()
    expect(conversation?.summary).toBe('summary after overflow')
    const assistantRows = db.select().from(messages).where(eq(messages.conversationId, 'conv-history')).all().filter(row => row.role === 'assistant')
    expect(assistantRows[assistantRows.length - 1]?.content).toBe('retried final answer')
    expect(bus.events.some(event => event.type === 'orchestrator.error')).toBe(false)
    expect(getSessionEntry(resolveSessionKey(envelope()))?.compactionCount).toBe(1)
  })

  it('routes through session_entries before legacy open conversation lookup', async () => {
    await seedConversation('conv-session')
    await seedConversation('conv-legacy')
    const db = getWorkerDb()
    db.update(conversations).set({ lastActiveAt: '2026-04-28T12:00:00.000Z' }).where(eq(conversations.id, 'conv-session')).run()
    db.update(conversations).set({ lastActiveAt: '2026-04-28T12:10:00.000Z' }).where(eq(conversations.id, 'conv-legacy')).run()

    const env = envelope('session-routed')
    upsertSessionEntry({
      sessionKey: resolveSessionKey(env),
      currentConversationId: 'conv-session',
      channel: env.channel,
      chatId: env.chatId,
      accountId: env.accountId,
    })

    const orch = new Orchestrator({
      config: buildConfig(),
      brain: stubBrain(),
      executor: capturingExecutor(),
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })
    await orch.ingest(env)

    const sessionMessages = db.select().from(messages).where(eq(messages.conversationId, 'conv-session')).all()
    const legacyMessages = db.select().from(messages).where(eq(messages.conversationId, 'conv-legacy')).all()
    expect(sessionMessages.some(row => row.content === 'session-routed')).toBe(true)
    expect(legacyMessages.some(row => row.content === 'session-routed')).toBe(false)
  })

  it('backfills session_entries from the legacy open conversation fallback', async () => {
    await seedConversation('conv-legacy-fallback')
    const env = envelope('legacy fallback')
    const sessionKey = resolveSessionKey(env)
    expect(getSessionEntry(sessionKey)).toBeNull()

    const orch = new Orchestrator({
      config: buildConfig(),
      brain: stubBrain(),
      executor: capturingExecutor(),
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })
    await orch.ingest(env)

    expect(getSessionEntry(sessionKey)?.currentConversationId).toBe('conv-legacy-fallback')
  })

  it('does not route root chat messages into threaded legacy conversations', async () => {
    await seedConversation('conv-thread', 'web', 'chat-history', 'thread-1')
    const env = envelope('root message')
    const sessionKey = resolveSessionKey(env)

    const orch = new Orchestrator({
      config: buildConfig(),
      brain: stubBrain(),
      executor: capturingExecutor(),
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })
    await orch.ingest(env)

    const entry = getSessionEntry(sessionKey)
    expect(entry?.currentConversationId).toBeDefined()
    expect(entry?.currentConversationId).not.toBe('conv-thread')
    const db = getWorkerDb()
    const threadMessages = db.select().from(messages).where(eq(messages.conversationId, 'conv-thread')).all()
    expect(threadMessages.some(row => row.content === 'root message')).toBe(false)
  })

  it('does not route root chat messages into threaded session entries', async () => {
    await seedConversation('conv-thread-session', 'web', 'chat-history', 'thread-1')
    const rootEnv = envelope('root message with threaded session present')
    const threadEnv = { ...rootEnv, threadId: 'thread-1' }
    const rootKey = resolveSessionKey(rootEnv)
    const threadKey = resolveSessionKey(threadEnv)

    upsertSessionEntry({
      sessionKey: threadKey,
      currentConversationId: 'conv-thread-session',
      channel: threadEnv.channel,
      chatId: threadEnv.chatId,
      threadId: threadEnv.threadId,
      accountId: threadEnv.accountId,
    })

    const orch = new Orchestrator({
      config: buildConfig(),
      brain: stubBrain(),
      executor: capturingExecutor(),
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })
    await orch.ingest(rootEnv)

    const rootEntry = getSessionEntry(rootKey)
    const threadEntry = getSessionEntry(threadKey)
    expect(rootEntry?.currentConversationId).toBeDefined()
    expect(rootEntry?.currentConversationId).not.toBe('conv-thread-session')
    expect(threadEntry?.currentConversationId).toBe('conv-thread-session')

    const db = getWorkerDb()
    const threadMessages = db.select().from(messages).where(eq(messages.conversationId, 'conv-thread-session')).all()
    expect(threadMessages.some(row => row.content === 'root message with threaded session present')).toBe(false)
  })

  it('creates a session entry on first ingest and keeps its active conversation on the second turn', async () => {
    const orch = new Orchestrator({
      config: buildConfig(),
      brain: stubBrain(),
      executor: capturingExecutor(),
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })
    const first = envelope('first turn')
    const second = envelope('second turn')
    const sessionKey = resolveSessionKey(first)
    expect(getSessionEntry(sessionKey)).toBeNull()

    await orch.ingest(first)
    const firstEntry = getSessionEntry(sessionKey)
    expect(firstEntry?.currentConversationId).toBeDefined()

    await orch.ingest(second)
    const secondEntry = getSessionEntry(sessionKey)
    expect(secondEntry?.currentConversationId).toBe(firstEntry!.currentConversationId)

    const db = getWorkerDb()
    const rows = db.select().from(messages).where(eq(messages.conversationId, firstEntry!.currentConversationId)).all()
    expect(rows.some(row => row.content === 'first turn')).toBe(true)
    expect(rows.some(row => row.content === 'second turn')).toBe(true)
  })

  it('emits gatewayConversationId for gateway-origin chat events', async () => {
    const bus = recordingBus()
    const orch = new Orchestrator({
      config: buildConfig(),
      brain: stubBrain(),
      executor: capturingExecutor(),
      bus,
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    const acceptedId = 'gw:w_history_test:accepted'
    await orch.ingest({
      ...envelope('gateway turn'),
      accountId: 'sys:gateway',
      chatId: acceptedId,
      raw: { source: 'gateway' },
    })

    const mapped = bus.events.filter(event =>
      event.type === 'conversation.message'
      || event.type === 'orchestrator.intent_decision'
      || event.type === 'orchestrator.capability_decision'
      || event.type === 'orchestrator.text'
      || event.type === 'orchestrator.quality_gate'
      || event.type === 'orchestrator.finished',
    )
    expect(mapped).toHaveLength(6)
    expect(mapped.every(event => event.payload.gatewayConversationId === acceptedId)).toBe(true)
    expect(mapped.every(event => event.payload.conversationId !== acceptedId)).toBe(true)
  })

  it('does not trust user-controlled raw source fields as gateway-origin events', async () => {
    const bus = recordingBus()
    const orch = new Orchestrator({
      config: buildConfig(),
      brain: stubBrain(),
      executor: capturingExecutor(),
      bus,
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    await orch.ingest({
      ...envelope('spoofed gateway source'),
      chatId: 'gw:w_history_test:spoofed',
      raw: { source: 'gateway' },
    })

    const mapped = bus.events.filter(event =>
      event.type === 'conversation.message'
      || event.type === 'orchestrator.text'
      || event.type === 'orchestrator.finished',
    )
    expect(mapped).toHaveLength(3)
    expect(mapped.every(event => event.payload.gatewayConversationId === undefined)).toBe(true)
  })

  it('persists and reuses native engine bindings for supporting executors', async () => {
    const firstBinding = { protocol: 'current', threadId: 'thread-1' }
    const secondBinding = { protocol: 'current', threadId: 'thread-2' }
    const executor = scriptedExecutor([
      { engine: 'codex', binding: firstBinding, text: 'first response' },
      '{"continue":true,"reason":"same topic"}',
      { engine: 'codex', binding: secondBinding, text: 'second response' },
    ])
    const orch = new Orchestrator({
      config: buildConfig({ executor: { engine: 'codex', variant: 'default' } }),
      brain: stubBrain(),
      executor,
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    const sessionKey = resolveSessionKey(envelope())
    await orch.ingest(envelope('first turn with native binding'))
    expect(getSessionEntry(sessionKey)?.engineBindings).toEqual({ codex: firstBinding })

    await orch.ingest(envelope('second turn with native binding'))
    expect(executor.inputs[0]?.engineBinding).toBeUndefined()
    expect(executor.inputs[1]?.engineBinding).toBeUndefined()
    expect(executor.inputs[2]?.engineBinding).toEqual(firstBinding)
    expect(getSessionEntry(sessionKey)?.engineBindings).toEqual({ codex: secondBinding })
  })

  it('keeps native engine bindings isolated by account-scoped session key', async () => {
    const firstBinding = { protocol: 'current', threadId: 'account-one-thread' }
    const secondBinding = { protocol: 'current', threadId: 'account-two-thread' }
    const executor = scriptedExecutor([
      { engine: 'codex', binding: firstBinding, text: 'first response' },
      { engine: 'codex', binding: secondBinding, text: 'second response' },
    ])
    const orch = new Orchestrator({
      config: buildConfig({ executor: { engine: 'codex', variant: 'default' } }),
      brain: stubBrain(),
      executor,
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })
    const first = { ...envelope('from account one'), accountId: 'account-one' }
    const second = { ...envelope('from account two'), accountId: 'account-two' }

    await orch.ingest(first)
    await orch.ingest(second)

    expect(executor.inputs[0]?.engineBinding).toBeUndefined()
    expect(executor.inputs[1]?.engineBinding).toBeUndefined()
    expect(getSessionEntry(resolveSessionKey(first))?.engineBindings).toEqual({ codex: firstBinding })
    expect(getSessionEntry(resolveSessionKey(second))?.engineBindings).toEqual({ codex: secondBinding })
  })

  it('does not pass a previous native binding after gateway reset rotates the session', async () => {
    const firstBinding = { protocol: 'current', threadId: 'old-thread' }
    const freshBinding = { protocol: 'current', threadId: 'fresh-thread' }
    const executor = scriptedExecutor([
      { engine: 'codex', binding: firstBinding, text: 'first response' },
      { engine: 'codex', binding: freshBinding, text: 'fresh response' },
    ])
    const orch = new Orchestrator({
      config: buildConfig({ executor: { engine: 'codex', variant: 'default' } }),
      brain: stubBrain(),
      executor,
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    const sessionKey = resolveSessionKey(envelope())
    await orch.ingest(envelope('before reset'))
    expect(getSessionEntry(sessionKey)?.engineBindings).toEqual({ codex: firstBinding })

    await orch.ingest({
      ...envelope('after reset'),
      raw: { source: 'gateway', sessionReset: true, resetCommand: '/new' },
    })

    expect(executor.inputs[1]?.engineBinding).toBeUndefined()
    expect(getSessionEntry(sessionKey)?.engineBindings).toEqual({ codex: freshBinding })
    expect(getSessionEntry(sessionKey)?.resetReason).toBe('manual:/new')
  })

  it('retries once with DB-rendered context after a stale native binding is cleared', async () => {
    const staleBinding = { protocol: 'current', threadId: 'stale-thread' }
    const freshBinding = { protocol: 'current', threadId: 'fresh-thread' }
    const executor = scriptedExecutor([
      { engine: 'codex', binding: staleBinding, text: 'first response' },
      '{"continue":true,"reason":"same topic"}',
      { engine: 'codex', binding: null, error: 'native thread not found' },
      { engine: 'codex', binding: freshBinding, text: 'recovered response' },
    ])
    const orch = new Orchestrator({
      config: buildConfig({ executor: { engine: 'codex', variant: 'default' } }),
      brain: stubBrain(),
      executor,
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    const sessionKey = resolveSessionKey(envelope())
    await orch.ingest(envelope('first native turn'))
    await orch.ingest(envelope('second native turn'))

    expect(executor.inputs[2]?.engineBinding).toEqual(staleBinding)
    expect(executor.inputs[3]?.engineBinding).toBeUndefined()
    expect(getSessionEntry(sessionKey)?.engineBindings).toEqual({ codex: freshBinding })

    const conversationId = getSessionEntry(sessionKey)!.currentConversationId
    const rows = getWorkerDb().select().from(messages).where(eq(messages.conversationId, conversationId)).all()
    expect(rows.some(row => row.content === 'recovered response')).toBe(true)
  })

  it('keeps prompt fallback unchanged when an executor reports no native binding', async () => {
    const executor = capturingExecutor(['fallback response'])
    const orch = new Orchestrator({
      config: buildConfig({ orchestrator: { maxHistoryMessages: 5 } }),
      brain: stubBrain(),
      executor,
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })
    const env = envelope('fallback-only turn')

    await orch.ingest(env)

    const runMessages = executor.captured[0]!
    expect(runMessages[0]?.role).toBe('system')
    expect(runMessages[runMessages.length - 1]?.content).toBe('fallback-only turn')
    expect(getSessionEntry(resolveSessionKey(env))?.engineBindings).toEqual({})
  })

  it('isolates session entries by account when channel and chat id match', async () => {
    const orch = new Orchestrator({
      config: buildConfig(),
      brain: stubBrain(),
      executor: capturingExecutor(),
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })
    const first = { ...envelope('from account one'), accountId: 'account-one' }
    const second = { ...envelope('from account two'), accountId: 'account-two' }
    const firstKey = resolveSessionKey(first)
    const secondKey = resolveSessionKey(second)

    expect(firstKey).not.toBe(secondKey)

    await orch.ingest(first)
    await orch.ingest(second)

    const firstEntry = getSessionEntry(firstKey)
    const secondEntry = getSessionEntry(secondKey)
    expect(firstEntry?.currentConversationId).toBeDefined()
    expect(secondEntry?.currentConversationId).toBeDefined()
    expect(firstEntry?.currentConversationId).not.toBe(secondEntry?.currentConversationId)

    const db = getWorkerDb()
    const firstMessages = db.select().from(messages).where(eq(messages.conversationId, firstEntry!.currentConversationId)).all()
    const secondMessages = db.select().from(messages).where(eq(messages.conversationId, secondEntry!.currentConversationId)).all()
    expect(firstMessages.some(row => row.content === 'from account one')).toBe(true)
    expect(firstMessages.some(row => row.content === 'from account two')).toBe(false)
    expect(secondMessages.some(row => row.content === 'from account two')).toBe(true)
  })

  it('gateway reset closes the current conversation and starts fresh on the same chat id', async () => {
    const executor = capturingExecutor()
    const orch = new Orchestrator({
      config: buildConfig(),
      brain: stubBrain(),
      executor,
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    const sessionKey = resolveSessionKey(envelope())
    await orch.ingest(envelope('remember before reset'))
    const beforeReset = getSessionEntry(sessionKey)
    expect(beforeReset?.currentConversationId).toBeDefined()
    await orch.ingest({
      ...envelope('after reset'),
      raw: { source: 'gateway', sessionReset: true, resetCommand: '/reset' },
    })

    const db = getWorkerDb()
    const rows = db.select().from(conversations).where(eq(conversations.chatId, 'chat-history')).all()
    expect(rows.length).toBe(2)
    const closed = rows.find(row => row.status === 'closed')
    const open = rows.find(row => row.status === 'open')
    expect(closed).toBeDefined()
    expect(open).toBeDefined()
    expect(open!.id).not.toBe(closed!.id)

    const oldMessages = db.select().from(messages).where(eq(messages.conversationId, closed!.id)).all()
    const newMessages = db.select().from(messages).where(eq(messages.conversationId, open!.id)).all()
    expect(oldMessages.some(row => row.content === 'remember before reset')).toBe(true)
    expect(newMessages.some(row => row.content === 'after reset')).toBe(true)
    expect(newMessages.some(row => row.content === 'remember before reset')).toBe(false)
    const entry = getSessionEntry(sessionKey)
    expect(entry?.currentConversationId).toBe(open!.id)
    expect(entry?.currentConversationId).not.toBe(beforeReset!.currentConversationId)
    expect(entry?.resetReason).toBe('manual:/reset')
  })

  it('gateway /new rotates the active session entry and stamps the manual reason', async () => {
    const orch = new Orchestrator({
      config: buildConfig(),
      brain: stubBrain(),
      executor: capturingExecutor(),
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    const sessionKey = resolveSessionKey(envelope())
    await orch.ingest(envelope('conversation before new'))
    const beforeReset = getSessionEntry(sessionKey)
    expect(beforeReset?.currentConversationId).toBeDefined()

    await orch.ingest({
      ...envelope('fresh topic'),
      raw: { source: 'gateway', sessionReset: true, resetCommand: '/new' },
    })

    const entry = getSessionEntry(sessionKey)
    expect(entry?.currentConversationId).toBeDefined()
    expect(entry?.currentConversationId).not.toBe(beforeReset!.currentConversationId)
    expect(entry?.resetReason).toBe('manual:/new')

    const db = getWorkerDb()
    const oldMessages = db.select().from(messages).where(eq(messages.conversationId, beforeReset!.currentConversationId)).all()
    const newMessages = db.select().from(messages).where(eq(messages.conversationId, entry!.currentConversationId)).all()
    expect(oldMessages.some(row => row.content === 'conversation before new')).toBe(true)
    expect(newMessages.some(row => row.content === 'fresh topic')).toBe(true)
    expect(newMessages.some(row => row.content === 'conversation before new')).toBe(false)
  })

  it('classifier new-topic decisions rotate the active session entry', async () => {
    const executor = capturingExecutor([
      'first response',
      '{"continue":false,"reason":"new topic"}',
      'second response',
    ])
    const orch = new Orchestrator({
      config: buildConfig(),
      brain: stubBrain(),
      executor,
      bus: silentBus(),
      workerId: 'w_history_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    const sessionKey = resolveSessionKey(envelope())
    await orch.ingest(envelope('first subject'))
    const firstEntry = getSessionEntry(sessionKey)
    expect(firstEntry?.currentConversationId).toBeDefined()

    await orch.ingest(envelope('unrelated second subject'))

    const secondEntry = getSessionEntry(sessionKey)
    expect(secondEntry?.currentConversationId).toBeDefined()
    expect(secondEntry?.currentConversationId).not.toBe(firstEntry!.currentConversationId)
    expect(secondEntry?.resetReason).toBe('classifier:new-topic')

    const db = getWorkerDb()
    const oldConversation = db.select().from(conversations).where(eq(conversations.id, firstEntry!.currentConversationId)).get()
    const oldMessages = db.select().from(messages).where(eq(messages.conversationId, firstEntry!.currentConversationId)).all()
    const newMessages = db.select().from(messages).where(eq(messages.conversationId, secondEntry!.currentConversationId)).all()
    expect(oldConversation?.status).toBe('closed')
    expect(oldMessages.some(row => row.content === 'first subject')).toBe(true)
    expect(newMessages.some(row => row.content === 'unrelated second subject')).toBe(true)
    expect(newMessages.some(row => row.content === 'first subject')).toBe(false)
  })
})
