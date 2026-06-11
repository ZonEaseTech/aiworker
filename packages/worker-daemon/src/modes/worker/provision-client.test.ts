import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'

import {
  persistWorkerAccess,
  readPersistedWorkerAccess,
} from './access-token-store'
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

  it('D6: reads back the persisted access and skips check-in when a token file exists', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-d6-skip-'))
    try {
      await persistWorkerAccess(home, {
        access: { mode: 'worker_access', token: 'awt_persisted' },
        assignment: { assignmentId: 'asn_persisted', workerId: 'wkr_82' },
      })
      process.env.AIWORKER_HOST_URL = 'https://host.example'
      process.env.AIWORKER_PROVISION_TOKEN = 'awp_secret'
      const calls: unknown[] = []

      const receipt = await maybeProvisionCheckIn({
        activeResolution: { kind: 'single', worker: { appId: 'aiworker-freeform', id: 'wkr_82' } },
        checkIn: async (input) => {
          calls.push(input)
          throw new Error('check-in must not be called when persisted token exists')
        },
        env: process.env,
        runtimeVersion: '1.2.3',
        workerHome: home,
      })

      // Reconstructs a tunnel-compatible receipt from the persisted reconnect triple.
      expect(receipt?.access).toEqual({ mode: 'worker_access', token: 'awt_persisted' })
      expect(receipt?.assignment.assignmentId).toBe('asn_persisted')
      expect(receipt?.assignment.workerId).toBe('wkr_82')
      expect(calls).toEqual([])
    }
    finally {
      await rm(home, { force: true, recursive: true })
    }
  })

  it('D6: check-in then persists the returned access when no token file exists yet', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-d6-persist-'))
    try {
      process.env.AIWORKER_HOST_URL = 'https://host.example'
      process.env.AIWORKER_PROVISION_TOKEN = 'awp_secret'
      const calls: unknown[] = []

      const receipt = await maybeProvisionCheckIn({
        activeResolution: { kind: 'single', worker: { appId: 'aiworker-freeform', id: 'wkr_82' } },
        checkIn: async (input) => {
          calls.push(input)
          return {
            access: { mode: 'worker_access', token: 'awt_fresh' },
            assignment: {
              assignedEmail: 'alice@example.com',
              assignmentId: 'asn_fresh',
              soulReleaseRef: 'soul-release-1',
              workerId: 'wkr_82',
            },
          }
        },
        env: process.env,
        runtimeVersion: '1.2.3',
        workerHome: home,
      })

      expect(calls).toHaveLength(1)
      expect(receipt?.access.token).toBe('awt_fresh')
      const persisted = await readPersistedWorkerAccess(home)
      expect(persisted).toEqual({
        access: { mode: 'worker_access', token: 'awt_fresh' },
        assignment: { assignmentId: 'asn_fresh', workerId: 'wkr_82' },
      })
    }
    finally {
      await rm(home, { force: true, recursive: true })
    }
  })

  it('D6/AC#4b: surfaces a consumed-token 401 instead of silently dying', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'aiworker-d6-401-'))
    try {
      process.env.AIWORKER_HOST_URL = 'https://host.example'
      process.env.AIWORKER_PROVISION_TOKEN = 'awp_already_consumed'

      await expect(maybeProvisionCheckIn({
        activeResolution: { kind: 'single', worker: { appId: 'aiworker-freeform', id: 'wkr_82' } },
        checkIn: async () => {
          throw new Error('Worker check-in failed: 401')
        },
        env: process.env,
        runtimeVersion: '1.2.3',
        workerHome: home,
      })).rejects.toThrow('Worker check-in failed: 401')

      // The consumed-token failure must not leave a partial/stale token file behind.
      expect(await readPersistedWorkerAccess(home)).toBeNull()
    }
    finally {
      await rm(home, { force: true, recursive: true })
    }
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

  it('sends a keepalive ping once per configured interval', async () => {
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('ws://host.example/api/provision/access'), sent)
    const clock = fakeKeepaliveClock()
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
      keepaliveIntervalMs: 25_000,
      localFetch: async () => new Response('unused'),
      startKeepalive: clock.startKeepalive,
    })

    expect(clock.lastIntervalMs).toBe(25_000)
    // The hello frame is the only thing sent before any tick.
    const helloOnly = sent.filter(frame => (frame as { type: string }).type === 'ping')
    expect(helloOnly).toEqual([])

    clock.advance(3)
    const pings = sent.filter(frame => (frame as { type: string }).type === 'ping')
    expect(pings).toHaveLength(3)
    for (const ping of pings)
      expect((ping as { type: string }).type).toBe('ping')
    // Each keepalive ping carries a non-empty id so the host pong path can echo it.
    const ids = pings.map(ping => (ping as { id: string }).id)
    expect(ids.every(id => typeof id === 'string' && id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps sending keepalive pings after the host pong reply (no death detection)', async () => {
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('ws://host.example/api/provision/access'), sent)
    const clock = fakeKeepaliveClock()
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
      startKeepalive: clock.startKeepalive,
    })

    clock.advance(1)
    const firstPing = sent.filter(frame => (frame as { type: string }).type === 'ping').at(-1) as { id: string }
    // Host replies pong with the same id; the worker must not throw or stop keepalive.
    await socket.dispatchMessage({ type: 'pong', id: firstPing.id })
    clock.advance(1)

    const pings = sent.filter(frame => (frame as { type: string }).type === 'ping')
    expect(pings).toHaveLength(2)
  })

  it('clears the keepalive timer on close so no further pings are sent (no leak)', async () => {
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('ws://host.example/api/provision/access'), sent)
    const clock = fakeKeepaliveClock()
    const handle = await connectWorkerAccessTunnel({
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
      startKeepalive: clock.startKeepalive,
    })

    clock.advance(1)
    expect(sent.filter(frame => (frame as { type: string }).type === 'ping')).toHaveLength(1)
    expect(clock.stopped).toBe(false)

    handle?.close()
    expect(clock.stopped).toBe(true)

    // Ticks delivered after close must not produce more pings.
    clock.advance(5)
    expect(sent.filter(frame => (frame as { type: string }).type === 'ping')).toHaveLength(1)
  })

  it('runs an independent keepalive timer per tunnel connection', async () => {
    const sentA: unknown[] = []
    const sentB: unknown[] = []
    const socketA = fakeWebSocket(new URL('ws://host.example/api/provision/access'), sentA)
    const socketB = fakeWebSocket(new URL('ws://host.example/api/provision/access'), sentB)
    const clockA = fakeKeepaliveClock()
    const clockB = fakeKeepaliveClock()

    const handleA = await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'a@example.com', assignmentId: 'asn_a', soulReleaseRef: 'soul_a', workerId: 'wkr_a' },
      createWebSocket: () => socketA,
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
      startKeepalive: clockA.startKeepalive,
    })
    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_b', soulReleaseRef: 'soul_b', workerId: 'wkr_b' },
      createWebSocket: () => socketB,
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
      startKeepalive: clockB.startKeepalive,
    })

    clockA.advance(2)
    // B has not ticked at all.
    expect(sentA.filter(frame => (frame as { type: string }).type === 'ping')).toHaveLength(2)
    expect(sentB.filter(frame => (frame as { type: string }).type === 'ping')).toHaveLength(0)

    // Closing A must not affect B's keepalive.
    handleA?.close()
    expect(clockA.stopped).toBe(true)
    expect(clockB.stopped).toBe(false)

    clockB.advance(3)
    expect(sentB.filter(frame => (frame as { type: string }).type === 'ping')).toHaveLength(3)
    // A stays closed → no extra pings.
    expect(sentA.filter(frame => (frame as { type: string }).type === 'ping')).toHaveLength(2)
  })

  it('reads the keepalive interval from env when no explicit interval is given', async () => {
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('ws://host.example/api/provision/access'), sent)
    const clock = fakeKeepaliveClock()
    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: {
        assignedEmail: 'bob@example.com',
        assignmentId: 'asn_1',
        soulReleaseRef: 'soul_1',
        workerId: 'wkr_82',
      },
      createWebSocket: () => socket,
      env: {
        AIWORKER_HOST_URL: 'http://host.example',
        AIWORKER_WORKER_ACCESS_KEEPALIVE_MS: '12000',
      },
      localFetch: async () => new Response('unused'),
      startKeepalive: clock.startKeepalive,
    })

    expect(clock.lastIntervalMs).toBe(12_000)
  })

  it('ignores a non-positive env keepalive interval and falls back to the default', async () => {
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('ws://host.example/api/provision/access'), sent)
    const clock = fakeKeepaliveClock()
    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: {
        assignedEmail: 'bob@example.com',
        assignmentId: 'asn_1',
        soulReleaseRef: 'soul_1',
        workerId: 'wkr_82',
      },
      createWebSocket: () => socket,
      env: {
        AIWORKER_HOST_URL: 'http://host.example',
        AIWORKER_WORKER_ACCESS_KEEPALIVE_MS: 'not-a-number',
      },
      localFetch: async () => new Response('unused'),
      startKeepalive: clock.startKeepalive,
    })

    expect(clock.lastIntervalMs).toBe(25_000)
  })

  it('clears the keepalive timer and schedules a reconnect when the host drops the socket (onclose)', async () => {
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('ws://host.example/api/provision/access'), sent)
    const clock = fakeKeepaliveClock()
    const reconnect = fakeReconnectScheduler()
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
      logger: fakeLogger(),
      startKeepalive: clock.startKeepalive,
      startReconnectTimer: reconnect.startReconnectTimer,
    })

    clock.advance(1)
    expect(sent.filter(frame => (frame as { type: string }).type === 'ping')).toHaveLength(1)

    // Host drops the socket: the worker clears its keepalive timer (no leak) and schedules a reconnect.
    socket.dispatchClose()
    expect(clock.stopped).toBe(true)
    expect(reconnect.lastDelayMs).toBeGreaterThan(0)

    // The dead socket's keepalive never fires again.
    clock.advance(5)
    expect(sent.filter(frame => (frame as { type: string }).type === 'ping')).toHaveLength(1)
  })

  it('force-closes and reconnects after the missed-pong limit (death detection on a half-open socket)', async () => {
    const clock = fakeKeepaliveClock()
    const reconnect = fakeReconnectScheduler()
    const socketSents: unknown[][] = []
    const sockets: ReturnType<typeof fakeWebSocket>[] = []
    const create = (url: URL) => {
      const sent: unknown[] = []
      socketSents.push(sent)
      const socket = fakeWebSocket(url, sent)
      sockets.push(socket)
      return socket
    }

    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: create,
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
      logger: fakeLogger(),
      missedPongLimit: 3,
      random: () => 1,
      startKeepalive: clock.startKeepalive,
      startReconnectTimer: reconnect.startReconnectTimer,
    })

    // Three keepalive pings go unanswered; no death yet.
    clock.advance(3)
    expect(socketSents[0]!.filter(frame => (frame as { type: string }).type === 'ping')).toHaveLength(3)
    expect(reconnect.lastDelayMs).toBeNull()

    // Fourth tick: missed pongs reach the limit → force close → schedule reconnect.
    clock.advance(1)
    expect(reconnect.lastDelayMs).toBe(1000)
    expect(clock.stopped).toBe(true)
    // The dead socket sent no fourth ping.
    expect(socketSents[0]!.filter(frame => (frame as { type: string }).type === 'ping')).toHaveLength(3)

    // Backoff elapses → a brand new socket opens and re-sends hello with the same token.
    reconnect.fire()
    expect(sockets).toHaveLength(2)
    expect(socketSents[1]![0]).toEqual({ type: 'hello', assignmentId: 'asn_1', token: 'awt_secret', workerId: 'wkr_82' })
  })

  it('keeps a healthy connection alive past the missed-pong limit when pongs arrive (no false death)', async () => {
    const clock = fakeKeepaliveClock()
    const reconnect = fakeReconnectScheduler()
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('ws://host.example/api/provision/access'), sent)

    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: () => socket,
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
      missedPongLimit: 3,
      startKeepalive: clock.startKeepalive,
      startReconnectTimer: reconnect.startReconnectTimer,
    })

    // Every ping is answered with a pong → the missed counter never reaches the limit.
    for (let i = 0; i < 10; i += 1) {
      clock.advance(1)
      const lastPing = sent.filter(frame => (frame as { type: string }).type === 'ping').at(-1) as { id: string }
      await socket.dispatchMessage({ type: 'pong', id: lastPing.id })
    }

    expect(sent.filter(frame => (frame as { type: string }).type === 'ping')).toHaveLength(10)
    expect(reconnect.lastDelayMs).toBeNull()
  })

  it('reconnects after an unexpected close, re-sending hello with the same access token (no re-provision)', async () => {
    const clock = fakeKeepaliveClock()
    const reconnect = fakeReconnectScheduler()
    const socketSents: unknown[][] = []
    const sockets: ReturnType<typeof fakeWebSocket>[] = []
    const create = (url: URL) => {
      const sent: unknown[] = []
      socketSents.push(sent)
      const socket = fakeWebSocket(url, sent)
      sockets.push(socket)
      return socket
    }

    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: create,
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
      logger: fakeLogger(),
      startKeepalive: clock.startKeepalive,
      startReconnectTimer: reconnect.startReconnectTimer,
    })

    expect(socketSents[0]![0]).toEqual({ type: 'hello', assignmentId: 'asn_1', token: 'awt_secret', workerId: 'wkr_82' })

    // Host restarts → the socket closes.
    sockets[0]!.dispatchClose()
    expect(reconnect.lastDelayMs).toBeGreaterThan(0)

    reconnect.fire()
    expect(sockets).toHaveLength(2)
    // The same durable access token is reused — no re-provision, no new check-in.
    expect(socketSents[1]![0]).toEqual({ type: 'hello', assignmentId: 'asn_1', token: 'awt_secret', workerId: 'wkr_82' })
  })

  it('uses exponential backoff capped at the max across consecutive failed reconnects', async () => {
    const clock = fakeKeepaliveClock()
    const reconnect = fakeReconnectScheduler()
    const sockets: ReturnType<typeof fakeWebSocket>[] = []
    const create = (url: URL) => {
      const socket = fakeWebSocket(url, [])
      sockets.push(socket)
      return socket
    }

    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: create,
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
      logger: fakeLogger(),
      reconnectBaseDelayMs: 1000,
      reconnectMaxDelayMs: 30_000,
      random: () => 1,
      startKeepalive: clock.startKeepalive,
      startReconnectTimer: reconnect.startReconnectTimer,
    })

    const seen: Array<number | null> = []
    for (let i = 0; i < 7; i += 1) {
      // Each fresh socket dies immediately without ever carrying traffic → attempts keep growing.
      sockets.at(-1)!.dispatchClose()
      seen.push(reconnect.lastDelayMs)
      reconnect.fire()
    }

    expect(seen).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000])
  })

  it('does not reconnect after an intentional close()', async () => {
    const clock = fakeKeepaliveClock()
    const reconnect = fakeReconnectScheduler()
    const sockets: ReturnType<typeof fakeWebSocket>[] = []
    const create = (url: URL) => {
      const socket = fakeWebSocket(url, [])
      sockets.push(socket)
      return socket
    }

    const handle = await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: create,
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
      startKeepalive: clock.startKeepalive,
      startReconnectTimer: reconnect.startReconnectTimer,
    })

    handle?.close()
    expect(clock.stopped).toBe(true)

    // A late close event from the now-orphaned socket must not schedule a reconnect.
    sockets[0]!.dispatchClose()
    expect(reconnect.lastDelayMs).toBeNull()
    expect(sockets).toHaveLength(1)
  })

  it('resets the backoff after a healthy reconnection (inbound frame received)', async () => {
    const clock = fakeKeepaliveClock()
    const reconnect = fakeReconnectScheduler()
    const sockets: ReturnType<typeof fakeWebSocket>[] = []
    const create = (url: URL) => {
      const socket = fakeWebSocket(url, [])
      sockets.push(socket)
      return socket
    }

    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: create,
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
      logger: fakeLogger(),
      reconnectBaseDelayMs: 1000,
      reconnectMaxDelayMs: 30_000,
      random: () => 1,
      startKeepalive: clock.startKeepalive,
      startReconnectTimer: reconnect.startReconnectTimer,
    })

    sockets[0]!.dispatchClose()
    expect(reconnect.lastDelayMs).toBe(1000)
    reconnect.fire()

    sockets[1]!.dispatchClose()
    expect(reconnect.lastDelayMs).toBe(2000)
    reconnect.fire()

    // The third socket actually carries traffic → connection is healthy → backoff resets.
    await sockets[2]!.dispatchMessage({ type: 'pong', id: 'wkr-keepalive-1' })
    sockets[2]!.dispatchClose()
    expect(reconnect.lastDelayMs).toBe(1000)
  })

  it('warns that re-provision may be required after repeated failed reconnects', async () => {
    const clock = fakeKeepaliveClock()
    const reconnect = fakeReconnectScheduler()
    const logger = fakeLogger()
    const sockets: ReturnType<typeof fakeWebSocket>[] = []
    const create = (url: URL) => {
      const socket = fakeWebSocket(url, [])
      sockets.push(socket)
      return socket
    }

    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: create,
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
      logger,
      reconnectReprovisionHintAfter: 3,
      startKeepalive: clock.startKeepalive,
      startReconnectTimer: reconnect.startReconnectTimer,
    })

    for (let i = 0; i < 3; i += 1) {
      sockets.at(-1)!.dispatchClose()
      reconnect.fire()
    }

    expect(logger.infos.some(message => /reconnect/i.test(message))).toBe(true)
    expect(logger.warns.some(message => /re-provision/i.test(message))).toBe(true)
  })

  it('treats an access_rejected (4401) close as revocation: clears the persisted token and stops reconnecting', async () => {
    const clock = fakeKeepaliveClock()
    const reconnect = fakeReconnectScheduler()
    const logger = fakeLogger()
    const socket = fakeWebSocket(new URL('ws://host.example/api/provision/access'), [])
    const cleared: string[] = []

    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      clearPersistedAccess: async (home) => {
        cleared.push(home)
      },
      createWebSocket: () => socket,
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
      logger,
      startKeepalive: clock.startKeepalive,
      startReconnectTimer: reconnect.startReconnectTimer,
      workerHome: '/tmp/worker-home',
    })

    // Host rejects the hello (revoked/denied) with the application close code 4401.
    socket.dispatchClose(4401)

    // Revocation, not a blip: the persisted token is cleared and no reconnect is scheduled.
    expect(cleared).toEqual(['/tmp/worker-home'])
    expect(reconnect.lastDelayMs).toBeNull()
    expect(clock.stopped).toBe(true)
    expect(logger.warns.some(message => /revoked|re-provision/i.test(message))).toBe(true)
    // The token is never echoed into any log line.
    expect([...logger.infos, ...logger.warns].some(message => message.includes('awt_secret'))).toBe(false)
  })

  it('still reconnects on a non-4401 close code (transient blip, not revocation)', async () => {
    const clock = fakeKeepaliveClock()
    const reconnect = fakeReconnectScheduler()
    const socket = fakeWebSocket(new URL('ws://host.example/api/provision/access'), [])
    const cleared: string[] = []

    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      clearPersistedAccess: async (home) => {
        cleared.push(home)
      },
      createWebSocket: () => socket,
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
      logger: fakeLogger(),
      startKeepalive: clock.startKeepalive,
      startReconnectTimer: reconnect.startReconnectTimer,
      workerHome: '/tmp/worker-home',
    })

    // Caddy/proxy 1006-style abnormal close (not 4401) → transient: reconnect, keep the token.
    socket.dispatchClose(1006)

    expect(reconnect.lastDelayMs).toBeGreaterThan(0)
    expect(cleared).toEqual([])
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

  it('eagerly requests anthropic + openai credentials after hello on connect', async () => {
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('wss://host.example/api/provision/access'), sent)
    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: () => socket,
      credentialStore: fakeCredentialStore(),
      env: { AIWORKER_HOST_URL: 'https://host.example' },
      localFetch: async () => new Response('unused'),
    })

    expect(sent[0]).toEqual({ type: 'hello', assignmentId: 'asn_1', token: 'awt_secret', workerId: 'wkr_82' })
    const acquires = sent.filter(frame => (frame as { type: string }).type === 'credential_acquire')
    expect(acquires).toEqual([
      { type: 'credential_acquire', providerKind: 'anthropic' },
      { type: 'credential_acquire', providerKind: 'openai' },
    ])
  })

  it('does not request credentials when no credential store is wired', async () => {
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('wss://host.example/api/provision/access'), sent)
    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: () => socket,
      env: { AIWORKER_HOST_URL: 'https://host.example' },
      localFetch: async () => new Response('unused'),
    })

    expect(sent.filter(frame => (frame as { type: string }).type === 'credential_acquire')).toEqual([])
  })

  it('writes the granted credential into the store on credential_grant', async () => {
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('wss://host.example/api/provision/access'), sent)
    const store = fakeCredentialStore()
    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: () => socket,
      credentialStore: store,
      env: { AIWORKER_HOST_URL: 'https://host.example' },
      localFetch: async () => new Response('unused'),
    })

    await socket.dispatchMessage({
      type: 'credential_grant',
      providerKind: 'anthropic',
      gatewayUrl: 'https://gw.example/anthropic',
      token: 'org-key-anthropic',
      expiresAt: '2099-01-01T00:00:00.000Z',
    })

    expect(store.sets).toEqual([
      ['anthropic', { gatewayUrl: 'https://gw.example/anthropic', token: 'org-key-anthropic', expiresAt: '2099-01-01T00:00:00.000Z' }],
    ])
  })

  it('schedules a refresh before a near-term expiry and emits credential_refresh', async () => {
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('wss://host.example/api/provision/access'), sent)
    const refresh = fakeRefreshScheduler()
    const now = Date.parse('2026-06-11T00:00:00.000Z')
    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: () => socket,
      credentialStore: fakeCredentialStore(),
      env: { AIWORKER_HOST_URL: 'https://host.example' },
      localFetch: async () => new Response('unused'),
      now: () => now,
      startRefreshTimer: refresh.startRefreshTimer,
    })

    // Expiry 10 minutes out → a refresh is scheduled (well under the sane cap).
    await socket.dispatchMessage({
      type: 'credential_grant',
      providerKind: 'openai',
      gatewayUrl: 'https://gw.example/openai',
      token: 'short-ttl-openai',
      expiresAt: new Date(now + 10 * 60_000).toISOString(),
    })

    expect(refresh.scheduled).toHaveLength(1)
    expect(refresh.scheduled[0]!.delayMs).toBeGreaterThan(0)
    refresh.fire(0)
    expect(sent.filter(frame => (frame as { type: string }).type === 'credential_refresh')).toEqual([
      { type: 'credential_refresh', providerKind: 'openai' },
    ])
  })

  it('never schedules a refresh for a far-future org-key expiry (no 1ms storm)', async () => {
    const sent: unknown[] = []
    const socket = fakeWebSocket(new URL('wss://host.example/api/provision/access'), sent)
    const refresh = fakeRefreshScheduler()
    const now = Date.parse('2026-06-11T00:00:00.000Z')
    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: () => socket,
      credentialStore: fakeCredentialStore(),
      env: { AIWORKER_HOST_URL: 'https://host.example' },
      localFetch: async () => new Response('unused'),
      now: () => now,
      startRefreshTimer: refresh.startRefreshTimer,
    })

    // org-key mode: far-future placeholder expiry → no refresh scheduled, no frame sent.
    await socket.dispatchMessage({
      type: 'credential_grant',
      providerKind: 'anthropic',
      gatewayUrl: 'https://gw.example/anthropic',
      token: 'org-key-anthropic',
      expiresAt: '2099-01-01T00:00:00.000Z',
    })

    expect(refresh.scheduled).toEqual([])
    expect(sent.filter(frame => (frame as { type: string }).type === 'credential_refresh')).toEqual([])
  })

  it('re-sends acquire after a reconnect (credential recovery without re-provision)', async () => {
    const clock = fakeKeepaliveClock()
    const reconnect = fakeReconnectScheduler()
    const socketSents: unknown[][] = []
    const sockets: ReturnType<typeof fakeWebSocket>[] = []
    const create = (url: URL) => {
      const sent: unknown[] = []
      socketSents.push(sent)
      const socket = fakeWebSocket(url, sent)
      sockets.push(socket)
      return socket
    }

    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: create,
      credentialStore: fakeCredentialStore(),
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
      startKeepalive: clock.startKeepalive,
      startReconnectTimer: reconnect.startReconnectTimer,
    })

    // First socket: hello + two acquires.
    expect(socketSents[0]!.filter(f => (f as { type: string }).type === 'credential_acquire')).toHaveLength(2)

    // Transient close → reconnect opens a fresh socket which re-sends hello + acquires.
    sockets[0]!.dispatchClose()
    reconnect.fire()
    expect(sockets).toHaveLength(2)
    expect(socketSents[1]![0]).toEqual({ type: 'hello', assignmentId: 'asn_1', token: 'awt_secret', workerId: 'wkr_82' })
    expect(socketSents[1]!.filter(f => (f as { type: string }).type === 'credential_acquire')).toEqual([
      { type: 'credential_acquire', providerKind: 'anthropic' },
      { type: 'credential_acquire', providerKind: 'openai' },
    ])
  })

  it('clears the credential store on access revocation (4401) but not on transient disconnect', async () => {
    const clock = fakeKeepaliveClock()
    const reconnect = fakeReconnectScheduler()
    const sockets: ReturnType<typeof fakeWebSocket>[] = []
    const create = (url: URL) => {
      const socket = fakeWebSocket(url, [])
      sockets.push(socket)
      return socket
    }
    const store = fakeCredentialStore()

    await connectWorkerAccessTunnel({
      access: { mode: 'worker_access', token: 'awt_secret' },
      assignment: { assignedEmail: 'b@example.com', assignmentId: 'asn_1', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
      createWebSocket: create,
      credentialStore: store,
      env: { AIWORKER_HOST_URL: 'http://host.example' },
      localFetch: async () => new Response('unused'),
      startKeepalive: clock.startKeepalive,
      startReconnectTimer: reconnect.startReconnectTimer,
      workerHome: '/tmp/does-not-matter',
      clearPersistedAccess: async () => {},
    })

    // Transient disconnect must NOT clear credentials (reconnect re-grants).
    sockets[0]!.dispatchClose()
    expect(store.clears).toBe(0)

    reconnect.fire()
    // Revocation (4401) must clear credentials.
    sockets[1]!.dispatchClose(4401)
    expect(store.clears).toBe(1)
  })
})

