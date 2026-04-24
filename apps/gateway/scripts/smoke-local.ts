#!/usr/bin/env bun
/**
 * PLAN-013 S2 smoke：在一个随机空闲端口上拉起完整 gateway 进程，以 loopback
 * operator 身份走 WS 协议完成 `system.presence` + `workers.list` 往返，最后
 * 优雅停止。
 *
 * 通过条件：所有断言通过 → 进程退出码 0；任何断言失败或超时 → 退出码 1。
 *
 * 故意不跑 docker、不 touch 任何 worker、不依赖外部 env；`fleet.db` 使用
 * 临时目录，smoke 结束前清理。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { encodeFrame, parseFrame, ROLES } from '@aiworker/gateway-proto'
import consola from 'consola'
import { startGateway } from '../src/index'

function log(msg: string): void {
  consola.info(`[smoke-gateway] ${msg}`)
}

function fail(msg: string, payload?: unknown): never {
  consola.error(`[smoke-gateway][FAIL] ${msg}`)
  if (payload !== undefined)
    consola.error(payload)
  throw new SmokeFailure(msg)
}

class SmokeFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SmokeFailure'
  }
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

/**
 * 最小 operator 客户端：建 WS 连接 → 发 connect → 支持 request/response 配对。
 * request 用自增 id；resolve 来自 response.id 匹配。
 */
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
    // event 帧在这个 smoke 里无需处理。
  })

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ws open timeout')), 5_000)
    ws.addEventListener('open', () => {
      clearTimeout(timer)
      resolve()
    })
    ws.addEventListener('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`ws error: ${err instanceof Event ? 'event' : String(err)}`))
    })
  })

  ws.send(encodeFrame({
    type: 'connect',
    role: ROLES.OPERATOR,
    agentId: 'smoke-op-id',
    deviceId: 'smoke-op-device',
    auth: { token: '' },
    meta: { source: 'apps/gateway/scripts/smoke-local.ts' },
  }))

  let seq = 0
  return {
    ws,
    async request(method, params) {
      const id = `smoke-${++seq}`
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
  const dir = mkdtempSync(join(tmpdir(), 'gateway-smoke-'))
  process.env.AIWORKER_FLEET_DB_PATH = join(dir, 'fleet.db')
  // 避免外层 env 干扰 — smoke 不需要 INTERNAL_SHARED_SECRET（loopback 免鉴权）。
  delete process.env.INTERNAL_SHARED_SECRET

  log(`临时 fleet.db: ${process.env.AIWORKER_FLEET_DB_PATH}`)
  log(`gateway 监听端口: 127.0.0.1:${port}`)

  const started = await startGateway({ port, host: '127.0.0.1' })
  try {
    const client = await connectOperator(`ws://127.0.0.1:${started.port}/ws`)

    log('step 1: system.presence')
    const presence = await client.request('system.presence', {})
    if (!presence.ok)
      fail(`system.presence 失败: ${JSON.stringify(presence.error)}`)
    const presenceResult = presence.result as { now: number, online: unknown[] }
    if (!Array.isArray(presenceResult.online) || presenceResult.online.length !== 0)
      fail('system.presence 应返回空 online 列表', presenceResult)
    if (typeof presenceResult.now !== 'number')
      fail('system.presence.now 应为 number', presenceResult)
    log(`        ok — online=[] now=${presenceResult.now}`)

    log('step 2: workers.list')
    const list = await client.request('workers.list', {})
    if (!list.ok)
      fail(`workers.list 失败: ${JSON.stringify(list.error)}`)
    const listResult = list.result as { workers: unknown[] }
    if (!Array.isArray(listResult.workers))
      fail('workers.list.workers 必须是数组', listResult)
    log(`        ok — workers=[${listResult.workers.length} 项]`)

    log('step 3: /health HTTP 心跳')
    const health = await fetch(`http://127.0.0.1:${started.port}/health`)
    if (!health.ok)
      fail(`/health 返回 ${health.status}`)
    log('        ok — /health 200')

    log('step 4: 未知方法走 unknown_method 分支')
    const bogus = await client.request('bogus.method', {})
    if (bogus.ok)
      fail('bogus.method 应该返回错误', bogus)
    if (bogus.error.code !== 'unknown_method')
      fail(`bogus.method 错误码 ${bogus.error.code}，期望 unknown_method`, bogus)
    log(`        ok — code=${bogus.error.code}`)

    log('step 5: chat.send 对 offline worker → node_offline')
    const offline = await client.request('chat.send', {
      workerId: 'non-exist-worker',
      content: 'hello',
    })
    if (offline.ok)
      fail('chat.send 对离线 worker 应返回错误', offline)
    if (offline.error.code !== 'node_offline')
      fail(`chat.send 错误码 ${offline.error.code}，期望 node_offline`, offline)
    log(`        ok — code=${offline.error.code}`)

    client.close()
    log('全部断言通过 — PLAN-013 S2 smoke PASS')
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
    consola.error('[smoke-gateway][CRASH]', err)
    process.exit(2)
  })
