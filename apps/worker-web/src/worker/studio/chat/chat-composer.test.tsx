// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatComposer } from './chat-composer'

const labels = {
  ariaLabel: 'Message composer',
  attachment: {
    add: 'Add',
    attached: 'Attached',
    closePreview: (name: string) => `Close ${name}`,
    materialReadError: 'Could not read material',
    preview: (name: string) => `Preview ${name}`,
    remove: (name: string) => `Remove ${name}`,
  },
  stop: 'Stop',
  stopAriaLabel: 'Stop generating',
  submitAriaLabel: 'Send message',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chat composer', () => {
  it('submits the composed message as a session-level invocation and reports the new invocation id', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      events: [],
      files: [],
      invocation: { id: 'inv-9', status: 'queued' },
      session: { id: 'session-1', status: 'active' },
    }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const onSubmitted = vi.fn()

    render(<ChatComposer labels={labels} onSubmitted={onSubmitted} sessionId="session-1" />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'do the thing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/sessions/session-1/invocations', expect.objectContaining({
        body: JSON.stringify({ input: 'do the thing', waitForCompletion: false }),
        method: 'POST',
      }))
    })
    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledWith({
        invocationId: 'inv-9',
        session: { id: 'session-1', status: 'active' },
        status: 'queued',
        text: 'do the thing',
      })
    })
  })

  it('renders the running composer dock stop control without changing the follow-up route', async () => {
    const onCancel = vi.fn()
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      events: [],
      files: [],
      invocation: { id: 'inv-9', status: 'queued' },
      session: { id: 'session-1', status: 'active' },
    }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<ChatComposer labels={labels} onCancel={onCancel} sessionId="session-1" status="running" />)

    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'queued follow-up' } })
    fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('includes attached source materials in the session invocation input', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      events: [],
      files: [],
      invocation: { id: 'inv-10', status: 'queued' },
      session: { id: 'session-1', status: 'active' },
    }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<ChatComposer labels={labels} sessionId="session-1" />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '查看这两个文件' } })
    fireEvent.change(screen.getByTestId('managed-session-file-input'), {
      target: { files: [new File(['col_a\tcol_b\n1\t2\n'], 'burn-20260528021436.tsv', { type: 'text/tab-separated-values' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { input: string, waitForCompletion: boolean }
    expect(body.input).toContain('查看这两个文件')
    expect(body.input).toContain('burn-20260528021436.tsv')
    expect(body.input).toContain('col_a\tcol_b\n1\t2')
    expect(body.waitForCompletion).toBe(false)
  })
})
