import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SecretsPanel } from '../components/secrets-panel'
import { renderWithProviders } from './test-utils'

const WORKER_ID = 'w_aaaaaaaaaaaa'

interface CapturedRequest {
  method: string
  url: string
  body: unknown
}

function installFetch(handler: (req: CapturedRequest) => { status: number, body: unknown }): CapturedRequest[] {
  const captured: CapturedRequest[] = []
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init?.method ?? 'GET').toUpperCase()
    let body: unknown
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body)
      }
      catch {
        body = init.body
      }
    }
    const req = { method, url, body }
    captured.push(req)
    const result = handler(req)
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return captured
}

let originalFetch: typeof fetch

beforeEach(() => {
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('secretsPanel', () => {
  it('lists keys and issues a PUT when Add secret submits', async () => {
    let keys = ['existing-key']
    const captured = installFetch(({ method, url, body }) => {
      if (method === 'GET' && url.includes('/proxy/worker/secrets'))
        return { status: 200, body: { keys } }
      if (method === 'PUT' && url.includes('/proxy/worker/secrets/')) {
        keys = [...keys, 'new-key']
        return { status: 200, body: { ok: true, value: (body as { value?: string }).value } }
      }
      return { status: 404, body: {} }
    })

    renderWithProviders(<SecretsPanel workerId={WORKER_ID} />)
    await screen.findByText('existing-key')

    fireEvent.click(screen.getByRole('button', { name: /Add secret/i }))
    // Dialog renders a "Save" button now.
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'new-key' } })
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))

    await waitFor(() => {
      expect(captured.some(r => r.method === 'PUT' && r.url.endsWith('/secrets/new-key'))).toBe(true)
    })
  })

  it('blocks submit when key is empty', async () => {
    installFetch(({ method, url }) => {
      if (method === 'GET' && url.includes('/proxy/worker/secrets'))
        return { status: 200, body: { keys: [] } }
      return { status: 500, body: {} }
    })

    renderWithProviders(<SecretsPanel workerId={WORKER_ID} />)
    await screen.findByText(/No secrets stored/i)
    fireEvent.click(screen.getByRole('button', { name: /Add secret/i }))
    // Only set value, leave key empty.
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))
    await screen.findByText(/Key is required/i)
  })

  it('prevents adding a key that already exists (prompts to Replace)', async () => {
    installFetch(({ method, url }) => {
      if (method === 'GET' && url.includes('/proxy/worker/secrets'))
        return { status: 200, body: { keys: ['already-there'] } }
      return { status: 500, body: {} }
    })

    renderWithProviders(<SecretsPanel workerId={WORKER_ID} />)
    await screen.findByText('already-there')
    fireEvent.click(screen.getByRole('button', { name: /Add secret/i }))
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'already-there' } })
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'v' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))
    await screen.findByText(/secret with this key already exists/i)
  })

  it('deletes a key through the proxy', async () => {
    let keys = ['killable']
    const captured = installFetch(({ method, url }) => {
      if (method === 'GET' && url.includes('/proxy/worker/secrets'))
        return { status: 200, body: { keys } }
      if (method === 'DELETE' && url.endsWith('/secrets/killable')) {
        keys = []
        return { status: 200, body: { ok: true } }
      }
      return { status: 500, body: {} }
    })

    renderWithProviders(<SecretsPanel workerId={WORKER_ID} />)
    await screen.findByText('killable')
    fireEvent.click(screen.getByRole('button', { name: /Delete secret killable/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }))

    await waitFor(() => {
      expect(captured.some(r => r.method === 'DELETE' && r.url.endsWith('/secrets/killable'))).toBe(true)
    })
  })
})
