import { describe, expect, it } from 'bun:test'
import { inferToolAction, mapStopReason, normalizeCodexNotification } from './normalize'

describe('normalizeCodexNotification', () => {
  it('turns assistant_message with delta into assistant_message_delta', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'codex/event/assistant_message',
      params: { delta: 'hello' },
    })
    expect(out).toEqual([{ type: 'assistant_message_delta', delta: 'hello' }])
  })

  it('falls back to full text when delta is absent', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'codex/event/assistant_message',
      params: { text: 'done' },
    })
    expect(out).toEqual([{ type: 'assistant_message_delta', delta: 'done' }])
  })

  it('turns thinking into thinking_delta', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'codex/event/thinking',
      params: { delta: 'reasoning...' },
    })
    expect(out).toEqual([{ type: 'thinking_delta', delta: 'reasoning...' }])
  })

  it('turns token_usage into a token_usage event', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'codex/event/token_usage',
      params: { usage: { input_tokens: 5, output_tokens: 3 } },
    })
    expect(out).toEqual([{
      type: 'token_usage',
      usage: { inputTokens: 5, outputTokens: 3 },
    }])
  })

  it('maps tool_call (read) to tool_use with file_read action', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'codex/event/tool_call',
      params: {
        id: 'call_1',
        name: 'read',
        arguments: { path: '/tmp/a.txt' },
        status: 'in_progress',
      },
    })
    expect(out).toEqual([{
      type: 'tool_use',
      id: 'call_1',
      name: 'read',
      arguments: { path: '/tmp/a.txt' },
      action: { kind: 'file_read', path: '/tmp/a.txt' },
      status: 'running',
    }])
  })

  it('maps tool_call (apply_patch) to tool_use with file_edit action + diff', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'codex/event/tool_call',
      params: {
        id: 'call_patch',
        name: 'apply_patch',
        arguments: { path: '/tmp/a.txt', old_string: 'hi', new_string: 'hello' },
      },
    })
    const evt = out[0]!
    expect(evt.type).toBe('tool_use')
    if (evt.type === 'tool_use') {
      expect(evt.action.kind).toBe('file_edit')
      if (evt.action.kind === 'file_edit')
        expect(evt.action.diff).toBe('- hi\n+ hello')
    }
  })

  it('maps tool_call (bash) to command_run action', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'codex/event/tool_call',
      params: {
        id: 'call_b',
        name: 'bash',
        arguments: { command: 'ls -la' },
      },
    })
    const evt = out[0]!
    if (evt.type === 'tool_use' && evt.action.kind === 'command_run')
      expect(evt.action.command).toBe('ls -la')
    else
      throw new Error('expected command_run')
  })

  it('maps tool_result to a paired tool_result event', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'codex/event/tool_result',
      params: { id: 'call_1', content: 'file contents' },
    })
    expect(out).toEqual([{
      type: 'tool_result',
      id: 'call_1',
      name: '',
      content: 'file contents',
    }])
  })

  it('propagates isError on tool_result when set', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'codex/event/tool_result',
      params: { id: 'call_x', content: 'boom', isError: true },
    })
    const evt = out[0]!
    if (evt.type === 'tool_result')
      expect(evt.isError).toBe(true)
  })

  it('emits a finish event on stop with mapped reason', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'codex/event/stop',
      params: { reason: 'stop', usage: { input_tokens: 3, output_tokens: 2 } },
    })
    // Stop emits both a trailing token_usage and a finish
    expect(out).toHaveLength(2)
    expect(out[0]!.type).toBe('token_usage')
    expect(out[1]).toEqual({ type: 'finish', reason: 'stop' })
  })

  it('returns [] for unknown methods (forward-compatible)', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'codex/event/unknown_future_event',
      params: { foo: 'bar' },
    })
    expect(out).toEqual([])
  })

  it('turns error events into AgentEvent error', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'codex/event/error',
      params: { message: 'rate limited' },
    })
    expect(out).toEqual([{ type: 'error', error: 'rate limited' }])
  })

  it('turns current item/agentMessage/delta into assistant_message_delta', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'item/agentMessage/delta',
      params: { delta: 'OK' },
    })
    expect(out).toEqual([{ type: 'assistant_message_delta', delta: 'OK' }])
  })

  it('turns current thread/tokenUsage/updated into token_usage', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'thread/tokenUsage/updated',
      params: {
        tokenUsage: {
          total: { inputTokens: 12, outputTokens: 9 },
        },
      },
    })
    expect(out).toEqual([{
      type: 'token_usage',
      usage: { inputTokens: 12, outputTokens: 9 },
    }])
  })

  it('turns current failed turn/completed into error + finish:error', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: {
        turn: {
          status: 'failed',
          error: { message: 'unsupported model' },
        },
      },
    })
    expect(out).toEqual([
      { type: 'error', error: 'unsupported model' },
      { type: 'finish', reason: 'error' },
    ])
  })

  it('ignores current transient reconnect error notifications', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'error',
      params: {
        error: { message: 'Reconnecting... 2/5' },
      },
    })
    expect(out).toEqual([])
  })

  it('keeps current non-transient error notifications fatal', () => {
    const out = normalizeCodexNotification({
      jsonrpc: '2.0',
      method: 'error',
      params: {
        error: { message: 'network unavailable' },
      },
    })
    expect(out).toEqual([{ type: 'error', error: 'network unavailable' }])
  })
})

describe('mapStopReason', () => {
  it('maps max_tokens to length', () => {
    expect(mapStopReason('max_tokens')).toBe('length')
  })
  it('maps cancelled to cancelled', () => {
    expect(mapStopReason('cancelled')).toBe('cancelled')
  })
  it('maps error to error', () => {
    expect(mapStopReason('error')).toBe('error')
  })
  it('defaults to stop for unknown reasons', () => {
    expect(mapStopReason('')).toBe('stop')
    expect(mapStopReason(undefined)).toBe('stop')
  })
})

describe('inferToolAction', () => {
  it('matches case-insensitively', () => {
    const action = inferToolAction('READ', { path: '/x' })
    expect(action.kind).toBe('file_read')
  })

  it('falls back to kind:tool for unknown names', () => {
    const action = inferToolAction('weird_custom_tool', { k: 1 })
    expect(action.kind).toBe('tool')
    if (action.kind === 'tool')
      expect(action.toolName).toBe('weird_custom_tool')
  })

  it('omits arguments bag when input is empty', () => {
    const action = inferToolAction('weird_custom_tool', {})
    expect(action.kind).toBe('tool')
    if (action.kind === 'tool')
      expect(action.arguments).toBeUndefined()
  })
})
