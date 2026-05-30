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
      soulId: 'freeform',
      version: '0.1.0',
      health: { ready: true },
      configMicroAppEntry: '/api/mount/workbench',
    })
    expect(ok.soulId).toBe('freeform')
  })

  test('assignment envelope is shape+version only, no connector behavior', () => {
    const env = parseWorkerAssignmentEnvelope({
      version: WORKER_CONTROL_PROTOCOL_VERSION,
      templateId: 'freeform',
      connectors: [{ id: 'enterprise-kb', authorized: true }],
      permissions: ['read'],
      gatewayProfileRef: 'env:OPENAI_API_KEY',
    })
    expect(env.templateId).toBe('freeform')
  })

  test('rejects assignment envelope carrying domain/session/secret data', () => {
    expect(() => parseWorkerAssignmentEnvelope({
      version: WORKER_CONTROL_PROTOCOL_VERSION,
      templateId: 'freeform',
      connectors: [],
      permissions: [],
      gatewayProfileRef: 'env:X',
      sessionId: 'leak',
    } as never)).toThrow()
  })
})