function fakeKeepaliveClock() {
  const state = {
    lastIntervalMs: null as number | null,
    stopped: false,
    tick: null as (() => void) | null,
  }
  return {
    advance(ticks: number) {
      for (let i = 0; i < ticks; i += 1)
        state.tick?.()
    },
    get lastIntervalMs() {
      return state.lastIntervalMs
    },
    startKeepalive(tick: () => void, intervalMs: number): () => void {
      state.lastIntervalMs = intervalMs
      state.tick = tick
      state.stopped = false
      return () => {
        state.stopped = true
        state.tick = null
      }
    },
    get stopped() {
      return state.stopped
    },
  }
}

function fakeReconnectScheduler() {
  const state = {
    canceled: false,
    delays: [] as number[],
    lastDelayMs: null as number | null,
    run: null as (() => void) | null,
  }
  return {
    get canceled() {
      return state.canceled
    },
    get delays() {
      return state.delays
    },
    fire() {
      const run = state.run
      state.run = null
      run?.()
    },
    get lastDelayMs() {
      return state.lastDelayMs
    },
    startReconnectTimer(run: () => void, delayMs: number): () => void {
      state.run = run
      state.lastDelayMs = delayMs
      state.delays.push(delayMs)
      state.canceled = false
      return () => {
        state.canceled = true
        state.run = null
      }
    },
  }
}

