import type { ToolPolicy } from '@zonease/aiworker-shared'

import { describe, expect, it } from 'bun:test'
import { evaluateToolPolicy, matchToolPattern } from './policy'

describe('matchToolPattern', () => {
  it('returns true for `*` against any non-empty name', () => {
    expect(matchToolPattern('*', 'Read')).toBe(true)
    expect(matchToolPattern('*', 'fs.write')).toBe(true)
  })

  it('matches literal patterns exactly', () => {
    expect(matchToolPattern('Read', 'Read')).toBe(true)
    expect(matchToolPattern('Read', 'Reader')).toBe(false)
    expect(matchToolPattern('Read', 'read')).toBe(false)
  })

  it('handles prefix wildcard `fs.*`', () => {
    expect(matchToolPattern('fs.*', 'fs.read')).toBe(true)
    expect(matchToolPattern('fs.*', 'fs.write.lock')).toBe(true)
    expect(matchToolPattern('fs.*', 'net.read')).toBe(false)
  })

  it('handles suffix wildcard `*.read`', () => {
    expect(matchToolPattern('*.read', 'fs.read')).toBe(true)
    expect(matchToolPattern('*.read', 'net.read')).toBe(true)
    expect(matchToolPattern('*.read', 'read')).toBe(false)
  })

  it('escapes regex specials in literal segments', () => {
    expect(matchToolPattern('a.b', 'a.b')).toBe(true)
    // `.` is regex any-char, but pattern should be escaped:
    expect(matchToolPattern('a.b', 'aXb')).toBe(false)
  })

  it('returns false on empty pattern', () => {
    expect(matchToolPattern('', 'Read')).toBe(false)
  })
})

describe('evaluateToolPolicy', () => {
  it('returns auto when policy is undefined (back-compat)', () => {
    expect(evaluateToolPolicy('Read', undefined)).toBe('auto')
  })

  it('falls back to default when no rule matches', () => {
    const policy: ToolPolicy = { default: 'ask', rules: [{ pattern: 'fs.*', action: 'auto' }] }
    expect(evaluateToolPolicy('net.fetch', policy)).toBe('ask')
  })

  it('returns the first matching rule action', () => {
    const policy: ToolPolicy = {
      default: 'auto',
      rules: [
        { pattern: 'fs.write', action: 'deny' },
        { pattern: 'fs.*', action: 'ask' },
      ],
    }
    expect(evaluateToolPolicy('fs.write', policy)).toBe('deny')
    expect(evaluateToolPolicy('fs.read', policy)).toBe('ask')
    expect(evaluateToolPolicy('net.fetch', policy)).toBe('auto')
  })

  it('returns default when rules array is empty', () => {
    expect(evaluateToolPolicy('Read', { default: 'deny', rules: [] })).toBe('deny')
  })
})
