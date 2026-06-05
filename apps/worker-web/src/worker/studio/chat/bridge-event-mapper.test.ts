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

  it('splits assistant text around tool activity to preserve native event order', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: '先说明。' } } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 'tool-1', input: { command: 'sed missing-skill' }, name: 'Bash', phase: 'use' } } }),
      event({ invocationId: 'inv-1', seq: 3, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { content: 'No such file', id: 'tool-1', isError: true, name: null, phase: 'result' } } }),
      event({ invocationId: 'inv-1', seq: 4, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: '文件路径没有读到。' } } }),
    ])

    expect(turns[0]!.items.map(item => item.kind)).toEqual([
      'assistant-markdown',
      'activity-group',
      'assistant-markdown',
    ])
    expect(turns[0]!.items[0]).toMatchObject({ kind: 'assistant-markdown', markdown: '先说明。' })
    expect(turns[0]!.items[1]).toMatchObject({ kind: 'activity-group', summary: 'Failed Bash: sed missing-skill' })
    expect(turns[0]!.items[2]).toMatchObject({ kind: 'assistant-markdown', markdown: '文件路径没有读到。' })
  })

  it('creates a new tool group when another tool call happens after assistant continuation', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: '第一段。' } } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 'tool-1', input: { command: 'sed missing-skill' }, name: 'Bash', phase: 'use' } } }),
      event({ invocationId: 'inv-1', seq: 3, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { content: 'No such file', id: 'tool-1', isError: true, name: null, phase: 'result' } } }),
      event({ invocationId: 'inv-1', seq: 4, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: '第二段。' } } }),
      event({ invocationId: 'inv-1', seq: 5, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 'tool-2', input: { command: 'sed superpowers' }, name: 'Bash', phase: 'use' } } }),
      event({ invocationId: 'inv-1', seq: 6, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { content: '---\\nname: using-superpowers', id: 'tool-2', isError: false, name: null, phase: 'result' } } }),
      event({ invocationId: 'inv-1', seq: 7, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: '第三段。' } } }),
    ])

    expect(turns[0]!.items.map(item => item.kind)).toEqual([
      'assistant-markdown',
      'activity-group',
      'assistant-markdown',
      'activity-group',
      'assistant-markdown',
    ])
    expect(turns[0]!.items[0]).toMatchObject({ kind: 'assistant-markdown', markdown: '第一段。' })
    expect(turns[0]!.items[1]).toMatchObject({ kind: 'activity-group', summary: 'Failed Bash: sed missing-skill' })
    expect(turns[0]!.items[2]).toMatchObject({ kind: 'assistant-markdown', markdown: '第二段。' })
    expect(turns[0]!.items[3]).toMatchObject({ kind: 'activity-group', summary: 'Ran Bash: sed superpowers' })
    expect(turns[0]!.items[4]).toMatchObject({ kind: 'assistant-markdown', markdown: '第三段。' })
  })

  it('maps tool use/result into one readable activity row without losing the command context', () => {
    const turns = buildInvocationTurns([
      event({
        invocationId: 'inv-1',
        seq: 1,
        type: 'tool',
        payloadJson: {
          bridgeEvent: 'invocation.tool.observed',
          tool: { id: 't1', input: { command: 'printf bridge' }, name: 'Bash', phase: 'use' },
        },
      }),
      event({
        invocationId: 'inv-1',
        seq: 2,
        type: 'tool',
        payloadJson: {
          bridgeEvent: 'invocation.tool.observed',
          tool: { content: 'bridge', id: 't1', isError: false, name: null, phase: 'result' },
        },
      }),
    ])
    const group = turns[0]!.items.find(item => item.kind === 'activity-group')
    expect(group).toBeTruthy()
    expect(group).toMatchObject({ kind: 'activity-group' })
    if (group?.kind === 'activity-group') {
      expect(group.summary).toBe('Ran Bash: printf bridge')
      expect(group.activities).toHaveLength(1)
      expect(group.activities[0]).toMatchObject({
        command: {
          command: 'printf bridge',
          output: 'bridge',
          status: 'succeeded',
          title: 'Bash',
        },
        status: 'succeeded',
        title: 'Bash',
      })
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
      { category: 'progress', provenance: 'engine', status: 'running', title: 'Reading files' },
    ])
    expect(timeline[1]?.body).toBeUndefined()
  })

  it('maps daemon status-only lifecycle events into the replacing lifecycle slot', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'status', payloadJson: { invocationId: 'inv-1', status: 'running' } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'status', payloadJson: { invocationId: 'inv-1', status: 'succeeded' } }),
    ])

    const timeline = turns[0]!.items.filter((item): item is TimelineStepItem => item.kind === 'timeline-step')
    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({ category: 'lifecycle', provenance: 'engine', status: 'succeeded', title: 'Invocation completed' })
  })

  it('removes successful lifecycle chrome once assistant output exists', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'status', payloadJson: { bridgeEvent: 'invocation.started' } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'status', payloadJson: { bridgeEvent: 'invocation.progress', data: { message: 'Reading files' } } }),
      event({ invocationId: 'inv-1', seq: 3, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'streamed answer' } } }),
      event({ invocationId: 'inv-1', seq: 4, type: 'status', payloadJson: { bridgeEvent: 'invocation.completed' } }),
    ])

    expect(turns[0]!.items.map(item => item.kind)).toEqual(['assistant-markdown'])
    expect(turns[0]!.items[0]).toMatchObject({ kind: 'assistant-markdown', markdown: 'streamed answer' })
    expect(JSON.stringify(turns)).not.toContain('Invocation completed')
    expect(JSON.stringify(turns)).not.toContain('Progress update')
    expect(JSON.stringify(turns)).not.toContain('Reading files')
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
    expect(timeline[0]).toMatchObject({ category: 'progress', provenance: 'engine', status: 'running', title: 'Working' })
    expect(timeline[0]?.body).toBeUndefined()
  })

  it('drops duplicate running lifecycle chrome once a clearer progress or tool row exists', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'status', payloadJson: { bridgeEvent: 'invocation.started' } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'status', payloadJson: { bridgeEvent: 'invocation.progress', data: { message: 'Reading files' } } }),
      event({ invocationId: 'inv-1', seq: 3, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 't1', input: { command: 'printf bridge' }, name: 'Bash', phase: 'use' } } }),
    ])

    expect(JSON.stringify(turns)).not.toContain('Invocation started')
    expect(turns[0]!.items.map(item => item.kind)).toEqual(['timeline-step', 'activity-group'])
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
      expect(group.summary).toBe('Ran bash + 1 more')
      expect(group.activities).toHaveLength(2)
      expect(group.activities[0]).toMatchObject({ status: 'succeeded', title: 'bash' })
      expect(group.activities[1]).toMatchObject({ status: 'running', title: 'read' })
    }
  })

  it('keeps readable tool activity while removing generic completed progress chrome', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'status', payloadJson: { bridgeEvent: 'invocation.started' } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'status', payloadJson: { bridgeEvent: 'invocation.progress', data: { message: 'initializing' } } }),
      event({ invocationId: 'inv-1', seq: 3, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 'tool-1', input: { command: 'printf bridge' }, name: 'Bash', phase: 'use' } } }),
      event({ invocationId: 'inv-1', seq: 4, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { content: 'bridge', id: 'tool-1', isError: false, name: null, phase: 'result' } } }),
      event({ invocationId: 'inv-1', seq: 5, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'Done.' } } }),
      event({ invocationId: 'inv-1', seq: 6, type: 'status', payloadJson: { bridgeEvent: 'invocation.completed', detail: 'text response' } }),
    ])

    expect(turns[0]!.items.map(item => item.kind)).toEqual(['activity-group', 'assistant-markdown'])
    expect(JSON.stringify(turns)).toContain('Ran Bash: printf bridge')
    expect(JSON.stringify(turns)).not.toContain('Progress update')
    expect(JSON.stringify(turns)).not.toContain('Invocation completed')
    expect(JSON.stringify(turns)).not.toContain('1 tool activity')
  })

  it('removes running progress once assistant text is visible even before the terminal tail arrives', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'status', payloadJson: { bridgeEvent: 'invocation.progress', status: 'running' } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 'tool-1', input: { command: 'printf bridge' }, name: 'Bash', phase: 'use' } } }),
      event({ invocationId: 'inv-1', seq: 3, type: 'tool', payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { content: 'bridge', id: 'tool-1', isError: false, name: null, phase: 'result' } } }),
      event({ invocationId: 'inv-1', seq: 4, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'Done.' } } }),
    ])

    expect(turns[0]!.items.map(item => item.kind)).toEqual(['activity-group', 'assistant-markdown'])
    expect(JSON.stringify(turns)).toContain('Ran Bash: printf bridge')
    expect(JSON.stringify(turns)).not.toContain('Working')
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

  it('maps redacted resource observations into first-class resource-card items', () => {
    const turns = buildInvocationTurns([
      event({
        invocationId: 'inv-1',
        seq: 1,
        type: 'artifact',
        payloadJson: {
          bridgeEvent: 'resource.observed',
          resource: {
            href: 'http://localhost:54393/report',
            kind: 'web',
            location: 'localhost:54393',
            status: 'available',
            title: 'Superpowers Brainstorm',
          },
        },
      }),
      event({
        invocationId: 'inv-1',
        seq: 2,
        type: 'file_change',
        payloadJson: {
          bridgeEvent: 'file.changed',
          file: {
            kind: 'document',
            path: 'docs/runtime.md',
            status: 'modified',
            title: 'runtime.md',
          },
        },
      }),
    ])

    expect(turns[0]!.items).toMatchObject([
      {
        id: 'inv-1:resource:1',
        kind: 'resource-card',
        resource: {
          href: 'http://localhost:54393/report',
          kind: 'web',
          location: 'localhost:54393',
          status: 'available',
          title: 'Superpowers Brainstorm',
        },
      },
      {
        id: 'inv-1:resource:2',
        kind: 'resource-card',
        resource: {
          kind: 'document',
          location: 'docs/runtime.md',
          status: 'modified',
          title: 'runtime.md',
        },
      },
    ])
  })

  it('maps redacted command observations into activity commands without leaking tool args', () => {
    const turns = buildInvocationTurns([
      event({
        invocationId: 'inv-1',
        seq: 1,
        type: 'tool',
        payloadJson: {
          bridgeEvent: 'invocation.tool.observed',
          tool: {
            args: { token: 'sk-test-raw-secret' },
            command: 'bun run --filter @zonease/aiworker-ui test',
            id: 'tool-1',
            name: 'exec_command',
            output: '1 failed',
            phase: 'result',
            status: 'failed',
          },
        },
      }),
    ])

    const group = turns[0]!.items.find(item => item.kind === 'activity-group')
    expect(group).toMatchObject({
      activities: [
        {
          command: {
            command: 'bun run --filter @zonease/aiworker-ui test',
            output: '1 failed',
            status: 'failed',
            title: 'exec_command',
          },
          status: 'failed',
          title: 'exec_command',
        },
      ],
      kind: 'activity-group',
    })
    expect(JSON.stringify(turns)).not.toContain('sk-test-raw-secret')
  })

  it('does not append generic action buttons after completed assistant output', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'assistant_delta', payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'Done.' } } }),
      event({ invocationId: 'inv-1', seq: 2, type: 'status', payloadJson: { bridgeEvent: 'invocation.completed' } }),
    ])

    expect(turns[0]!.items.map(item => item.kind)).toEqual(['assistant-markdown'])
    expect(JSON.stringify(turns)).not.toContain('Feedback')
    expect(JSON.stringify(turns)).not.toContain('Source')
  })

  it('maps an error event into a danger status item', () => {
    const turns = buildInvocationTurns([
      event({ invocationId: 'inv-1', seq: 1, type: 'error', payloadJson: { bridgeEvent: 'invocation.error', error: 'engine exploded' } }),
    ])
    const status = turns[0]!.items.find(item => item.kind === 'status')
    expect(status).toMatchObject({ kind: 'status', tone: 'danger' })
  })
})
