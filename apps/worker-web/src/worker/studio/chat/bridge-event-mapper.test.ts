import type { LocalSessionEvent } from '@zonease/aiworker-soul-protocol'

import { describe, expect, it } from 'vitest'

import { buildInvocationTurns } from './bridge-event-mapper'

function event(partial: Partial<LocalSessionEvent> & Pick<LocalSessionEvent, 'invocationId' | 'seq' | 'type' | 'payloadJson'>): LocalSessionEvent {
  return {
    id: partial.id ?? partial.seq,
    sessionId: partial.sessionId ?? 'session-1',
    createdAt: partial.createdAt ?? '2026-06-01T00:00:00.000Z',
    ...partial,
  }
}

describe('buildInvocationTurns', () => {
  it('returns no turns for an empty event list', () => {
    expect(buildInvocationTurns([])).toEqual([])
  })

  it('groups events into one turn per invocation, preserving first-seen order', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-a', seq: 1, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'A' } } }),
      event({ invocationId: 'inv-b', seq: 2, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'B' } } }),
    ])
    expect(turns.map(turn => turn.id)).toEqual(['inv-a', 'inv-b'])
  })

  it('accumulates assistant_delta text into a single assistant-markdown item per turn', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'Hello, ' } } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'world.' } } }),
    ])
    expect(turns).toHaveLength(1)
    const assistant = turns[0]!.items.find(item => item.kind === 'assistant-markdown')
    expect(assistant).toMatchObject({ kind: 'assistant-markdown', markdown: 'Hello, world.' })
  })

  it('maps tool events into an activity-group item titled by tool name', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 't1', name: 'bash', phase: 'use' } } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 't1', name: 'bash', phase: 'result', isError: false } } }),
    ])
    const group = turns[0]!.items.find(item => item.kind === 'activity-group')
    expect(group).toBeTruthy()
    expect(group).toMatchObject({ kind: 'activity-group' })
    if (group?.kind === 'activity-group') {
      expect(group.activities).toHaveLength(2)
      expect(group.activities[0]).toMatchObject({ title: 'bash', status: 'running' })
      expect(group.activities[1]).toMatchObject({ title: 'bash', status: 'succeeded' })
    }
  })

  it('maps an error event into a danger status item', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'error', payloadJson: { bridgeEvent: 'invocation.error', error: 'engine exploded' } }),
    ])
    const status = turns[0]!.items.find(item => item.kind === 'status')
    expect(status).toMatchObject({ kind: 'status', tone: 'danger' })
  })
})
