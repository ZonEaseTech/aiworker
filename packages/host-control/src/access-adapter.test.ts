import { describe, expect, test } from 'bun:test'

import {
  createAccessRequestEnvelope,
  createWorkerAccessRegistry,
  parseAccessResponseEnvelope,
  sanitizeForwardHeaders,
} from './access-adapter'

describe('host-control access adapter boundary', () => {
  test('registers and removes access connections', () => {
    const registry = createWorkerAccessRegistry()
    let closed = 0
    const connection = { close() { closed += 1 }, workerId: 'worker-1' }

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
    const oldConnection = { close() { closed += 1 }, workerId: 'worker-1' }
    const nextConnection = { close() {}, workerId: 'worker-1' }

    registry.register(oldConnection)
    registry.register(nextConnection)

    expect(closed).toBe(1)
    expect(registry.get('worker-1')).toBe(nextConnection)
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
      id: 'req_1',
      method: 'GET',
      path: '/workers/wkr_82?tab=chat',
      headers: { accept: 'text/html' },
      bodyText: '',
    })
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
