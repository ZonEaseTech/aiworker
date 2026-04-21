import { describe, expect, it } from 'bun:test'

import {
  WorkerClient,
  WorkerClientAuthError,
  WorkerClientInvalidResponseError,
  WorkerClientNetworkError,
} from './client'

interface FetchCall { url: string, init: RequestInit | undefined }

function makeFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const calls: FetchCall[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
    calls.push({ url, init })
    return handler(url, init)
  }) as typeof fetch
  return { fetchImpl, calls }
}

function okJson(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

const DEFAULT_INFO = {
  workerId: 'w_abcdef123456',
  runtimeVersion: '0.2.0',
  configVersion: 7,
  brains: [],
  executor: { type: 'http', status: 'healthy' },
  channels: [],
  evolutionEnabled: false,
  startedAt: '2026-04-21T00:00:00.000Z',
}

describe('WorkerClient', () => {
  it('prefixes /api/worker and bearer header', async () => {
    const { fetchImpl, calls } = makeFetch(() => okJson(DEFAULT_INFO))
    const client = new WorkerClient({
      baseUrl: 'https://worker.example.com/',
      apiToken: 'wtk_testtoken_12345678901234567890123456789012',
      fetchImpl,
    })
    const info = await client.info()
    expect(info.workerId).toBe('w_abcdef123456')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://worker.example.com/api/worker/info')
    const headers = new Headers(calls[0]!.init?.headers)
    expect(headers.get('authorization')).toBe('Bearer wtk_testtoken_12345678901234567890123456789012')
  })

  it('trims multiple trailing slashes from baseUrl', async () => {
    const { fetchImpl, calls } = makeFetch(() => okJson(DEFAULT_INFO))
    const client = new WorkerClient({
      baseUrl: 'https://worker.example.com///',
      apiToken: 'wtk_x0000000000000000000000000000000000',
      fetchImpl,
    })
    await client.info()
    expect(calls[0]!.url).toBe('https://worker.example.com/api/worker/info')
  })

  it('throws WorkerClientAuthError on 401', async () => {
    const { fetchImpl } = makeFetch(() => new Response('no', { status: 401 }))
    const client = new WorkerClient({
      baseUrl: 'https://worker.example.com',
      apiToken: 'wtk_badtokenbadtokenbadtokenbadtokenbad!',
      fetchImpl,
    })
    await expect(client.info()).rejects.toBeInstanceOf(WorkerClientAuthError)
  })

  it('throws WorkerClientNetworkError when fetch rejects', async () => {
    const { fetchImpl } = makeFetch(() => {
      throw new TypeError('fetch failed: ECONNREFUSED')
    })
    const client = new WorkerClient({
      baseUrl: 'https://worker.example.com',
      apiToken: 'wtk_token00000000000000000000000000000000',
      fetchImpl,
    })
    await expect(client.info()).rejects.toBeInstanceOf(WorkerClientNetworkError)
  })

  it('throws WorkerClientNetworkError on 5xx', async () => {
    const { fetchImpl } = makeFetch(() => new Response('oops', { status: 503 }))
    const client = new WorkerClient({
      baseUrl: 'https://worker.example.com',
      apiToken: 'wtk_token00000000000000000000000000000000',
      fetchImpl,
    })
    await expect(client.info()).rejects.toBeInstanceOf(WorkerClientNetworkError)
  })

  it('throws WorkerClientInvalidResponseError when /info body is not JSON', async () => {
    const { fetchImpl } = makeFetch(() => new Response('<html>nope</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }))
    const client = new WorkerClient({
      baseUrl: 'https://worker.example.com',
      apiToken: 'wtk_token00000000000000000000000000000000',
      fetchImpl,
    })
    await expect(client.info()).rejects.toBeInstanceOf(WorkerClientInvalidResponseError)
  })

  it('throws WorkerClientInvalidResponseError when /info omits workerId', async () => {
    const { fetchImpl } = makeFetch(() => okJson({ configVersion: 1 }))
    const client = new WorkerClient({
      baseUrl: 'https://worker.example.com',
      apiToken: 'wtk_token00000000000000000000000000000000',
      fetchImpl,
    })
    await expect(client.info()).rejects.toBeInstanceOf(WorkerClientInvalidResponseError)
  })

  it('throws WorkerClientInvalidResponseError when configVersion is not a number', async () => {
    const { fetchImpl } = makeFetch(() => okJson({ workerId: 'w_x', configVersion: 'three' }))
    const client = new WorkerClient({
      baseUrl: 'https://worker.example.com',
      apiToken: 'wtk_token00000000000000000000000000000000',
      fetchImpl,
    })
    await expect(client.info()).rejects.toBeInstanceOf(WorkerClientInvalidResponseError)
  })

  it('passThrough forwards raw Response with Bearer header', async () => {
    const { fetchImpl, calls } = makeFetch(() => new Response('{"ok":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const client = new WorkerClient({
      baseUrl: 'https://worker.example.com',
      apiToken: 'wtk_token00000000000000000000000000000000',
      fetchImpl,
    })
    const res = await client.passThrough('PUT', 'config', { foo: 'bar' }, { 'If-Match': '7' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
    expect(calls[0]!.url).toBe('https://worker.example.com/api/worker/config')
    expect(calls[0]!.init?.method).toBe('PUT')
    const headers = new Headers(calls[0]!.init?.headers)
    expect(headers.get('authorization')).toBe('Bearer wtk_token00000000000000000000000000000000')
    expect(headers.get('if-match')).toBe('7')
    expect(headers.get('content-type')).toBe('application/json')
    expect(calls[0]!.init?.body).toBe(JSON.stringify({ foo: 'bar' }))
  })
})
