// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatTranscript } from './chat-transcript'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chat transcript view', () => {
  it('renders an empty, labelled transcript log when no invocation is selected', () => {
    render(<ChatTranscript ariaLabel="Session transcript" invocationId={null} sessionId="s1" />)
    expect(screen.getByRole('log', { name: 'Session transcript' })).toBeTruthy()
    expect(screen.queryByText(/engine/)).toBeNull()
  })

  it('renders assistant output from live invocation events', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      events: [{
        createdAt: '2026-06-01T00:00:00.000Z',
        id: 1,
        invocationId: 'inv-1',
        payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'Hello from the engine.' } },
        seq: 1,
        sessionId: 's1',
        type: 'assistant_delta',
      }],
      invocation: { id: 'inv-1', status: 'succeeded' },
    }))))

    render(<ChatTranscript ariaLabel="Session transcript" invocationId="inv-1" sessionId="s1" />)

    await waitFor(() => {
      expect(screen.getByText(/Hello from the engine/)).toBeTruthy()
    })
  })

  it('renders persisted user previews before restored assistant output', async () => {
    render(
      <ChatTranscript
        ariaLabel="Session transcript"
        initialInvocation={{ id: 'inv-restored', status: 'succeeded' }}
        invocationId="inv-restored"
        sessionEvents={[{
          createdAt: '2026-06-01T00:00:00.000Z',
          id: 1,
          invocationId: 'inv-restored',
          payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'restored answer' } },
          seq: 1,
          sessionId: 's1',
          type: 'assistant_delta',
        }]}
        sessionId="s1"
        sessionInvocations={[{
          id: 'inv-restored',
          metadataJson: { uiUserDisplayText: 'restored question' },
          seq: 1,
        }]}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/restored question/)).toBeTruthy()
      expect(screen.getByText(/restored answer/)).toBeTruthy()
    })
    const turns = [...document.querySelectorAll('[data-transcript-slot="transcript-turn"]')]
    expect(turns[0]?.textContent).toContain('restored question')
    expect(turns[1]?.textContent).toContain('restored answer')
  })

  it('shows an active streaming placeholder before the assistant sends text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      events: [],
      invocation: { id: 'inv-streaming', status: 'running' },
    }))))

    render(
      <ChatTranscript
        ariaLabel="Session transcript"
        initialInvocation={{ id: 'inv-streaming', status: 'running' }}
        intervalMs={1000}
        invocationId="inv-streaming"
        sessionId="s1"
        userMessage={{ invocationId: 'inv-streaming', text: 'draft a concise update' }}
      />,
    )

    expect(screen.getByText(/draft a concise update/)).toBeTruthy()
    expect(await screen.findByRole('status', { name: 'Preparing response' })).toBeTruthy()
  })
})
