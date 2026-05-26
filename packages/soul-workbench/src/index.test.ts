import { describe, expect, test } from 'bun:test'
import { soulWorkbenchPackage } from './index'

describe('soul-workbench package boundary', () => {
  test('declares common workbench ownership', () => {
    expect(soulWorkbenchPackage.owns).toContain('common-workbench-modules')
    expect(soulWorkbenchPackage.owns).toContain('mounted-workbench-client-helpers')
  })
})
