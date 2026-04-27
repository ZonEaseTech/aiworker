#!/usr/bin/env bun
/**
 * PLAN-013 S3 smoke：
 * 起一个 stub WS server 扮演 gateway —— 收到 connect 后不回复 ack，收到 request 后
 * 按 `@zonease/aiworker-gateway-proto` 的协议返回成功 response。aim client 走一次
 * system.presence 往返，成功即 PASS。
 *
 * 这个脚本不 mock 协议本身（用的是真 parseFrame/encodeFrame），也不直接 import
 * apps/gateway 的代码——符合"aim 仅通过协议与 gateway 对话"的约束。
 */
import type { RequestFrame } from '@zonease/aiworker-gateway-proto'
import type { Server, ServerWebSocket } from 'bun'
import type { Buffer } from 'node:buffer'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { encodeFrame, parseFrame, ROLES } from '@zonease/aiworker-gateway-proto'
import consola from 'consola'

import { createAimClient } from '../src/aim/client'

type StubWs = ServerWebSocket<{ connected: boolean }>

function startStubGateway(): Promise<{ url: string, close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    try {
      const server: Server = Bun.serve<{ connected: boolean }>({
        port: 0,
        fetch(req, srv) {
          const upgraded = srv.upgrade(req, { data: { connected: false } })
          if (upgraded)
            return undefined
          return new Response('upgrade failed', { status: 500 })
        },
        websocket: {
          open() {
            // 等 connect 帧再置位。
          },
          message(ws: StubWs, raw: string | Buffer) {
            const text = typeof raw === 'string' ? raw : raw.toString('utf8')
            const res = parseFrame(text)
            if (!res.ok) {
              consola.warn(`[stub-gateway] 非法帧: ${res.error}`)
              return
            }
            const frame = res.frame
            if (frame.type === 'connect') {
              if (frame.role !== ROLES.OPERATOR) {
                ws.close(4001, 'only operator accepted')
                return
              }
              ws.data.connected = true
              return
            }
            if (frame.type === 'request') {
              handleRequest(ws, frame)
            }
          },
        },
      })
      const url = `ws://localhost:${server.port}`
      resolve({
        url,
        close: async () => {
          server.stop(true)
        },
      })
    }
    catch (err) {
      reject(err)
    }
  })
}

function handleRequest(ws: StubWs, frame: RequestFrame): void {
  if (frame.method === 'system.presence') {
    ws.send(encodeFrame({
      type: 'response',
      id: frame.id,
      ok: true,
      result: {
        now: Date.now(),
        online: [
          { workerId: 'stub-worker-1', online: true, deviceId: 'stub-dev-1' },
        ],
      },
    }))
    return
  }
  ws.send(encodeFrame({
    type: 'response',
    id: frame.id,
    ok: false,
    error: { code: 'not_implemented', message: `stub gateway 未实现 method=${frame.method}` },
  }))
}

async function main(): Promise<number> {
  // 隔离 state：用 tmp 目录作为 AIWORKER_HOME，避免污染开发者家目录。
  const home = mkdtempSync(path.join(tmpdir(), 'aim-smoke-'))
  process.env.AIWORKER_HOME = home

  const gateway = await startStubGateway()
  consola.info(`[smoke-aim] stub gateway listening at ${gateway.url}`)

  const client = createAimClient()
  try {
    await client.connect({
      url: gateway.url,
      deviceId: 'op-smoke',
      token: '',
      meta: { purpose: 'smoke' },
      timeoutMs: 5000,
    })

    const res = await client.request('system.presence', {}, { timeoutMs: 5000 })
    if (typeof res.now !== 'number')
      throw new Error(`system.presence result 形状异常: ${JSON.stringify(res)}`)
    if (!Array.isArray(res.online) || res.online.length !== 1)
      throw new Error(`system.presence online 列表异常: ${JSON.stringify(res.online)}`)

    consola.success(`[smoke-aim] PASS: system.presence 往返成功 (online=${res.online.length})`)
    return 0
  }
  catch (err) {
    consola.error(`[smoke-aim] FAIL: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
  finally {
    try {
      await client.close(1000, 'smoke done')
    }
    catch {
      // 忽略关闭阶段异常。
    }
    await gateway.close()
    rmSync(home, { recursive: true, force: true })
  }
}

main()
  .then(code => process.exit(code))
  .catch((err) => {
    consola.error(err)
    process.exit(1)
  })
