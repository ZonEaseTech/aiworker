import type { ChannelBinding } from '@aiworker/shared'

import { describe, expect, it } from 'bun:test'

import { webAdapter } from './web'

function makeBinding(id?: string): ChannelBinding {
  return {
    ...(id === undefined ? {} : { id }),
    channel: 'web',
    enabled: true,
    credentials: { channel: 'web' },
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
