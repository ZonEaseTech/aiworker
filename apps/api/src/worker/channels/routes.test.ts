import type { WorkerRuntime } from '@zonease/aiworker-core'
import type { ChannelBinding } from '@zonease/aiworker-shared'
import { ChannelRegistry } from '@zonease/aiworker-core'

import { describe, expect, it } from 'bun:test'
import { buildChannelRoutes } from './routes'

const VERIFY_TOKEN = 'wa-verify-token-abc'
const WORKER_ID = 'w_abcdefghjkmn'

function whatsappBinding(): ChannelBinding {
  return {
    channel: 'whatsapp',
    enabled: true,
    credentials: {
      channel: 'whatsapp',
      phoneNumberId: '1234567890',
      accessToken: 'wa_access_token',
      appSecret: 'wa_app_secret',
      verifyToken: VERIFY_TOKEN,
    },
  }
}

function stubRuntime(bindings: ChannelBinding[]): WorkerRuntime {
  return {
    workerId: WORKER_ID,
    config: {} as WorkerRuntime['config'],
    brain: {} as WorkerRuntime['brain'],
    executor: {} as WorkerRuntime['executor'],
    channels: new ChannelRegistry(bindings),
    bus: {} as WorkerRuntime['bus'],
    orchestrator: {} as WorkerRuntime['orchestrator'],
    cron: {} as WorkerRuntime['cron'],
    workspaces: {} as WorkerRuntime['workspaces'],
    processes: {} as WorkerRuntime['processes'],
    approvals: {} as WorkerRuntime['approvals'],
    dispose: () => undefined,
  }
}

describe('buildChannelRoutes — WhatsApp GET /whatsapp/webhook', () => {
  it('returns the challenge text on subscribe + matching verify_token', async () => {
    const runtime = stubRuntime([whatsappBinding()])
    const routes = buildChannelRoutes(() => runtime, WORKER_ID)
    const url = `http://w/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}&hub.challenge=challenge-1`
    const res = await routes.fetch(new Request(url))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('challenge-1')
  })

  it('returns 403 on a same-length but mismatched verify_token (constant-time path)', async () => {
    // 同长度仅末位不同，强制走 timingSafeEqualStrings 的 timingSafeEqual 分支。
    const wrong = `${VERIFY_TOKEN.slice(0, -1)}X`
    expect(wrong.length).toBe(VERIFY_TOKEN.length)
    expect(wrong).not.toBe(VERIFY_TOKEN)
    const runtime = stubRuntime([whatsappBinding()])
    const routes = buildChannelRoutes(() => runtime, WORKER_ID)
    const url = `http://w/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(wrong)}&hub.challenge=challenge-2`
    const res = await routes.fetch(new Request(url))
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('forbidden')
  })

  it('returns 403 on a different-length verify_token (length-mismatch path)', async () => {
    const runtime = stubRuntime([whatsappBinding()])
    const routes = buildChannelRoutes(() => runtime, WORKER_ID)
    const url = 'http://w/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=short&hub.challenge=challenge-3'
    const res = await routes.fetch(new Request(url))
    expect(res.status).toBe(403)
  })

  it('returns 403 when hub.mode is not subscribe', async () => {
    const runtime = stubRuntime([whatsappBinding()])
    const routes = buildChannelRoutes(() => runtime, WORKER_ID)
    const url = `http://w/whatsapp/webhook?hub.mode=other&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}&hub.challenge=challenge-4`
    const res = await routes.fetch(new Request(url))
    expect(res.status).toBe(403)
  })

  it('returns 403 when hub.verify_token is missing entirely', async () => {
    const runtime = stubRuntime([whatsappBinding()])
    const routes = buildChannelRoutes(() => runtime, WORKER_ID)
    const url = 'http://w/whatsapp/webhook?hub.mode=subscribe&hub.challenge=challenge-5'
    const res = await routes.fetch(new Request(url))
    expect(res.status).toBe(403)
  })

  it('returns 404 when whatsapp is not bound to this worker', async () => {
    const runtime = stubRuntime([])
    const routes = buildChannelRoutes(() => runtime, WORKER_ID)
    const url = `http://w/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}&hub.challenge=challenge-6`
    const res = await routes.fetch(new Request(url))
    expect(res.status).toBe(404)
  })
})
