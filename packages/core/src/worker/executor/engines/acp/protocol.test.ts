import { describe, expect, it } from 'bun:test'

import { JsonRpcPeer, splitNdjson } from './protocol'

function captureWriter(): { writeLine: (s: string) => void, lines: string[] } {
  const lines: string[] = []
  return { writeLine: (s: string) => lines.push(s), lines }
}

describe('splitNdjson', () => {
  it('joins buffered remainder with next chunk', () => {
    const first = splitNdjson('', '{"jsonrpc":"2.0",')
    expect(first.lines).toEqual([])
    expect(first.remainder).toBe('{"jsonrpc":"2.0",')
    const second = splitNdjson(first.remainder, '"method":"x"}\n{"jsonrpc":"2.0","method":"y"}\n')
    expect(second.lines).toEqual([
      '{"jsonrpc":"2.0","method":"x"}',
      '{"jsonrpc":"2.0","method":"y"}',
    ])
    expect(second.remainder).toBe('')
  })

  it('strips blank lines', () => {
    const { lines } = splitNdjson('', 'a\n\nb\n')
    expect(lines).toEqual(['a', 'b'])
  })
})

describe('JsonRpcPeer — request / response', () => {
  it('resolves a request when a matching response arrives', async () => {
    const writer = captureWriter()
    const peer = new JsonRpcPeer({ writeLine: writer.writeLine })
    const promise = peer.request<{ sessionId: string }>('session/new', { cwd: '/tmp' })

    expect(writer.lines).toHaveLength(1)
    const sent = JSON.parse(writer.lines[0]!)
    expect(sent.jsonrpc).toBe('2.0')
    expect(sent.method).toBe('session/new')
    expect(sent.params).toEqual({ cwd: '/tmp' })
    expect(typeof sent.id).toBe('number')

    peer.handleLine(JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: { sessionId: 'abc' } }))
    const result = await promise
    expect(result).toEqual({ sessionId: 'abc' })
  })

  it('rejects on error response with code + message preserved', async () => {
    const writer = captureWriter()
    const peer = new JsonRpcPeer({ writeLine: writer.writeLine })
    const promise = peer.request('boom')
    const sent = JSON.parse(writer.lines[0]!)
    peer.handleLine(JSON.stringify({
      jsonrpc: '2.0',
      id: sent.id,
      error: { code: -32000, message: 'nope' },
    }))
    await expect(promise).rejects.toThrow(/-32000/)
    await expect(promise).rejects.toThrow(/nope/)
  })

  it('times out when no response arrives', async () => {
    const writer = captureWriter()
    const peer = new JsonRpcPeer({ writeLine: writer.writeLine, requestTimeoutMs: 30 })
    await expect(peer.request('slow')).rejects.toThrow(/timed out/)
  })

  it('aborts when caller signal fires', async () => {
    const writer = captureWriter()
    const peer = new JsonRpcPeer({ writeLine: writer.writeLine })
    const ctrl = new AbortController()
    const promise = peer.request('slow', undefined, ctrl.signal)
    ctrl.abort()
    await expect(promise).rejects.toThrow(/aborted/)
  })

  it('assigns monotonically increasing request ids', async () => {
    const writer = captureWriter()
    const peer = new JsonRpcPeer({ writeLine: writer.writeLine })
    void peer.request('a')
    void peer.request('b')
    void peer.request('c')
    const ids = writer.lines.map(l => JSON.parse(l).id as number)
    expect(ids).toEqual([1, 2, 3])
  })
})

describe('JsonRpcPeer — notifications', () => {
  it('writes a notification without id', () => {
    const writer = captureWriter()
    const peer = new JsonRpcPeer({ writeLine: writer.writeLine })
    peer.notify('session/cancel', { sessionId: 'x' })
    expect(writer.lines).toHaveLength(1)
    const parsed = JSON.parse(writer.lines[0]!)
    expect(parsed.method).toBe('session/cancel')
    expect(parsed.params).toEqual({ sessionId: 'x' })
    expect('id' in parsed).toBe(false)
  })

  it('dispatches inbound notifications to the callback', () => {
    const writer = captureWriter()
    const seen: unknown[] = []
    const peer = new JsonRpcPeer({
      writeLine: writer.writeLine,
      onNotification: n => seen.push(n),
    })
    peer.handleLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId: 'x', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } } },
    }))
    expect(seen).toHaveLength(1)
  })
})

describe('JsonRpcPeer — inbound requests', () => {
  it('auto-replies with method-not-found when no handler configured', () => {
    const writer = captureWriter()
    const peer = new JsonRpcPeer({ writeLine: writer.writeLine })
    peer.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'fs/read_text_file' }))
    expect(writer.lines).toHaveLength(1)
    const parsed = JSON.parse(writer.lines[0]!)
    expect(parsed.id).toBe(42)
    expect(parsed.error.code).toBe(-32601)
  })

  it('dispatches to onRequest and writes the resolved result', async () => {
    const writer = captureWriter()
    const peer = new JsonRpcPeer({
      writeLine: writer.writeLine,
      onRequest: async req => ({ echoed: req.method }),
    })
    peer.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }))
    // onRequest resolves asynchronously — wait a tick
    await new Promise<void>(resolve => setTimeout(resolve, 5))
    const parsed = JSON.parse(writer.lines[0]!)
    expect(parsed).toEqual({ jsonrpc: '2.0', id: 7, result: { echoed: 'ping' } })
  })

  it('writes an error envelope when onRequest throws', async () => {
    const writer = captureWriter()
    const peer = new JsonRpcPeer({
      writeLine: writer.writeLine,
      onRequest: async () => { throw new Error('bad input') },
    })
    peer.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'boom' }))
    await new Promise<void>(resolve => setTimeout(resolve, 5))
    const parsed = JSON.parse(writer.lines[0]!)
    expect(parsed.error.code).toBe(-32000)
    expect(parsed.error.message).toBe('bad input')
  })
})

describe('JsonRpcPeer — malformed input', () => {
  it('routes parse errors to onError without throwing', () => {
    const writer = captureWriter()
    const errors: Error[] = []
    const peer = new JsonRpcPeer({ writeLine: writer.writeLine, onError: e => errors.push(e) })
    peer.handleLine('{not-json')
    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toContain('parse error')
  })

  it('ignores arrays / non-objects', () => {
    const writer = captureWriter()
    const peer = new JsonRpcPeer({ writeLine: writer.writeLine })
    peer.handleLine('[1,2,3]')
    peer.handleLine('"hello"')
    expect(writer.lines).toHaveLength(0)
  })
})

describe('JsonRpcPeer — dispose', () => {
  it('rejects pending requests with the disposed error', async () => {
    const writer = captureWriter()
    const peer = new JsonRpcPeer({ writeLine: writer.writeLine })
    const promise = peer.request('x')
    peer.dispose('shutdown')
    await expect(promise).rejects.toThrow(/shutdown/)
  })
})
