import type {
  AgentRunInput,
  BrainProvider,
  ChatMessage,
  Envelope,
  ExecutorProvider,
  WorkerConfig,
} from '@zonease/aiworker-shared'
import type { WorkerEventBus } from '../events/bus'
import type { WorkspaceManager } from '../executor/workspace'

import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { closeWorkerDb, conversations, getSessionEntry, getWorkerDb, initWorkerDb, messages, runWorkerMigrations, upsertSessionEntry } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { resolveSessionKey } from '../conversation/router'
import { WorkspaceManager as RealWorkspaceManager } from '../executor/workspace'
import { ApprovalStore } from './approvals'
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

interface CapturingExecutor extends ExecutorProvider {
  captured: ChatMessage[][]
}

function capturingExecutor(): CapturingExecutor {
  const captured: ChatMessage[][] = []
  const exec: CapturingExecutor = {
    name: 'capture',
    captured,
    health: async () => ({ name: 'capture', status: 'healthy', lastChecked: 'x' }),
    listTools: async () => [],
    run: (input: AgentRunInput) => {
      captured.push(input.messages.map(m => ({ role: m.role, content: m.content })))
      return (async function* () {
        yield { type: 'assistant_message_delta' as const, delta: 'ok' }
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

async function seedConversation(id: string, channel = 'web', chatId = 'chat-history', threadId?: string) {
  const db = getWorkerDb()
  const now = new Date().toISOString()
  await db.insert(conversations).values({
    id,
    channel: channel as 'web',
    chatId,
    ...(threadId === undefined ? {} : { threadId }),
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
  }): Promise<{ executor: CapturingExecutor }> {
    // 注意：我们要让 ingest 命中"已存在 conversation"分支，避免触发分类器；
    // 直接预 seed 一个 open conversation + 大量历史消息。
    await seedConversation('conv-history')
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
})
