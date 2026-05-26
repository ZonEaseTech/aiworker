import { describe, expect, test } from 'bun:test'
import { engineBridgePackage } from './index'

describe('engine-bridge package boundary', () => {
  test('declares B+ bridge ownership', () => {
    expect(engineBridgePackage.owns).toContain('adapter-registry')
    expect(engineBridgePackage.owns).toContain('redaction')
  })
})
