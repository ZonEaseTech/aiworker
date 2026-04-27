import type {
  BrainProvider,
  ExecutorProvider,
  WorkerConfig,
} from '@zonease/aiworker-shared'
import type { WorkerEventBus } from '../events/bus'
import type { WorkspaceManager } from '../executor/workspace'

import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { closeWorkerDb, getWorkerDb, initWorkerDb, messages, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { WorkspaceManager as RealWorkspaceManager } from '../executor/workspace'
import { ApprovalStore } from './approvals'
import { ProcessManager } from './process-manager'
import { Orchestrator } from './service'

/**
 * PLAN-014 F2 — orchestrator policy gate 单测。覆盖 3 个核心 case：
 *   - auto：直接 allow，不发 approval.requested 事件，不写 messages
 *   - ask 超时：emit approval.requested + 等到超时按 deny 处理 + 短路写 messages
 *   - deny：立刻短路 + 合成 assistant message 写库 + 不发 ask 事件
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

function stubExecutor(): ExecutorProvider {
  // policy gate 测试不真正调 executor.run（auto 之后才进 executor）；这里返回
  // 结构合法的 stub 即可，避免 type/health 失败把 bus 弄脏。
  return {
    name: 'stub-exec',
    health: async () => ({ name: 'stub-exec', status: 'healthy', lastChecked: 'x' }),
    listTools: async () => [],
    run: () => ({ async* [Symbol.asyncIterator]() {} } as AsyncIterable<never>),
  }
}

function recordingBus(): WorkerEventBus & { recorded: Array<{ kind: string, payload: Record<string, unknown> }> } {
  const recorded: Array<{ kind: string, payload: Record<string, unknown> }> = []
  return {
    emit: (kind: string, payload: Record<string, unknown>) => {
      recorded.push({ kind, payload })
    },
    on: () => () => undefined,
    recorded,
  } as unknown as WorkerEventBus & { recorded: Array<{ kind: string, payload: Record<string, unknown> }> }
}

function configWith(toolPolicy?: WorkerConfig['toolPolicy']): WorkerConfig {
  return {
    brains: [],
    brainWriteTarget: '',
    brainRetrieval: 'first-match',
    executor: { engine: 'http', variant: 'openai-compatible' },
    channels: [],
    evolution: { enabled: false, observationRetentionDays: 7 },
    ...(toolPolicy === undefined ? {} : { toolPolicy }),
  }
}

function buildOrch(deps: {
  config: WorkerConfig
  bus: WorkerEventBus
  approvals: ApprovalStore
  workspaces: WorkspaceManager
  processes: ProcessManager
}): Orchestrator {
  return new Orchestrator({
    config: deps.config,
    brain: stubBrain(),
    executor: stubExecutor(),
    bus: deps.bus,
    workerId: 'w_test',
    workspaces: deps.workspaces,
    processes: deps.processes,
    approvals: deps.approvals,
  })
}

async function insertConversation(id: string): Promise<void> {
  const db = getWorkerDb()
  const now = new Date().toISOString()
  await db.insert((await import('@zonease/aiworker-storage-sqlite/worker')).conversations).values({
    id,
    channel: 'web',
    chatId: `chat-${id}`,
    status: 'open',
    startedAt: now,
    lastActiveAt: now,
  }).run()
}

describe('Orchestrator.runTool — toolPolicy gate', () => {
  let tmpRoot: string
  let workspaces: WorkspaceManager
  let processes: ProcessManager

  beforeEach(() => {
    closeWorkerDb()
    tmpRoot = mkdtempSync(path.join(tmpdir(), 'aiworker-policy-'))
    initWorkerDb(path.join(tmpRoot, 'worker.db'))
    runWorkerMigrations()
    workspaces = new RealWorkspaceManager({ root: tmpRoot })
    processes = new ProcessManager({
      maxConcurrentTotal: 1,
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

  it('auto policy returns allow without emitting approval.requested', async () => {
    const bus = recordingBus()
    const approvals = new ApprovalStore()
    const orch = buildOrch({
      config: configWith({ default: 'auto', rules: [] }),
      bus,
      approvals,
      workspaces,
      processes,
    })

    const res = await orch.runTool({
      taskId: 'task-1',
      toolCallId: 'call-1',
      toolName: 'Read',
      params: {},
    })

    expect(res.decision).toBe('allow')
    expect(res.policy).toBe('auto')
    expect(res.syntheticAssistantMessage).toBeUndefined()
    expect(bus.recorded.find(r => r.kind === 'approval.requested')).toBeUndefined()
    approvals.dispose()
  })

  it('ask policy emits approval.requested and timeouts to deny + persists synthetic assistant message', async () => {
    await insertConversation('conv-ask')

    const bus = recordingBus()
    const approvals = new ApprovalStore()
    const orch = buildOrch({
      config: configWith({ default: 'ask', rules: [] }),
      bus,
      approvals,
      workspaces,
      processes,
    })

    const start = Date.now()
    const res = await orch.runTool({
      taskId: 'task-2',
      toolCallId: 'call-2',
      toolName: 'Write',
      params: { path: '/etc/passwd' },
      conversationId: 'conv-ask',
      timeoutMs: 30,
    })

    // 实际超时应在 30ms 附近；放宽到 < 1s 容忍 CI jitter，但要远低于
    // DEFAULT 60s，证明确实走了我们传入的 timeoutMs。
    expect(Date.now() - start).toBeLessThan(1_000)
    expect(res.decision).toBe('deny')
    expect(res.policy).toBe('ask')
    expect(res.syntheticAssistantMessage).toBe('tool Write blocked by policy')

    const requested = bus.recorded.find(r => r.kind === 'approval.requested')
    expect(requested).toBeDefined()
    expect(requested!.payload.taskId).toBe('task-2')
    expect(requested!.payload.toolCallId).toBe('call-2')
    expect(requested!.payload.toolName).toBe('Write')
    expect(requested!.payload.params).toEqual({ path: '/etc/passwd' })
    expect(typeof requested!.payload.expiresAt).toBe('number')

    // 短路 message 落了 conv-ask 一行 assistant
    const db = getWorkerDb()
    const rows = db.select().from(messages).where(eq(messages.conversationId, 'conv-ask')).all()
    const assistantRows = rows.filter(r => r.role === 'assistant')
    expect(assistantRows).toHaveLength(1)
    expect(assistantRows[0]?.content).toBe('tool Write blocked by policy')

    approvals.dispose()
  })

  it('deny policy short-circuits without invoking executor or emitting approval.requested', async () => {
    await insertConversation('conv-deny')

    const bus = recordingBus()
    const approvals = new ApprovalStore()
    const orch = buildOrch({
      config: configWith({ default: 'auto', rules: [{ pattern: 'fs.*', action: 'deny' }] }),
      bus,
      approvals,
      workspaces,
      processes,
    })

    const res = await orch.runTool({
      taskId: 'task-3',
      toolCallId: 'call-3',
      toolName: 'fs.write',
      params: { path: '/secret' },
      conversationId: 'conv-deny',
    })

    expect(res.decision).toBe('deny')
    expect(res.policy).toBe('deny')
    expect(res.syntheticAssistantMessage).toBe('tool fs.write blocked by policy')

    expect(bus.recorded.find(r => r.kind === 'approval.requested')).toBeUndefined()
    const denied = bus.recorded.find(r => r.kind === 'approval.denied')
    expect(denied).toBeDefined()
    expect(denied!.payload.toolName).toBe('fs.write')

    const db = getWorkerDb()
    const rows = db.select().from(messages).where(eq(messages.conversationId, 'conv-deny')).all()
    expect(rows.filter(r => r.role === 'assistant')).toHaveLength(1)
    expect(rows[0]?.content).toBe('tool fs.write blocked by policy')

    approvals.dispose()
  })

  it('ask policy resolves immediately when operator grants allow', async () => {
    const bus = recordingBus()
    const approvals = new ApprovalStore()
    const orch = buildOrch({
      config: configWith({ default: 'ask', rules: [] }),
      bus,
      approvals,
      workspaces,
      processes,
    })

    // 启动 wait，再异步 grant —— 模拟 operator 通过 gateway 解锁。
    const promise = orch.runTool({
      taskId: 'task-4',
      toolCallId: 'call-4',
      toolName: 'Read',
      params: {},
      timeoutMs: 5_000,
    })
    // 让 wait 注册到 store。
    await new Promise<void>(r => setTimeout(r, 5))
    expect(approvals.size()).toBe(1)
    const granted = approvals.grant('task-4', 'call-4', 'allow')
    expect(granted).toBe(true)

    const res = await promise
    expect(res.decision).toBe('allow')
    expect(res.policy).toBe('ask')
    expect(res.syntheticAssistantMessage).toBeUndefined()

    approvals.dispose()
  })
})
