import type { ParsedEngineEvent } from './engine-stream'

import { describe, expect, it } from 'bun:test'

import { createEngineStreamHandler } from './engine-stream'

describe('createEngineStreamHandler claude session capture', () => {
  it('emits external_session_ref from the claude system/init event', () => {
    const events: ParsedEngineEvent[] = []
    const handler = createEngineStreamHandler('claude', event => events.push(event))
    handler.feed(`${JSON.stringify({ model: 'claude-x', session_id: 'claude-sess-1', subtype: 'init', type: 'system' })}\n`)
    handler.flush()
    expect(events).toContainEqual({ ref: { id: 'claude-sess-1', target: 'claude' }, type: 'external_session_ref' })
  })

  it('does not emit external_session_ref for non-init system events (hook noise) or result events', () => {
    const events: ParsedEngineEvent[] = []
    const handler = createEngineStreamHandler('claude', event => events.push(event))
    handler.feed(`${JSON.stringify({ hook_name: 'SessionStart', session_id: 'hook-sess', subtype: 'hook_started', type: 'system' })}\n`)
    handler.feed(`${JSON.stringify({ result: 'ok', session_id: 'result-sess', type: 'result' })}\n`)
    handler.flush()
    expect(events.some(event => event.type === 'external_session_ref')).toBe(false)
  })
})
