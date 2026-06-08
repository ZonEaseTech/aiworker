import { describe, expect, test } from 'bun:test'
import { workerRuntimePackage } from './index'

describe('host-runtime package boundary', () => {
  test('declares locator and orchestration ownership', () => {
    expect(workerRuntimePackage.owns).toContain('session-lifecycle')
    expect(workerRuntimePackage.owns).toContain('engine-invocation-orchestration')
  })
})
