import type { GatewayConfig } from '../src/config'
import type { GatewayContext } from '../src/router/context'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseFrame } from '@zonease/aiworker-gateway-proto'
import {
  auditEvents,
  closeFleetDb,
  defaultFleetMigrationsFolder,
  getFleetDb,
  initFleetDb,
  runFleetMigrations,
} from '@zonease/aiworker-storage-sqlite/fleet'
import { describe, expect, test } from 'bun:test'
import consola from 'consola'
import { ForwardTable, NodeRegistry, OperatorRegistry } from '../src/registry'
import { FleetPersistence } from '../src/registry/persistence'
import { dispatchNodeEvent, dispatchNodeResponse } from '../src/router/dispatch'
import { startGatewayServer } from '../src/server'

const WORKER_ID = 'w_aaaabbbbcccd'
const WORKER_TOKEN = 'wtk_bridge_worker_token'
const TEST_MASTER = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

function testConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    adminExternalAuthAcknowledged: false,
    fleetDbPath: ':memory:',
    canLaunch: false,
    enrollOtpTtlSec: 300,
    nodeEnv: 'test',
    supervisor: {
      dockerHost: '/var/run/docker.sock',
      network: 'aiworker_test',
      launchBaseUrlTemplate: 'http://{containerName}:9217',
    },
    ...overrides,
  }
}

function makeCtx(): { ctx: GatewayContext, cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'gw-bridge-'))
  initFleetDb(join(dir, 'fleet.db'))
  runFleetMigrations(defaultFleetMigrationsFolder)
  const ctx: GatewayContext = {
    persistence: new FleetPersistence(getFleetDb()),
    nodes: new NodeRegistry(),
    operators: new OperatorRegistry(),
    forwards: new ForwardTable({ timeoutMs: 0 }),
    logger: consola.withTag('gw-bridge-test'),
    masterKeyHex: TEST_MASTER,
  }
  return {
    ctx,
    cleanup: () => {
      ctx.forwards.dispose()
      closeFleetDb()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

function registerBridgeWorker(ctx: GatewayContext): void {
  ctx.persistence.upsertEnrolledWorker(
    {
      workerId: WORKER_ID,
      baseUrl: '',
      apiToken: WORKER_TOKEN,
      displayName: 'bridge-worker',
      addedBy: 'otp',
    },
    TEST_MASTER,
  )
}

function withBridgeAuth(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers)
  if (!headers.has('Authorization'))
    headers.set('Authorization', `Bearer ${WORKER_TOKEN}`)
  return { ...init, headers }
}

function readBridgeAudits(): Array<{
  action: string
  workerId: string | null
  detail: Record<string, unknown> | null
}> {
  return getFleetDb()
    .select({
      action: auditEvents.action,
      workerId: auditEvents.workerId,
      detail: auditEvents.detail,
    })
    .from(auditEvents)
    .all()
}

function expectBridgeAudit(args: {
  method: 'workers.info' | 'config.get' | 'config.put'
  result: 'success' | 'error'
  status: number
  errorCode?: string
}): Record<string, unknown> {
  const rows = readBridgeAudits()
  expect(rows).toHaveLength(1)
  const row = rows[0]!
  expect(row.action).toBe('gateway.method.invoked')
  expect(row.workerId).toBe(WORKER_ID)
  expect(row.detail).toMatchObject({
    operator: 'http-bridge',
    workerId: WORKER_ID,
    method: args.method,
    path: `/w/${WORKER_ID}/api/worker/${args.method === 'workers.info' ? 'info' : 'config'}`,
    result: args.result,
    status: args.status,
  })
  expect(typeof row.detail?.latencyMs).toBe('number')
  if (args.errorCode === undefined)
    expect(row.detail).not.toHaveProperty('errorCode')
  else
    expect(row.detail?.errorCode).toBe(args.errorCode)
  return row.detail!
}

function makeSendTap(): { ws: any, sent: string[] } {
  const sent: string[] = []
  const ws = {
    send: (msg: string) => sent.push(msg),
    close: () => {},
    data: {},
  }
  return { ws, sent }
}

async function waitForForward(sent: string[]): Promise<{ id: string, method: string, params: unknown }> {
  for (let i = 0; i < 50; i++) {
    if (sent[0]) {
      const parsed = parseFrame(sent[0])
      expect(parsed.ok).toBe(true)
      if (parsed.ok && parsed.frame.type === 'request') {
        return {
          id: parsed.frame.id,
          method: parsed.frame.method,
          params: parsed.frame.params,
        }
      }
      throw new Error('expected forwarded request frame')
    }
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  throw new Error('timed out waiting for forwarded request frame')
}

async function waitForWsOpen(ws: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for ws open')), 500)
    ws.addEventListener('open', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
    ws.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('ws failed to open'))
    }, { once: true })
  })
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string): Promise<string> {
  const decoder = new TextDecoder()
  let text = ''
  for (let i = 0; i < 20; i++) {
    const { value, done } = await reader.read()
    if (done)
      break
    text += decoder.decode(value)
    if (text.includes(needle))
      return text
  }
  return text
}

