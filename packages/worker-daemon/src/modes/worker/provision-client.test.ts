import { afterEach, describe, expect, it } from 'bun:test'

import {
  buildAccessHello,
  buildCheckInBody,
  checkInToHost,
  connectWorkerAccessTunnel,
  handleAccessRequestEnvelope,
  maybeProvisionCheckIn,
} from './provision-client'

describe('worker provision check-in client', () => {
  const originalHost = process.env.AIWORKER_HOST_URL
  const originalToken = process.env.AIWORKER_PROVISION_TOKEN

  afterEach(() => {
    if (originalHost == null)
      delete process.env.AIWORKER_HOST_URL
    else
      process.env.AIWORKER_HOST_URL = originalHost
    if (originalToken == null)
      delete process.env.AIWORKER_PROVISION_TOKEN
    else
      process.env.AIWORKER_PROVISION_TOKEN = originalToken
  })

  it('builds the exact worker check-in request body', () => {
    const body = buildCheckInBody({
      id: 'aiworker-freeform',
      provisionToken: 'awp_secret',
      version: '1.2.3',
      workerId: 'worker-1',
      workbenchUrl: '/',
    })

    expect(body).toEqual({
      provisionToken: 'awp_secret',
      worker: {
        health: { ready: true },
        id: 'aiworker-freeform',
        version: '1.2.3',
        workerId: 'worker-1',
        workbenchUrl: '/',
      },
    })
    expect(Object.keys(body).sort()).toEqual(['provisionToken', 'worker'])
    expect(Object.keys(body.worker).sort()).toEqual(['health', 'id', 'version', 'workbenchUrl', 'workerId'])
    expect('sessionId' in body).toBe(false)
    expect('sessionId' in body.worker).toBe(false)
  })

  it('builds the exact worker access hello body', () => {
    const hello = buildAccessHello({
      assignmentId: 'assignment-1',
      token: 'awt_secret',
      workerId: 'worker-1',
    })

    expect(hello).toEqual({
      assignmentId: 'assignment-1',
      token: 'awt_secret',
      workerId: 'worker-1',
    })
    expect(Object.keys(hello).sort()).toEqual(['assignmentId', 'token', 'workerId'])
  })

  it('posts check-in JSON to the host and parses the worker access response', async () => {
    const calls: Array<{ body: unknown, headers: unknown, method: string, url: string }> = []
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({
        body: JSON.parse(String(init?.body)),
        headers: init?.headers,
        method: init?.method ?? 'GET',
        url: String(url),
      })
      return Response.json({
        access: { mode: 'worker_access', token: 'awt_token' },
        assignment: {
          assignedEmail: 'alice@example.com',
          assignmentId: 'assignment-1',
          soulReleaseRef: 'soul-release-1',
          workerId: 'worker-1',
        },
      })
    }

    const response = await checkInToHost({
      fetch: fakeFetch,
      host: 'https://host.example/base',
      id: 'aiworker-freeform',
      provisionToken: 'awp_secret',
      version: '1.2.3',
      workerId: 'worker-1',
      workbenchUrl: '/',
    })

    expect(calls).toEqual([{
      body: {
        provisionToken: 'awp_secret',
        worker: {
          health: { ready: true },
          id: 'aiworker-freeform',
          version: '1.2.3',
          workerId: 'worker-1',
          workbenchUrl: '/',
        },
      },
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      url: 'https://host.example/api/provision/check-in',
    }])
    expect(response.access).toEqual({ mode: 'worker_access', token: 'awt_token' })
    expect(response.assignment.workerId).toBe('worker-1')
  })

  it('throws status-only errors for non-ok responses without leaking the provision token', async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ error: 'bad awp_secret' }), { status: 403 })

    await expect(checkInToHost({
      fetch: fakeFetch,
      host: 'https://host.example',
      id: 'aiworker-freeform',
      provisionToken: 'awp_secret',
      version: '1.2.3',
      workerId: 'worker-1',
      workbenchUrl: '/',
    })).rejects.toThrow('Worker check-in failed: 403')

    try {
      await checkInToHost({
        fetch: fakeFetch,
        host: 'https://host.example',
        id: 'aiworker-freeform',
        provisionToken: 'awp_secret',
        version: '1.2.3',
        workerId: 'worker-1',
        workbenchUrl: '/',
      })
    }
    catch (error) {
      expect(String(error)).not.toContain('awp_secret')
    }
  })

  it('calls injected check-in once for a single active worker when provision env is present', async () => {
    process.env.AIWORKER_HOST_URL = 'https://host.example'
    process.env.AIWORKER_PROVISION_TOKEN = 'awp_secret'
    const calls: unknown[] = []

    const receipt = await maybeProvisionCheckIn({
      activeResolution: {
        kind: 'single',
        worker: {
          appId: 'aiworker-freeform',
          id: 'worker-1',
        },
      },
      checkIn: async (input) => {
        calls.push(input)
        return {
          access: { mode: 'worker_access', token: 'awt_token' },
          assignment: {
            assignedEmail: 'alice@example.com',
            assignmentId: 'assignment-1',
            soulReleaseRef: 'soul-release-1',
            workerId: 'worker-1',
          },
        }
      },
      env: process.env,
      runtimeVersion: '1.2.3',
    })

    expect(receipt?.access.token).toBe('awt_token')
    expect(calls).toEqual([{
      host: 'https://host.example',
      id: 'aiworker-freeform',
      provisionToken: 'awp_secret',
      version: '1.2.3',
      workerId: 'worker-1',
      workbenchUrl: '/',
    }])
  })

  it('does not call injected check-in when provision env is absent', async () => {
    delete process.env.AIWORKER_HOST_URL
    delete process.env.AIWORKER_PROVISION_TOKEN
    const calls: unknown[] = []

    const receipt = await maybeProvisionCheckIn({
      activeResolution: {
        kind: 'single',
        worker: {
          appId: 'aiworker-freeform',
          id: 'worker-1',
        },
      },
      checkIn: async (input) => {
        calls.push(input)
        return {
          access: { mode: 'worker_access', token: 'awt_token' },
          assignment: {
            assignedEmail: 'alice@example.com',
            assignmentId: 'assignment-1',
            soulReleaseRef: 'soul-release-1',
            workerId: 'worker-1',
          },
        }
      },
      env: process.env,
      runtimeVersion: '1.2.3',
    })

    expect(receipt).toBeNull()
    expect(calls).toEqual([])
  })

  it('does not require or read a worker access local url env', async () => {
    const env = {
      AIWORKER_HOST_URL: 'https://host.example',
      AIWORKER_PROVISION_TOKEN: 'awp_secret',
      AIWORKER_WORKER_ACCESS_LOCAL_URL: 'http://wrong.example',
    }
    const sent: unknown[] = []
    const urls: string[] = []

    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: {
        assignedEmail: 'bob@example.com',
        assignmentId: 'asn_1',
        soulReleaseRef: 'soul_1',
        workerId: 'wkr_82',
      },
      createWebSocket: (url) => {
        urls.push(url.toString())
        return fakeWebSocket(url, sent)
      },
      env,
      localFetch: async request => new Response(`local:${new URL(request.url).pathname}`),
    })

    expect(urls).toEqual(['wss://host.example/api/provision/access'])
    expect(sent[0]).toEqual({
      type: 'hello',
      assignmentId: 'asn_1',
      token: 'awt_secret',
      workerId: 'wkr_82',
    })
  })

  it('forwards tunnel request frames to the injected local runtime handler', async () => {
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('wss://host.example/api/provision/access'), sent)
    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: {
        assignedEmail: 'bob@example.com',
        assignmentId: 'asn_1',
        soulReleaseRef: 'soul_1',
        workerId: 'wkr_82',
      },
      createWebSocket: () => socket,
      env: { AIWORKER_HOST_URL: 'https://host.example' },
      localFetch: async request => new Response(`ok:${new URL(request.url).pathname}`, { status: 201 }),
    })

    await socket.dispatchMessage({
      type: 'request',
      id: 'req_1',
      method: 'GET',
      path: '/api/info',
      headers: {},
      bodyText: '',
    })

    expect(sent.at(-1)).toEqual({
      type: 'response',
      id: 'req_1',
      status: 201,
      headers: {},
      bodyText: 'ok:/api/info',
    })
  })

  it('responds to tunnel ping frames', async () => {
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('ws://host.example/api/provision/access'), sent)
    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: {
        assignedEmail: 'bob@example.com',
        assignmentId: 'asn_1',
        soulReleaseRef: 'soul_1',
        workerId: 'wkr_82',
      },
      createWebSocket: () => socket,
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
    })

    await socket.dispatchMessage({ type: 'ping', id: 'ping_1' })

    expect(sent.at(-1)).toEqual({ type: 'pong', id: 'ping_1' })
  })

  it('forwards a worker access GET envelope to the local workbench and returns a response envelope', async () => {
    const calls: Array<{ body: unknown, headers: unknown, method: string, url: string }> = []

    const response = await handleAccessRequestEnvelope({
      envelope: {
        type: 'request',
        id: 'req_1',
        method: 'GET',
        path: '/workers/wkr_82',
        headers: { accept: 'text/html' },
        bodyText: 'must-not-forward',
      },
      localFetch: async (request) => {
        calls.push({
          body: await request.text(),
          headers: Object.fromEntries(request.headers.entries()),
          method: request.method,
          url: request.url,
        })
        return new Response('<main>worker</main>', {
          headers: { 'content-type': 'text/html' },
          status: 202,
        })
      },
    })

    expect(calls).toEqual([{
      body: '',
      headers: { accept: 'text/html' },
      method: 'GET',
      url: 'http://aiworker.local/workers/wkr_82',
    }])
    expect(response).toEqual({
      type: 'response',
      id: 'req_1',
      status: 202,
      headers: { 'content-type': 'text/html' },
      bodyText: '<main>worker</main>',
    })
  })

  it('forwards worker access POST body and headers to the local workbench', async () => {
    const calls: Array<{ body: unknown, headers: unknown, method: string, url: string }> = []

    await handleAccessRequestEnvelope({
      envelope: {
        type: 'request',
        id: 'req_2',
        method: 'POST',
        path: '/workers/wkr_82/api/messages',
        headers: { 'content-type': 'application/json' },
        bodyText: '{"text":"hello"}',
      },
      localFetch: async (request) => {
        calls.push({
          body: await request.text(),
          headers: Object.fromEntries(request.headers.entries()),
          method: request.method,
          url: request.url,
        })
        return Response.json({ ok: true })
      },
    })

    expect(calls).toEqual([{
      body: '{"text":"hello"}',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      url: 'http://aiworker.local/workers/wkr_82/api/messages',
    }])
  })

  it('rejects absolute worker access paths without calling fetch', async () => {
    let calls = 0

    for (const path of ['https://evil.example/pwn', '//evil.example/pwn']) {
      await expect(handleAccessRequestEnvelope({
        envelope: {
          type: 'request',
          id: 'req_3',
          method: 'GET',
          path,
          headers: {},
          bodyText: '',
        },
        localFetch: async () => {
          calls += 1
          return Response.json({ ok: true })
        },
      })).rejects.toThrow('invalid worker access path')
    }

    expect(calls).toBe(0)
  })
})

function fakeWebSocket(url: URL, sent: unknown[]) {
  let onmessage: ((event: { data: string }) => Promise<void> | void) | null = null
  return {
    async dispatchMessage(frame: unknown) {
      await onmessage?.({ data: JSON.stringify(frame) })
    },
    send(value: string) {
      sent.push(JSON.parse(value))
    },
    set onmessage(handler: ((event: { data: string }) => Promise<void> | void) | null) {
      onmessage = handler
    },
    get onmessage() {
      return onmessage
    },
    get url() {
      return url.toString()
    },
  }
}
