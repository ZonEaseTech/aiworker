import type { HostAssignmentSummary } from './host-api'

import { describe, expect, it } from 'vitest'

import {
  createHostApiClient,
  hostApiBaseUrl,
  HostApiError,
} from './host-api'

const readyAssignment: HostAssignmentSummary = {
  assignedEmail: 'lin@example.com',
  serverRef: 'aissh://server/ap-sg-01',
  soulReleaseRef: 'freeform@2026.06.01',
  status: 'ready',
  workerId: 'worker-lin',
  workbenchUrl: 'https://worker.example.com/w/worker-lin',
}

interface FetchCall {
  init: Parameters<typeof fetch>[1]
  input: Parameters<typeof fetch>[0]
}

type TestFetch = typeof fetch & { calls: FetchCall[] }

function createFetch(response: Response | ((call: FetchCall) => Promise<Response> | Response)): TestFetch {
  const calls: FetchCall[] = []
  const fetchImpl = (async (...args: Parameters<typeof fetch>) => {
    const call = { input: args[0], init: args[1] }
    calls.push(call)
    return typeof response === 'function' ? response(call) : response
  }) as TestFetch
  fetchImpl.calls = calls
  return fetchImpl
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  })
}

describe('hostApiBaseUrl', () => {
  it('uses same-origin API paths by default', () => {
    expect(hostApiBaseUrl()).toBe('')
  })

  it('trims trailing slashes from explicit Host API URLs', () => {
    expect(hostApiBaseUrl({ AIWORKER_HOST_API_URL: 'http://host.test///' })).toBe('http://host.test')
  })
})

describe('createHostApiClient', () => {
  it('can be constructed without options for same-origin runtime paths', () => {
    expect(() => createHostApiClient()).not.toThrow()
  })

  it('lists assignments from the configured Host API base URL', async () => {
    const fetchImpl = createFetch(jsonResponse({ assignments: [readyAssignment] }))
    const client = createHostApiClient({ baseUrl: 'http://host.test', fetch: fetchImpl })

    await expect(client.listAssignments()).resolves.toEqual([readyAssignment])

    expect(fetchImpl.calls).toHaveLength(1)
    expect(fetchImpl.calls[0]?.input).toBe('http://host.test/api/host/assignments')
    expect(fetchImpl.calls[0]?.init).toBeUndefined()
  })

  it('uses same-origin assignment paths when the base URL is empty', async () => {
    const fetchImpl = createFetch(jsonResponse({ assignments: [] }))
    const client = createHostApiClient({ fetch: fetchImpl })

    await client.listAssignments()

    expect(fetchImpl.calls[0]?.input).toBe('/api/host/assignments')
  })

  it('creates assignments with the expected method and body', async () => {
    const fetchImpl = createFetch(jsonResponse({
      aisshCommand: 'aissh exec srv-1 "bun aiworker provision --token awp_secret" --reason=test',
      assignment: readyAssignment,
      provisionCommand: 'bun apps/worker-cli/src/aiworker.ts provision --token awp_secret',
    }))
    const client = createHostApiClient({ baseUrl: '', fetch: fetchImpl })

    const input = {
      assignedEmail: 'lin@example.com',
      serverRef: 'aissh://server/ap-sg-01',
      soulReleaseRef: 'freeform@2026.06.01',
    }

    await expect(client.createAssignment(input)).resolves.toEqual({
      aisshCommand: 'aissh exec srv-1 "bun aiworker provision --token awp_secret" --reason=test',
      assignment: readyAssignment,
      provisionCommand: 'bun apps/worker-cli/src/aiworker.ts provision --token awp_secret',
    })

    expect(fetchImpl.calls).toHaveLength(1)
    expect(fetchImpl.calls[0]?.input).toBe('/api/host/assignments')
    expect(fetchImpl.calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(fetchImpl.calls[0]?.init?.body))).toEqual(input)
  })

  it('loads Host options from the configured API base URL', async () => {
    const fetchImpl = createFetch(jsonResponse({
      access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
      auth: { mode: 'dev-static', status: 'deferred-logto' },
      provisioningTargets: [{ id: 'srv-1', displayName: 'aiwork', adapterType: 'aissh', maturity: 'production', ref: 'srv-1' }],
      soulReleases: [{
        descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json',
        id: 'aiworker-freeform',
        name: 'AIWorker Freeform',
        releaseRef: 'aiworker-freeform@dev',
        source: 'official',
      }],
    }))
    const client = createHostApiClient({ baseUrl: 'http://host.test', fetch: fetchImpl })

    const options = await client.getOptions()

    expect(fetchImpl.calls[0]?.input).toBe('http://host.test/api/host/options')
    expect(options.provisioningTargets[0]).toMatchObject({
      adapterType: 'aissh',
      displayName: 'aiwork',
      maturity: 'production',
      ref: 'srv-1',
    })
    expect(options.soulReleases[0]?.releaseRef).toBe('aiworker-freeform@dev')
  })

  it('throws stable HostApiError details for non-ok responses', async () => {
    expect.assertions(3)
    const fetchImpl = createFetch(jsonResponse({ error: { code: 'FORBIDDEN' } }, { status: 403 }))
    const client = createHostApiClient({ baseUrl: '', fetch: fetchImpl })

    try {
      await client.listAssignments()
    }
    catch (error) {
      expect(error).toBeInstanceOf(HostApiError)
      expect(error).toMatchObject({ code: 'FORBIDDEN', status: 403 })
      expect((error as HostApiError).message).toContain('FORBIDDEN')
    }
  })
})
