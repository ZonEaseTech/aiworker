import { describe, expect, test } from 'bun:test'
import { soulWorkbenchPackage } from './index'

describe('soul-workbench package boundary', () => {
  // v1 薄壳：common workbench 归 soul-app-sdk，owns 为空（见 docs/soul-authoring.md）
  test('is a thin shell with no owned modules in v1', () => {
    expect(soulWorkbenchPackage.name).toBe('@zonease/aiworker-soul-workbench')
    expect(soulWorkbenchPackage.owns).toEqual([])
  })
})
