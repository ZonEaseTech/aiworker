import { describe, expect, test } from 'bun:test'
import {
  encodeFrame,
  EVENTS,
  isKnownEvent,
  isKnownMethod,
  parseFrame,
  ROLES,
} from '../src'

/**
 * parseFrame 正反用例。覆盖 connect/request/response(ok)/response(err)/event 的合法形态，
 * 以及非法 JSON、非法 type、缺字段、未注册方法名等边界。
 */
describe('parseFrame', () => {
  test('合法 connect 帧（operator）', () => {
    const raw = JSON.stringify({
      type: 'connect',
      role: ROLES.OPERATOR,
      agentId: 'op-device-1',
      deviceId: 'op-device-1',
      auth: { token: 'bearer-xxx' },
      meta: { version: '0.1.0', hostname: 'laptop' },
    })
    const res = parseFrame(raw)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.frame.type).toBe('connect')
      if (res.frame.type === 'connect') {
        expect(res.frame.role).toBe('operator')
        expect(res.frame.auth.token).toBe('bearer-xxx')
      }
    }
  })

  test('合法 connect 帧（node，token 可为空字符串）', () => {
    const raw = JSON.stringify({
      type: 'connect',
      role: ROLES.NODE,
      agentId: 'worker-abc',
      deviceId: 'worker-abc-container',
      auth: { token: '' },
    })
    const res = parseFrame(raw)
    expect(res.ok).toBe(true)
    if (res.ok && res.frame.type === 'connect') {
      expect(res.frame.role).toBe('node')
      expect(res.frame.auth.token).toBe('')
    }
  })

  test('合法 request 帧（method=chat.send）', () => {
    const raw = JSON.stringify({
      type: 'request',
      id: 'req-1',
      method: 'chat.send',
      params: { workerId: 'w1', content: 'hello' },
    })
    const res = parseFrame(raw)
    expect(res.ok).toBe(true)
    if (res.ok && res.frame.type === 'request') {
      expect(res.frame.method).toBe('chat.send')
      expect(isKnownMethod(res.frame.method)).toBe(true)
    }
  })

  test('合法 response ok=true 帧', () => {
    const raw = JSON.stringify({
      type: 'response',
      id: 'req-1',
      ok: true,
      result: { conversationId: 'c1', accepted: true },
    })
    const res = parseFrame(raw)
    expect(res.ok).toBe(true)
    if (res.ok && res.frame.type === 'response' && res.frame.ok === true) {
      expect(res.frame.id).toBe('req-1')
    }
  })

  test('合法 response ok=false 帧（带 error.code/message）', () => {
    const raw = JSON.stringify({
      type: 'response',
      id: 'req-2',
      ok: false,
      error: { code: 'NOT_FOUND', message: 'worker offline' },
    })
    const res = parseFrame(raw)
    expect(res.ok).toBe(true)
    if (res.ok && res.frame.type === 'response' && res.frame.ok === false) {
      expect(res.frame.error.code).toBe('NOT_FOUND')
      expect(res.frame.error.message).toBe('worker offline')
    }
  })

  test('合法 event 帧（name=agent.done）', () => {
    const raw = JSON.stringify({
      type: 'event',
      name: EVENTS.AGENT_DONE,
      payload: {
        workerId: 'w1',
        conversationId: 'c1',
        finishReason: 'stop',
      },
      ts: 1_700_000_000_000,
    })
    const res = parseFrame(raw)
    expect(res.ok).toBe(true)
    if (res.ok && res.frame.type === 'event') {
      expect(res.frame.name).toBe('agent.done')
      expect(isKnownEvent(res.frame.name)).toBe(true)
    }
  })

  test('非法 JSON → ok: false', () => {
    const res = parseFrame('{not-json')
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toMatch(/^invalid_json:/)
    }
  })

  test('非法 type → ok: false', () => {
    const raw = JSON.stringify({
      type: 'bogus',
      id: 'x',
    })
    const res = parseFrame(raw)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toMatch(/^schema:/)
    }
  })

  test('connect 缺 auth → ok: false', () => {
    const raw = JSON.stringify({
      type: 'connect',
      role: 'operator',
      agentId: 'op-1',
      deviceId: 'op-1',
    })
    const res = parseFrame(raw)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toMatch(/^schema:/)
    }
  })

  test('request 的 method 非注册方法 → 帧结构合法，但 isKnownMethod=false', () => {
    const raw = JSON.stringify({
      type: 'request',
      id: 'req-99',
      method: 'some.unknown.method',
    })
    const res = parseFrame(raw)
    expect(res.ok).toBe(true)
    if (res.ok && res.frame.type === 'request') {
      expect(isKnownMethod(res.frame.method)).toBe(false)
    }
  })

  test('合法 connect 帧（node 携 enroll，PLAN-018 自助注册）', () => {
    const raw = JSON.stringify({
      type: 'connect',
      role: ROLES.NODE,
      agentId: 'w_abcdef123456',
      deviceId: 'w_abcdef123456-container',
      auth: { token: '' },
      enroll: {
        joinToken: 'shared-fleet-secret',
        apiToken: 'wtk_abcdefghijklmnopqrstuvwxyz012345',
        displayName: 'prod-1',
      },
    })
    const res = parseFrame(raw)
    expect(res.ok).toBe(true)
    if (res.ok && res.frame.type === 'connect') {
      expect(res.frame.enroll?.joinToken).toBe('shared-fleet-secret')
      expect(res.frame.enroll?.apiToken).toBe('wtk_abcdefghijklmnopqrstuvwxyz012345')
      expect(res.frame.enroll?.displayName).toBe('prod-1')
    }
  })

  test('connect.enroll.apiToken 不匹配 wtk_ 模式 → ok: false', () => {
    const raw = JSON.stringify({
      type: 'connect',
      role: ROLES.NODE,
      agentId: 'w_abcdef123456',
      deviceId: 'w_abcdef123456-container',
      auth: { token: '' },
      enroll: {
        joinToken: 'shared-fleet-secret',
        apiToken: 'not-a-valid-token',
      },
    })
    const res = parseFrame(raw)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toMatch(/^schema:/)
      expect(res.error).toMatch(/apiToken/)
    }
  })

  test('合法 connect 帧（不带 enroll，向后兼容老 client）', () => {
    const raw = JSON.stringify({
      type: 'connect',
      role: ROLES.NODE,
      agentId: 'w_legacy00001',
      deviceId: 'w_legacy00001-container',
      auth: { token: 'legacy-bearer' },
    })
    const res = parseFrame(raw)
    expect(res.ok).toBe(true)
    if (res.ok && res.frame.type === 'connect') {
      expect(res.frame.enroll).toBeUndefined()
      expect(res.frame.auth.token).toBe('legacy-bearer')
    }
  })

  test('encodeFrame 往返：encode → parse 结果与原始 Frame 等价', () => {
    const original = {
      type: 'event' as const,
      name: EVENTS.WORKER_ONLINE,
      payload: {
        workerId: 'w1',
        deviceId: 'd1',
        connectedAt: 1_700_000_000_000,
      },
      ts: 1_700_000_000_001,
    }
    const raw = encodeFrame(original)
    const res = parseFrame(raw)
    expect(res.ok).toBe(true)
    if (res.ok && res.frame.type === 'event') {
      expect(res.frame.name).toBe(EVENTS.WORKER_ONLINE)
      expect(res.frame.ts).toBe(1_700_000_000_001)
    }
  })

  // BUG-008: workerSummarySchema 必须接受空字符串 baseUrl —— self-enrolled
  // worker（PLAN-018）在 NAT 后没有 inbound HTTP 地址，fleet.db 落空字符串。
  test('workerSummarySchema 接受空字符串 / 缺省 baseUrl（self-enroll 情形）', async () => {
    const { workerSummarySchema } = await import('../src/methods')
    expect(workerSummarySchema.safeParse({
      workerId: 'w_self_enroll',
      online: true,
      baseUrl: '',
    }).success).toBe(true)
    expect(workerSummarySchema.safeParse({
      workerId: 'w_no_url',
      online: false,
    }).success).toBe(true)
    expect(workerSummarySchema.safeParse({
      workerId: 'w_pair',
      online: true,
      baseUrl: 'http://10.0.0.1:3001',
    }).success).toBe(true)
  })
})
