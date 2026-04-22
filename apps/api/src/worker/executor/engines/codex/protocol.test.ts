import { describe, expect, it } from 'bun:test'
import { JsonRpcPeer, splitNdjson } from './protocol'

// The protocol module intentionally re-exports the ACP peer (same JSON-RPC
// wire format over ndjson). The tests below mirror the core ACP smoke so the
// re-export surface stays visible and non-trivially correct on its own.

describe('codex protocol re-export', () => {
  it('re-exports JsonRpcPeer with a working request/response roundtrip', async () => {
    const outbound: string[] = []
    const peer = new JsonRpcPeer({
      writeLine: line => outbound.push(line),
      requestTimeoutMs: 1_000,
    })

    const promise = peer.request<{ threadId: string }>('thread_start', { model: 'gpt-5.2-codex' })
    expect(outbound).toHaveLength(1)
    const req = JSON.parse(outbound[0]!) as { id: number, method: string, params: { model: string } }
    expect(req.method).toBe('thread_start')
    expect(req.params.model).toBe('gpt-5.2-codex')

    peer.handleLine(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { threadId: 'thr_1' } }))
    const result = await promise
    expect(result.threadId).toBe('thr_1')

    peer.dispose()
  })

  it('re-exports splitNdjson that preserves partial-line remainders', () => {
    const first = splitNdjson('', '{"a":1}\n{"b":')
    expect(first.lines).toEqual(['{"a":1}'])
    expect(first.remainder).toBe('{"b":')
    const second = splitNdjson(first.remainder, '2}\n')
    expect(second.lines).toEqual(['{"b":2}'])
    expect(second.remainder).toBe('')
  })

  it('routes notifications through onNotification', () => {
    const notifs: Array<{ method: string, params: unknown }> = []
    const peer = new JsonRpcPeer({
      writeLine: () => undefined,
      onNotification: n => notifs.push({ method: n.method, params: n.params }),
    })
    peer.handleLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'codex/event/assistant_message',
      params: { delta: 'hello' },
    }))
    expect(notifs).toHaveLength(1)
    expect(notifs[0]!.method).toBe('codex/event/assistant_message')
    expect(notifs[0]!.params).toEqual({ delta: 'hello' })
    peer.dispose()
  })
})
