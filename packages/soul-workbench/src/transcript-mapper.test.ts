import { describe, expect, it } from 'bun:test'

import { bridgeEventsToTranscriptTurns } from './transcript-mapper'

describe('bridgeEventsToTranscriptTurns', () => {
  it('accumulates output.delta text into one assistant-markdown item per invocation', () => {
    const turns = bridgeEventsToTranscriptTurns([
      { data: { text: 'Hello' }, id: 1, invocationId: 'inv-1', type: 'invocation.output.delta' },
      { data: { text: ', world.' }, id: 2, invocationId: 'inv-1', type: 'invocation.output.delta' },
    ])
    expect(turns).toEqual([{
      id: 'inv-1',
      items: [{ id: 'inv-1:assistant', kind: 'assistant-markdown', markdown: 'Hello, world.' }],
    }])
  })

  it('maps tool.observed phases into an activity-group (use→running, result→succeeded/failed)', () => {
    const turns = bridgeEventsToTranscriptTurns([
      { id: 1, invocationId: 'inv-1', tool: { name: 'read', phase: 'use' }, type: 'invocation.tool.observed' },
      { id: 2, invocationId: 'inv-1', tool: { name: 'read', phase: 'result' }, type: 'invocation.tool.observed' },
      { id: 3, invocationId: 'inv-1', tool: { isError: true, name: 'write', phase: 'result' }, type: 'invocation.tool.observed' },
    ])
    expect(turns[0]!.items).toEqual([{
      activities: [
        { id: 'inv-1:tool:0', status: 'running', title: 'read' },
        { id: 'inv-1:tool:1', status: 'succeeded', title: 'read' },
        { id: 'inv-1:tool:2', status: 'failed', title: 'write' },
      ],
      id: 'inv-1:tools',
      kind: 'activity-group',
      summary: '3 tool activities',
    }])
  })

  it('maps invocation.error (daemon message + failureCode) into a danger status item', () => {
    const turns = bridgeEventsToTranscriptTurns([
      { failureCode: 'ENGINE_SESSION_REF_MISSING', id: 7, invocationId: 'inv-9', message: 'Engine session ref missing.', type: 'invocation.error' },
    ])
    expect(turns[0]!.items).toEqual([{
      body: 'Engine session ref missing.',
      id: 'inv-9:error:7',
      kind: 'status',
      tone: 'danger',
    }])
  })

  it('falls back to failureCode when an error event carries no message', () => {
    const turns = bridgeEventsToTranscriptTurns([
      { failureCode: 'ENGINE_PROCESS_LOST', id: 3, invocationId: 'inv-2', type: 'invocation.error' },
    ])
    expect(turns[0]!.items).toEqual([{
      body: 'ENGINE_PROCESS_LOST',
      id: 'inv-2:error:3',
      kind: 'status',
      tone: 'danger',
    }])
  })

  it('groups by invocation in first-seen order and sorts each turn by event id', () => {
    const turns = bridgeEventsToTranscriptTurns([
      { data: { text: 'b' }, id: 2, invocationId: 'inv-1', type: 'invocation.output.delta' },
      { data: { text: 'x' }, id: 5, invocationId: 'inv-2', type: 'invocation.output.delta' },
      { data: { text: 'a' }, id: 1, invocationId: 'inv-1', type: 'invocation.output.delta' },
    ])
    expect(turns.map(turn => turn.id)).toEqual(['inv-1', 'inv-2'])
    expect(turns[0]!.items).toEqual([{ id: 'inv-1:assistant', kind: 'assistant-markdown', markdown: 'ab' }])
  })

  it('ignores non-rendered bridge events (progress/usage/started/completed)', () => {
    const turns = bridgeEventsToTranscriptTurns([
      { id: 1, invocationId: 'inv-1', type: 'invocation.started' },
      { id: 2, invocationId: 'inv-1', type: 'invocation.progress' },
      { id: 3, invocationId: 'inv-1', type: 'invocation.usage.observed', usage: { inputTokens: 3 } },
      { id: 4, invocationId: 'inv-1', type: 'invocation.completed' },
    ])
    expect(turns).toEqual([{ id: 'inv-1', items: [] }])
  })
})
