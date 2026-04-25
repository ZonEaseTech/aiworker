import type { ChannelBinding, OutboundMessage } from '@aiworker/shared'

import { Buffer } from 'node:buffer'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { __larkInternals, larkAdapter } from './lark'

type FetchFn = typeof globalThis.fetch
type FetchInit = RequestInit | undefined
interface FetchCall { url: string, init: FetchInit }

const ENCRYPT_KEY = 'test-encrypt-key-1234567890'
const VERIFY_TOKEN = 'verification-token-xyz'

function makeBinding(overrides: Partial<{ appId: string, appSecret: string }> = {}): ChannelBinding {
  return {
    channel: 'lark',
    enabled: true,
    credentials: {
      channel: 'lark',
      appId: overrides.appId ?? 'cli_app_id',
      appSecret: overrides.appSecret ?? 'app-secret',
      encryptKey: ENCRYPT_KEY,
      verificationToken: VERIFY_TOKEN,
    },
  }
}

function encryptForLark(plaintext: string, encryptKey: string): string {
  const key = createHash('sha256').update(encryptKey, 'utf8').digest()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, encrypted]).toString('base64')
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function groupTextEvent(text: string): Record<string, unknown> {
  return {
    schema: '2.0',
    header: {
      event_id: 'evt_1',
      event_type: 'im.message.receive_v1',
      create_time: '1700000000000',
      token: VERIFY_TOKEN,
      app_id: 'cli_app_id',
      tenant_key: 'tk',
    },
    event: {
      sender: {
        sender_id: { open_id: 'ou_user1', name: 'Alice' },
        sender_type: 'user',
        tenant_key: 'tk',
      },
      message: {
        message_id: 'om_1',
        create_time: '1700000000123',
        chat_id: 'oc_room1',
        chat_type: 'group',
        message_type: 'text',
        content: JSON.stringify({ text }),
      },
    },
  }
}

function p2pTextEvent(text: string, openId = 'ou_user2'): Record<string, unknown> {
  return {
    schema: '2.0',
    header: {
      event_id: 'evt_2',
      event_type: 'im.message.receive_v1',
      create_time: '1700000001000',
      token: VERIFY_TOKEN,
      app_id: 'cli_app_id',
      tenant_key: 'tk',
    },
    event: {
      sender: {
        sender_id: { open_id: openId },
        sender_type: 'user',
        tenant_key: 'tk',
      },
      message: {
        message_id: 'om_2',
        create_time: '1700000001000',
        chat_id: 'oc_p2p1',
        chat_type: 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text }),
      },
    },
  }
}

