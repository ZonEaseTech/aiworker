import type { ChannelBinding } from '@zonease/aiworker-shared'

import { describe, expect, it } from 'bun:test'

import { webAdapter } from './web'

function makeBinding(id?: string, inboundToken?: string): ChannelBinding {
  return {
    ...(id === undefined ? {} : { id }),
    channel: 'web',
    enabled: true,
    credentials: { channel: 'web', ...(inboundToken === undefined ? {} : { inboundToken }) },
  }
}

describe('webAdapter.toEnvelopes', () => {
  it('derives accountId from binding.id', async () => {
    const body = {
      chatId: 'session-1',
      text: 'hello from web',
      userDisplayName: 'Operator',
    }
    const envelopes = await webAdapter.toEnvelopes(
      JSON.stringify(body),
      'w_test',
      makeBinding('web-bind-A'),
    )
    expect(envelopes).toHaveLength(1)
    const env = envelopes[0]!
    expect(env.channel).toBe('web')
    expect(env.workerId).toBe('w_test')
    expect(env.accountId).toBe('web-bind-A')
    expect(env.chatId).toBe('session-1')
    expect(env.text).toBe('hello from web')
    expect(env.userDisplayName).toBe('Operator')
    expect(env.richMetadata).toBeUndefined()
  })

  it('falls back to "default" accountId when binding has no id', async () => {
    const body = { chatId: 'sess', text: 'no id binding' }
    const [env] = await webAdapter.toEnvelopes(
      JSON.stringify(body),
      'w_test',
      makeBinding(),
    )
    expect(env?.accountId).toBe('default')
  })

  it('forwards rich metadata from the inbound payload', async () => {
    const body = {
      chatId: 's',
      text: 'edited text',
      metadata: {
        isEdit: true,
        replyTo: { authorId: 'op-1', text: 'previous' },
        quote: 'previous',
      },
    }
    const [env] = await webAdapter.toEnvelopes(
      JSON.stringify(body),
      'w_test',
      makeBinding('web-bind-B'),
    )
    expect(env?.richMetadata?.isEdit).toBe(true)
    expect(env?.richMetadata?.replyTo).toEqual({ authorId: 'op-1', text: 'previous' })
    expect(env?.richMetadata?.quote).toBe('previous')
  })
})

describe('webAdapter.verify (BUG-016)', () => {
  it('passes when bearer matches inboundToken', async () => {
    await expect(
      webAdapter.verify(
        '{}',
        { authorization: 'Bearer secret-abc' },
        makeBinding('web-bind-A', 'secret-abc'),
      ),
    ).resolves.toBeUndefined()
  })

  it('rejects when bearer does not match inboundToken', async () => {
    await expect(
      webAdapter.verify(
        '{}',
        { authorization: 'Bearer wrong' },
        makeBinding('web-bind-A', 'secret-abc'),
      ),
    ).rejects.toThrow(/invalid Authorization bearer/i)
  })

  it('rejects when Authorization header is missing', async () => {
    await expect(
      webAdapter.verify(
        '{}',
        {},
        makeBinding('web-bind-A', 'secret-abc'),
      ),
    ).rejects.toThrow(/invalid Authorization bearer/i)
  })

  it('rejects fail-closed when binding has no inboundToken (legacy config)', async () => {
    await expect(
      webAdapter.verify(
        '{}',
        { authorization: 'Bearer anything' },
        makeBinding('web-bind-A'),
      ),
    ).rejects.toThrow(/no inboundToken/i)
  })

  it('rejects fail-closed when inboundToken is empty string', async () => {
    await expect(
      webAdapter.verify(
        '{}',
        { authorization: 'Bearer anything' },
        makeBinding('web-bind-A', ''),
      ),
    ).rejects.toThrow(/no inboundToken/i)
  })

  it('rejects when Authorization header has wrong scheme', async () => {
    await expect(
      webAdapter.verify(
        '{}',
        { authorization: 'Basic c2VjcmV0LWFiYw==' },
        makeBinding('web-bind-A', 'secret-abc'),
      ),
    ).rejects.toThrow(/invalid Authorization bearer/i)
  })

  it('does not leak length info — different-length tokens are constant-time rejected', async () => {
    // No throw difference between length-mismatch vs same-length-different;
    // both throw the same error. Smoke that timingSafeEqualStrings handles
    // the length mismatch without crashing.
    await expect(
      webAdapter.verify(
        '{}',
        { authorization: 'Bearer x' },
        makeBinding('web-bind-A', 'much-longer-secret'),
      ),
    ).rejects.toThrow(/invalid Authorization bearer/i)
  })
})
