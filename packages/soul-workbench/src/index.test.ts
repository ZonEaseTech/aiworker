import { describe, expect, test } from 'bun:test'

import { soulWorkbenchPackage } from './index'

describe('soul-workbench package boundary', () => {
  // 方案 C: soul-workbench owns the interactive SDK common workbench micro-app
  // (consolidated from soul-app-sdk; see docs/soul-authoring.md).
  test('owns the interactive common workbench micro-app and its modules', () => {
    expect(soulWorkbenchPackage.name).toBe('@zonease/aiworker-soul-workbench')
    expect(soulWorkbenchPackage.owns).toContain('common-workbench-micro-app')
    expect(soulWorkbenchPackage.owns).toContain('chat-surface')
    expect(soulWorkbenchPackage.owns).toContain('mounted-client-helpers')
  })
})
