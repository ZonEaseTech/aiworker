import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeWorkerDb, upsertWorker } from '@zonease/aiworker-storage-sqlite/worker'
import {
  parseWorkerDescribe,
} from '@zonease/aiworker-worker-control-protocol'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { bootstrapWorkerApp } from '../worker'
import { setEngineScanner } from './settings'

const FREEFORM_APP_ID = 'aiworker-freeform'

describe('worker-daemon control contract endpoints', () => {
  let dir = ''
  // 与 worker.local.test 一致:收集 boot 出来的 daemon,afterEach 关库前 dispose,
  // 排空各运行体事件总线,防止还活着的订阅在 closeWorkerDb 后触发 DB 读(防御性,
  // 本文件当前不开 SSE / 不建 running invocation,故今天为惰性,但守住同一不变量)。
  let bootedDaemons: Array<{ shutdown: () => void }> = []

  beforeEach(() => {
    closeWorkerDb()
    dir = mkdtempSync(join(tmpdir(), 'aiworker-control-'))
    bootedDaemons = []
  })

  afterEach(async () => {
    for (const daemon of bootedDaemons)
      daemon.shutdown()
    // 无条件复位引擎扫描器到真实实现,防止注入的 fake 跨测试泄漏。
    setEngineScanner(null)
    closeWorkerDb()
    await rm(dir, { recursive: true, force: true })
  })

  async function app() {
    const boot = await bootstrapWorkerApp({
      dbPath: join(dir, 'worker.db'),
      // 注入确定性 fake 引擎扫描器,使 settings 加载绝不 shell 出真实引擎 CLI。
      engineScanner: () => [
        { command: 'codex', id: 'codex', installed: true, name: 'Codex CLI', path: '/fake/bin/codex', version: 'codex test 1.0' },
      ],
      executor: {
        async invoke(input) {
          input.onEvent?.({ kind: 'text', text: 'done' })
          return { artifacts: [], summary: 'done' }
        },
      },
      runtimeVersion: 'test',
      workersRoot: join(dir, 'workers'),
    })
    bootedDaemons.push(boot.state)
    return boot.app
  }

  async function createFreeformWorker(target: Awaited<ReturnType<typeof app>>, id = 'freeform-worker') {
    const res = await target.request('/api/workers', {
      body: JSON.stringify({ id, name: 'Freeform', appId: FREEFORM_APP_ID }),
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
    // 必须满足 worker-control-protocol 的 describe 形状（含 Worker-owned Workbench URL）
    const describe = parseWorkerDescribe(body)
    expect(describe.id).toBe(FREEFORM_APP_ID)
    expect(describe.workbenchUrl).toBe('/')
    expect(body).not.toHaveProperty('configMicroAppEntry')
  })

  it('GET /api/control/worker returns the single active worker, not listWorkers()[0]', async () => {
    const target = await app()
    await createFreeformWorker(target, 'the-active-worker')
    // 直插一个 id 排序在前的 archived worker:listWorkers()[0]（按 id 排序）会错取它,
    // find(active) 恒取唯一 active worker。
    upsertWorker({ id: 'aaa-archived-worker', appId: FREEFORM_APP_ID, name: 'Archived', status: 'archived' })
    const res = await target.request('/api/control/worker')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ workerId: 'the-active-worker' })
  })

  it('GET /api/control/worker returns 404 when no active worker exists (zero-active)', async () => {
    const target = await app() // fresh daemon, 未创建任何 worker
    const res = await target.request('/api/control/worker')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'WORKER_NOT_FOUND' } })
  })

  it('GET /api/control/worker returns 404 on a dirty multi-active DB, refusing to guess (post-boot concurrent write)', async () => {
    const target = await app()
    await createFreeformWorker(target, 'active-primary')
    // 并发 CLI/daemon 写可在 boot 之后插入第二个 active 行(busy_timeout 即为支持此),
    // bootstrap 的 >1-active fail-fast 已过;control route 必须拒绝在脏多-active DB 上
    // 静默取首元素,改为 404(与共享 resolveSingleActiveWorker 的 multiple 态一致)。
    upsertWorker({ id: 'active-secondary', appId: FREEFORM_APP_ID, name: 'Second', status: 'active' })
    const res = await target.request('/api/control/worker')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'WORKER_NOT_FOUND' } })
  })

  it('standalone discovery: /api/control/worker self-describes workerId + Workbench entry without Host', async () => {
    const target = await app()
    await createFreeformWorker(target, 'standalone-worker')
    // 控制契约自描述:standalone client 无先验地发现 workerId + Worker 自有 Workbench 入口。
    const describeRes = await target.request('/api/control/worker')
    expect(describeRes.status).toBe(200)
    const body = await describeRes.json()
    const describe = parseWorkerDescribe(body)
    expect(describe.workerId).toBe('standalone-worker')
    expect(describe.workbenchUrl).toBe('/')
    expect(body).not.toHaveProperty('configMicroAppEntry')
  })

  it('PUT /api/control/assignment accepts a valid envelope', async () => {
    const target = await app()
    await createFreeformWorker(target, 'control-worker')
    const res = await target.request('/api/control/assignment', {
      body: JSON.stringify({
        version: 1,
        id: FREEFORM_APP_ID,
        connectors: [],
        permissions: ['read'],
        gatewayProfileRef: 'env:OPENAI_API_KEY',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ assignment: { id: FREEFORM_APP_ID } })
  })

  it('PUT /api/control/assignment rejects an envelope carrying non-contract data', async () => {
    const target = await app()
    await createFreeformWorker(target, 'control-worker')
    const res = await target.request('/api/control/assignment', {
      body: JSON.stringify({
        version: 1,
        id: FREEFORM_APP_ID,
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
