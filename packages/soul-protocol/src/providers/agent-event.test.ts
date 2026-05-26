import { describe, expect, it } from 'bun:test'

import { agentEventSchema } from './agent-event'

describe('agentEventSchema', () => {
  it('accepts an assistant_message_delta event', () => {
    const parsed = agentEventSchema.parse({ type: 'assistant_message_delta', delta: 'hello' })
    expect(parsed.type).toBe('assistant_message_delta')
  })

  it('accepts a tool_use event with a tool-kind action', () => {
    const parsed = agentEventSchema.parse({
      type: 'tool_use',
      id: 'call_1',
      name: 'get_weather',
      arguments: { location: 'Tokyo' },
      action: { kind: 'tool', toolName: 'get_weather', arguments: { location: 'Tokyo' } },
    })
    expect(parsed.type).toBe('tool_use')
    if (parsed.type === 'tool_use')
      expect(parsed.action.kind).toBe('tool')
  })

  it('accepts a tool_use event with a file_edit action + optional diff', () => {
    const parsed = agentEventSchema.parse({
      type: 'tool_use',
      id: 'call_2',
      name: 'edit',
      arguments: { path: 'src/a.ts' },
      action: { kind: 'file_edit', path: 'src/a.ts', diff: '- old\n+ new' },
      status: 'running',
    })
    expect(parsed.type).toBe('tool_use')
    if (parsed.type === 'tool_use' && parsed.action.kind === 'file_edit')
      expect(parsed.action.diff).toContain('new')
  })

  it('accepts a finish event with optional usage', () => {
    const parsed = agentEventSchema.parse({
      type: 'finish',
      reason: 'stop',
      usage: { inputTokens: 10, outputTokens: 20 },
    })
    expect(parsed.type).toBe('finish')
  })

  it('rejects an unknown event type', () => {
    const res = agentEventSchema.safeParse({ type: 'bogus', delta: 'x' })
    expect(res.success).toBe(false)
  })

  it('rejects a tool_use event missing arguments', () => {
    const res = agentEventSchema.safeParse({
      type: 'tool_use',
      id: 'c',
      name: 'x',
      action: { kind: 'tool', toolName: 'x' },
    })
    expect(res.success).toBe(false)
  })

  it('rejects a tool_use event with an unknown action kind', () => {
    const res = agentEventSchema.safeParse({
      type: 'tool_use',
      id: 'c',
      name: 'x',
      arguments: {},
      action: { kind: 'nope' },
    })
    expect(res.success).toBe(false)
  })
})
