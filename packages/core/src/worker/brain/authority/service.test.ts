import { describe, expect, it } from 'bun:test'
import { detectAuthorityPreflight, operatorAuthorityMode } from './service'

describe('authority preflight (PLAN-179)', () => {
  it('labels unmanaged native executors as ambient authority', () => {
    expect(operatorAuthorityMode('unmanaged_ambient')).toBe('ambient')
    const result = detectAuthorityPreflight({
      authorityMode: 'unmanaged_ambient',
      text: 'delete rows from the production database',
    })

    expect(result.risk).toBe('high')
    expect(result.operatorMode).toBe('ambient')
    expect(result.enforceable).toBe(false)
    expect(result.recommendation).toBe('prefer-plan-only')
    expect(result.signals.map(signal => signal.type)).toEqual(['production', 'database', 'destructive'])
    expect(result.warning).toContain('cannot guarantee')
  })

  it('keeps low-risk tasks quiet', () => {
    const result = detectAuthorityPreflight({
      authorityMode: 'provider_managed',
      text: 'summarize the README',
    })

    expect(result.risk).toBe('low')
    expect(result.signals).toEqual([])
    expect(result.recommendation).toBe('continue')
  })
})
