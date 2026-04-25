import type { ChannelBinding } from '@aiworker/shared'

import { createHash } from 'node:crypto'

import { describe, expect, it } from 'bun:test'

import { lineAdapter } from './line'

const CHANNEL_SECRET = 'line-channel-secret'
const CHANNEL_ACCESS_TOKEN = 'line-access-token-abcdef'

function makeBinding(): ChannelBinding {
  return {
    channel: 'line',
    enabled: true,
    credentials: {
      channel: 'line',
      channelSecret: CHANNEL_SECRET,
      channelAccessToken: CHANNEL_ACCESS_TOKEN,
    },
  }
}

function expectedAccountId(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex').slice(0, 16)
}

describe('lineAdapter.toEnvelopes', () => {
  it('emits one envelope per text message and derives accountId from channelAccessToken hash', async () => {
    const body = {
      destination: 'U_dest',
      events: [{
        type: 'message',
        timestamp: 1_700_000_000_000,
        source: { type: 'user', userId: 'U_user' },
        message: { id: 'msg_1', type: 'text', text: 'hi LINE' },
      }],
    }
    const envelopes = await lineAdapter.toEnvelopes(JSON.stringify(body), 'w_test', makeBinding())
    expect(envelopes).toHaveLength(1)
    const env = envelopes[0]!
    expect(env.channel).toBe('line')
    expect(env.workerId).toBe('w_test')
    expect(env.accountId).toBe(expectedAccountId(CHANNEL_ACCESS_TOKEN))
    expect(env.accountId).toMatch(/^[0-9a-f]{16}$/)
    expect(env.chatId).toBe('user:U_user')
    expect(env.userId).toBe('U_user')
    expect(env.text).toBe('hi LINE')
    expect(env.richMetadata).toBeUndefined()
  })

  it('skips non-message events and non-text message types', async () => {
    const body = {
      events: [
        { type: 'follow', timestamp: 1, source: { type: 'user', userId: 'U' } },
        { type: 'message', timestamp: 2, source: { type: 'user', userId: 'U' }, message: { id: 'm', type: 'sticker' } },
      ],
    }
    const envelopes = await lineAdapter.toEnvelopes(JSON.stringify(body), 'w_test', makeBinding())
    expect(envelopes).toEqual([])
  })

  it('extracts quote richMetadata when the message carries a quotedMessageId', async () => {
    const body = {
      events: [{
        type: 'message',
        timestamp: 1_700_000_500_000,
        source: { type: 'user', userId: 'U_user' },
        message: {
          id: 'msg_2',
          type: 'text',
          text: 'replying',
          quotedMessageId: 'msg_parent',
        },
      }],
    }
    const [env] = await lineAdapter.toEnvelopes(JSON.stringify(body), 'w_test', makeBinding())
    expect(env?.richMetadata?.quote).toBe('msg_parent')
    expect(env?.richMetadata?.replyTo).toBeUndefined()
  })

  it('renders chatId for group and room sources with optional userId', async () => {
    const body = {
      events: [
        {
          type: 'message',
          timestamp: 1,
          source: { type: 'group', groupId: 'G1', userId: 'U1' },
          message: { id: 'm1', type: 'text', text: 'in group' },
        },
        {
          type: 'message',
          timestamp: 2,
          source: { type: 'room', roomId: 'R1' },
          message: { id: 'm2', type: 'text', text: 'in room' },
        },
      ],
    }
    const envelopes = await lineAdapter.toEnvelopes(JSON.stringify(body), 'w_test', makeBinding())
    expect(envelopes).toHaveLength(2)
    expect(envelopes[0]!.chatId).toBe('group:G1')
    expect(envelopes[0]!.userId).toBe('U1')
    expect(envelopes[1]!.chatId).toBe('room:R1')
    expect(envelopes[1]!.userId).toBeUndefined()
  })
})
