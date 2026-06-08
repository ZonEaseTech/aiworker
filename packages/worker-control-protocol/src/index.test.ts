import { describe, expect, test } from 'bun:test'

import {
  parseWorkerAccessFrame,
  parseWorkerAccessHello,
  parseWorkerAccessReceipt,
  parseWorkerAccessRequestEnvelope,
  parseWorkerAccessResponseEnvelope,
  parseWorkerAssignmentEnvelope,
  parseWorkerAssignmentReceipt,
  parseWorkerCheckInRequest,
  parseWorkerCheckInResponse,
  parseWorkerDescribe,
  WORKER_CONTROL_PROTOCOL_VERSION,
} from './index'

describe('worker-control-protocol contract', () => {
  test('describe accepts a valid worker self-description', () => {
    const ok = parseWorkerDescribe({
      workerId: 'w1',
      id: 'aiworker-freeform',
      version: '0.1.0',
      health: { ready: true },
      workbenchUrl: '/',
    })
    expect(ok.id).toBe('aiworker-freeform')
    expect(ok.workbenchUrl).toBe('/')
  })

  test('describe rejects micro-app entry remnants', () => {
    expect(() => parseWorkerDescribe({
      workerId: 'w1',
      id: 'aiworker-freeform',
      version: '0.1.0',
      health: { ready: true },
      configMicroAppEntry: '/api/mount/workbench',
    } as never)).toThrow()
  })

  test('assignment envelope is shape+version only, no connector behavior', () => {
    const env = parseWorkerAssignmentEnvelope({
      version: WORKER_CONTROL_PROTOCOL_VERSION,
      id: 'freeform',
      connectors: [{ id: 'enterprise-kb', authorized: true }],
      permissions: ['read'],
      gatewayProfileRef: 'env:OPENAI_API_KEY',
    })
    expect(env.id).toBe('freeform')
  })

  test('rejects assignment envelope carrying domain/session/secret data', () => {
    expect(() => parseWorkerAssignmentEnvelope({
      version: WORKER_CONTROL_PROTOCOL_VERSION,
      id: 'freeform',
      connectors: [],
      permissions: [],
      gatewayProfileRef: 'env:X',
      sessionId: 'leak',
    } as never)).toThrow()
  })

  test('rejects a literal-secret gatewayProfileRef (C6: assignment carries a reference, not a literal secret)', () => {
    expect(() => parseWorkerAssignmentEnvelope({
      version: WORKER_CONTROL_PROTOCOL_VERSION,
      id: 'freeform',
      connectors: [],
      permissions: [],
      gatewayProfileRef: 'sk-proj-LITERALSECRETVALUE0123456789',
    })).toThrow()
  })

  test('accepts only reference-shaped gatewayProfileRef (env:/secretref:/$)', () => {
    for (const ref of ['env:GATEWAY_KEY', 'secretref:prod/gateway', '$GATEWAY_PROFILE']) {
      const env = parseWorkerAssignmentEnvelope({
        version: WORKER_CONTROL_PROTOCOL_VERSION,
        id: 'freeform',
        connectors: [],
        permissions: [],
        gatewayProfileRef: ref,
      })
      expect(env.gatewayProfileRef).toBe(ref)
    }
  })

  test('check-in request accepts only provision token and worker description', () => {
    const req = parseWorkerCheckInRequest({
      provisionToken: 'awp_token',
      worker: {
        workerId: 'worker-1',
        id: 'aiworker-freeform',
        version: '0.1.0',
        health: { ready: true },
        workbenchUrl: '/',
      },
    })

    expect(req.worker.workerId).toBe('worker-1')
    expect(req.provisionToken).toBe('awp_token')
  })

  test('check-in request rejects extra data', () => {
    expect(() => parseWorkerCheckInRequest({
      provisionToken: 'awp_token',
      worker: {
        workerId: 'worker-1',
        id: 'aiworker-freeform',
        version: '0.1.0',
        health: { ready: true },
        workbenchUrl: '/',
      },
      extraData: 'leak',
    } as never)).toThrow()
  })

  test('check-in request rejects strict secret carrier fields', () => {
    expect(() => parseWorkerCheckInRequest({
      provisionToken: 'awp_token',
      worker: {
        workerId: 'worker-1',
        id: 'aiworker-freeform',
        version: '0.1.0',
        health: { ready: true },
        workbenchUrl: '/',
      },
      apiKey: 'literal-secret',
    } as never)).toThrow()
  })

  test('check-in response carries access and assignment receipts', () => {
    const res = parseWorkerCheckInResponse({
      access: {
        mode: 'worker_access',
        token: 'awt_token',
      },
      assignment: {
        assignedEmail: 'operator@example.com',
        assignmentId: 'assignment-1',
        soulReleaseRef: 'soul-release-1',
        workerId: 'worker-1',
      },
    })

    expect(res.access.mode).toBe('worker_access')
    expect(res.assignment.assignedEmail).toBe('operator@example.com')
  })

  test('assignment receipt parser accepts assignment receipt only', () => {
    const receipt = parseWorkerAssignmentReceipt({
      assignedEmail: 'operator@example.com',
      assignmentId: 'assignment-1',
      soulReleaseRef: 'soul-release-1',
      workerId: 'worker-1',
    })

    expect(receipt.assignmentId).toBe('assignment-1')

    expect(() => parseWorkerAssignmentReceipt({
      assignedEmail: 'operator@example.com',
      assignmentId: 'assignment-1',
      soulReleaseRef: 'soul-release-1',
      workerId: 'worker-1',
      extraData: 'leak',
    } as never)).toThrow()
  })

  test('access receipt parser accepts worker access receipt', () => {
    const receipt = parseWorkerAccessReceipt({
      mode: 'worker_access',
      token: 'awt_token',
    })

    expect(receipt.mode).toBe('worker_access')
    expect(receipt.token).toBe('awt_token')
  })

  test('check-in response rejects transport-owned access data', () => {
    expect(() => parseWorkerCheckInResponse({
      access: {
        mode: 'worker_access',
        token: 'awt_token',
        url: 'wss://example.test/access',
      },
      assignment: {
        assignedEmail: 'operator@example.com',
        assignmentId: 'assignment-1',
        soulReleaseRef: 'soul-release-1',
        workerId: 'worker-1',
      },
    } as never)).toThrow()
  })

  test('access hello binds worker and assignment with token', () => {
    const hello = parseWorkerAccessHello({
      assignmentId: 'assignment-1',
      token: 'awt_token',
      workerId: 'worker-1',
    })

    expect(hello).toEqual({
      assignmentId: 'assignment-1',
      token: 'awt_token',
      workerId: 'worker-1',
    })
  })

  test('worker access hello frame binds worker assignment and token without extras', () => {
    expect(parseWorkerAccessFrame({
      type: 'hello',
      assignmentId: 'asn_1',
      token: 'awt_secret',
      workerId: 'wkr_82',
    })).toEqual({
      type: 'hello',
      assignmentId: 'asn_1',
      token: 'awt_secret',
      workerId: 'wkr_82',
    })

    expect(() => parseWorkerAccessFrame({
      type: 'hello',
      assignmentId: 'asn_1',
      token: 'awt_secret',
      workerId: 'wkr_82',
      localUrl: 'http://127.0.0.1:9217',
    } as never)).toThrow()
  })

  test('worker access frame parser accepts request response ping pong and close only', () => {
    const request = parseWorkerAccessFrame({
      type: 'request',
      id: 'req_1',
      method: 'GET',
      path: '/api/info',
      headers: {},
      bodyText: '',
    })
    expect(request.type).toBe('request')
    expect(parseWorkerAccessFrame({ type: 'response', id: 'req_1', status: 200, headers: {}, bodyText: '' })).toEqual({
      type: 'response',
      id: 'req_1',
      status: 200,
      headers: {},
      bodyText: '',
    })
    expect(parseWorkerAccessFrame({ type: 'ping', id: 'ping_1' })).toEqual({ type: 'ping', id: 'ping_1' })
    expect(parseWorkerAccessFrame({ type: 'pong', id: 'ping_1' })).toEqual({ type: 'pong', id: 'ping_1' })
    expect(parseWorkerAccessFrame({ type: 'close', id: 'req_1', reason: 'client-aborted' })).toEqual({
      type: 'close',
      id: 'req_1',
      reason: 'client-aborted',
    })
    expect(() => parseWorkerAccessFrame({ type: 'long_poll', id: 'x' } as never)).toThrow()
  })

  test('access request envelope is strict', () => {
    const req = parseWorkerAccessRequestEnvelope({
      type: 'request',
      id: 'frame-1',
      method: 'GET',
      path: '/api/workbench',
      headers: { accept: 'application/json' },
      bodyText: '',
    })
    expect(req.type).toBe('request')

    expect(() => parseWorkerAccessRequestEnvelope({
      type: 'request',
      id: 'frame-1',
      method: 'GET',
      path: '/api/workbench',
      headers: {},
      bodyText: '',
      extraData: 'leak',
    } as never)).toThrow()
  })

  test('access response envelope is strict', () => {
    const res = parseWorkerAccessResponseEnvelope({
      type: 'response',
      id: 'frame-1',
      status: 200,
      headers: { 'content-type': 'application/json' },
      bodyText: '{}',
    })
    expect(res.status).toBe(200)

    expect(() => parseWorkerAccessResponseEnvelope({
      type: 'response',
      id: 'frame-1',
      status: 200,
      headers: {},
      bodyText: '',
      extraData: 'leak',
    } as never)).toThrow()
  })
})
