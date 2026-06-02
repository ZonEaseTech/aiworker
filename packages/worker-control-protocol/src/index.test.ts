import { describe, expect, test } from 'bun:test'

import {
  parseWorkerAssignmentEnvelope,
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
      configMicroAppEntry: '/api/mount/workbench',
    })
    expect(ok.id).toBe('aiworker-freeform')
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
})
