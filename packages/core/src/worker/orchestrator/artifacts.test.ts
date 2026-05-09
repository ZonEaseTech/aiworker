import type {
  BrainProvider,
  Envelope,
  ExecutorProvider,
  WorkerConfig,
} from '@zonease/aiworker-shared'

import type { WorkerEventBus } from '../events/bus'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'

import path from 'node:path'
import {
  agentTasks,
  closeWorkerDb,
  getWorkerDb,
  initWorkerDb,
  runWorkerMigrations,
  workerArtifacts,
} from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { WorkspaceManager } from '../executor/workspace'
import { ApprovalStore } from './approvals'
import { ProcessManager } from './process-manager'
import { Orchestrator } from './service'

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

function executor(output: string): ExecutorProvider {
  return {
    name: 'artifact-test',
    health: async () => ({ name: 'artifact-test', status: 'healthy', lastChecked: 'x' }),
    listTools: async () => [],
    run: () => (async function* () {
      yield { type: 'assistant_message_delta' as const, delta: output }
      yield { type: 'finish' as const, reason: 'stop' as const }
    })(),
  }
}

function config(): WorkerConfig {
  return {
    brains: [],
    brainWriteTarget: '',
    brainRetrieval: 'first-match',
    executor: { engine: 'http', variant: 'default', overrides: {} },
    channels: [],
    evolution: { enabled: false, observationRetentionDays: 7 },
  }
}

function silentBus(): WorkerEventBus {
  return {
    emit: () => undefined,
    on: () => () => undefined,
  } as unknown as WorkerEventBus
}

function envelope(taskId: string): Envelope {
  return {
    workerId: 'w_artifact_test',
    channel: 'web',
    accountId: 'sys:task',
    chatId: `task:${taskId}`,
    text: 'create the smoke artifact',
    receivedAt: new Date().toISOString(),
    raw: { taskId },
  }
}

describe('Orchestrator run artifacts', () => {
  let tmpRoot: string
  let projectRoot: string
  let workspaces: WorkspaceManager
  let processes: ProcessManager

  beforeEach(() => {
    closeWorkerDb()
    tmpRoot = mkdtempSync(path.join(tmpdir(), 'aiworker-run-artifact-'))
    projectRoot = path.join(tmpRoot, 'project')
    initWorkerDb(path.join(tmpRoot, 'worker.db'))
    runWorkerMigrations()
    workspaces = new WorkspaceManager({
      root: path.join(tmpRoot, 'data-root'),
      projectRoot,
    })
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

  it('captures final assistant output as the run artifact before finishing', async () => {
    const taskId = 'run-output-artifact'
    getWorkerDb().insert(agentTasks).values({
      id: taskId,
      prompt: 'create the smoke artifact',
      status: 'queued',
      createdAt: '2026-05-09T10:00:00.000Z',
    }).run()

    const orchestrator = new Orchestrator({
      config: config(),
      brain: stubBrain(),
      executor: executor('Smoke artifact complete.'),
      bus: silentBus(),
      workerId: 'w_artifact_test',
      workspaces,
      processes,
      approvals: new ApprovalStore(),
    })

    await orchestrator.ingest(envelope(taskId))

    const artifact = getWorkerDb()
      .select()
      .from(workerArtifacts)
      .where(eq(workerArtifacts.runId, taskId))
      .get()
    expect(artifact).toMatchObject({
      kind: 'assistant-output',
      runId: taskId,
      source: 'system',
      status: 'available',
      title: 'Run response',
    })
    expect(artifact?.relativePath).toBe('.aiworker/local/artifacts/runs/run-output-artifact/response.md')
    const artifactPath = path.join(projectRoot, ...(artifact?.relativePath ?? '').split('/'))
    expect(existsSync(artifactPath)).toBe(true)
    expect(readFileSync(artifactPath, 'utf8')).toBe('Smoke artifact complete.')

    const task = getWorkerDb()
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, taskId))
      .get()
    expect(task?.status).toBe('succeeded')
    expect(task?.result).toMatchObject({
      artifactId: artifact?.id,
      artifactPath: artifact?.relativePath,
    })
  })
})
