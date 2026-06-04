// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatThread } from './chat-thread'

afterEach(() => cleanup())

describe('chat thread', () => {
  it('constrains transcript rhythm to a shared centered conversation column', () => {
    render(
      <ChatThread
        ariaLabel="Conversation"
        turns={[
          {
            id: 'assistant-turn',
            items: [{ id: 'answer', kind: 'assistant-markdown', markdown: 'A calmer response.' }],
          },
          {
            id: 'user-turn',
            items: [{ body: 'Please review this.', id: 'user', kind: 'user-message' }],
          },
        ]}
      />,
    )

    const thread = document.querySelector('[data-transcript-slot="chat-thread"]')
    const log = document.querySelector('[data-transcript-slot="chat-thread-log"]')
    const userTurnShell = document
      .querySelector('[data-transcript-turn-kind="user"] [data-transcript-slot="transcript-turn-shell"]')
    const assistantTurnShell = document
      .querySelector('[data-transcript-turn-kind="assistant"] [data-transcript-slot="transcript-turn-shell"]')

    expect(thread?.className).toContain('mx-auto')
    expect(thread?.className).toContain('w-full')
    expect(thread?.className).toContain('max-w-3xl')
    expect(log?.className).toContain('w-full')
    expect(userTurnShell?.className).toContain('ml-auto')
    expect(assistantTurnShell?.className).toContain('w-full')
  })

  it('renders an empty transcript companion outside the labelled log', () => {
    render(<ChatThread ariaLabel="Conversation" turns={[]} />)

    const log = screen.getByRole('log', { name: 'Conversation' })
    const empty = document.querySelector('[data-transcript-slot="chat-thread-empty"]')
    expect(log).toBeTruthy()
    expect(empty).toBeTruthy()
    expect(empty?.className).toContain('w-full')
    expect(empty?.closest('[role="log"]')).toBeNull()
    expect(document.querySelector('[data-transcript-slot="transcript-turn"]')).toBeNull()
    expect(screen.getByText('Ready when you are')).toBeTruthy()
  })

  it('renders transcript loading skeleton in the transcript region before turns load', () => {
    render(<ChatThread ariaLabel="Conversation" loading turns={[]} />)

    expect(screen.getByRole('log', { name: 'Conversation' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status', { name: 'Loading transcript' })).toBeTruthy()
    expect(document.querySelector('[data-transcript-slot="chat-thread-loading"]')?.className).toContain('w-full')
  })

  it('renders assistant turns without default card chrome or generic headers', () => {
    render(
      <ChatThread
        ariaLabel="Conversation"
        turns={[{
          id: 'assistant-turn',
          items: [{ id: 'answer', kind: 'assistant-markdown', markdown: 'A calmer response.' }],
        }]}
      />,
    )

    const turn = document.querySelector('[data-transcript-slot="transcript-turn"]')
    expect(turn?.getAttribute('data-transcript-turn-kind')).toBe('assistant')
    expect(turn?.className).not.toContain('border')
    expect(turn?.className).not.toContain('bg-background')
    expect(screen.queryByText('Turn')).toBeNull()
  })

  it('aligns user turns as compact transcript bubbles', () => {
    render(
      <ChatThread
        ariaLabel="Conversation"
        turns={[{
          id: 'user-turn',
          items: [{ body: 'Please review this.', id: 'user', kind: 'user-message' }],
        }]}
      />,
    )

    const turn = document.querySelector('[data-transcript-slot="transcript-turn"]')
    expect(turn?.getAttribute('data-transcript-turn-kind')).toBe('user')
    expect(turn?.className).toContain('justify-end')
    expect(screen.getByText('Please review this.')).toBeTruthy()
  })

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

  it('renders generic timeline steps with distinct optimistic and engine provenance', () => {
    render(
      <ChatThread
        ariaLabel="Conversation"
        turns={[{
          id: 'invocation-1',
          items: [
            {
              body: 'Waiting for the native engine to emit its first event.',
              id: 'optimistic-start',
              kind: 'timeline-step',
              provenance: 'optimistic',
              status: 'waiting',
              title: 'Starting invocation',
            },
            {
              body: 'Read workspace files',
              id: 'engine-progress',
              kind: 'timeline-step',
              provenance: 'engine',
              status: 'running',
              title: 'Inspecting workspace',
            },
          ],
        }]}
      />,
    )

    expect(screen.getByText('Starting invocation')).toBeTruthy()
    expect(screen.getByText('Waiting for the native engine to emit its first event.')).toBeTruthy()
    expect(screen.getByText('Inspecting workspace')).toBeTruthy()
    expect(screen.getByText('Read workspace files')).toBeTruthy()
    expect(document.querySelector('[data-transcript-slot="timeline-step"][data-timeline-step-provenance="optimistic"]')).toBeTruthy()
    expect(document.querySelector('[data-transcript-slot="timeline-step"][data-timeline-step-provenance="engine"]')).toBeTruthy()
  })
})
