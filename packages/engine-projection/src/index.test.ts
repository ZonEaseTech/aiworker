import { describe, expect, test } from 'bun:test'
import { engineProjectionPackage } from './index'

describe('engine-projection package boundary', () => {
  test('declares projection receipt ownership', () => {
    expect(engineProjectionPackage.owns).toContain('native-mcp-files')
    expect(engineProjectionPackage.owns).toContain('projection-receipts')
  })
})
