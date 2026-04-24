import type { WorkerInfo } from '@aiworker/shared'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestPanel } from '../components/test-panel'
import { renderWithProviders } from './test-utils'

const WORKER_ID = 'w_aaaaaaaaaaaa'

function infoWithChannels(): WorkerInfo {
  return {
    workerId: WORKER_ID,
    runtimeVersion: '0.2.0',
    configVersion: 1,
    brains: [],
    executor: { type: 'http', status: 'healthy' },
    channels: [
      { channel: 'telegram', enabled: true },
      { channel: 'line', enabled: false },
    ],
    evolutionEnabled: false,
    startedAt: new Date().toISOString(),
  }
}

function installFetch(handler: (req: { method: string, url: string, body: unknown }) => {
  status: number
  body: unknown
}) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init?.method ?? 'GET').toUpperCase()
    let body: unknown
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body)
      }
      catch {}
    }
    const result = handler({ method, url, body })
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

let originalFetch: typeof fetch

beforeEach(() => {
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// PLAN-013 S5: brain/test、executor/test、channels/test 这些端点在 gateway
// proto 中尚未暴露;`@/lib/api` 已 stub 化为空结果。原 fetch-mocked UI 断言
// 无法再用,先跳过,待 proto 扩展后重写。
describe.skip('testPanel', () => {
  it('brain test happy-path renders per-source rows', async () => {
    installFetch(({ method, url }) => {
      if (method === 'GET' && url.includes('/proxy/worker/info'))
        return { status: 200, body: infoWithChannels() }
      if (method === 'POST' && url.includes('/proxy/worker/brain/test')) {
        return {
          status: 200,
          body: {
            brains: [{ id: 'brain-1', type: 'hermes', status: 'healthy' }],
          },
        }
      }
      return { status: 404, body: {} }
    })

    renderWithProviders(<TestPanel workerId={WORKER_ID} />)
    fireEvent.click(screen.getByRole('button', { name: /Test brain/i }))

    await screen.findByText('brain-1')
    expect(screen.getByText('healthy')).toBeTruthy()
  })

  it('channel dropdown is populated from info.channels', async () => {
    installFetch(({ method, url }) => {
      if (method === 'GET' && url.includes('/proxy/worker/info'))
        return { status: 200, body: infoWithChannels() }
      return { status: 404, body: {} }
    })

    renderWithProviders(<TestPanel workerId={WORKER_ID} />)
    await waitFor(() => {
      const select = screen.getByLabelText('Channel to test') as HTMLSelectElement
      const values = Array.from(select.options).map(o => o.value)
      expect(values).toContain('telegram')
      expect(values).toContain('line')
    })
  })

  it('sends channel test via proxy and shows the sent badge', async () => {
    installFetch(({ method, url }) => {
      if (method === 'GET' && url.includes('/proxy/worker/info'))
        return { status: 200, body: infoWithChannels() }
      if (method === 'POST' && url.includes('/proxy/worker/channels/telegram/test'))
        return { status: 200, body: { sent: true, platformResponse: { ok: true } } }
      return { status: 500, body: {} }
    })

    renderWithProviders(<TestPanel workerId={WORKER_ID} />)
    // Wait until the dropdown has been populated from info, otherwise the
    // button is still disabled (channel === '').
    await waitFor(() => {
      const select = screen.getByLabelText('Channel to test') as HTMLSelectElement
      expect(Array.from(select.options).map(o => o.value)).toContain('telegram')
    })
    const button = screen.getByRole('button', { name: /Send test message/i }) as HTMLButtonElement
    await waitFor(() => expect(button.disabled).toBe(false))

    fireEvent.click(button)
    await screen.findByText(/Sent:/i)
  })
})
