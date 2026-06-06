import { describe, expect, test } from 'bun:test'

import {
  createAccessRequestEnvelope,
  createWorkerAccessRegistry,
  mapWorkerAccessPath,
  parseAccessResponseEnvelope,
  sanitizeForwardHeaders,
} from './access-adapter'

describe('host-control access adapter boundary', () => {
  test('registers and removes access connections', () => {
    const registry = createWorkerAccessRegistry()
    let closed = 0
    const connection = {
      assignmentId: 'asn_1',
      close() { closed += 1 },
      async sendRequest() {
        throw new Error('unexpected connection request')
      },
      workerId: 'worker-1',
    }

    registry.register(connection)

    expect(registry.has('worker-1')).toBe(true)
    expect(registry.get('worker-1')).toBe(connection)

    registry.remove('worker-1')

    expect(registry.has('worker-1')).toBe(false)
    expect(registry.get('worker-1')).toBeUndefined()
    expect(closed).toBe(1)
  })

  test('closes the previous connection when registering a duplicate worker id', () => {
    const registry = createWorkerAccessRegistry()
    let closed = 0
    const oldConnection = {
      assignmentId: 'asn_old',
      close() { closed += 1 },
      async sendRequest() {
        throw new Error('unexpected old connection request')
      },
      workerId: 'worker-1',
    }
    const nextConnection = {
      assignmentId: 'asn_next',
      close() {},
      async sendRequest() {
        throw new Error('unexpected next connection request')
      },
      workerId: 'worker-1',
    }

    registry.register(oldConnection)
    registry.register(nextConnection)

    expect(closed).toBe(1)
    expect(registry.get('worker-1')).toBe(nextConnection)
  })

  test('maps Host worker paths to Worker-local paths without exposing localhost', () => {
    expect(mapWorkerAccessPath('/workers/wkr_82', 'wkr_82')).toBe('/')
    expect(mapWorkerAccessPath('/workers/wkr_82/', 'wkr_82')).toBe('/')
    expect(mapWorkerAccessPath('/workers/wkr_82/assets/app.js?x=1', 'wkr_82')).toBe('/assets/app.js?x=1')
    expect(() => mapWorkerAccessPath('/workers/wkr_other/assets/app.js', 'wkr_82')).toThrow('worker path mismatch')
    expect(() => mapWorkerAccessPath('/workers/wkr_82//evil.com', 'wkr_82')).toThrow('invalid worker access path')
  })

  test('registered tunnel connection resolves matching request responses', async () => {
    const registry = createWorkerAccessRegistry()
    registry.register({
      assignmentId: 'asn_1',
      close() {},
      sendRequest: async envelope => ({
        type: 'response',
        id: envelope.id,
        status: 200,
        headers: { 'content-type': 'text/plain' },
        bodyText: `ok:${envelope.path}`,
      }),
      workerId: 'wkr_82',
    })

    const response = await registry.sendRequest('wkr_82', {
      type: 'request',
      id: 'req_test',
      method: 'GET',
      path: '/',
      headers: {},
      bodyText: '',
    })
    expect(response?.bodyText).toBe('ok:/')
  })

  test('removes credential headers while preserving routing headers', () => {
    const headers = sanitizeForwardHeaders(new Headers({
      accept: 'text/html',
      authorization: 'Bearer secret',
      cookie: 'sid=secret',
      'proxy-authorization': 'Basic secret',
      'set-cookie': 'sid=secret',
      'x-aiworker-user-email': 'worker@example.com',
    }))

    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('proxy-authorization')).toBeNull()
    expect(headers.get('set-cookie')).toBeNull()
    expect(headers.get('x-aiworker-user-email')).toBeNull()
    expect(headers.get('accept')).toBe('text/html')
  })

  test('creates a minimal worker access request envelope with sanitized headers', async () => {
    const envelope = await createAccessRequestEnvelope(new Request('https://host.example/workers/wkr_82?tab=chat', {
      headers: {
        accept: 'text/html',
        authorization: 'Bearer secret',
        cookie: 'sid=secret',
        'x-aiworker-user-email': 'bob@example.com',
      },
      method: 'GET',
    }))

    expect(envelope).toEqual({
      type: 'request',
      id: envelope.id,
      method: 'GET',
      path: '/workers/wkr_82?tab=chat',
      headers: { accept: 'text/html' },
      bodyText: '',
    })
    expect(envelope.id).toMatch(/^req_/)
  })

  test('creates unique request ids so access responses can be correlated', async () => {
    const first = await createAccessRequestEnvelope(new Request('https://host.example/workers/wkr_82'))
    const second = await createAccessRequestEnvelope(new Request('https://host.example/workers/wkr_82'))

    expect(first.id).toMatch(/^req_/)
    expect(second.id).toMatch(/^req_/)
    expect(first.id).not.toBe(second.id)
  })

  test('parses worker access response envelopes through the protocol parser', () => {
    expect(parseAccessResponseEnvelope({
      type: 'response',
      id: 'req_1',
      status: 200,
      headers: { 'content-type': 'text/html' },
      bodyText: '<main>ok</main>',
    })).toEqual({
      type: 'response',
      id: 'req_1',
      status: 200,
      headers: { 'content-type': 'text/html' },
      bodyText: '<main>ok</main>',
    })

    expect(() => parseAccessResponseEnvelope({
      type: 'response',
      id: 'req_1',
      status: 200,
      headers: {},
      bodyText: '',
      extraData: 'leak',
    } as never)).toThrow()
  })
})
