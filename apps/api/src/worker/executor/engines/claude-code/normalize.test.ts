import type { AgentEvent } from '@aiworker/shared'
import { describe, expect, it } from 'bun:test'

import { inferToolAction, normalizeLine, parseLine, splitNdjson } from './normalize'

describe('splitNdjson', () => {
  it('joins buffered remainder with next chunk', () => {
    const first = splitNdjson('', '{"type":"system"')
    expect(first.lines).toEqual([])
    expect(first.remainder).toBe('{"type":"system"')

    const second = splitNdjson(first.remainder, ',"subtype":"init"}\n{"type":"result"}\n')
    expect(second.lines).toEqual([
      '{"type":"system","subtype":"init"}',
      '{"type":"result"}',
    ])
    expect(second.remainder).toBe('')
  })

  it('strips blank lines', () => {
    const { lines } = splitNdjson('', 'a\n\nb\n')
    expect(lines).toEqual(['a', 'b'])
  })
})

describe('parseLine', () => {
  it('returns null on malformed JSON', () => {
    expect(parseLine('{oops')).toBeNull()
  })
  it('returns null on non-object payload', () => {
    expect(parseLine('"just a string"')).toBeNull()
  })
  it('parses a well-formed line', () => {
    expect(parseLine('{"type":"result","subtype":"success"}')).toEqual({
      type: 'result',
      subtype: 'success',
    })
  })
})

describe('normalizeLine — assistant message with text + tool_use', () => {
  it('emits assistant_message_delta + tool_use with inferred action', () => {
    const events = normalizeLine({
      type: 'assistant',
      session_id: 's',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Reading file now' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'Read',
            input: { file_path: '/tmp/foo.txt' },
          },
        ],
      },
    })
    expect(events[0]).toEqual({ type: 'assistant_message_delta', delta: 'Reading file now' })
    const use = events[1] as Extract<AgentEvent, { type: 'tool_use' }>
    expect(use.type).toBe('tool_use')
    expect(use.id).toBe('toolu_1')
    expect(use.name).toBe('Read')
    expect(use.arguments).toEqual({ file_path: '/tmp/foo.txt' })
    expect(use.action).toEqual({ kind: 'file_read', path: '/tmp/foo.txt' })
  })

  it('emits token_usage when message.usage present', () => {
    const events = normalizeLine({
      type: 'assistant',
      message: {
        usage: { input_tokens: 10, output_tokens: 20 },
        content: [{ type: 'text', text: 'hi' }],
      },
    })
    const usage = events.find(e => e.type === 'token_usage') as Extract<AgentEvent, { type: 'token_usage' }> | undefined
    expect(usage?.usage).toEqual({ inputTokens: 10, outputTokens: 20 })
  })

  it('emits thinking_delta for thinking blocks', () => {
    const events = normalizeLine({
      type: 'assistant',
      message: {
        content: [{ type: 'thinking', thinking: 'deliberating...' }],
      },
    })
    expect(events[0]).toEqual({ type: 'thinking_delta', delta: 'deliberating...' })
  })
})

describe('normalizeLine — tool_result', () => {
  it('maps user tool_result content (string) to tool_result event', () => {
    const events = normalizeLine({
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_1', content: 'hello' },
        ],
      },
    })
    expect(events[0]).toEqual({
      type: 'tool_result',
      id: 'toolu_1',
      name: '',
      content: 'hello',
    })
  })

  it('flattens array content and preserves isError flag', () => {
    const events = normalizeLine({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_2',
            is_error: true,
            content: [
              { type: 'text', text: 'line-1' },
              { type: 'text', text: 'line-2' },
            ],
          },
        ],
      },
    })
    expect(events[0]).toEqual({
      type: 'tool_result',
      id: 'toolu_2',
      name: '',
      content: 'line-1\nline-2',
      isError: true,
    })
  })
})

describe('normalizeLine — result (finish)', () => {
  it('maps success subtype to finish:stop + usage', () => {
    const events = normalizeLine({
      type: 'result',
      subtype: 'success',
      is_error: false,
      usage: { input_tokens: 5, output_tokens: 7 },
    })
    expect(events.find(e => e.type === 'token_usage')).toBeDefined()
    const finish = events.find(e => e.type === 'finish') as Extract<AgentEvent, { type: 'finish' }>
    expect(finish.reason).toBe('stop')
    expect(finish.usage).toEqual({ inputTokens: 5, outputTokens: 7 })
  })

  it('maps error subtype to error + finish:error', () => {
    const events = normalizeLine({
      type: 'result',
      subtype: 'error',
      is_error: true,
      error: 'boom',
    })
    const err = events.find(e => e.type === 'error') as Extract<AgentEvent, { type: 'error' }>
    expect(err.error).toBe('boom')
    const finish = events.find(e => e.type === 'finish') as Extract<AgentEvent, { type: 'finish' }>
    expect(finish.reason).toBe('error')
  })
})

describe('normalizeLine — stream_event (partial)', () => {
  it('surfaces text_delta as assistant_message_delta', () => {
    const events = normalizeLine({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } },
    })
    expect(events).toEqual([{ type: 'assistant_message_delta', delta: 'partial' }])
  })

  it('ignores non-delta stream events', () => {
    const events = normalizeLine({ type: 'stream_event' })
    expect(events).toEqual([])
  })
})

describe('inferToolAction', () => {
  it.each([
    ['Read', { file_path: '/a' }, 'file_read'],
    ['View', { path: '/a' }, 'file_read'],
    ['Edit', { file_path: '/a' }, 'file_edit'],
    ['Write', { file_path: '/a' }, 'file_edit'],
    ['Bash', { command: 'ls' }, 'command_run'],
    ['Grep', { pattern: 'foo' }, 'search'],
    ['WebSearch', { query: 'bar' }, 'search'],
    ['WebFetch', { url: 'https://example.com' }, 'web_fetch'],
    ['TodoWrite', { todos: [1, 2, 3] }, 'task_plan'],
    ['SomeCustomTool', { x: 1 }, 'tool'],
  ] as const)('maps %s → %s', (name, input, kind) => {
    const action = inferToolAction(name, input)
    expect(action.kind).toBe(kind)
  })
})

describe('normalizeLine — unknown types', () => {
  it('ignores system init lines', () => {
    const events = normalizeLine({ type: 'system', subtype: 'init' } as never)
    expect(events).toEqual([])
  })
  it('ignores completely unknown top-level types', () => {
    const events = normalizeLine({ type: 'foo' } as never)
    expect(events).toEqual([])
  })
})