describe('gateway worker HTTP bridge', () => {
  test('GET /w/:workerId/api/worker/info forwards to workers.info and returns node JSON', async () => {
    const { ctx, cleanup } = makeCtx()
    registerBridgeWorker(ctx)
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const pendingFetch = fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/info`, {
        headers: {
          Authorization: `Bearer ${WORKER_TOKEN}`,
          Cookie: 'sid=browser-cookie',
        },
      })
      const forwarded = await waitForForward(node.sent)
      expect(forwarded.method).toBe('workers.info')
      expect(forwarded.params).toEqual({ workerId: WORKER_ID })

      dispatchNodeResponse(ctx, node.ws, {
        type: 'response',
        id: forwarded.id,
        ok: true,
        result: {
          workerId: WORKER_ID,
          runtimeVersion: 'test',
          configVersion: 3,
          brains: [],
          executor: { type: 'http', status: 'unknown' },
          channels: [],
          evolutionEnabled: false,
          startedAt: '2026-04-29T18:13:00.000Z',
        },
      })

      const res = await pendingFetch
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ workerId: WORKER_ID, configVersion: 3 })
      const detail = expectBridgeAudit({ method: 'workers.info', result: 'success', status: 200 })
      const serialized = JSON.stringify(detail)
      expect(serialized).not.toContain(WORKER_TOKEN)
      expect(serialized).not.toContain('browser-cookie')
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('GET /w/:workerId/api/worker/config forwards only allowlisted proto params', async () => {
    const { ctx, cleanup } = makeCtx()
    registerBridgeWorker(ctx)
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const pendingFetch = fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/config`, {
        headers: {
          Authorization: `Bearer ${WORKER_TOKEN}`,
          Cookie: 'secret=should-not-forward',
        },
      })
      const forwarded = await waitForForward(node.sent)
      expect(forwarded.method).toBe('config.get')
      expect(forwarded.params).toEqual({ workerId: WORKER_ID })

      dispatchNodeResponse(ctx, node.ws, {
        type: 'response',
        id: forwarded.id,
        ok: true,
        result: { version: 2, config: { executor: { engine: 'http' } } },
      })

      const res = await pendingFetch
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ version: 2, config: { executor: { engine: 'http' } } })
      const detail = expectBridgeAudit({ method: 'config.get', result: 'success', status: 200 })
      const serialized = JSON.stringify(detail)
      expect(serialized).not.toContain(WORKER_TOKEN)
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('PUT /w/:workerId/api/worker/config maps If-Match and body to config.put', async () => {
    const { ctx, cleanup } = makeCtx()
    registerBridgeWorker(ctx)
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const nextConfig = {
        executor: { engine: 'codex' },
        secrets: { apiKey: 'raw-config-secret' },
        workerBearerToken: 'worker-bearer-token',
      }
      const pendingFetch = fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': '7',
          'Authorization': `Bearer ${WORKER_TOKEN}`,
          'Cookie': 'sid=browser-cookie',
        },
        body: JSON.stringify(nextConfig),
      })
      const forwarded = await waitForForward(node.sent)
      expect(forwarded.method).toBe('config.put')
      expect(forwarded.params).toEqual({
        workerId: WORKER_ID,
        ifMatch: 7,
        config: nextConfig,
      })

      dispatchNodeResponse(ctx, node.ws, {
        type: 'response',
        id: forwarded.id,
        ok: true,
        result: { version: 8, appliedAt: 123, runtimeReload: 'ok' },
      })

      const res = await pendingFetch
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ version: 8, appliedAt: 123, runtimeReload: 'ok' })
      const detail = expectBridgeAudit({ method: 'config.put', result: 'success', status: 200 })
      const serialized = JSON.stringify(detail)
      expect(serialized).not.toContain(WORKER_TOKEN)
      expect(serialized).not.toContain('browser-cookie')
      expect(serialized).not.toContain('raw-config-secret')
      expect(serialized).not.toContain('worker-bearer-token')
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('rejects invalid workerId before routing', async () => {
    const { ctx, cleanup } = makeCtx()
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const res = await fetch(`http://127.0.0.1:${started.port}/w/not-a-worker/api/worker/config`)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'invalid-worker-id' } })
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('rejects worker bridge API requests without bearer token', async () => {
    const { ctx, cleanup } = makeCtx()
    registerBridgeWorker(ctx)
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const res = await fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/info`)
      expect(res.status).toBe(401)
      expect(res.headers.get('www-authenticate')).toBe('Bearer')
      expect(await res.json()).toMatchObject({ error: { code: 'auth-required' } })
      expect(node.sent).toHaveLength(0)
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('rejects worker bridge API requests with the wrong bearer token', async () => {
    const { ctx, cleanup } = makeCtx()
    registerBridgeWorker(ctx)
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const res = await fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/info`, {
        headers: { Authorization: 'Bearer wtk_wrong_token' },
      })
      expect(res.status).toBe(401)
      expect(res.headers.get('www-authenticate')).toBe('Bearer')
      expect(await res.json()).toMatchObject({ error: { code: 'auth-failed' } })
      expect(node.sent).toHaveLength(0)
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('unknown worker API paths are not bridged', async () => {
    const { ctx, cleanup } = makeCtx()
    registerBridgeWorker(ctx)
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const res = await fetch(
        `http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/runtime/processes/capacity`,
        withBridgeAuth(),
      )
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ error: { code: 'not-found' } })
      expect(node.sent).toHaveLength(0)
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('bridges worker UI REST routes through allowlisted proto methods', async () => {
    const { ctx, cleanup } = makeCtx()
    registerBridgeWorker(ctx)
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })

    async function expectForward(args: {
      path: string
      init?: RequestInit
      method: string
      params: unknown
      result: unknown
      body?: unknown
      status?: number
    }) {
      node.sent.length = 0
      const pendingFetch = fetch(`http://127.0.0.1:${started.port}${args.path}`, withBridgeAuth(args.init))
      const forwarded = await waitForForward(node.sent)
      expect(forwarded.method).toBe(args.method)
      expect(forwarded.params).toEqual(args.params)
      dispatchNodeResponse(ctx, node.ws, {
        type: 'response',
        id: forwarded.id,
        ok: true,
        result: args.result,
      })
      const res = await pendingFetch
      expect(res.status).toBe(args.status ?? 200)
      if (args.body !== undefined)
        expect(await res.json()).toEqual(args.body)
      else
        await res.text()
    }

    try {
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/cron`,
        method: 'cron.list',
        params: { workerId: WORKER_ID },
        result: { jobs: [] },
        body: { jobs: [] },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/cron`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: '* * * * *', prompt: 'ping', channel: 'web', chatId: 'c' }),
        },
        method: 'cron.add',
        params: {
          workerId: WORKER_ID,
          job: { expression: '* * * * *', prompt: 'ping', channel: 'web', chatId: 'c' },
        },
        result: { job: { id: 'job-1' } },
        body: { job: { id: 'job-1' } },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/cron/job-1`,
        init: {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        },
        method: 'cron.update',
        params: { workerId: WORKER_ID, jobId: 'job-1', patch: { enabled: false } },
        result: { job: { id: 'job-1', enabled: false } },
        body: { job: { id: 'job-1', enabled: false } },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/cron/job-1`,
        init: { method: 'DELETE' },
        method: 'cron.remove',
        params: { workerId: WORKER_ID, jobId: 'job-1' },
        result: { removed: true },
        body: { ok: true },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/approvals`,
        method: 'approval.list',
        params: { workerId: WORKER_ID },
        result: { approvals: [] },
        body: { approvals: [] },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/approvals/t-1/c-1/grant`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'allow' }),
        },
        method: 'approval.grant',
        params: { workerId: WORKER_ID, taskId: 't-1', toolCallId: 'c-1', decision: 'allow' },
        result: { granted: true },
        body: { granted: true },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/secrets`,
        method: 'secrets.list',
        params: { workerId: WORKER_ID },
        result: { keys: ['api-key'] },
        body: { keys: ['api-key'] },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/secrets/api-key`,
        init: {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'secret-value' }),
        },
        method: 'secrets.put',
        params: { workerId: WORKER_ID, key: 'api-key', value: 'secret-value' },
        result: { ok: true },
        body: { ok: true },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/engines?refresh=1`,
        method: 'engines.list',
        params: { workerId: WORKER_ID, refresh: true },
        result: { engines: [{ kind: 'http' }] },
        body: { engines: [{ kind: 'http' }] },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/brain/summary`,
        method: 'brain.summary',
        params: { workerId: WORKER_ID },
        result: { workerId: WORKER_ID, brainSummary: { artifacts: { total: 0 } }, checkedAt: 'now' },
        body: { workerId: WORKER_ID, brainSummary: { artifacts: { total: 0 } }, checkedAt: 'now' },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/brain/admission?status=pending&kind=memory-add&limit=25&showSensitive=true`,
        method: 'brain.admission.list',
        params: { workerId: WORKER_ID, status: 'pending', kind: 'memory-add', limit: 25, showSensitive: true },
        result: { count: 0, redacted: true, proposals: [] },
        body: { count: 0, redacted: true, proposals: [] },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/brain/admission/p-1?showSensitive=true`,
        method: 'brain.admission.show',
        params: { workerId: WORKER_ID, id: 'p-1', showSensitive: true },
        result: { redacted: true, proposal: { id: 'p-1' }, decisions: [] },
        body: { redacted: true, proposal: { id: 'p-1' }, decisions: [] },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/brain/admission/p-1/approve`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decidedBy: 'operator', reason: 'ok' }),
        },
        method: 'brain.admission.approve',
        params: { workerId: WORKER_ID, id: 'p-1', decidedBy: 'operator', reason: 'ok' },
        result: { decision: 'approved', proposal: { id: 'p-1', status: 'approved' } },
        body: { decision: 'approved', proposal: { id: 'p-1', status: 'approved' } },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/brain/admission/p-1/reject`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decidedBy: 'operator' }),
        },
        method: 'brain.admission.reject',
        params: { workerId: WORKER_ID, id: 'p-1', decidedBy: 'operator' },
        result: { decision: 'rejected', proposal: { id: 'p-1', status: 'rejected' } },
        body: { decision: 'rejected', proposal: { id: 'p-1', status: 'rejected' } },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/brain/admission/p-1/apply`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ allowSecretBody: 'block', commit: true, decidedBy: 'operator' }),
        },
        method: 'brain.admission.apply',
        params: { workerId: WORKER_ID, id: 'p-1', decidedBy: 'operator', commit: true, allowSecretBody: 'block' },
        result: { outcome: { kind: 'blocked-by-secret-scan', secretScan: { hits: [] } } },
        body: { outcome: { kind: 'blocked-by-secret-scan', secretScan: { hits: [] } } },
        status: 409,
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/brain/artifacts?scopeId=s-1&type=resume&status=active&minSensitivity=internal&limit=50`,
        method: 'brain.artifacts.list',
        params: { workerId: WORKER_ID, scopeId: 's-1', type: 'resume', status: 'active', minSensitivity: 'internal', limit: 50 },
        result: { count: 1, redacted: true, artifacts: [{ id: 'a-1' }] },
        body: { count: 1, redacted: true, artifacts: [{ id: 'a-1' }] },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/brain/artifacts/a-1?showSensitive=true`,
        method: 'brain.artifacts.show',
        params: { workerId: WORKER_ID, id: 'a-1', showSensitive: true },
        result: { redacted: false, artifact: { id: 'a-1' } },
        body: { redacted: false, artifact: { id: 'a-1' } },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/cases?limit=12`,
        method: 'cases.list',
        params: { workerId: WORKER_ID, limit: 12 },
        result: { cases: [{ taskId: 'task-1' }] },
        body: { cases: [{ taskId: 'task-1' }] },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/cases/task%2F1`,
        method: 'cases.show',
        params: { workerId: WORKER_ID, taskId: 'task/1' },
        result: { case: { taskId: 'task/1' } },
        body: { case: { taskId: 'task/1' } },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/cases/task%2F1/rerun`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'repair' }),
        },
        method: 'cases.rerun',
        params: { workerId: WORKER_ID, taskId: 'task/1', prompt: 'repair' },
        result: { task: { id: 'task-child' } },
        body: { task: { id: 'task-child' } },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/cases/task%2F1/lessons/propose`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scopeId: 'scope-1', soulId: 'developer' }),
        },
        method: 'cases.lessons.propose',
        params: { workerId: WORKER_ID, taskId: 'task/1', scopeId: 'scope-1', soulId: 'developer' },
        result: { proposals: [{ id: 'p-1' }] },
        body: { proposals: [{ id: 'p-1' }] },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/executor/test`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ probe: true }),
        },
        method: 'executor.test',
        params: { workerId: WORKER_ID, probe: true },
        result: { executor: { type: 'http', status: 'healthy' } },
        body: { executor: { type: 'http', status: 'healthy' } },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/channels/web/test`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: 'c', text: 'hello' }),
        },
        method: 'channel.test',
        params: { workerId: WORKER_ID, channel: 'web', body: { chatId: 'c', text: 'hello' } },
        result: { sent: true },
        body: { sent: true },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/orchestrator/tasks`,
        method: 'orchestrator.tasks.list',
        params: { workerId: WORKER_ID },
        result: { tasks: [] },
        body: { tasks: [] },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/orchestrator/tasks`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'hello' }),
        },
        method: 'orchestrator.tasks.create',
        params: { workerId: WORKER_ID, prompt: 'hello' },
        result: { task: { id: 'task-1' } },
        body: { task: { id: 'task-1' } },
      })
      await expectForward({
        path: `/w/${WORKER_ID}/api/worker/orchestrator/conversations/conv-1/messages`,
        method: 'orchestrator.messages.list',
        params: { workerId: WORKER_ID, conversationId: 'conv-1' },
        result: { messages: [] },
        body: { messages: [] },
      })
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('serves the worker bundle under /w/:workerId/', async () => {
    const { ctx, cleanup } = makeCtx()
    const staticDir = mkdtempSync(join(tmpdir(), 'gw-worker-ui-'))
    mkdirSync(join(staticDir, 'assets'))
    writeFileSync(join(staticDir, 'index.html'), '<html><body>worker shell</body></html>')
    writeFileSync(join(staticDir, 'assets', 'app.js'), 'console.log("worker")')
    ctx.workerWebStaticDir = staticDir
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const redirect = await fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}`, { redirect: 'manual' })
      expect(redirect.status).toBe(308)
      expect(redirect.headers.get('location')).toBe(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/`)

      const shell = await fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/config`)
      expect(shell.status).toBe(200)
      expect(await shell.text()).toContain('worker shell')

      const asset = await fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/assets/app.js`)
      expect(asset.status).toBe(200)
      expect(await asset.text()).toContain('console.log')
    }
    finally {
      await started.stop()
      rmSync(staticDir, { recursive: true, force: true })
      cleanup()
    }
  })

  test('bridges worker events as worker-scoped SSE', async () => {
    const { ctx, cleanup } = makeCtx()
    registerBridgeWorker(ctx)
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    const ctrl = new AbortController()
    try {
      const res = await fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/events/stream`, {
        headers: { Authorization: `Bearer ${WORKER_TOKEN}` },
        signal: ctrl.signal,
      })
      expect(res.status).toBe(200)
      const reader = res.body!.getReader()

      dispatchNodeEvent(ctx, node.ws, {
        type: 'event',
        name: 'chat.message',
        payload: {
          workerId: WORKER_ID,
          conversationId: 'conv-1',
          role: 'assistant',
          content: 'hello',
          createdAt: 1,
        },
        ts: 2,
      })

      const text = await readUntil(reader, 'chat.message')
      expect(text).toContain('event: chat.message')
      expect(text).toContain('"workerId":"w_aaaabbbbcccd"')
      await reader.cancel()
      ctrl.abort()
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('missing If-Match on config PUT returns a bridge-local JSON error', async () => {
    const { ctx, cleanup } = makeCtx()
    registerBridgeWorker(ctx)
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const res = await fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WORKER_TOKEN}` },
        body: JSON.stringify({ secrets: { apiKey: 'raw-config-secret' } }),
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'invalid-if-match' } })
      expect(node.sent).toHaveLength(0)
      const detail = expectBridgeAudit({
        method: 'config.put',
        result: 'error',
        status: 400,
        errorCode: 'invalid-if-match',
      })
      expect(JSON.stringify(detail)).not.toContain('raw-config-secret')
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('reserved /ws path still upgrades normally', async () => {
    const { ctx, cleanup } = makeCtx()
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    const ws = new WebSocket(`ws://127.0.0.1:${started.port}/ws`)
    try {
      await waitForWsOpen(ws)
      expect(ws.readyState).toBe(WebSocket.OPEN)
    }
    finally {
      ws.close()
      await started.stop()
      cleanup()
    }
  })

  test('records audit for a bridged node error without storing response details', async () => {
    const { ctx, cleanup } = makeCtx()
    registerBridgeWorker(ctx)
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const pendingFetch = fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/config`, withBridgeAuth())
      const forwarded = await waitForForward(node.sent)
      dispatchNodeResponse(ctx, node.ws, {
        type: 'response',
        id: forwarded.id,
        ok: false,
        error: {
          code: 'invalid_config',
          message: 'invalid config',
          details: { secret: 'node-error-secret' },
        },
      })

      const res = await pendingFetch
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'invalid-config' } })
      const detail = expectBridgeAudit({
        method: 'config.get',
        result: 'error',
        status: 400,
        errorCode: 'invalid_config',
      })
      expect(JSON.stringify(detail)).not.toContain('node-error-secret')
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('records audit for a bridge error before returning JSON', async () => {
    const { ctx, cleanup } = makeCtx()
    registerBridgeWorker(ctx)
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const res = await fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/info`, withBridgeAuth())
      expect(res.status).toBe(503)
      expect(await res.json()).toMatchObject({ error: { code: 'node_offline' } })
      expectBridgeAudit({
        method: 'workers.info',
        result: 'error',
        status: 503,
        errorCode: 'node_offline',
      })
    }
    finally {
      await started.stop()
      cleanup()
    }
  })
})
