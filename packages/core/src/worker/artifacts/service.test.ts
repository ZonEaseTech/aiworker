import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { agentTasks, closeWorkerDb, conversations, getWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { WorkerArtifactService } from './service'

describe('WorkerArtifactService', () => {
  let tmp: string

  beforeEach(() => {
    closeWorkerDb()
    tmp = mkdtempSync(join(tmpdir(), 'aiworker-artifacts-'))
    initWorkerDb(join(tmp, 'worker.db'))
    runWorkerMigrations()
    seedRun('run-1', 'conv-1')
    seedRun('run-2', 'conv-2')
  })

  afterEach(async () => {
    closeWorkerDb()
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('registers workspace-relative artifact metadata', () => {
    const artifact = new WorkerArtifactService().registerArtifact({
      conversationId: 'conv-1',
      hash: 'sha256:abc',
      kind: 'markdown',
      metadata: { section: 'summary' },
      mimeType: 'text/markdown',
      relativePath: ' reports/../reports/summary.md ',
      runId: 'run-1',
      sizeBytes: 42,
      source: 'executor',
      title: 'Run summary',
      at: '2026-05-09T09:00:00.000Z',
    })

    expect(artifact).toMatchObject({
      conversationId: 'conv-1',
      hash: 'sha256:abc',
      kind: 'markdown',
      metadata: { section: 'summary' },
      mimeType: 'text/markdown',
      relativePath: 'reports/summary.md',
      runId: 'run-1',
      sizeBytes: 42,
      status: 'available',
      title: 'Run summary',
    })
  })

  it('upserts by relativePath instead of duplicating rows', () => {
    const service = new WorkerArtifactService()
    const first = service.registerArtifact({
      relativePath: 'out/report.md',
      runId: 'run-1',
      title: 'First',
      at: '2026-05-09T09:00:00.000Z',
    })
    const second = service.registerArtifact({
      relativePath: 'out/report.md',
      runId: 'run-2',
      status: 'archived',
      title: 'Second',
      at: '2026-05-09T09:10:00.000Z',
    })

    expect(second.id).toBe(first.id)
    expect(second.createdAt).toBe('2026-05-09T09:00:00.000Z')
    expect(second.updatedAt).toBe('2026-05-09T09:10:00.000Z')
    expect(second).toMatchObject({
      runId: 'run-2',
      status: 'archived',
      title: 'Second',
    })
    expect(service.listArtifacts()).toHaveLength(1)
  })

  it('lists artifacts by run, conversation, and status from newest to oldest', () => {
    const service = new WorkerArtifactService()
    service.registerArtifact({
      conversationId: 'conv-1',
      relativePath: 'out/old.md',
      runId: 'run-1',
      title: 'Old',
      at: '2026-05-09T09:00:00.000Z',
    })
    service.registerArtifact({
      conversationId: 'conv-1',
      relativePath: 'out/new.md',
      runId: 'run-1',
      status: 'missing',
      title: 'New',
      at: '2026-05-09T09:10:00.000Z',
    })
    service.registerArtifact({
      conversationId: 'conv-2',
      relativePath: 'out/other.md',
      runId: 'run-2',
      title: 'Other',
      at: '2026-05-09T09:20:00.000Z',
    })

    expect(service.listArtifacts({ runId: 'run-1' }).map(item => item.relativePath)).toEqual([
      'out/new.md',
      'out/old.md',
    ])
    expect(service.listArtifacts({ conversationId: 'conv-1', status: 'missing' }).map(item => item.relativePath)).toEqual([
      'out/new.md',
    ])
  })

  it('rejects absolute or escaping paths', () => {
    const service = new WorkerArtifactService()

    expect(() => service.registerArtifact({ relativePath: '/tmp/report.md' })).toThrow('must be relative')
    expect(() => service.registerArtifact({ relativePath: '../report.md' })).toThrow('cannot escape')
    expect(() => service.registerArtifact({ relativePath: 'C:\\tmp\\report.md' })).toThrow('must be relative')
  })
})

function seedRun(runId: string, conversationId: string): void {
  getWorkerDb().insert(agentTasks).values({
    id: runId,
    prompt: `prompt ${runId}`,
    status: 'succeeded',
    conversationId,
    createdAt: '2026-05-09T08:00:00.000Z',
  }).run()
  getWorkerDb().insert(conversations).values({
    id: conversationId,
    taskId: runId,
    channel: 'web',
    chatId: `task:${runId}`,
    status: 'open',
    startedAt: '2026-05-09T08:00:00.000Z',
    lastActiveAt: '2026-05-09T08:00:00.000Z',
  }).run()
}
