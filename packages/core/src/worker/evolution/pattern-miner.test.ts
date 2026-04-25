import { describe, expect, it } from 'bun:test'

import { DEFAULT_MINER_OPTIONS, mineToolPatterns } from './pattern-miner'

describe('mineToolPatterns', () => {
  it('returns an empty array for empty input', () => {
    expect(mineToolPatterns(new Map())).toEqual([])
  })

  it('mines a shared 3-tool sequence across two conversations', () => {
    const logs = new Map<string, string[]>([
      ['conv-a', ['search', 'read', 'write']],
      ['conv-b', ['search', 'read', 'write']],
    ])
    const patterns = mineToolPatterns(logs, {
      ...DEFAULT_MINER_OPTIONS,
      minOccurrences: 2,
      minConversations: 2,
      windowSize: 10,
    })
    const triple = patterns.find(p => p.toolSequence.join('|') === 'search|read|write')
    expect(triple).toBeDefined()
    expect(triple?.occurrences).toBe(2)
    expect(triple?.uniqueConversations).toBe(2)
    expect(triple?.confidence).toBeCloseTo(0.2, 5)
  })

  it('drops a 2-gram shadowed by a passing 3-gram (prefix dedup)', () => {
    const logs = new Map<string, string[]>([
      ['conv-a', ['search', 'read', 'write']],
      ['conv-b', ['search', 'read', 'write']],
    ])
    const patterns = mineToolPatterns(logs, {
      ...DEFAULT_MINER_OPTIONS,
      minOccurrences: 2,
      minConversations: 2,
      windowSize: 10,
    })
    const keys = patterns.map(p => p.toolSequence.join('|'))
    expect(keys).toContain('search|read|write')
    expect(keys).not.toContain('search|read')
  })

  it('drops sub-threshold sequences', () => {
    const logs = new Map<string, string[]>([
      ['conv-a', ['search', 'read']],
      ['conv-b', ['search', 'write']],
    ])
    const patterns = mineToolPatterns(logs, {
      ...DEFAULT_MINER_OPTIONS,
      minOccurrences: 2,
      minConversations: 2,
      windowSize: 10,
    })
    expect(patterns).toEqual([])
  })

  it('sorts patterns with more occurrences first', () => {
    const logs = new Map<string, string[]>([
      ['conv-a', ['alpha', 'beta', 'alpha', 'beta']],
      ['conv-b', ['alpha', 'beta', 'gamma', 'delta']],
      ['conv-c', ['alpha', 'beta', 'gamma', 'delta']],
    ])
    const patterns = mineToolPatterns(logs, {
      nGramMin: 2,
      nGramMax: 2,
      minOccurrences: 2,
      minConversations: 2,
      windowSize: 10,
    })
    expect(patterns.length).toBeGreaterThanOrEqual(2)
    const [first, second] = patterns
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(first!.occurrences).toBeGreaterThanOrEqual(second!.occurrences)
    expect(first!.toolSequence.join('|')).toBe('alpha|beta')
  })
})
