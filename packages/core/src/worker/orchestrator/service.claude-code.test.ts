import type {
  BrainProvider,
  Envelope,
  WorkerConfig,
} from '@zonease/aiworker-shared'
import type { WorkerEventBus } from '../events/bus'
import type { WorkspaceManager } from '../executor/workspace'

import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { closeWorkerDb, getWorkerDb, initWorkerDb, messages, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { ClaudeCodeExecutor } from '../executor/engines/claude-code'
import { WorkspaceManager as RealWorkspaceManager } from '../executor/workspace'
import { ApprovalStore } from './approvals'
import { ProcessManager } from './process-manager'
import { Orchestrator } from './service'

/**
 * End-to-end smoke of the FEAT-012 hot path:
 * channel envelope → orchestrator → Claude Code executor (stubbed CLI) →
 * `worker.db.messages` transcript + orchestrator SSE events.
 */

const STUB_PATH = path.resolve(import.meta.dirname, '..', '..', '..', 'test-fixtures', 'cli', 'claude-stub.sh')

function stubBrain(): BrainProvider {
  return {
    name: 'multi',
    health: async () => ({ name: 'multi', status: 'healthy', lastChecked: 'x' }),
    listSkills: async () => [],
    listMemories: async () => [],
    searchMemories: async () => [],
    writeMemory: async () => { throw new Error('unused') },
  }
}

function stubBus(): WorkerEventBus {
  const recorded: Array<{ kind: string, payload: unknown }> = []
  const bus = {
    emit: (kind: string, payload: unknown) => {
      recorded.push({ kind, payload })
    },
    on: () => () => undefined,
    recorded,
  } as unknown as WorkerEventBus & { recorded: Array<{ kind: string, payload: unknown }> }
  return bus
}

function validConfig(): WorkerConfig {
  return {
    brains: [],
    brainWriteTarget: '',
    brainRetrieval: 'first-match',
    executor: {
      engine: 'claude-code',
      variant: 'default',
      overrides: {
        model: 'sonnet',
        timeoutMs: 30_000,
      },
    },
    channels: [],
    evolution: { enabled: false, observationRetentionDays: 7 },
  }
}

describe('Orchestrator + ClaudeCodeExecutor (stub CLI)', () => {
  let tmpRoot: string
  let workspaces: WorkspaceManager
  let processes: ProcessManager

  beforeEach(() => {
    closeWorkerDb()
    tmpRoot = mkdtempSync(path.join(tmpdir(), 'aiworker-orch-cc-'))
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

  it('runs a full turn, persists assistant message, emits tool_call SSE, creates workspace', async () => {
    const config = validConfig()
    const bus = stubBus() as WorkerEventBus & { recorded: Array<{ kind: string, payload: unknown }> }
    const executor = new ClaudeCodeExecutor({
      resolveClaudeBinary: async () => STUB_PATH,
      spawn: (_cmd, _args, opts) =>
        spawn(STUB_PATH, [], { cwd: opts.cwd, env: opts.env, stdio: ['pipe', 'pipe', 'pipe'] }),
    })

    const approvals = new ApprovalStore()
    const orchestrator = new Orchestrator({
      config,
      brain: stubBrain(),
      executor,
      bus,
      workerId: 'w_testtesttest',
      workspaces,
      processes,
      approvals,
    })

    const envelope: Envelope = {
      workerId: 'w_testtesttest',
      channel: 'web',
      accountId: 'test',
      chatId: 'chat-1',
      text: 'hello',
      receivedAt: new Date().toISOString(),
      raw: {},
    }

    await orchestrator.ingest(envelope)
    // The run is queued; let the event loop drain until the tool_call event
    // lands on the bus (or we time out).
    const deadline = Date.now() + 8_000
    while (Date.now() < deadline) {
      if (bus.recorded.some(r => r.kind === 'orchestrator.finished' || r.kind === 'orchestrator.error'))
        break
      await new Promise<void>(resolve => setTimeout(resolve, 50))
    }

    // A tool_call event was surfaced to downstream consumers.
    const toolCall = bus.recorded.find(r => r.kind === 'orchestrator.tool_call')
    expect(toolCall).toBeDefined()

    // Assistant text delta was observed (partial OR full block).
    const textEvents = bus.recorded.filter(r => r.kind === 'orchestrator.text')
    expect(textEvents.length).toBeGreaterThan(0)

    // worker.db.messages has at least the user + one assistant row.
    const db = getWorkerDb()
    const rows = db.select().from(messages).all()
    const userRows = rows.filter(r => r.role === 'user')
    const assistantRows = rows.filter(r => r.role === 'assistant')
    expect(userRows.length).toBe(1)
    expect(assistantRows.length).toBe(1)
    expect(assistantRows[0]?.content).toContain('Checking files')

    // Workspace directory was provisioned under the path-escape-guarded root.
    const convId = userRows[0]?.conversationId ?? ''
    expect(convId.length).toBeGreaterThan(0)
    const wsPath = path.join(tmpRoot, 'workspaces', convId)
    const stat = await fs.stat(wsPath).catch(() => null)
    expect(stat?.isDirectory()).toBe(true)

    // The orchestrator must not have leaked raw stream-json into the bus.
    const leakedEvent = bus.recorded.find((r) => {
      if (r.kind !== 'orchestrator.text')
        return false
      const payload = r.payload as { delta?: unknown }
      const delta = typeof payload.delta === 'string' ? payload.delta : ''
      return delta.includes('"type":"assistant"') || delta.includes('"type":"result"')
    })
    expect(leakedEvent).toBeUndefined()
  })

  it('rejects workspace path escape attempts', async () => {
    await expect(workspaces.disposeWorkspace('../escape'))
      .rejects
      .toMatchObject({ name: 'WorkspaceEscapeError' })
  })
})
