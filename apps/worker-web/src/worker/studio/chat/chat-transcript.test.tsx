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
    expect(document.querySelector('[data-session-timeline="true"]')).toBeTruthy()
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

  it('does not render internal invocation input previews as user turns', async () => {
    render(
      <ChatTranscript
        ariaLabel="Session transcript"
        initialInvocation={{ id: 'inv-user', status: 'succeeded' }}
        invocationId="inv-user"
        sessionEvents={[{
          createdAt: '2026-06-01T00:00:00.000Z',
          id: 1,
          invocationId: 'inv-user',
          payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'public answer' } },
          seq: 1,
          sessionId: 's1',
          type: 'assistant_delta',
        }]}
        sessionId="s1"
        sessionInvocations={[
          {
            id: 'inv-user',
            metadataJson: { uiUserDisplayText: 'public question' },
            seq: 1,
          },
          {
            id: 'inv-internal-title',
            metadataJson: { kind: 'internal', purpose: 'session-autoname', uiUserDisplayText: 'internal title prompt' },
            seq: 2,
          },
        ]}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/public question/)).toBeTruthy()
      expect(screen.getByText(/public answer/)).toBeTruthy()
    })
    expect(screen.queryByText(/internal title prompt/)).toBeNull()
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

  it('marks the pre-event active invocation skeleton as optimistic instead of real engine progress', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      events: [],
      invocation: { id: 'inv-optimistic', status: 'running' },
    }))))

    render(
      <ChatTranscript
        ariaLabel="Session transcript"
        initialInvocation={{ id: 'inv-optimistic', status: 'running' }}
        intervalMs={1000}
        invocationId="inv-optimistic"
        sessionId="s1"
        userMessage={{ invocationId: 'inv-optimistic', text: 'show a timeline' }}
      />,
    )

    expect(screen.getByText(/show a timeline/)).toBeTruthy()
    expect(await screen.findByText('Starting invocation')).toBeTruthy()
    expect(document.querySelector('[data-transcript-slot="timeline-step"][data-timeline-step-provenance="optimistic"]')).toBeTruthy()
    expect(document.querySelector('[data-transcript-slot="timeline-step"][data-timeline-step-provenance="engine"]')).toBeNull()
  })

  it('reports live invocation status changes to the owning surface', async () => {
    const onInvocationStatusChange = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      events: [],
      invocation: { id: 'inv-status', status: 'succeeded' },
    }))))

    render(
      <ChatTranscript
        ariaLabel="Session transcript"
        initialInvocation={{ id: 'inv-status', status: 'running' }}
        invocationId="inv-status"
        onInvocationStatusChange={onInvocationStatusChange}
        sessionId="s1"
      />,
    )

    await waitFor(() => {
      expect(onInvocationStatusChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-status', status: 'succeeded' }))
    })
  })

  it('removes running progress chrome when the invocation status is terminal before a terminal event is present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(() => {})))

    render(
      <ChatTranscript
        ariaLabel="Session transcript"
        initialInvocation={{ id: 'inv-terminal-with-tail-progress', status: 'succeeded' }}
        invocationId="inv-terminal-with-tail-progress"
        sessionEvents={[
          {
            createdAt: '2026-06-01T00:00:00.000Z',
            id: 1,
            invocationId: 'inv-terminal-with-tail-progress',
            payloadJson: { bridgeEvent: 'invocation.progress', status: 'running' },
            seq: 1,
            sessionId: 's1',
            type: 'status',
          },
          {
            createdAt: '2026-06-01T00:00:00.000Z',
            id: 2,
            invocationId: 'inv-terminal-with-tail-progress',
            payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 'tool-1', input: { command: 'printf bridge' }, name: 'Bash', phase: 'use' } },
            seq: 2,
            sessionId: 's1',
            type: 'tool',
          },
          {
            createdAt: '2026-06-01T00:00:00.000Z',
            id: 3,
            invocationId: 'inv-terminal-with-tail-progress',
            payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { content: 'bridge', id: 'tool-1', isError: false, name: null, phase: 'result' } },
            seq: 3,
            sessionId: 's1',
            type: 'tool',
          },
          {
            createdAt: '2026-06-01T00:00:00.000Z',
            id: 4,
            invocationId: 'inv-terminal-with-tail-progress',
            payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'Done.' } },
            seq: 4,
            sessionId: 's1',
            type: 'assistant_delta',
          },
        ]}
        sessionId="s1"
      />,
    )

    expect(await screen.findByText('Done.')).toBeTruthy()
    expect(screen.getByText('Ran Bash: printf bridge')).toBeTruthy()
    expect(screen.queryByText('Working')).toBeNull()
  })

  it('marks only the latest assistant segment as streaming after tool interleaving', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(() => {})))

    render(
      <ChatTranscript
        ariaLabel="Session transcript"
        initialInvocation={{ id: 'inv-interleaved', status: 'running' }}
        invocationId="inv-interleaved"
        sessionEvents={[
          {
            createdAt: '2026-06-01T00:00:00.000Z',
            id: 1,
            invocationId: 'inv-interleaved',
            payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'first segment' } },
            seq: 1,
            sessionId: 's1',
            type: 'assistant_delta',
          },
          {
            createdAt: '2026-06-01T00:00:00.000Z',
            id: 2,
            invocationId: 'inv-interleaved',
            payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { id: 'tool-1', input: { command: 'printf bridge' }, name: 'Bash', phase: 'use' } },
            seq: 2,
            sessionId: 's1',
            type: 'tool',
          },
          {
            createdAt: '2026-06-01T00:00:00.000Z',
            id: 3,
            invocationId: 'inv-interleaved',
            payloadJson: { bridgeEvent: 'invocation.tool.observed', tool: { content: 'bridge', id: 'tool-1', isError: false, name: null, phase: 'result' } },
            seq: 3,
            sessionId: 's1',
            type: 'tool',
          },
          {
            createdAt: '2026-06-01T00:00:00.000Z',
            id: 4,
            invocationId: 'inv-interleaved',
            payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'second segment' } },
            seq: 4,
            sessionId: 's1',
            type: 'assistant_delta',
          },
        ]}
        sessionId="s1"
      />,
    )

    expect(await screen.findByText('first segment')).toBeTruthy()
    expect(screen.getByText('second segment')).toBeTruthy()
    expect(screen.getByText('Ran Bash: printf bridge')).toBeTruthy()
    const streamingBlocks = [...document.querySelectorAll('[data-streaming="true"]')]
    expect(streamingBlocks).toHaveLength(1)
    expect(streamingBlocks[0]?.textContent).toContain('second segment')
  })

  it('hides stale progress-only turns from prior invocations while following a newer chat turn', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(() => {})))

    render(
      <ChatTranscript
        ariaLabel="Session transcript"
        initialInvocation={{ id: 'inv-current', status: 'succeeded' }}
        invocationId="inv-current"
        sessionEvents={[
          {
            createdAt: '2026-06-01T00:00:00.000Z',
            id: 1,
            invocationId: 'inv-old',
            payloadJson: { bridgeEvent: 'invocation.progress', status: 'running' },
            seq: 1,
            sessionId: 's1',
            type: 'status',
          },
          {
            createdAt: '2026-06-01T00:00:00.000Z',
            id: 2,
            invocationId: 'inv-current',
            payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'current answer' } },
            seq: 1,
            sessionId: 's1',
            type: 'assistant_delta',
          },
        ]}
        sessionId="s1"
        sessionInvocations={[
          { id: 'inv-old', metadataJson: { uiUserDisplayText: 'old prompt' }, seq: 1 },
          { id: 'inv-current', metadataJson: { uiUserDisplayText: 'current prompt' }, seq: 2 },
        ]}
      />,
    )

    expect(await screen.findByText('current answer')).toBeTruthy()
    expect(screen.getByText('old prompt')).toBeTruthy()
    expect(screen.queryByText('Working')).toBeNull()
  })

  it('reports terminal bridge events even when the seeded invocation still says running', async () => {
    const onInvocationStatusChange = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(() => {})))

    render(
      <ChatTranscript
        ariaLabel="Session transcript"
        initialInvocation={{ id: 'inv-terminal-event', status: 'running' }}
        invocationId="inv-terminal-event"
        onInvocationStatusChange={onInvocationStatusChange}
        sessionEvents={[{
          createdAt: '2026-06-01T00:00:00.000Z',
          id: 1,
          invocationId: 'inv-terminal-event',
          payloadJson: { bridgeEvent: 'invocation.completed' },
          seq: 1,
          sessionId: 's1',
          type: 'status',
        }]}
        sessionId="s1"
      />,
    )

    await waitFor(() => {
      expect(onInvocationStatusChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-terminal-event', status: 'succeeded' }))
    })
  })

  it('reports terminal status events even when the seeded invocation still says running', async () => {
    const onInvocationStatusChange = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(() => {})))

    render(
      <ChatTranscript
        ariaLabel="Session transcript"
        initialInvocation={{ id: 'inv-terminal-status', status: 'running' }}
        invocationId="inv-terminal-status"
        onInvocationStatusChange={onInvocationStatusChange}
        sessionEvents={[{
          createdAt: '2026-06-01T00:00:00.000Z',
          id: 1,
          invocationId: 'inv-terminal-status',
          payloadJson: { invocationId: 'inv-terminal-status', status: 'succeeded' },
          seq: 1,
          sessionId: 's1',
          type: 'status',
        }]}
        sessionId="s1"
      />,
    )

    await waitFor(() => {
      expect(onInvocationStatusChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-terminal-status', status: 'succeeded' }))
    })
  })
})
