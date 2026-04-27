import type { WorkerRuntime } from '@zonease/aiworker-core'

import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { buildOrchestratorRoutes } from './routes'

/**
 * REFACTOR-006 P2 — orchestrator POST /tasks 入参校验。MB 级 prompt 不能直
 * 灌进 SQLite/LLM；空白也不能绕过 trim 后变空串。zod schema 在 routes 层
 * 一票否决，不进 orchestrator.submitTask。
 */

function stubRuntime(submit: (prompt: string) => Promise<{ id: string }>): WorkerRuntime {
  return {
    workerId: 'w_routes_test',
    config: {} as WorkerRuntime['config'],
    brain: {} as WorkerRuntime['brain'],
    executor: {} as WorkerRuntime['executor'],
    channels: {} as WorkerRuntime['channels'],
    bus: {} as WorkerRuntime['bus'],
    orchestrator: { submitTask: submit } as unknown as WorkerRuntime['orchestrator'],
    cron: {} as WorkerRuntime['cron'],
    workspaces: {} as WorkerRuntime['workspaces'],
    processes: {} as WorkerRuntime['processes'],
    approvals: {} as WorkerRuntime['approvals'],
    dispose: () => undefined,
  }
}

describe('buildOrchestratorRoutes — POST /tasks zod validation', () => {
  let tmp: string

  beforeEach(() => {
    closeWorkerDb()
    tmp = mkdtempSync(join(tmpdir(), 'aiworker-orch-routes-'))
    initWorkerDb(join(tmp, 'worker.db'))
    runWorkerMigrations()
  })

  afterEach(async () => {
    closeWorkerDb()
    await fs.rm(tmp, { recursive: true, force: true })
  })

  it('rejects empty prompt with 400 invalid-body', async () => {
    let called = false
    const routes = buildOrchestratorRoutes(() => stubRuntime(async () => {
      called = true
      return { id: 'task-1' }
    }))
    const res = await routes.fetch(new Request('http://w/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' }),
    }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('invalid-body')
    expect(called).toBe(false)
  })

  it('rejects whitespace-only prompt with 400 invalid-body', async () => {
    let called = false
    const routes = buildOrchestratorRoutes(() => stubRuntime(async () => {
      called = true
      return { id: 'task-1' }
    }))
    const res = await routes.fetch(new Request('http://w/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   \n   \t  ' }),
    }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('invalid-body')
    expect(called).toBe(false)
  })

  it('rejects prompt longer than 8000 chars with 400 invalid-body', async () => {
    let called = false
    const routes = buildOrchestratorRoutes(() => stubRuntime(async () => {
      called = true
      return { id: 'task-1' }
    }))
    const oversized = 'x'.repeat(8001)
    const res = await routes.fetch(new Request('http://w/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: oversized }),
    }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string, details: { prompt?: string[] } } }
    expect(body.error.code).toBe('invalid-body')
    expect(called).toBe(false)
  })

  it('accepts a normal prompt and forwards trimmed value to submitTask', async () => {
    let received = ''
    const routes = buildOrchestratorRoutes(() => stubRuntime(async (p) => {
      received = p
      return { id: 'task-42' }
    }))
    const res = await routes.fetch(new Request('http://w/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '  hello world  ' }),
    }))
    expect(res.status).toBe(201)
    const body = await res.json() as { task: { id: string } }
    expect(body.task.id).toBe('task-42')
    expect(received).toBe('hello world')
  })

  it('accepts prompt at exactly 8000 chars boundary', async () => {
    let called = false
    const routes = buildOrchestratorRoutes(() => stubRuntime(async () => {
      called = true
      return { id: 'task-boundary' }
    }))
    const res = await routes.fetch(new Request('http://w/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'a'.repeat(8000) }),
    }))
    expect(res.status).toBe(201)
    expect(called).toBe(true)
  })

  it('rejects malformed JSON body with 400', async () => {
    const routes = buildOrchestratorRoutes(() => stubRuntime(async () => ({ id: 'never' })))
    const res = await routes.fetch(new Request('http://w/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    }))
    expect(res.status).toBe(400)
  })
})
