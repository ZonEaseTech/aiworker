import type { TranscriptTurnModel } from '@zonease/aiworker-ui/components/transcript-types'

import { describe, expect, it } from 'bun:test'

import { withUserMessageTurn } from './transcript-mapper'

describe('withUserMessageTurn', () => {
  it('prepends a user-message item to the matching invocation turn', () => {
    const turns: TranscriptTurnModel[] = [{
      id: 'inv-1',
      items: [{ id: 'inv-1:assistant', kind: 'assistant-markdown', markdown: 'Hi.' }],
    }]
    expect(withUserMessageTurn(turns, 'inv-1', 'Hello engine')).toEqual([{
      id: 'inv-1',
      items: [
        { body: 'Hello engine', id: 'inv-1:user', kind: 'user-message' },
        { id: 'inv-1:assistant', kind: 'assistant-markdown', markdown: 'Hi.' },
      ],
    }])
  })

  it('creates a user-only turn when the invocation has not streamed events yet', () => {
    expect(withUserMessageTurn([], 'inv-2', 'First turn')).toEqual([{
      id: 'inv-2',
      items: [{ body: 'First turn', id: 'inv-2:user', kind: 'user-message' }],
    }])
  })

  it('returns the turns unchanged when there is no active invocation or input', () => {
    const turns: TranscriptTurnModel[] = [{ id: 'inv-1', items: [] }]
    expect(withUserMessageTurn(turns, '', 'ignored')).toBe(turns)
    expect(withUserMessageTurn(turns, 'inv-1', '')).toBe(turns)
  })
})
