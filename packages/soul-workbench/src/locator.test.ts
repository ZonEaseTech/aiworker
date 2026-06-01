import { describe, expect, test } from 'bun:test'

import { readWorkbenchLocator } from './locator'

describe('workbench locator', () => {
  test('reads worker/workspace/session ids from a router-mode=search query string', () => {
    expect(readWorkbenchLocator('?workerId=w1&workspaceId=ws1&sessionId=s1')).toEqual({
      sessionId: 's1',
      workerId: 'w1',
      workspaceId: 'ws1',
    })
  })

  test('returns nulls for absent params (no session selected yet)', () => {
    expect(readWorkbenchLocator('')).toEqual({
      sessionId: null,
      workerId: null,
      workspaceId: null,
    })
  })
})
