import { describe, expect, test } from 'bun:test'

import { createWorkerRegistry } from './index'

describe('host-control worker registry', () => {
  test('registers and lists workers', () => {
    const reg = createWorkerRegistry()
    reg.register({ workerId: 'w1', id: 'aiworker-freeform', endpoint: 'http://127.0.0.1:9217', health: { ready: true } })
    expect(reg.list().map(w => w.workerId)).toEqual(['w1'])
    expect(reg.get('w1')?.id).toBe('aiworker-freeform')
  })

  test('stores an assignment envelope validated by the control protocol', () => {
    const reg = createWorkerRegistry()
    reg.register({ workerId: 'w1', id: 'aiworker-freeform', endpoint: 'http://x', health: { ready: true } })
    reg.assign('w1', {
      version: 1,
      id: 'freeform',
      connectors: [],
      permissions: ['read'],
      gatewayProfileRef: 'env:OPENAI_API_KEY',
    })
    expect(reg.get('w1')?.assignment?.id).toBe('freeform')
  })

  test('rejects an assignment that violates the control protocol', () => {
    const reg = createWorkerRegistry()
    reg.register({ workerId: 'w1', id: 'aiworker-freeform', endpoint: 'http://x', health: { ready: true } })
    expect(() => reg.assign('w1', {
      version: 1,
      id: '',
      connectors: [],
      permissions: [],
      gatewayProfileRef: 'env:X',
    })).toThrow()
  })

  test('rejects an assignment carrying a literal-secret gatewayProfileRef (C6: Host plane never persists a literal key)', () => {
    const reg = createWorkerRegistry()
    reg.register({ workerId: 'w1', id: 'aiworker-freeform', endpoint: 'http://x', health: { ready: true } })
    // Otherwise-valid envelope; the ONLY defect is a literal secret in gatewayProfileRef,
    // so the throw can only come from the control-protocol's reference-shape refine.
    expect(() => reg.assign('w1', {
      version: 1,
      id: 'freeform',
      connectors: [],
      permissions: ['read'],
      gatewayProfileRef: 'sk-proj-LITERALSECRETVALUE0123456789',
    })).toThrow(/gatewayProfileRef|reference|secret/)
    // The rejected literal must not have leaked into the registry.
    expect(reg.get('w1')?.assignment).toBeUndefined()
  })

  test('rejects assignment for an unknown worker', () => {
    const reg = createWorkerRegistry()
    expect(() => reg.assign('missing', {
      version: 1,
      id: 'freeform',
      connectors: [],
      permissions: [],
      gatewayProfileRef: 'env:X',
    })).toThrow('unknown worker')
  })
})
