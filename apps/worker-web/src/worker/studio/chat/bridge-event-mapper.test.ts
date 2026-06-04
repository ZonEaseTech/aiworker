import type { LocalSessionEvent } from '@zonease/aiworker-soul-descriptor'
import type { TranscriptItemModel } from '@zonease/aiworker-ui/components/transcript-types'

import { describe, expect, it } from 'vitest'

import { buildInvocationTurns } from './bridge-event-mapper'

type TimelineStepItem = Extract<TranscriptItemModel, { kind: 'timeline-step' }>

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

  it('maps tool events into one replacing activity-group row per tool call', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 't1', name: 'bash', phase: 'use' } } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 't1', name: 'bash', phase: 'result', isError: false } } }),
    ])
    const group = turns[0]!.items.find(item => item.kind === 'activity-group')
    expect(group).toBeTruthy()
    expect(group).toMatchObject({ kind: 'activity-group' })
    if (group?.kind === 'activity-group') {
      expect(group.activities).toHaveLength(1)
      expect(group.activities[0]).toMatchObject({ title: 'bash', status: 'succeeded' })
    }
  })

  it('collapses lifecycle and progress observations into replacing state slots', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'status', payloadJson: { bridgeEvent: 'invocation.started' } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'status', payloadJson: { bridgeEvent: 'process.started' } }),
      event({ invocationId: 'inv-1', seq: 3, type: 'status', payloadJson: { bridgeEvent: 'invocation.progress', data: { message: 'Inspecting workspace' } } }),
      event({ invocationId: 'inv-1', seq: 4, type: 'status', payloadJson: { bridgeEvent: 'invocation.progress', data: { message: 'Reading files' } } }),
      event({ invocationId: 'inv-1', seq: 5, type: 'status', payloadJson: { bridgeEvent: 'process.exited' } }),
      event({ invocationId: 'inv-1', seq: 6, type: 'status', payloadJson: { bridgeEvent: 'invocation.completed' } }),
    ])

    const timeline = turns[0]!.items.filter((item): item is TimelineStepItem => item.kind === 'timeline-step')
    expect(timeline).toHaveLength(2)
    expect(timeline).toMatchObject([
      { body: 'Process exited', category: 'lifecycle', provenance: 'engine', status: 'succeeded', title: 'Invocation completed' },
      { body: 'Reading files', category: 'progress', provenance: 'engine', status: 'running', title: 'Progress update' },
    ])
  })

  it('keeps assistant output after the lifecycle state slot instead of bracketing it with lifecycle checklist items', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'status', payloadJson: { bridgeEvent: 'invocation.started' } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'streamed answer' } } }),
      event({ invocationId: 'inv-1', seq: 3, type: 'status', payloadJson: { bridgeEvent: 'invocation.completed' } }),
    ])

    expect(turns[0]!.items.map(item => item.kind)).toEqual([
      'timeline-step',
      'assistant-markdown',
    ])
    expect(turns[0]!.items[0]).toMatchObject({ category: 'lifecycle', kind: 'timeline-step', status: 'succeeded', title: 'Invocation completed' })
    expect(turns[0]!.items[1]).toMatchObject({ kind: 'assistant-markdown', markdown: 'streamed answer' })
  })

  it('does not surface progress data.text because it may contain native thinking content', () => {
    const turns = buildInvocationTurns([
      event({
        invocationId: 'inv-1',
        seq: 1,
        type: 'status',
        payloadJson: {
          bridgeEvent: 'invocation.progress',
          data: { phase: 'thinking', text: 'private reasoning trace' },
        },
      }),
    ])

    expect(JSON.stringify(turns)).not.toContain('private reasoning trace')
    const timeline = turns[0]!.items.filter((item): item is TimelineStepItem => item.kind === 'timeline-step')
    expect(timeline[0]).toMatchObject({ category: 'progress', provenance: 'engine', status: 'running', title: 'Progress update' })
    expect(timeline[0]?.body).toBeUndefined()
  })

  it('collapses process bridge observations into the latest lifecycle state', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'status', payloadJson: { bridgeEvent: 'process.started' } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'status', payloadJson: { bridgeEvent: 'process.exited' } }),
      event({ invocationId: 'inv-1', seq: 3, type: 'status', payloadJson: { bridgeEvent: 'process.lost' } }),
    ])

    const timeline = turns[0]!.items.filter((item): item is TimelineStepItem => item.kind === 'timeline-step')
    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({ category: 'lifecycle', provenance: 'engine', status: 'failed', title: 'Process lost' })
    expect(timeline[0]?.body).toBeUndefined()
  })

  it('avoids duplicate lifecycle title/body while preserving process detail after invocation completion', () => {
    const processOnly = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'status', payloadJson: { bridgeEvent: 'process.exited' } }),
    ])
    const processOnlyTimeline = processOnly[0]!.items.filter((item): item is TimelineStepItem => item.kind === 'timeline-step')
    expect(processOnlyTimeline[0]).toMatchObject({ category: 'lifecycle', status: 'succeeded', title: 'Process exited' })
    expect(processOnlyTimeline[0]?.body).toBeUndefined()

    const completed = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'status', payloadJson: { bridgeEvent: 'process.exited' } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'status', payloadJson: { bridgeEvent: 'invocation.completed' } }),
    ])
    const completedTimeline = completed[0]!.items.filter((item): item is TimelineStepItem => item.kind === 'timeline-step')
    expect(completedTimeline[0]).toMatchObject({ body: 'Process exited', category: 'lifecycle', status: 'succeeded', title: 'Invocation completed' })
  })

  it('collapses tool use/result observations into one activity per tool call', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 't1', name: 'bash', phase: 'use' } } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 't1', name: 'bash', phase: 'result', isError: false } } }),
      event({ invocationId: 'inv-1', seq: 3, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 't2', name: 'read', phase: 'use' } } }),
    ])

    const group = turns[0]!.items.find(item => item.kind === 'activity-group')
    expect(group).toBeTruthy()
    if (group?.kind === 'activity-group') {
      expect(group.summary).toBe('2 tool activities')
      expect(group.activities).toHaveLength(2)
      expect(group.activities[0]).toMatchObject({ status: 'succeeded', title: 'bash' })
      expect(group.activities[1]).toMatchObject({ status: 'running', title: 'read' })
    }
  })

  it('keeps raw tool payloads and secret-like values out of visible tool timeline data', () => {
    const turns = buildInvocationTurns([
      event({
        invocationId: 'inv-1',
        seq: 1,
        type: 'tool',
        payloadJson: {
          bridgeEvent: 'invocation.tool.observed',
          tool: {
            args: { token: 'sk-test-raw-secret', path: '/tmp/private' },
            id: 't1',
            name: 'bash',
            phase: 'use',
          },
        },
      }),
    ])

    expect(JSON.stringify(turns)).not.toContain('sk-test-raw-secret')
    expect(JSON.stringify(turns)).not.toContain('/tmp/private')
  })

  it('maps an error event into a danger status item', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'error', payloadJson: { bridgeEvent: 'invocation.error', error: 'engine exploded' } }),
    ])
    const status = turns[0]!.items.find(item => item.kind === 'status')
    expect(status).toMatchObject({ kind: 'status', tone: 'danger' })
  })
})
