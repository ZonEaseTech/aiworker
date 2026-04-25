import type { AgentEvent } from '@aiworker/shared'
import { describe, expect, it } from 'bun:test'

import { inferToolAction, mapStopReason, normalizeSessionUpdate } from './normalize'

describe('normalizeSessionUpdate — messages', () => {
  it('maps agent_message_chunk to assistant_message_delta', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'hello world' },
    })
    expect(events).toEqual([{ type: 'assistant_message_delta', delta: 'hello world' }])
  })

  it('maps agent_thinking_chunk to thinking_delta', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'agent_thinking_chunk',
      content: { type: 'text', text: 'reasoning...' },
    })
    expect(events).toEqual([{ type: 'thinking_delta', delta: 'reasoning...' }])
  })

  it('drops user_message_chunk (agent echo of user text)', () => {
    expect(normalizeSessionUpdate({
      sessionUpdate: 'user_message_chunk',
      content: { type: 'text', text: 'echo' },
    })).toEqual([])
  })

  it('drops available_commands_update and current_mode_update', () => {
    expect(normalizeSessionUpdate({
      sessionUpdate: 'available_commands_update',
      availableCommands: [{ name: 'web' }],
    })).toEqual([])
    expect(normalizeSessionUpdate({
      sessionUpdate: 'current_mode_update',
      currentModeId: 'default',
    })).toEqual([])
  })

  it('tolerates unknown sessionUpdate kinds', () => {
    expect(normalizeSessionUpdate({ sessionUpdate: 'future_thing', foo: 1 })).toEqual([])
  })
})

describe('normalizeSessionUpdate — tool_call', () => {
  it('emits tool_use with file_edit action for kind=edit', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 'call_1',
      title: 'Edit foo.ts',
      kind: 'edit',
      status: 'in_progress',
      rawInput: { path: '/a.ts', old_string: 'a', new_string: 'b' },
    })
    expect(events).toHaveLength(1)
    const ev = events[0] as Extract<AgentEvent, { type: 'tool_use' }>
    expect(ev.type).toBe('tool_use')
    expect(ev.id).toBe('call_1')
    expect(ev.name).toBe('Edit foo.ts')
    expect(ev.action).toEqual({ kind: 'file_edit', path: '/a.ts', diff: '- a\n+ b' })
    expect(ev.status).toBe('running')
  })

  it('emits tool_use with file_read action for kind=read', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 'call_2',
      kind: 'read',
      rawInput: { file_path: '/x.md' },
    })
    const ev = events[0] as Extract<AgentEvent, { type: 'tool_use' }>
    expect(ev.action).toEqual({ kind: 'file_read', path: '/x.md' })
  })

  it('emits tool_use with command_run action for kind=execute', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 'call_3',
      kind: 'execute',
      rawInput: { command: 'ls -la' },
    })
    const ev = events[0] as Extract<AgentEvent, { type: 'tool_use' }>
    expect(ev.action).toEqual({ kind: 'command_run', command: 'ls -la' })
  })

  it('emits tool_use with search action for kind=search', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 'call_4',
      kind: 'search',
      rawInput: { query: 'foo' },
    })
    const ev = events[0] as Extract<AgentEvent, { type: 'tool_use' }>
    expect(ev.action).toEqual({ kind: 'search', query: 'foo' })
  })

  it('emits tool_use with web_fetch action for kind=fetch', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 'call_5',
      kind: 'fetch',
      rawInput: { url: 'https://example.com' },
    })
    const ev = events[0] as Extract<AgentEvent, { type: 'tool_use' }>
    expect(ev.action).toEqual({ kind: 'web_fetch', url: 'https://example.com' })
  })

  it('falls back to generic tool action when kind is missing', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 'call_6',
      title: 'mystery',
      rawInput: { x: 1 },
    })
    const ev = events[0] as Extract<AgentEvent, { type: 'tool_use' }>
    expect(ev.action.kind).toBe('tool')
  })

  it('also surfaces tool_result when tool_call arrives already completed', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 'call_7',
      kind: 'execute',
      status: 'completed',
      rawInput: { command: 'echo ok' },
      content: [{ type: 'content', content: { type: 'text', text: 'ok' } }],
    })
    expect(events.map(e => e.type)).toEqual(['tool_use', 'tool_result'])
    const result = events[1] as Extract<AgentEvent, { type: 'tool_result' }>
    expect(result.content).toBe('ok')
    expect(result.isError).toBeUndefined()
  })

  it('flags isError when tool_call has terminal status failed', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 'call_8',
      kind: 'execute',
      status: 'failed',
      rawInput: { command: 'x' },
      content: [],
    })
    const result = events.find(e => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    expect(result.isError).toBe(true)
  })
})

