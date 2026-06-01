import { describe, expect, it } from 'bun:test'

import { summarizeProjectionReceipt } from './lifecycle-mapper'

describe('summarizeProjectionReceipt', () => {
  it('summarizes a found projection receipt', () => {
    expect(summarizeProjectionReceipt({ receiptId: 'ws-1', status: 'found', workspaceId: 'ws-1' })).toEqual({
      receiptId: 'ws-1',
      status: 'found',
    })
  })

  it('passes through not_found / stale receipt statuses', () => {
    expect(summarizeProjectionReceipt({ receiptId: 'ws-1', status: 'not_found' })).toEqual({ receiptId: 'ws-1', status: 'not_found' })
    expect(summarizeProjectionReceipt({ receiptId: 'ws-1', status: 'stale' })).toEqual({ receiptId: 'ws-1', status: 'stale' })
  })

  it('defaults a missing status to "unknown"', () => {
    expect(summarizeProjectionReceipt({ receiptId: 'ws-1' })).toEqual({ receiptId: 'ws-1', status: 'unknown' })
  })
})
