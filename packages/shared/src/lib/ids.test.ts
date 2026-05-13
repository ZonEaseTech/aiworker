import { describe, expect, it } from 'bun:test'

import { mintWorkerId, slugify, WORKER_ID_PATTERN } from './ids'

describe('worker id utilities', () => {
  it('mints Host-local worker ids with the expected prefix and alphabet', () => {
    const seen = new Set<string>()

    for (let i = 0; i < 100; i += 1) {
      const id = mintWorkerId()
      expect(id).toMatch(WORKER_ID_PATTERN)
      seen.add(id)
    }

    expect(seen.size).toBe(100)
  })

  it('slugifies names for local URL and id fragments', () => {
    expect(slugify('HR People Profile!')).toBe('hr-people-profile')
    expect(slugify('  QA___Release   Gate  ')).toBe('qa___release-gate')
  })
})
