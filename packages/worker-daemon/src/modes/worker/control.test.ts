import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'
import {
  parseWorkerDescribe,
} from '@zonease/aiworker-worker-control-protocol'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { bootstrapWorkerApp } from '../worker'

const FREEFORM_APP_ID = 'aiworker-freeform'

describe('worker-daemon control contract endpoints', () => {
  let dir = ''

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-control-'))
  })

  afterEach(async () => {
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  async function app() {
    const boot = await bootstrapWorkerApp({
      dbPath: join(dir, 'worker.db'),
      executor: {
        async invoke(input) {
          input.onEvent?.({ kind: 'text', text: 'done' })
          return { artifacts: [], summary: 'done' }
        },
      },
      runtimeVersion: 'test',
      workersRoot: join(dir, 'workers'),
    })
    return boot.app
  }

  async function createFreeformWorker(target: Awaited<ReturnType<typeof app>>, id = 'freeform-worker') {
    const res = await target.request('/api/workers', {
      body: JSON.stringify({ id, name: 'Freeform', soulId: FREEFORM_APP_ID }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(res.status).toBe(201)
  }

  it('GET /api/control/health reports readiness', async () => {
    const target = await app()
    const res = await target.request('/api/control/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ready: true })
  })

  it('GET /api/control/worker returns a protocol-valid self-description', async () => {
    const target = await app()
    await createFreeformWorker(target, 'control-worker')
    const res = await target.request('/api/control/worker')
    expect(res.status).toBe(200)
    const body = await res.json()
    // 必须满足 worker-control-protocol 的 describe 形状（含 configMicroAppEntry）
    const describe = parseWorkerDescribe(body)
    expect(describe.soulId).toBe(FREEFORM_APP_ID)
    expect(describe.configMicroAppEntry).toContain('/api/mount/workbench')
  })

  it('PUT /api/control/assignment accepts a valid envelope', async () => {
    const target = await app()
    await createFreeformWorker(target, 'control-worker')
    const res = await target.request('/api/control/assignment', {
      body: JSON.stringify({
        version: 1,
        templateId: 'freeform',
        connectors: [],
        permissions: ['read'],
        gatewayProfileRef: 'env:OPENAI_API_KEY',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ assignment: { templateId: 'freeform' } })
  })

  it('PUT /api/control/assignment rejects an envelope carrying non-contract data', async () => {
    const target = await app()
    await createFreeformWorker(target, 'control-worker')
    const res = await target.request('/api/control/assignment', {
      body: JSON.stringify({
        version: 1,
        templateId: 'freeform',
        connectors: [],
        permissions: [],
        gatewayProfileRef: 'env:X',
        sessionId: 'leak',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/control/lifecycle accepts an instance-level action', async () => {
    const target = await app()
    await createFreeformWorker(target, 'control-worker')
    const res = await target.request('/api/control/lifecycle', {
      body: JSON.stringify({ workerId: 'control-worker', action: 'stop' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ action: 'stop' })
  })
})
