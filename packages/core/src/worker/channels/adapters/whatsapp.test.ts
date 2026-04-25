import type { ChannelBinding } from '@aiworker/shared'

import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'

import { whatsappAdapter } from './whatsapp'

type FetchFn = typeof globalThis.fetch
type MockFetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const BINDING: ChannelBinding = {
  channel: 'whatsapp',
  enabled: true,
  credentials: {
    channel: 'whatsapp',
    phoneNumberId: '1234567890',
    accessToken: 'token-abc',
    appSecret: 'super-secret',
    verifyToken: 'verify-123',
  },
}

function signBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`
}

describe('whatsappAdapter.verify', () => {
  it('resolves when the signature matches the body', async () => {
    const body = '{"entry":[]}'
    const sig = signBody('super-secret', body)
    await expect(whatsappAdapter.verify(body, { 'x-hub-signature-256': sig }, BINDING)).resolves.toBeUndefined()
  })

  it('throws when the signature does not match the body', async () => {
    const body = '{"entry":[]}'
    const sig = signBody('super-secret', 'different-body')
    await expect(whatsappAdapter.verify(body, { 'x-hub-signature-256': sig }, BINDING))
      .rejects
      .toThrow(/invalid WhatsApp signature/)
  })

  it('throws when the signature header is missing', async () => {
    await expect(whatsappAdapter.verify('{}', {}, BINDING))
      .rejects
      .toThrow(/missing X-Hub-Signature-256/)
  })
})

describe('whatsappAdapter.toEnvelopes', () => {
  it('maps a text message into one envelope and derives accountId from phoneNumberId', async () => {
    // Based on the Meta Cloud API "text" example payload.
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: '0',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15550000000', phone_number_id: '1234567890' },
            contacts: [{ profile: { name: 'Alice' }, wa_id: '16505551234' }],
            messages: [{
              from: '16505551234',
              id: 'wamid.ABC',
              timestamp: '1700000000',
              text: { body: 'Hello' },
              type: 'text',
            }],
          },
        }],
      }],
    }
    const envelopes = await whatsappAdapter.toEnvelopes(JSON.stringify(payload), 'w_test', BINDING)
    expect(envelopes).toHaveLength(1)
    const env = envelopes[0]!
    expect(env.channel).toBe('whatsapp')
    expect(env.workerId).toBe('w_test')
    expect(env.accountId).toBe('1234567890')
    expect(env.chatId).toBe('16505551234')
    expect(env.userId).toBe('16505551234')
    expect(env.userDisplayName).toBe('Alice')
    expect(env.text).toBe('Hello')
    expect(env.receivedAt).toBe(new Date(1700000000 * 1000).toISOString())
    expect(env.richMetadata).toBeUndefined()
  })

  it('extracts replyTo richMetadata from a message context', async () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            contacts: [{ profile: { name: 'Alice' }, wa_id: '16505551234' }],
            messages: [{
              from: '16505551234',
              id: 'wamid.REPLY',
              timestamp: '1700000010',
              text: { body: 'sounds good' },
              type: 'text',
              context: { from: '16505550000', id: 'wamid.PARENT' },
            }],
          },
        }],
      }],
    }
    const envelopes = await whatsappAdapter.toEnvelopes(JSON.stringify(payload), 'w_test', BINDING)
    expect(envelopes).toHaveLength(1)
    const env = envelopes[0]!
    expect(env.richMetadata?.replyTo).toEqual({ authorId: '16505550000', text: '' })
    expect(env.richMetadata?.quote).toBe('wamid.PARENT')
  })

  it('maps an image with caption, using caption as text', async () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            contacts: [{ profile: { name: 'Bob' }, wa_id: '16505551234' }],
            messages: [{
              from: '16505551234',
              id: 'wamid.IMG',
              timestamp: '1700000001',
              type: 'image',
              image: { caption: 'look at this', id: 'img-1', mime_type: 'image/jpeg' },
            }],
          },
        }],
      }],
    }
    const envelopes = await whatsappAdapter.toEnvelopes(JSON.stringify(payload), 'w_test', BINDING)
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]!.text).toBe('look at this')
    expect(envelopes[0]!.chatId).toBe('16505551234')
  })

  it('skips an image without caption', async () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: '16505551234',
              id: 'wamid.IMG',
              timestamp: '1700000001',
              type: 'image',
              image: { id: 'img-1', mime_type: 'image/jpeg' },
            }],
          },
        }],
      }],
    }
    const envelopes = await whatsappAdapter.toEnvelopes(JSON.stringify(payload), 'w_test', BINDING)
    expect(envelopes).toEqual([])
  })

  it('returns [] for a status-only payload', async () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            statuses: [{
              id: 'wamid.X',
              status: 'delivered',
              timestamp: '1700000002',
              recipient_id: '16505551234',
            }],
          },
        }],
      }],
    }
    const envelopes = await whatsappAdapter.toEnvelopes(JSON.stringify(payload), 'w_test', BINDING)
    expect(envelopes).toEqual([])
  })

  it('skips unsupported message types (button, interactive, reaction)', async () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            messages: [
              { from: '1', id: 'a', timestamp: '1700000000', type: 'button', button: { text: 'x', payload: 'p' } },
              { from: '2', id: 'b', timestamp: '1700000000', type: 'interactive', interactive: {} },
              { from: '3', id: 'c', timestamp: '1700000000', type: 'reaction', reaction: { emoji: '👍' } },
            ],
          },
        }],
      }],
    }
    const envelopes = await whatsappAdapter.toEnvelopes(JSON.stringify(payload), 'w_test', BINDING)
    expect(envelopes).toEqual([])
  })
})

describe('whatsappAdapter.send', () => {
  const originalFetch = globalThis.fetch
  let fetchSpy: ReturnType<typeof spyOn<{ fetch: FetchFn }, 'fetch'>> | null = null

  beforeEach(() => {
    fetchSpy = null
  })

  afterEach(() => {
    fetchSpy?.mockRestore()
    globalThis.fetch = originalFetch
  })

  function mockFetch(impl: MockFetchImpl) {
    const holder = { fetch: impl as unknown as FetchFn }
    fetchSpy = spyOn(holder, 'fetch')
    globalThis.fetch = holder.fetch as FetchFn
    return fetchSpy
  }

  it('POSTs to the Graph API with auth header and text body', async () => {
    let capturedUrl: string | undefined
    let capturedInit: RequestInit | undefined
    mockFetch(async (input, init) => {
      capturedUrl = typeof input === 'string' ? input : input.toString()
      capturedInit = init
      return new Response('{}', { status: 200 })
    })

    await whatsappAdapter.send(BINDING, {
      channel: 'whatsapp',
      chatId: '16505551234',
      text: 'hi',
    })

    expect(capturedUrl).toBe('https://graph.facebook.com/v21.0/1234567890/messages')
    expect(capturedInit?.method).toBe('POST')
    const headers = capturedInit?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer token-abc')
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '16505551234',
      type: 'text',
      text: { preview_url: false, body: 'hi' },
    })
  })

  it('throws with status + body text on non-2xx response', async () => {
    mockFetch(async () => new Response('outside 24h window', { status: 400 }))
    await expect(whatsappAdapter.send(BINDING, {
      channel: 'whatsapp',
      chatId: '16505551234',
      text: 'hi',
    })).rejects.toThrow(/400 outside 24h window/)
  })
})
