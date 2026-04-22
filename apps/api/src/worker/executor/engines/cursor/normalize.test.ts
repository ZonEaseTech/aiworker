import { describe, expect, it } from 'bun:test'
import {
  extractSessionId,
  inferToolAction,
  mapStopReason,
  normalizeCursorLine,
  parseCursorLine,
  splitNdjson,
} from './normalize'

describe('normalizeCursorLine', () => {
  it('returns [] for system lines (no AgentEvent projection)', () => {
    expect(normalizeCursorLine({ type: 'system', session_id: 'sess_1' })).toEqual([])
  })

  it('maps assistant_message delta to assistant_message_delta', () => {
    const out = normalizeCursorLine({ type: 'assistant_message', delta: 'hello' })
    expect(out).toEqual([{ type: 'assistant_message_delta', delta: 'hello' }])
  })

  it('falls back to full text when delta is absent', () => {
    const out = normalizeCursorLine({ type: 'assistant_message', text: 'done' })
    expect(out).toEqual([{ type: 'assistant_message_delta', delta: 'done' }])
  })

  it('maps thinking to thinking_delta', () => {
    expect(normalizeCursorLine({ type: 'thinking', delta: 'planning' }))
      .toEqual([{ type: 'thinking_delta', delta: 'planning' }])
  })

  it('maps tool_use (read_file) to tool_use with file_read action', () => {
    const out = normalizeCursorLine({
      type: 'tool_use',
      id: 'call_r',
      name: 'read_file',
      input: { path: '/x.txt' },
      status: 'completed',
    })
    expect(out).toEqual([{
      type: 'tool_use',
      id: 'call_r',
      name: 'read_file',
      arguments: { path: '/x.txt' },
      action: { kind: 'file_read', path: '/x.txt' },
      status: 'success',
    }])
  })

  it('maps tool_use (edit_file) to file_edit with diff', () => {
    const out = normalizeCursorLine({
      type: 'tool_use',
      id: 'call_e',
      name: 'edit_file',
      input: { path: '/x.txt', old_string: 'hi', new_string: 'hello' },
    })
    const evt = out[0]!
    if (evt.type === 'tool_use' && evt.action.kind === 'file_edit')
      expect(evt.action.diff).toBe('- hi\n+ hello')
    else
      throw new Error('expected file_edit')
  })

  it('maps tool_use (run_terminal_cmd) to command_run action', () => {
    const out = normalizeCursorLine({
      type: 'tool_use',
      id: 'call_c',
      name: 'run_terminal_cmd',
      input: { command: 'bun test' },
    })
    const evt = out[0]!
    if (evt.type === 'tool_use' && evt.action.kind === 'command_run')
      expect(evt.action.command).toBe('bun test')
    else
      throw new Error('expected command_run')
  })

  it('maps tool_result with both isError and is_error aliases', () => {
    const normal = normalizeCursorLine({
      type: 'tool_result',
      id: 'call_r',
      content: 'ok',
    })
    expect(normal).toEqual([{
      type: 'tool_result',
      id: 'call_r',
      name: '',
      content: 'ok',
    }])
    const errored = normalizeCursorLine({
      type: 'tool_result',
      id: 'call_r',
      content: 'boom',
      is_error: true,
    })
    const evt = errored[0]!
    if (evt.type === 'tool_result')
      expect(evt.isError).toBe(true)
  })

  it('turns token_usage into a token_usage event', () => {
    expect(normalizeCursorLine({ type: 'token_usage', usage: { input_tokens: 4, output_tokens: 2 } }))
      .toEqual([{ type: 'token_usage', usage: { inputTokens: 4, outputTokens: 2 } }])
  })

  it('turns stop into finish:stop (+ trailing token_usage when provided)', () => {
    const out = normalizeCursorLine({
      type: 'stop',
      reason: 'stop',
      usage: { input_tokens: 3, output_tokens: 1 },
    })
    expect(out).toHaveLength(2)
    expect(out[0]!.type).toBe('token_usage')
    expect(out[1]).toEqual({ type: 'finish', reason: 'stop' })
  })

  it('treats `end` as `stop`', () => {
    const out = normalizeCursorLine({ type: 'end', reason: 'stop' })
    expect(out[0]).toEqual({ type: 'finish', reason: 'stop' })
  })

  it('turns error lines into AgentEvent error', () => {
    expect(normalizeCursorLine({ type: 'error', message: 'failed' } as unknown as Parameters<typeof normalizeCursorLine>[0]))
      .toEqual([{ type: 'error', error: 'failed' }])
  })

  it('ignores unknown type values (forward-compatible)', () => {
    expect(normalizeCursorLine({ type: 'future_thing', foo: 1 })).toEqual([])
  })
})

describe('mapStopReason', () => {
  it('maps length', () => {
    expect(mapStopReason('length')).toBe('length')
  })
  it('maps cancelled', () => {
    expect(mapStopReason('cancelled')).toBe('cancelled')
  })
  it('defaults to stop', () => {
    expect(mapStopReason(undefined)).toBe('stop')
    expect(mapStopReason('end_turn')).toBe('stop')
  })
})

describe('extractSessionId', () => {
  it('reads session_id from system lines', () => {
    expect(extractSessionId({ type: 'system', session_id: 'sess_1' })).toBe('sess_1')
  })
  it('reads session_id from stop lines', () => {
    expect(extractSessionId({ type: 'stop', reason: 'stop', session_id: 'sess_2' })).toBe('sess_2')
  })
  it('returns empty string when missing', () => {
    expect(extractSessionId({ type: 'assistant_message', delta: 'hi' })).toBe('')
  })
})

describe('parseCursorLine / splitNdjson', () => {
  it('parses typed ndjson lines', () => {
    const p = parseCursorLine('{"type":"assistant_message","delta":"hi"}')
    expect(p?.type).toBe('assistant_message')
  })
  it('returns null on malformed JSON', () => {
    expect(parseCursorLine('not json')).toBeNull()
  })
  it('splits chunks respecting trailing remainder', () => {
    const first = splitNdjson('', '{"a":1}\n{"b":')
    expect(first.lines).toEqual(['{"a":1}'])
    expect(first.remainder).toBe('{"b":')
  })
})

describe('inferToolAction', () => {
  it('matches case-insensitively', () => {
    expect(inferToolAction('READ_FILE', { path: '/x' }).kind).toBe('file_read')
  })

  it('falls back to kind:tool for unknown names', () => {
    const action = inferToolAction('mystery', { a: 1 })
    expect(action.kind).toBe('tool')
  })

  it('treats grep/codebase_search as search', () => {
    const action = inferToolAction('codebase_search', { query: 'foo' })
    if (action.kind === 'search')
      expect(action.query).toBe('foo')
    else
      throw new Error('expected search')
  })
})