function fakeLogger() {
  const infos: string[] = []
  const warns: string[] = []
  return {
    info(message: string) {
      infos.push(message)
    },
    get infos() {
      return infos
    },
    warn(message: string) {
      warns.push(message)
    },
    get warns() {
      return warns
    },
  }
}

function fakeCredentialStore() {
  const sets: Array<[string, unknown]> = []
  let clears = 0
  return {
    get clears() {
      return clears
    },
    set(providerKind: string, credential: unknown) {
      sets.push([providerKind, credential])
    },
    get sets() {
      return sets
    },
    clear() {
      clears += 1
    },
  }
}

function fakeRefreshScheduler() {
  const scheduled: Array<{ delayMs: number, run: () => void }> = []
  return {
    fire(index: number) {
      scheduled[index]?.run()
    },
    get scheduled() {
      return scheduled
    },
    startRefreshTimer(run: () => void, delayMs: number): () => void {
      const entry = { delayMs, run }
      scheduled.push(entry)
      return () => {
        const at = scheduled.indexOf(entry)
        if (at >= 0)
          scheduled.splice(at, 1)
      }
    },
  }
}

function fakeWebSocket(url: URL, sent: unknown[]) {
  let onmessage: ((event: { data: string }) => Promise<void> | void) | null = null
  let onclose: ((event?: { code?: number }) => void) | null = null
  let closeCalls = 0
  return {
    get closeCalls() {
      return closeCalls
    },
    // 模拟真实 CloseEvent:可带 close code(撤销 = 4401),不带则模拟无 code 的瞬断。
    dispatchClose(code?: number) {
      onclose?.(code === undefined ? undefined : { code })
    },
    close() {
      closeCalls += 1
    },
    async dispatchMessage(frame: unknown) {
      await onmessage?.({ data: JSON.stringify(frame) })
    },
    send(value: string) {
      sent.push(JSON.parse(value))
    },
    set onclose(handler: (() => void) | null) {
      onclose = handler
    },
    get onclose() {
      return onclose
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
