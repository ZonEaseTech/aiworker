import type { GatewayConfig } from '../src/config'
import type { GatewayContext } from '../src/router/context'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseFrame } from '@zonease/aiworker-gateway-proto'
import {
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
import { dispatchNodeResponse } from '../src/router/dispatch'
import { startGatewayServer } from '../src/server'

const WORKER_ID = 'w_aaaabbbbcccd'

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

describe('gateway worker HTTP bridge', () => {
  test('GET /w/:workerId/api/worker/info forwards to workers.info and returns node JSON', async () => {
    const { ctx, cleanup } = makeCtx()
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const pendingFetch = fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/info`, {
        headers: {
          Authorization: 'Bearer browser-token',
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
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('GET /w/:workerId/api/worker/config forwards only allowlisted proto params', async () => {
    const { ctx, cleanup } = makeCtx()
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const pendingFetch = fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/config`, {
        headers: {
          Authorization: 'Bearer should-not-forward',
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
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('PUT /w/:workerId/api/worker/config maps If-Match and body to config.put', async () => {
    const { ctx, cleanup } = makeCtx()
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const nextConfig = { executor: { engine: 'codex' } }
      const pendingFetch = fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': '7',
          'Authorization': 'Bearer browser-token',
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

  test('unknown worker API paths are not bridged', async () => {
    const { ctx, cleanup } = makeCtx()
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const res = await fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/secrets`)
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ error: { code: 'not-found' } })
      expect(node.sent).toHaveLength(0)
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('missing If-Match on config PUT returns a bridge-local JSON error', async () => {
    const { ctx, cleanup } = makeCtx()
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const res = await fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'invalid-if-match' } })
      expect(node.sent).toHaveLength(0)
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

  test('records audit for a successful bridged worker call', async () => {
    const { ctx, cleanup } = makeCtx()
    const node = makeSendTap()
    ctx.nodes.register({ workerId: WORKER_ID, deviceId: 'dev-1', ws: node.ws, pairedAt: 1, meta: {} })
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const pendingFetch = fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/config`)
      const forwarded = await waitForForward(node.sent)
      dispatchNodeResponse(ctx, node.ws, {
        type: 'response',
        id: forwarded.id,
        ok: true,
        result: { version: 4, config: {} },
      })

      const res = await pendingFetch
      expect(res.status).toBe(200)
      const audit = ctx.persistence.listAuditEvents({ actionPrefix: 'gateway.bridge.', workerId: WORKER_ID })
      expect(audit.events).toHaveLength(1)
      expect(audit.events[0]).toMatchObject({
        actor: 'gateway',
        action: 'gateway.bridge.invoked',
        workerId: WORKER_ID,
        detail: {
          source: 'http-bridge',
          httpMethod: 'GET',
          path: '/api/worker/config',
          method: 'config.get',
          ok: true,
          status: 200,
        },
      })
      expect(audit.events[0]!.detail).not.toHaveProperty('errorCode')
    }
    finally {
      await started.stop()
      cleanup()
    }
  })

  test('records audit for a bridge error before returning JSON', async () => {
    const { ctx, cleanup } = makeCtx()
    const started = startGatewayServer({ config: testConfig(), context: ctx })
    try {
      const res = await fetch(`http://127.0.0.1:${started.port}/w/${WORKER_ID}/api/worker/info`)
      expect(res.status).toBe(503)
      expect(await res.json()).toMatchObject({ error: { code: 'node_offline' } })

      const audit = ctx.persistence.listAuditEvents({ actionPrefix: 'gateway.bridge.', workerId: WORKER_ID })
      expect(audit.events).toHaveLength(1)
      expect(audit.events[0]).toMatchObject({
        actor: 'gateway',
        action: 'gateway.bridge.invoked',
        workerId: WORKER_ID,
        detail: {
          source: 'http-bridge',
          httpMethod: 'GET',
          path: '/api/worker/info',
          method: 'workers.info',
          ok: false,
          status: 503,
          errorCode: 'node_offline',
        },
      })
    }
    finally {
      await started.stop()
      cleanup()
    }
  })
})
