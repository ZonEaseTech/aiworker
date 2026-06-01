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
  submitAriaLabel: 'Send message',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chat composer', () => {
  it('submits the composed message as a session-level invocation and reports the new invocation id', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
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
        body: JSON.stringify({ input: 'do the thing' }),
        method: 'POST',
      }))
    })
    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledWith('inv-9')
    })
  })
})
