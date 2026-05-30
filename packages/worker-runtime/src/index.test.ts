import { describe, expect, test } from 'bun:test'
import { hostRuntimePackage } from './index'

describe('host-runtime package boundary', () => {
  test('declares locator and orchestration ownership', () => {
    expect(hostRuntimePackage.owns).toContain('session-lifecycle')
    expect(hostRuntimePackage.owns).toContain('engine-invocation-orchestration')
  })
})
