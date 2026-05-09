import { describe, expect, it } from 'bun:test'

import { shouldBootstrapDotenv } from './bootstrap'

function argv(...args: string[]): string[] {
  return ['/usr/bin/bun', '/path/to/aiworker.ts', ...args]
}

describe('shouldBootstrapDotenv', () => {
  it('does not bootstrap setup or diagnostic commands', () => {
    for (const args of [
      ['init'],
      ['daemon', 'start'],
      ['daemon', 'status'],
      ['doctor'],
      ['commands'],
      ['executor', 'mcp', 'sync'],
      ['pack', 'list'],
      ['pack', 'show'],
    ])
      expect(shouldBootstrapDotenv(argv(...args))).toBe(false)
  })

  it('bootstraps commands that need worker runtime state', () => {
    for (const args of [
      ['run'],
      ['runs', 'list'],
      ['artifacts', 'list'],
      ['review', 'show'],
      ['lessons', 'promote'],
    ])
      expect(shouldBootstrapDotenv(argv(...args))).toBe(true)
  })
})
