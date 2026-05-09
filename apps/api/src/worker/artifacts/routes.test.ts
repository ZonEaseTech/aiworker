import { WorkerArtifactService } from '@zonease/aiworker-core'
import { agentTasks, closeWorkerDb, conversations, getWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildArtifactRoutes } from './routes'

describe('worker artifact routes', () => {
  let tmp: string

  beforeEach(() => {
    closeWorkerDb()
    tmp = mkdtempSync(join(tmpdir(), 'aiworker-artifact-routes-'))
    initWorkerDb(join(tmp, 'worker.db'))
    runWorkerMigrations()
    seedRun('run-1', 'conv-1')
    seedRun('run-2', 'conv-2')
  })

  afterEach(async () => {
    closeWorkerDb()
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('GET / lists artifact metadata with filters', async () => {
    const service = new WorkerArtifactService()
    service.registerArtifact({
      conversationId: 'conv-1',
      relativePath: 'reports/old.md',
      runId: 'run-1',
      title: 'Old',
      at: '2026-05-09T09:00:00.000Z',
    })
    service.registerArtifact({
      conversationId: 'conv-1',
      relativePath: 'reports/new.md',
      runId: 'run-1',
      status: 'missing',
      title: 'New',
      at: '2026-05-09T09:10:00.000Z',
    })

    const res = await buildArtifactRoutes().fetch(new Request('http://w/?runId=run-1&status=missing'))

    expect(res.status).toBe(200)
    const body = await res.json() as { artifacts: Array<{ relativePath: string, status: string }> }
    expect(body.artifacts).toEqual([
      expect.objectContaining({ relativePath: 'reports/new.md', status: 'missing' }),
    ])
  })

  it('GET /:id returns one artifact metadata record', async () => {
    const artifact = new WorkerArtifactService().registerArtifact({
      relativePath: 'reports/summary.md',
      runId: 'run-1',
      title: 'Summary',
      at: '2026-05-09T09:00:00.000Z',
    })

    const res = await buildArtifactRoutes().fetch(new Request(`http://w/${artifact.id}`))

    expect(res.status).toBe(200)
    const body = await res.json() as { artifact: { id: string, relativePath: string } }
    expect(body.artifact).toMatchObject({
      id: artifact.id,
      relativePath: 'reports/summary.md',
    })
  })

  it('GET / rejects invalid query values', async () => {
    const res = await buildArtifactRoutes().fetch(new Request('http://w/?status=unknown'))

    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('invalid-query')
  })

  it('GET /:id returns 404 for missing artifacts', async () => {
    const res = await buildArtifactRoutes().fetch(new Request('http://w/missing'))

    expect(res.status).toBe(404)
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
