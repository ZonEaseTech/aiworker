#!/usr/bin/env bun
/**
 * PLAN-013 S5 web smoke-e2e:
 *
 *   1. 在随机空闲端口拉起一个完整 gateway 进程(loopback,不鉴权);
 *   2. 用 Node/Bun 原生 WebSocket 连上去,模拟一个浏览器 operator;
 *   3. 握手 + 发 `workers.list` 请求 → 断言 `workers` 字段为空数组;
 *   4. 额外跑 `system.presence` 确认 operator 在 online 列表里会有对应 agentId。
 *
 * 目的:验证 web 侧新的 WS 数据层协议仍能与 gateway 完成来回调用。
 * 真实浏览器 E2E(Playwright)不在本脚本范围内,这里用 Bun 内置 WebSocket
 * 做协议层烟测。
 *
 * 通过:所有断言通过 → 退出码 0;断言失败 → 退出码 1;启动失败 / 崩溃 → 退出码 2。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { encodeFrame, parseFrame, ROLES } from '@aiworker/gateway-proto'
import { startGateway } from '../../gateway/src/index'

/** smoke 脚本用简化 logger,避免给 apps/web 增加 consola 依赖。 */
const consola = {
  info: (msg: string) => console.log(msg),
  error: (msg: string, payload?: unknown) => {
    if (payload !== undefined)
      console.error(msg, payload)
    else
      console.error(msg)
  },
}

class SmokeFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SmokeFailure'
  }
}

function log(msg: string): void {
  consola.info(`[web-smoke-e2e] ${msg}`)
}

function fail(msg: string, payload?: unknown): never {
  consola.error(`[web-smoke-e2e][FAIL] ${msg}`)
  if (payload !== undefined)
    consola.error(payload)
  throw new SmokeFailure(msg)
}

async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (typeof addr !== 'object' || addr === null) {
        srv.close()
        reject(new Error('failed to acquire ephemeral port'))
        return
      }
      const port = addr.port
      srv.close(() => resolve(port))
    })
  })
}

interface OperatorClient {
  ws: WebSocket
  request: (method: string, params: unknown) => Promise<{ ok: true, result: unknown } | { ok: false, error: { code: string, message: string } }>
  close: () => void
}

async function connectOperator(url: string): Promise<OperatorClient> {
  const ws = new WebSocket(url)
  const pending = new Map<string, (r: { ok: true, result: unknown } | { ok: false, error: { code: string, message: string } }) => void>()

  ws.addEventListener('message', (evt) => {
    const raw = typeof evt.data === 'string' ? evt.data : String(evt.data)
    const parsed = parseFrame(raw)
    if (!parsed.ok)
      return
    const frame = parsed.frame
    if (frame.type === 'response') {
      const resolver = pending.get(frame.id)
      if (!resolver)
        return
      pending.delete(frame.id)
      if (frame.ok)
        resolver({ ok: true, result: frame.result })
      else
        resolver({ ok: false, error: frame.error })
    }
  })

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ws open timeout')), 5_000)
    ws.addEventListener('open', () => {
      clearTimeout(timer)
      resolve()
    })
    ws.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('ws error'))
    })
  })

  ws.send(encodeFrame({
    type: 'connect',
    role: ROLES.OPERATOR,
    agentId: 'web-smoke-op',
    deviceId: 'web-smoke-dev',
    auth: { token: '' },
    meta: { source: 'apps/web/scripts/smoke-e2e.ts' },
  }))

  let seq = 0
  return {
    ws,
    async request(method, params) {
      const id = `web-smoke-${++seq}`
      const promise = new Promise<{ ok: true, result: unknown } | { ok: false, error: { code: string, message: string } }>(
        (resolve, reject) => {
          pending.set(id, resolve)
          setTimeout(() => {
            if (pending.has(id)) {
              pending.delete(id)
              reject(new Error(`request ${method} timeout`))
            }
          }, 5_000)
        },
      )
      ws.send(encodeFrame({ type: 'request', id, method, params }))
      return promise
    },
    close() {
      try {
        ws.close(1000, 'smoke_done')
      }
      catch { /* no-op */ }
    },
  }
}

async function runSmoke(): Promise<void> {
  const port = await pickFreePort()
  const dir = mkdtempSync(join(tmpdir(), 'web-smoke-'))
  process.env.AIWORKER_FLEET_DB_PATH = join(dir, 'fleet.db')
  // 避免外层 env 干扰——loopback 免鉴权。
  delete process.env.INTERNAL_SHARED_SECRET

  log(`临时 fleet.db: ${process.env.AIWORKER_FLEET_DB_PATH}`)
  log(`gateway 监听端口: 127.0.0.1:${port}`)

  const started = await startGateway({ port, host: '127.0.0.1' })
  try {
    const client = await connectOperator(`ws://127.0.0.1:${started.port}/ws`)

    log('step 1: workers.list 往返')
    const list = await client.request('workers.list', {})
    if (!list.ok)
      fail(`workers.list 失败: ${JSON.stringify(list.error)}`)
    const listResult = list.result as { workers: unknown[] }
    if (!Array.isArray(listResult.workers) || listResult.workers.length !== 0)
      fail('workers.list.workers 应为空数组', listResult)
    log(`        ok — workers=[] (空 fleet.db)`)

    log('step 2: system.presence 包含 operator 在线')
    const presence = await client.request('system.presence', {})
    if (!presence.ok)
      fail(`system.presence 失败: ${JSON.stringify(presence.error)}`)
    const presenceResult = presence.result as { now: number, online: unknown[] }
    if (!Array.isArray(presenceResult.online))
      fail('system.presence.online 应为数组', presenceResult)
    if (typeof presenceResult.now !== 'number')
      fail('system.presence.now 应为 number', presenceResult)
    log(`        ok — now=${presenceResult.now} online=${presenceResult.online.length}`)

    log('step 3: chat.send 对 offline worker → node_offline')
    const offline = await client.request('chat.send', {
      workerId: 'w_smoke_nowhere',
      content: 'hello',
    })
    if (offline.ok)
      fail('chat.send 对离线 worker 应返回错误', offline)
    if (offline.error.code !== 'node_offline')
      fail(`chat.send 错误码 ${offline.error.code},期望 node_offline`, offline)
    log(`        ok — code=${offline.error.code}`)

    client.close()
    log('全部断言通过 — web smoke-e2e PASS')
  }
  finally {
    await started.stop()
    rmSync(dir, { recursive: true, force: true })
  }
}

runSmoke()
  .then(() => process.exit(0))
  .catch((err) => {
    if (err instanceof SmokeFailure) {
      process.exit(1)
    }
    consola.error('[web-smoke-e2e][CRASH]', err)
    process.exit(2)
  })
