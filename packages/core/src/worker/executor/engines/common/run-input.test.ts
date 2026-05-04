import { describe, expect, it } from 'bun:test'

import {
  composeSystemPromptText,
  extractRunMessages,
  renderHistoryAsUserPreamble,
} from './run-input'

describe('extractRunMessages', () => {
  it('separates system, history, and the latest user turn', () => {
    const result = extractRunMessages([
      { role: 'system', content: 'You are worker-A.' },
      { role: 'user', content: 'first request' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'second request' },
    ])
    expect(result.systemText).toBe('You are worker-A.')
    expect(result.history.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(result.history[0]?.content).toBe('first request')
    expect(result.latestUser).toBe('second request')
  })

  it('joins multiple system segments with a separator and skips blanks', () => {
    const result = extractRunMessages([
      { role: 'system', content: 'persona block' },
      { role: 'system', content: '   ' },
      { role: 'system', content: 'memory index' },
      { role: 'user', content: 'hi' },
    ])
    expect(result.systemText).toBe('persona block\n\n---\n\nmemory index')
  })

  it('returns null latestUser when no user content exists', () => {
    const result = extractRunMessages([
      { role: 'system', content: 'persona' },
      { role: 'assistant', content: 'orphan reply' },
    ])
    expect(result.latestUser).toBeNull()
    expect(result.history.map(m => m.role)).toEqual(['assistant'])
  })

  it('skips the latest user turn from history but keeps earlier user turns', () => {
    const result = extractRunMessages([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'now' },
    ])
    expect(result.latestUser).toBe('now')
    expect(result.history.map(m => m.content)).toEqual(['earlier', 'reply'])
  })
})

describe('composeSystemPromptText', () => {
  it('returns empty string when no system messages exist', () => {
    expect(composeSystemPromptText([{ role: 'user', content: 'hi' }])).toBe('')
  })

  it('returns the same joined text as extractRunMessages', () => {
    const messages = [
      { role: 'system' as const, content: 'alpha' },
      { role: 'system' as const, content: 'beta' },
      { role: 'user' as const, content: 'q' },
    ]
    expect(composeSystemPromptText(messages)).toBe('alpha\n\n---\n\nbeta')
  })
})

describe('renderHistoryAsUserPreamble', () => {
  it('returns empty string for empty history', () => {
    expect(renderHistoryAsUserPreamble([])).toBe('')
  })

  it('renders user / assistant turns with a labelled preamble', () => {
    const text = renderHistoryAsUserPreamble([
      { role: 'user', content: 'why?' },
      { role: 'assistant', content: 'because' },
    ])
    expect(text).toContain('Recent conversation:')
    expect(text).toContain('- user: why?')
    expect(text).toContain('- assistant: because')
  })

  it('truncates long entries with ellipsis marker', () => {
    const long = 'x'.repeat(2_500)
    const text = renderHistoryAsUserPreamble([{ role: 'user', content: long }])
    expect(text).toContain('… (truncated)')
    expect(text.length).toBeLessThan(long.length + 100)
  })

  it('keeps only the newest 20 entries', () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      role: 'user' as const,
      content: `m${i}`,
    }))
    const text = renderHistoryAsUserPreamble(messages)
    expect(text).not.toContain('- user: m0')
    expect(text).toContain('- user: m24')
    expect(text).toContain('- user: m5')
  })
})
