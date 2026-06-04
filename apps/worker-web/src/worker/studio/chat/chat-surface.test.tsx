// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatSurface } from './chat-surface'

const composerLabels = {
  ariaLabel: 'Message composer',
  attachment: {
    add: 'Add',
    attached: 'Attached',
    closePreview: (name: string) => `Close ${name}`,
    materialReadError: 'Could not read material',
    preview: (name: string) => `Preview ${name}`,
    remove: (name: string) => `Remove ${name}`,
  },
  submitAriaLabel: 'Send message',
}

function sessionDetail(events: unknown[] = [], invocations: unknown[] = []) {
  return {
    events,
    invocations,
    session: { id: 'session-1', status: 'active' },
  }
}

function deferredResponse<T>(value: T) {
  let resolve!: () => void
  const gate = new Promise<void>((resolveGate) => {
    resolve = resolveGate
  })
  return {
    resolve,
    response: async () => {
      await gate
      return new Response(JSON.stringify(value))
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('chat surface', () => {
  it('renders an empty transcript and a composer for the selected session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sessionDetail()))))
    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading transcript' })).toBeNull()
    })
    expect(screen.getByRole('log', { name: 'Session transcript' })).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('centers an empty session route composer in a bounded focus column', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sessionDetail()))))
    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading transcript' })).toBeNull()
    })

    const emptyEntry = document.querySelector('[data-chat-empty-entry="true"]')
    expect(emptyEntry).toBeTruthy()
    const emptyEntryElement = emptyEntry as HTMLElement
    expect(emptyEntryElement.className).toContain('flex-1')
    expect(emptyEntryElement.className).toContain('items-center')
    expect(emptyEntryElement.className).toContain('justify-center')

    const emptyColumn = emptyEntryElement.querySelector('[data-chat-column="true"]')
    expect(emptyColumn).toBeTruthy()
    const emptyColumnElement = emptyColumn as HTMLElement
    expect(emptyColumnElement.className).toContain('mx-auto')
    expect(emptyColumnElement.className).toContain('max-w-')
    expect(emptyColumnElement.contains(screen.getByRole('log', { name: 'Session transcript' }))).toBe(true)
    expect(emptyColumnElement.contains(screen.getByRole('textbox'))).toBe(true)
  })

  it('stretches to the main workbench so the composer stays pinned to the bottom', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sessionDetail()))))
    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading transcript' })).toBeNull()
    })

    const surface = document.querySelector('[data-chat-surface="true"]')
    expect(surface?.className).toContain('flex-1')
    expect(surface?.className).toContain('overflow-hidden')
  })

  it('shows transcript loading skeleton while session detail is loading without replacing the composer', async () => {
    const pendingSession = deferredResponse(sessionDetail())
    vi.stubGlobal('fetch', vi.fn(pendingSession.response))

    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    expect(screen.getByRole('log', { name: 'Session transcript' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status', { name: 'Loading transcript' })).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()

    pendingSession.resolve()

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading transcript' })).toBeNull()
    })
  })

  it('aligns existing conversation transcript and composer in one centered chat column', async () => {
    const persistedEvent = {
      createdAt: '2026-06-01T00:00:00.000Z',
      id: 1,
      invocationId: 'inv-existing',
      payloadJson: { data: { text: 'existing assistant reply' } },
      seq: 1,
      sessionId: 'session-1',
      type: 'assistant_delta',
    }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/sessions/session-1') {
        return new Response(JSON.stringify(sessionDetail(
          [persistedEvent],
          [{
            id: 'inv-existing',
            metadataJson: { uiUserDisplayText: 'existing user prompt' },
            seq: 1,
            sessionId: 'session-1',
            status: 'succeeded',
          }],
        )))
      }
      return new Response(JSON.stringify({
        events: [persistedEvent],
        invocation: { id: 'inv-existing', status: 'succeeded' },
      }))
    }))

    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    expect(await screen.findByText(/existing assistant reply/)).toBeTruthy()
    const chatColumn = document.querySelector('[data-chat-column="true"]')
    expect(chatColumn).toBeTruthy()
    const chatColumnElement = chatColumn as HTMLElement
    expect(chatColumnElement.className).toContain('mx-auto')
    expect(chatColumnElement.className).toContain('max-w-')
    expect(chatColumnElement.contains(screen.getByRole('log', { name: 'Session transcript' }))).toBe(true)
    expect(chatColumnElement.contains(screen.getByRole('textbox'))).toBe(true)
  })

  it('renders a transcript restore error instead of the default empty state when session detail fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('session detail unavailable')
    }))

    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading transcript' })).toBeNull()
    })
    expect(screen.getByRole('status', { name: 'Transcript history unavailable' })).toBeTruthy()
    expect(document.querySelector('[data-transcript-slot="chat-thread-error"]')?.closest('[role="log"]')).toBeNull()
    expect(screen.queryByText('Ready when you are')).toBeNull()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('replays persisted session events after a browser refresh with no in-memory active invocation', async () => {
    const persistedEvent = {
      createdAt: '2026-06-01T00:00:00.000Z',
      id: 3,
      invocationId: 'inv-restored',
      payloadJson: { data: { text: 'persisted reply after refresh' } },
      seq: 1,
      sessionId: 'session-1',
      type: 'assistant_delta',
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/sessions/session-1') {
        return new Response(JSON.stringify(sessionDetail(
          [persistedEvent],
          [{
            id: 'inv-restored',
            metadataJson: { uiUserDisplayText: 'persisted user prompt after refresh' },
            seq: 1,
            sessionId: 'session-1',
            status: 'succeeded',
          }],
        )))
      }
      return new Response(JSON.stringify({
        events: [persistedEvent],
        invocation: { id: 'inv-restored', status: 'succeeded' },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    expect(await screen.findByText(/persisted reply after refresh/)).toBeTruthy()
    expect(screen.getByText(/persisted user prompt after refresh/)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/session-1', expect.any(Object))
  })

  it('scrolls the restored transcript container to the latest message after refresh', async () => {
    const scrollTo = vi.fn()
    const scrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })

    try {
      const persistedEvent = {
        createdAt: '2026-06-01T00:00:00.000Z',
        id: 4,
        invocationId: 'inv-scroll-restored',
        payloadJson: { data: { text: 'last restored reply stays visible' } },
        seq: 1,
        sessionId: 'session-1',
        type: 'assistant_delta',
      }
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/sessions/session-1') {
          return new Response(JSON.stringify(sessionDetail(
            [persistedEvent],
            [{
              id: 'inv-scroll-restored',
              metadataJson: { uiUserDisplayText: 'restored prompt that should stay visible' },
              seq: 1,
              sessionId: 'session-1',
              status: 'succeeded',
            }],
          )))
        }
        return new Response(JSON.stringify({
          events: [persistedEvent],
          invocation: { id: 'inv-scroll-restored', status: 'succeeded' },
        }))
      }))

      render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

      expect(await screen.findByText(/last restored reply stays visible/)).toBeTruthy()
      expect(document.querySelector('[data-chat-transcript-scroll="true"]')).toBeTruthy()
      await waitFor(() => {
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }))
      })
    }
    finally {
      if (scrollToDescriptor)
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', scrollToDescriptor)
      else
        delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo
    }
  })

  it('does not force a manually scrolled transcript back to the bottom during streaming mutations', async () => {
    expect(typeof MutationObserver).toBe('function')
    const scrollTo = vi.fn()
    const scrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })

    try {
      const persistedEvent = {
        createdAt: '2026-06-01T00:00:00.000Z',
        id: 5,
        invocationId: 'inv-manual-scroll',
        payloadJson: { data: { text: 'streaming reply before manual scroll' } },
        seq: 1,
        sessionId: 'session-1',
        type: 'assistant_delta',
      }
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/sessions/session-1') {
          return new Response(JSON.stringify(sessionDetail(
            [persistedEvent],
            [{
              id: 'inv-manual-scroll',
              metadataJson: { uiUserDisplayText: 'long prompt before manual scroll' },
              seq: 1,
              sessionId: 'session-1',
              status: 'running',
            }],
          )))
        }
        return new Response(JSON.stringify({
          events: [persistedEvent],
          invocation: { id: 'inv-manual-scroll', status: 'running' },
        }))
      }))

      render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

      expect(await screen.findByText(/streaming reply before manual scroll/)).toBeTruthy()
      await waitFor(() => {
        expect(scrollTo).toHaveBeenCalled()
      })
      scrollTo.mockClear()

      const scroller = document.querySelector('[data-chat-transcript-scroll="true"]') as HTMLElement | null
      expect(scroller).toBeTruthy()
      Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 300 })
      Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1200 })
      scroller!.scrollTop = 0
      fireEvent.scroll(scroller!)
      await new Promise(resolve => setTimeout(resolve, 0))

      const streamedToken = document.createElement('div')
      streamedToken.textContent = 'new token while the reader is up-thread'
      scroller!.append(streamedToken)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(scrollTo).not.toHaveBeenCalled()
    }
    finally {
      if (scrollToDescriptor)
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', scrollToDescriptor)
      else
        delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo
    }
  })

  it('submits a message and streams the resulting invocation into the transcript', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/invocations') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          events: [],
          files: [],
          invocation: { id: 'inv-1', status: 'queued' },
          session: { id: 'session-1', status: 'active' },
        }), { status: 201 })
      }
      if (url === '/api/sessions/session-1')
        return new Response(JSON.stringify(sessionDetail()))
      return new Response(JSON.stringify({
        events: [{
          createdAt: '2026-06-01T00:00:00.000Z',
          id: 1,
          invocationId: 'inv-1',
          payloadJson: { bridgeEvent: 'invocation.output.delta', data: { text: 'engine reply here' } },
          seq: 1,
          sessionId: 'session-1',
          type: 'assistant_delta',
        }],
        invocation: { id: 'inv-1', status: 'succeeded' },
      }))
    }))

    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'go' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => {
      expect(screen.getByText(/engine reply here/)).toBeTruthy()
    })
  })

  it('echoes the submitted message as a user-message turn in the transcript', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/invocations') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          events: [],
          files: [],
          invocation: { id: 'inv-echo', status: 'queued' },
          session: { id: 'session-1', status: 'active' },
        }), { status: 201 })
      }
      if (url === '/api/sessions/session-1')
        return new Response(JSON.stringify(sessionDetail()))
      return new Response(JSON.stringify({
        events: [],
        invocation: { id: 'inv-echo', status: 'succeeded' },
      }))
    }))

    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'echo this back please' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => {
      const userMessage = document.querySelector('[data-transcript-slot="user-message"]')
      expect(userMessage?.textContent).toContain('echo this back please')
    })
  })

  it('restores keyboard focus to the composer after submitting with the send button', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/invocations') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          events: [],
          files: [],
          invocation: { id: 'inv-focus', status: 'queued' },
          session: { id: 'session-1', status: 'active' },
        }), { status: 201 })
      }
      if (url === '/api/sessions/session-1')
        return new Response(JSON.stringify(sessionDetail()))
      return new Response(JSON.stringify({
        events: [],
        invocation: { id: 'inv-focus', status: 'succeeded' },
      }))
    }))

    render(<ChatSurface composerLabels={composerLabels} sessionId="session-1" transcriptAriaLabel="Session transcript" />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'keep keyboard rhythm' } })
    const sendButton = screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement
    sendButton.focus()
    expect(document.activeElement).toBe(sendButton)

    fireEvent.click(sendButton)

    await waitFor(() => {
      const textbox = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textbox.value).toBe('')
      expect(document.activeElement).toBe(textbox)
    })
  })
})
