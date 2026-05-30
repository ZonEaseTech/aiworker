import { describe, expect, test } from 'bun:test'

import { createWorkerRegistry } from './index'

describe('host-control worker registry', () => {
  test('registers and lists workers', () => {
    const reg = createWorkerRegistry()
    reg.register({ workerId: 'w1', soulId: 'freeform', endpoint: 'http://127.0.0.1:9217', health: { ready: true } })
    expect(reg.list().map(w => w.workerId)).toEqual(['w1'])
    expect(reg.get('w1')?.soulId).toBe('freeform')
  })

  test('stores an assignment envelope validated by the control protocol', () => {
    const reg = createWorkerRegistry()
    reg.register({ workerId: 'w1', soulId: 'freeform', endpoint: 'http://x', health: { ready: true } })
    reg.assign('w1', {
      version: 1,
      templateId: 'freeform',
      connectors: [],
      permissions: ['read'],
      gatewayProfileRef: 'env:OPENAI_API_KEY',
    })
    expect(reg.get('w1')?.assignment?.templateId).toBe('freeform')
  })

  test('rejects an assignment that violates the control protocol', () => {
    const reg = createWorkerRegistry()
    reg.register({ workerId: 'w1', soulId: 'freeform', endpoint: 'http://x', health: { ready: true } })
    expect(() => reg.assign('w1', {
      version: 1,
      templateId: '',
      connectors: [],
      permissions: [],
      gatewayProfileRef: 'env:X',
    })).toThrow()
  })

  test('rejects assignment for an unknown worker', () => {
    const reg = createWorkerRegistry()
    expect(() => reg.assign('missing', {
      version: 1,
      templateId: 'freeform',
      connectors: [],
      permissions: [],
      gatewayProfileRef: 'env:X',
    })).toThrow('unknown worker')
  })
})
