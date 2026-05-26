// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatThread } from './chat-thread'

afterEach(() => cleanup())

describe('ChatThread', () => {
  it('renders generic turn items without owning product semantics', () => {
    render(
      <ChatThread
        ariaLabel="Conversation"
        turns={[
          {
            id: 'turn-1',
            items: [
              { body: 'Please review this.', id: 'user', kind: 'user-message' },
              {
                activities: [{ id: 'read', title: 'Read files' }],
                id: 'activity',
                kind: 'activity-group',
                summary: 'Explored 1 file',
              },
              { id: 'answer', kind: 'assistant-markdown', markdown: 'Done with **evidence**.' },
              { artifacts: [{ id: 'artifact', title: 'Evidence' }], id: 'artifacts', kind: 'artifact-strip' },
              { body: 'Waiting for next turn', id: 'status', kind: 'status', tone: 'muted' },
              { id: 'custom', kind: 'custom', node: <span>Custom detail</span> },
            ],
            meta: 'meta',
            title: 'Turn 1',
          },
        ]}
      />,
    )

    expect(screen.getByRole('log', { name: 'Conversation' })).toBeTruthy()
    expect(screen.getByText('Please review this.')).toBeTruthy()
    expect(screen.getByText('Explored 1 file')).toBeTruthy()
    expect(screen.getByText('evidence').tagName).toBe('STRONG')
    expect(screen.getByText('Evidence')).toBeTruthy()
    expect(screen.getByText('Waiting for next turn')).toBeTruthy()
    expect(screen.getByText('Custom detail')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Host-owned/i)
  })

  it('lets consumers control collapsed turns', () => {
    const onTurnCollapsedChange = vi.fn()

    render(
      <ChatThread
        ariaLabel="Conversation"
        onTurnCollapsedChange={onTurnCollapsedChange}
        turns={[
          {
            collapsed: true,
            id: 'turn-1',
            items: [{ body: 'Hidden detail', id: 'user', kind: 'user-message' }],
            summary: '1 previous message',
            title: 'Previous turn',
          },
        ]}
      />,
    )

    expect(screen.getByText('1 previous message')).toBeTruthy()
    expect(screen.queryByText('Hidden detail')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Expand turn Previous turn' }))
    expect(onTurnCollapsedChange).toHaveBeenCalledWith('turn-1', false)
  })

  it('shows a streaming placeholder for empty assistant markdown', () => {
    render(
      <ChatThread
        ariaLabel="Conversation"
        turns={[
          {
            id: 'turn-1',
            items: [{ id: 'answer', kind: 'assistant-markdown', markdown: '   ', streaming: true }],
            title: 'Turn 1',
          },
        ]}
      />,
    )

    expect(screen.getByRole('status', { name: 'Preparing response' })).toBeTruthy()
  })
})