describe('larkAdapter', () => {
  const originalFetch = globalThis.fetch
  let fetchCalls: FetchCall[] = []
  let fetchImpl: ((url: string, init: FetchInit) => Promise<Response>) | null = null

  beforeEach(() => {
    __larkInternals.resetTokenCache()
    fetchCalls = []
    fetchImpl = null
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      fetchCalls.push({ url, init })
      if (!fetchImpl)
        throw new Error(`unexpected fetch: ${url}`)
      return fetchImpl(url, init)
    }) as FetchFn
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    __larkInternals.resetTokenCache()
  })

  describe('AES decrypt helper', () => {
    it('round-trips plaintext through Lark encrypt envelope', () => {
      const plaintext = JSON.stringify({ hello: 'world', n: 42 })
      const encrypted = encryptForLark(plaintext, ENCRYPT_KEY)
      const decrypted = __larkInternals.decryptLarkPayload(encrypted, ENCRYPT_KEY)
      expect(decrypted).toBe(plaintext)
    })

    it('throws on a payload shorter than the IV', () => {
      const tooShort = Buffer.alloc(8).toString('base64')
      expect(() => __larkInternals.decryptLarkPayload(tooShort, ENCRYPT_KEY)).toThrow()
    })
  })

  describe('toEnvelopes', () => {
    it('normalises a group im.message.receive_v1 text event and derives accountId from appId', async () => {
      const event = groupTextEvent('hello group')
      const envelopes = await larkAdapter.toEnvelopes(JSON.stringify(event), 'w_test', makeBinding({ appId: 'cli_app_id' }))
      expect(envelopes).toHaveLength(1)
      const env = envelopes[0]!
      expect(env.channel).toBe('lark')
      expect(env.accountId).toBe('cli_app_id')
      expect(env.chatId).toBe('group:oc_room1')
      expect(env.userId).toBe('ou_user1')
      expect(env.userDisplayName).toBe('Alice')
      expect(env.text).toBe('hello group')
      expect(env.workerId).toBe('w_test')
      expect(env.receivedAt).toBe(new Date(1700000000123).toISOString())
      expect(env.richMetadata).toBeUndefined()
    })

    it('extracts quote richMetadata when message has a parent_id', async () => {
      const event = groupTextEvent('replying') as Record<string, unknown>
      const eventBlock = (event as { event: { message: Record<string, unknown> } }).event
      eventBlock.message.parent_id = 'om_parent'
      const envelopes = await larkAdapter.toEnvelopes(JSON.stringify(event), 'w_test', makeBinding())
      expect(envelopes).toHaveLength(1)
      expect(envelopes[0]!.richMetadata?.quote).toBe('om_parent')
    })

    it('normalises a p2p text event into chatId p2p:<open_id>', async () => {
      const event = p2pTextEvent('hi there', 'ou_xxx')
      const envelopes = await larkAdapter.toEnvelopes(JSON.stringify(event), 'w_test', makeBinding())
      expect(envelopes).toHaveLength(1)
      expect(envelopes[0]!.chatId).toBe('p2p:ou_xxx')
      expect(envelopes[0]!.userId).toBe('ou_xxx')
      expect(envelopes[0]!.text).toBe('hi there')
    })

    it('returns [] for non-text message types', async () => {
      const event = groupTextEvent('ignored') as any
      event.event.message.message_type = 'image'
      event.event.message.content = JSON.stringify({ image_key: 'img_xxx' })
      const envelopes = await larkAdapter.toEnvelopes(JSON.stringify(event), 'w_test', makeBinding())
      expect(envelopes).toEqual([])
    })

    it('decrypts an encrypted payload before normalising', async () => {
      const event = groupTextEvent('encrypted hello')
      const encrypted = encryptForLark(JSON.stringify(event), ENCRYPT_KEY)
      const rawBody = JSON.stringify({ encrypt: encrypted })
      const envelopes = await larkAdapter.toEnvelopes(rawBody, 'w_test', makeBinding())
      expect(envelopes).toHaveLength(1)
      expect(envelopes[0]!.text).toBe('encrypted hello')
    })

    it('returns [] for url_verification challenges', async () => {
      const body = JSON.stringify({ type: 'url_verification', challenge: 'abc', token: VERIFY_TOKEN })
      const envelopes = await larkAdapter.toEnvelopes(body, 'w_test', makeBinding())
      expect(envelopes).toEqual([])
    })
  })

  describe('verify', () => {
    it('passes when header.token matches verificationToken', async () => {
      const body = JSON.stringify(groupTextEvent('hi'))
      await expect(larkAdapter.verify(body, {}, makeBinding())).resolves.toBeUndefined()
    })

    it('throws on a mismatched verificationToken', async () => {
      const event = groupTextEvent('hi') as any
      event.header.token = 'wrong-token'
      const body = JSON.stringify(event)
      await expect(larkAdapter.verify(body, {}, makeBinding())).rejects.toThrow(/verification token/)
    })

    it('verifies a url_verification root token', async () => {
      const body = JSON.stringify({ type: 'url_verification', challenge: 'abc', token: VERIFY_TOKEN })
      await expect(larkAdapter.verify(body, {}, makeBinding())).resolves.toBeUndefined()
    })

    it('decrypts before token comparison', async () => {
      const event = groupTextEvent('hi')
      const encrypted = encryptForLark(JSON.stringify(event), ENCRYPT_KEY)
      const body = JSON.stringify({ encrypt: encrypted })
      await expect(larkAdapter.verify(body, {}, makeBinding())).resolves.toBeUndefined()
    })
  })

  describe('send', () => {
    function setupHappyPath(): { tokenUrl: string, messagesUrl: string } {
      const tokenUrl = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal'
      const messagesUrl = 'https://open.feishu.cn/open-apis/im/v1/messages'
      fetchImpl = async (url) => {
        if (url.startsWith(tokenUrl))
          return jsonResponse({ code: 0, tenant_access_token: 't_abc', expire: 7200 })
        if (url.startsWith(messagesUrl))
          return jsonResponse({ code: 0, msg: 'success', data: { message_id: 'om_x' } })
        throw new Error(`unexpected url ${url}`)
      }
      return { tokenUrl, messagesUrl }
    }

    it('exchanges a token then POSTs a text message with the bearer header', async () => {
      const { tokenUrl, messagesUrl } = setupHappyPath()
      const binding = makeBinding({ appId: 'app_send_1' })
      const message: OutboundMessage = {
        channel: 'lark',
        chatId: 'p2p:ou_target',
        text: 'reply text',
      }
      await larkAdapter.send(binding, message)

      expect(fetchCalls).toHaveLength(2)
      expect(fetchCalls[0]!.url).toBe(tokenUrl)
      const tokenBody = JSON.parse((fetchCalls[0]!.init?.body as string) ?? '{}')
      expect(tokenBody).toEqual({ app_id: 'app_send_1', app_secret: 'app-secret' })

      expect(fetchCalls[1]!.url).toBe(`${messagesUrl}?receive_id_type=open_id`)
      const headers = (fetchCalls[1]!.init?.headers ?? {}) as Record<string, string>
      expect(headers.Authorization).toBe('Bearer t_abc')
      const sentBody = JSON.parse((fetchCalls[1]!.init?.body as string) ?? '{}')
      expect(sentBody).toEqual({
        receive_id: 'ou_target',
        msg_type: 'text',
        content: JSON.stringify({ text: 'reply text' }),
      })
    })

    it('uses receive_id_type=chat_id for group chats', async () => {
      const { messagesUrl } = setupHappyPath()
      await larkAdapter.send(makeBinding({ appId: 'app_send_2' }), {
        channel: 'lark',
        chatId: 'group:oc_room',
        text: 'hello group',
      })
      expect(fetchCalls[1]!.url).toBe(`${messagesUrl}?receive_id_type=chat_id`)
      const sentBody = JSON.parse((fetchCalls[1]!.init?.body as string) ?? '{}')
      expect(sentBody.receive_id).toBe('oc_room')
    })

    it('throws when Lark response has non-zero code', async () => {
      fetchImpl = async (url) => {
        if (url.includes('tenant_access_token'))
          return jsonResponse({ code: 0, tenant_access_token: 't_abc', expire: 7200 })
        return jsonResponse({ code: 230001, msg: 'invalid receive id' })
      }
      await expect(larkAdapter.send(makeBinding({ appId: 'app_send_3' }), {
        channel: 'lark',
        chatId: 'p2p:ou_bad',
        text: 'fail',
      })).rejects.toThrow(/230001|invalid receive id/)
    })

    it('shares one token exchange across concurrent sends', async () => {
      let tokenCalls = 0
      let messageCalls = 0
      let resolveToken: ((res: Response) => void) | null = null
      fetchImpl = async (url) => {
        if (url.includes('tenant_access_token')) {
          tokenCalls++
          return new Promise<Response>((resolve) => {
            resolveToken = resolve
          })
        }
        messageCalls++
        return jsonResponse({ code: 0, msg: 'success' })
      }
      const binding = makeBinding({ appId: 'app_concurrent' })
      const send1 = larkAdapter.send(binding, { channel: 'lark', chatId: 'p2p:ou_a', text: 'a' })
      const send2 = larkAdapter.send(binding, { channel: 'lark', chatId: 'p2p:ou_b', text: 'b' })
      // Yield once so both calls reach the inflight branch.
      await new Promise(r => setTimeout(r, 0))
      expect(tokenCalls).toBe(1)
      resolveToken!(jsonResponse({ code: 0, tenant_access_token: 't_shared', expire: 7200 }))
      await Promise.all([send1, send2])
      expect(tokenCalls).toBe(1)
      expect(messageCalls).toBe(2)
      expect(fetchCalls).toHaveLength(3)
      // Both message POSTs carry the same shared token.
      const headers1 = (fetchCalls[1]!.init?.headers ?? {}) as Record<string, string>
      const headers2 = (fetchCalls[2]!.init?.headers ?? {}) as Record<string, string>
      expect(headers1.Authorization).toBe('Bearer t_shared')
      expect(headers2.Authorization).toBe('Bearer t_shared')
    })

    it('re-exchanges the token after the cached entry expires', async () => {
      let tokenCalls = 0
      const tokens = ['t_first', 't_second']
      fetchImpl = async (url) => {
        if (url.includes('tenant_access_token')) {
          // expire=0 → entry is immediately within the 60s refresh margin → next call refreshes.
          return jsonResponse({ code: 0, tenant_access_token: tokens[tokenCalls++], expire: 0 })
        }
        return jsonResponse({ code: 0, msg: 'success' })
      }
      const binding = makeBinding({ appId: 'app_expiry' })
      await larkAdapter.send(binding, { channel: 'lark', chatId: 'p2p:ou_a', text: 'a' })
      await larkAdapter.send(binding, { channel: 'lark', chatId: 'p2p:ou_b', text: 'b' })
      expect(tokenCalls).toBe(2)
      const auth1 = ((fetchCalls[1]!.init?.headers ?? {}) as Record<string, string>).Authorization
      const auth2 = ((fetchCalls[3]!.init?.headers ?? {}) as Record<string, string>).Authorization
      expect(auth1).toBe('Bearer t_first')
      expect(auth2).toBe('Bearer t_second')
    })
  })
})