describe('normalizeSessionUpdate — tool_call_update', () => {
  it('emits tool_result when a prior tool_call transitions to completed', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_1',
      status: 'completed',
      content: [{ type: 'content', content: { type: 'text', text: 'done' } }],
    })
    expect(events).toEqual([{
      type: 'tool_result',
      id: 'call_1',
      name: '',
      content: 'done',
    }])
  })

  it('emits tool_result with isError=true when status=failed', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_1',
      status: 'failed',
      content: [{ type: 'content', content: { type: 'text', text: 'boom' } }],
    })
    const result = events[0] as Extract<AgentEvent, { type: 'tool_result' }>
    expect(result.isError).toBe(true)
  })

  it('drops non-terminal status updates (in_progress progress spam)', () => {
    expect(normalizeSessionUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_1',
      status: 'in_progress',
      content: [{ type: 'content', content: { type: 'text', text: 'running' } }],
    })).toEqual([])
  })

  it('flattens diff content into a readable patch body', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_1',
      status: 'completed',
      content: [{ type: 'diff', path: '/a.ts', oldText: 'a', newText: 'b' }],
    })
    const result = events[0] as Extract<AgentEvent, { type: 'tool_result' }>
    expect(result.content).toBe('--- /a.ts\n- a\n+ b')
  })
})

describe('normalizeSessionUpdate — plan', () => {
  it('surfaces a plan as a task_plan tool_use', () => {
    const events = normalizeSessionUpdate({
      sessionUpdate: 'plan',
      entries: [
        { content: 'first', priority: 'high', status: 'pending' },
        { content: 'second', priority: 'low', status: 'pending' },
      ],
    })
    expect(events).toHaveLength(1)
    const ev = events[0] as Extract<AgentEvent, { type: 'tool_use' }>
    expect(ev.type).toBe('tool_use')
    expect(ev.name).toBe('plan')
    expect(ev.action.kind).toBe('task_plan')
    if (ev.action.kind === 'task_plan')
      expect(ev.action.summary).toContain('first')
  })

  it('drops an empty plan', () => {
    expect(normalizeSessionUpdate({ sessionUpdate: 'plan', entries: [] })).toEqual([])
  })
})

describe('inferToolAction', () => {
  it.each([
    ['read', { path: '/a' }, 'file_read'],
    ['edit', { file_path: '/a' }, 'file_edit'],
    ['delete', { path: '/a' }, 'file_edit'],
    ['move', { path: '/a' }, 'file_edit'],
    ['execute', { command: 'ls' }, 'command_run'],
    ['search', { query: 'foo' }, 'search'],
    ['fetch', { url: 'https://x' }, 'web_fetch'],
    ['think', { x: 1 }, 'task_plan'],
    ['other', { x: 1 }, 'tool'],
    [undefined, { x: 1 }, 'tool'],
  ] as const)('maps kind=%s → %s', (kind, input, expected) => {
    const action = inferToolAction(kind, 'title', input)
    expect(action.kind).toBe(expected)
  })
})

describe('mapStopReason', () => {
  it.each([
    ['end_turn', 'stop'],
    ['max_tokens', 'length'],
    ['max_turn_requests', 'length'],
    ['refusal', 'error'],
    ['cancelled', 'cancelled'],
    [undefined, 'stop'],
    ['unknown', 'stop'],
  ] as const)('maps %s → %s', (reason, expected) => {
    expect(mapStopReason(reason)).toBe(expected)
  })
})
