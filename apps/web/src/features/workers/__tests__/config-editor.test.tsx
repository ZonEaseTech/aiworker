import type { WorkerConfig, WorkerInfo } from '@aiworker/shared'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigEditor } from '../components/config-editor'
import { renderWithProviders } from './test-utils'

const WORKER_ID = 'w_aaaaaaaaaaaa'

function configFixture(): WorkerConfig {
  return {
    brains: [
      {
        id: 'brain-1',
        type: 'filesystem',
        priority: 100,
        readOnly: false,
        config: { home: '/home' },
      },
    ],
    brainWriteTarget: 'brain-1',
    brainRetrieval: 'merge-by-priority',
    executor: {
      engine: 'http',
      variant: 'default',
      overrides: {
        baseUrl: 'http://localhost:9999',
        apiKey: '',
        model: 'stub',
        timeoutMs: 30_000,
      },
    },
    channels: [],
    evolution: { enabled: false, observationRetentionDays: 7 },
  }
}

function infoFixture(): WorkerInfo {
  return {
    workerId: WORKER_ID,
    runtimeVersion: '0.2.0',
    configVersion: 3,
    brains: [{ id: 'brain-1', type: 'filesystem', status: 'healthy' }],
    executor: { type: 'http', status: 'healthy', model: 'stub' },
    channels: [],
    evolutionEnabled: false,
    startedAt: new Date().toISOString(),
  }
}

type FetchHandler = (req: { method: string, url: string, body: unknown, headers: Record<string, string> }) => {
  status: number
  body: unknown
}

function installFetch(handler: FetchHandler): typeof fetch {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
    const headers: Record<string, string> = {}
    if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>))
        headers[k] = v
    }
    const result = handler({ method, url, body, headers })
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    })
  })
  globalThis.fetch = mock as unknown as typeof fetch
  return mock as unknown as typeof fetch
}

let originalFetch: typeof fetch

beforeEach(() => {
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('configEditor', () => {
  it('loads config + PUT round-trip on Save', async () => {
    let putCalled = false
    installFetch(({ method, url, body }) => {
      if (method === 'GET' && url.includes('/proxy/worker/config'))
        return { status: 200, body: { config: configFixture(), version: 3 } }
      if (method === 'GET' && url.includes('/proxy/worker/info'))
        return { status: 200, body: infoFixture() }
      if (method === 'PUT' && url.includes('/proxy/worker/config')) {
        putCalled = true
        return {
          status: 200,
          body: { config: body as WorkerConfig, version: 4, runtimeReload: 'ok' },
        }
      }
      return { status: 404, body: {} }
    })

    renderWithProviders(<ConfigEditor workerId={WORKER_ID} />)

    await screen.findByText(/Configuration/)
    // Wait for version text to indicate load succeeded.
    await screen.findByText(/Version/)

    fireEvent.click(screen.getByRole('button', { name: /Save configuration/i }))

    await waitFor(() => expect(putCalled).toBe(true))
    await screen.findByText(/Saved \(version 4\)\./i)
  })

  it('shows 409 conflict banner and surfaces Reload button', async () => {
    installFetch(({ method, url }) => {
      if (method === 'GET' && url.includes('/proxy/worker/config'))
        return { status: 200, body: { config: configFixture(), version: 3 } }
      if (method === 'GET' && url.includes('/proxy/worker/info'))
        return { status: 200, body: infoFixture() }
      if (method === 'PUT' && url.includes('/proxy/worker/config')) {
        return {
          status: 409,
          body: {
            error: {
              code: 'version-conflict',
              message: 'config version 3 does not match current version 5',
              expected: 3,
              actual: 5,
            },
          },
        }
      }
      return { status: 404, body: {} }
    })

    renderWithProviders(<ConfigEditor workerId={WORKER_ID} />)
    await screen.findByText(/Configuration/)

    fireEvent.click(screen.getByRole('button', { name: /Save configuration/i }))
    await screen.findByText(/Version conflict/i)
    expect(screen.getByRole('button', { name: /Reload and re-edit/i })).toBeTruthy()
  })

  it('blocks save when brainWriteTarget is empty while brains exist', async () => {
    const brokenConfig = configFixture()
    brokenConfig.brainWriteTarget = ''
    installFetch(({ method, url }) => {
      if (method === 'GET' && url.includes('/proxy/worker/config'))
        return { status: 200, body: { config: brokenConfig, version: 1 } }
      if (method === 'GET' && url.includes('/proxy/worker/info'))
        return { status: 200, body: infoFixture() }
      return { status: 500, body: {} }
    })

    renderWithProviders(<ConfigEditor workerId={WORKER_ID} />)
    await screen.findByText(/Configuration/)

    fireEvent.click(screen.getByRole('button', { name: /Save configuration/i }))
    await screen.findByText(/Pick a brain write target/i)
  })
})
