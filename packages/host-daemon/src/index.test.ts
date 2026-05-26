import { describe, expect, test } from 'bun:test'
import { hostDaemonPackage } from './index'

describe('host-daemon package boundary', () => {
  test('declares local broker route ownership', () => {
    expect(hostDaemonPackage.owns).toContain('local-broker-routes')
  })
})
