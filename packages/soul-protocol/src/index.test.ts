import { describe, expect, test } from 'bun:test'
import { soulProtocolPackage } from './index'

describe('soul-protocol package boundary', () => {
  test('declares descriptor-only v1 sections', () => {
    expect(soulProtocolPackage.descriptor).toBe('dist/soul.descriptor.json')
    expect(soulProtocolPackage.sections).toContain('workbench')
    expect(soulProtocolPackage.sections).not.toContain('exports')
  })
})
