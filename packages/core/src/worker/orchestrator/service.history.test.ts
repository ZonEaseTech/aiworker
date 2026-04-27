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

import { closeWorkerDb, conversations, getWorkerDb, initWorkerDb, messages, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
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

async function seedConversation(id: string, channel = 'web', chatId = 'chat-history') {
  const db = getWorkerDb()
  const now = new Date().toISOString()
  await db.insert(conversations).values({
    id,
    channel: channel as 'web',
    chatId,
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
})
