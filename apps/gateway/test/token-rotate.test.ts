import type { GatewayContext } from '../src/router/context'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encodeFrame, parseFrame } from '@aiworker/gateway-proto'
import {
  closeFleetDb,
  defaultFleetMigrationsFolder,
  getFleetDb,
  initFleetDb,
  runFleetMigrations,
} from '@aiworker/storage-sqlite/fleet'
import { describe, expect, test } from 'bun:test'
import consola from 'consola'
import { ForwardTable, NodeRegistry, OperatorRegistry } from '../src/registry'
import { decryptToken } from '../src/registry/crypto'
import { FleetPersistence } from '../src/registry/persistence'
import { handleTokenRotate } from '../src/router/methods/token'

const TEST_MASTER = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const VALID_TOKEN = 'wtk_abcdefghijklmnopqrstuvwxyz0123456789'
const NEW_TOKEN = 'wtk_zzzzyyyyxxxxwwwwvvvvuuuu00112233445566'

function makeCtx(overrides: Partial<GatewayContext> = {}): { ctx: GatewayContext, cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'gw-tokrot-'))
  initFleetDb(join(dir, 'fleet.db'))
  runFleetMigrations(defaultFleetMigrationsFolder)
  const persistence = new FleetPersistence(getFleetDb())
  const ctx: GatewayContext = {
    persistence,
    nodes: new NodeRegistry(),
    operators: new OperatorRegistry(),
    forwards: new ForwardTable({ timeoutMs: 500 }),
    logger: consola.withTag('gw-test-tokrot'),
    masterKeyHex: TEST_MASTER,
    supervisor: null,
    ...overrides,
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

/** 伪 node ws:当 gateway send request 给 node 时,这里解析 id 并回 response。 */
function makeFakeNode(ctx: GatewayContext, respond: (id: string) => ReturnType<typeof encodeFrame>) {
  const received: string[] = []
  const ws = {
    send(raw: string) {
      received.push(raw)
      const parsed = parseFrame(raw)
      if (parsed.ok && parsed.frame.type === 'request') {
        const id = parsed.frame.id
        // 异步把响应扔回 dispatch——等 event loop 下一个 tick
        queueMicrotask(() => {
          const frame = respond(id)
          // dispatchNodeResponse 走 consume + operatorWs.send
          const pending = ctx.forwards.consume(id)
          if (pending) {
            try {
              pending.operatorWs.send(frame)
            }
            catch {}
          }
        })
      }
    },
    close() {},
  }
  return { ws, received }
}

describe('token.rotate', () => {
  test('worker 不存在 → not_found', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      const r = await handleTokenRotate(ctx, { workerId: 'nowhere' })
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('not_found')
    }
    finally { cleanup() }
  })

  test('node 不在线 → node_offline', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      ctx.persistence.createRegisteredWorker(
        {
          workerId: 'w_offline123456',
          baseUrl: 'http://w',
          apiToken: VALID_TOKEN,
          displayName: 'off',
        },
        TEST_MASTER,
      )
      const r = await handleTokenRotate(ctx, { workerId: 'w_offline123456' })
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('node_offline')
    }
    finally { cleanup() }
  })

  test('master key 缺失 → master_key_missing', async () => {
    const { ctx, cleanup } = makeCtx({ masterKeyHex: undefined })
    try {
      const r = await handleTokenRotate(ctx, { workerId: 'anything' })
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('master_key_missing')
    }
    finally { cleanup() }
  })

  test('成功:fleet.db 加密 token 被更新为新 token', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      ctx.persistence.createRegisteredWorker(
        {
          workerId: 'w_online12345x',
          baseUrl: 'http://w',
          apiToken: VALID_TOKEN,
          displayName: 'on',
        },
        TEST_MASTER,
      )
      const fake = makeFakeNode(ctx, id => encodeFrame({
        type: 'response',
        id,
        ok: true,
        result: { deviceToken: NEW_TOKEN },
      }))
      ctx.nodes.register({
        workerId: 'w_online12345x',
        deviceId: 'dev-1',
        ws: fake.ws as never,
        pairedAt: Date.now(),
        meta: {},
      })
      const r = await handleTokenRotate(ctx, { workerId: 'w_online12345x' })
      expect(r.ok).toBe(true)
      if (r.ok) {
        const out = r.result as { deviceToken: string }
        expect(out.deviceToken).toBe(NEW_TOKEN)
      }
      // 持久化检查:解密后应等于 NEW_TOKEN。
      const row = ctx.persistence.getRegisteredWorkerRaw('w_online12345x')!
      const decrypted = decryptToken(row.apiTokenEnc, row.nonce, row.authTag, TEST_MASTER)
      expect(decrypted).toBe(NEW_TOKEN)
    }
    finally { cleanup() }
  })

  test('node 返回错误 → 错误码透传', async () => {
    const { ctx, cleanup } = makeCtx()
    try {
      ctx.persistence.createRegisteredWorker(
        {
          workerId: 'w_err1234567ab',
          baseUrl: 'http://w',
          apiToken: VALID_TOKEN,
          displayName: 'on',
        },
        TEST_MASTER,
      )
      const fake = makeFakeNode(ctx, id => encodeFrame({
        type: 'response',
        id,
        ok: false,
        error: { code: 'internal_error', message: 'rotate failed' },
      }))
      ctx.nodes.register({
        workerId: 'w_err1234567ab',
        deviceId: 'dev-1',
        ws: fake.ws as never,
        pairedAt: Date.now(),
        meta: {},
      })
      const r = await handleTokenRotate(ctx, { workerId: 'w_err1234567ab' })
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.code).toBe('internal_error')
    }
    finally { cleanup() }
  })
})
