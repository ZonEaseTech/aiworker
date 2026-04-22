import type { ChannelBinding } from '@aiworker/shared'

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'

import { telegramAdapter } from './telegram'

type FetchFn = typeof globalThis.fetch
type MockFetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function telegramBinding(
  creds: { botToken?: string, webhookSecretToken?: string } = {},
): ChannelBinding {
  return {
    channel: 'telegram',
    enabled: true,
    credentials: {
      channel: 'telegram',
      botToken: creds.botToken ?? 'TEST:TOKEN',
      ...(creds.webhookSecretToken === undefined
        ? {}
        : { webhookSecretToken: creds.webhookSecretToken }),
    },
  }
}

describe('telegramAdapter', () => {
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

  describe('toEnvelopes', () => {
    it('emits one envelope for a private-chat text message', async () => {
      const update = {
        update_id: 10_000_000,
        message: {
          message_id: 1365,
          from: {
            id: 42,
            is_bot: false,
            first_name: 'Test',
            last_name: 'User',
            username: 'testuser',
          },
          chat: {
            id: 123_456,
            first_name: 'Test',
            username: 'testuser',
            type: 'private',
          },
          date: 1_700_000_000,
          text: 'hello',
        },
      }

      const envelopes = await telegramAdapter.toEnvelopes(
        JSON.stringify(update),
        'worker-1',
      )

      expect(envelopes).toHaveLength(1)
      const env = envelopes[0]!
      expect(env.workerId).toBe('worker-1')
      expect(env.channel).toBe('telegram')
      expect(env.chatId).toBe('private:123456')
      expect(env.userId).toBe('42')
      expect(env.userDisplayName).toBe('Test User')
      expect(env.text).toBe('hello')
      expect(env.receivedAt).toBe(new Date(1_700_000_000 * 1000).toISOString())
      expect(env.raw).toEqual(update)
    })

    it('uses first_name alone when last_name is absent and falls back to username', async () => {
      const firstOnly = {
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: 7, first_name: 'Alice' },
          chat: { id: 7, type: 'private' },
          date: 1_700_000_000,
          text: 'hi',
        },
      }
      const usernameOnly = {
        update_id: 2,
        message: {
          message_id: 2,
          from: { id: 8, username: 'bob' },
          chat: { id: 8, type: 'private' },
          date: 1_700_000_000,
          text: 'hi',
        },
      }
      const [aliceEnv] = await telegramAdapter.toEnvelopes(
        JSON.stringify(firstOnly),
        'w',
      )
      const [bobEnv] = await telegramAdapter.toEnvelopes(
        JSON.stringify(usernameOnly),
        'w',
      )
      expect(aliceEnv?.userDisplayName).toBe('Alice')
      expect(bobEnv?.userDisplayName).toBe('bob')
    })

    it('returns [] for non-text updates (edited_message)', async () => {
      const update = {
        update_id: 11,
        edited_message: {
          message_id: 1365,
          from: { id: 42, first_name: 'Test' },
          chat: { id: 123_456, type: 'private' },
          date: 1_700_000_100,
          edit_date: 1_700_000_200,
          text: 'edited',
        },
      }
      const envelopes = await telegramAdapter.toEnvelopes(
        JSON.stringify(update),
        'w',
      )
      expect(envelopes).toEqual([])
    })

    it('returns [] when message has no text (e.g. photo-only)', async () => {
      const update = {
        update_id: 12,
        message: {
          message_id: 2,
          from: { id: 42, first_name: 'Test' },
          chat: { id: 123_456, type: 'private' },
          date: 1_700_000_000,
          photo: [{ file_id: 'abc', file_unique_id: 'u', width: 10, height: 10 }],
        },
      }
      const envelopes = await telegramAdapter.toEnvelopes(
        JSON.stringify(update),
        'w',
      )
      expect(envelopes).toEqual([])
    })
  })

  describe('verify', () => {
    it('accepts a matching secret-token header', async () => {
      const binding = telegramBinding({ webhookSecretToken: 'abc' })
      await expect(
        telegramAdapter.verify(
          '{}',
          { 'x-telegram-bot-api-secret-token': 'abc' },
          binding,
        ),
      ).resolves.toBeUndefined()
    })

    it('rejects a mismatched secret-token header', async () => {
      const binding = telegramBinding({ webhookSecretToken: 'abc' })
      await expect(
        telegramAdapter.verify(
          '{}',
          { 'x-telegram-bot-api-secret-token': 'wrong' },
          binding,
        ),
      ).rejects.toThrow(/invalid X-Telegram-Bot-Api-Secret-Token/)
    })

    it('rejects when secret-token is configured but header is missing', async () => {
      const binding = telegramBinding({ webhookSecretToken: 'abc' })
      await expect(
        telegramAdapter.verify('{}', {}, binding),
      ).rejects.toThrow(/invalid X-Telegram-Bot-Api-Secret-Token/)
    })

    it('accepts without header check when webhookSecretToken is unset', async () => {
      const binding = telegramBinding()
      await expect(
        telegramAdapter.verify('{}', {}, binding),
      ).resolves.toBeUndefined()
    })
  })

  describe('send', () => {
    it('splits a 5000-char message into two sendMessage calls', async () => {
      const calls: Array<{ url: string, body: { chat_id: number, text: string } }> = []
      mockFetch(async (input, init) => {
        const url = typeof input === 'string'
          ? input
          : input instanceof URL ? input.toString() : input.url
        const body = init?.body ? JSON.parse(init.body as string) : null
        calls.push({ url, body })
        return new Response('{"ok":true}', { status: 200 })
      })

      const binding = telegramBinding({ botToken: 'BOT:123' })
      const text = 'a'.repeat(5000)
      await telegramAdapter.send(binding, {
        channel: 'telegram',
        chatId: 'private:42',
        text,
      })

      expect(calls).toHaveLength(2)
      expect(calls[0]!.url).toBe('https://api.telegram.org/botBOT:123/sendMessage')
      expect(calls[1]!.url).toBe('https://api.telegram.org/botBOT:123/sendMessage')
      expect(calls[0]!.body.chat_id).toBe(42)
      expect(calls[1]!.body.chat_id).toBe(42)
      expect(calls[0]!.body.text.length).toBe(4096)
      expect(calls[1]!.body.text.length).toBe(904)
      expect(calls[0]!.body.text + calls[1]!.body.text).toBe(text)
    })

    it('sends negative group chat ids as signed integers', async () => {
      const captured: Array<{ chat_id: number, text: string }> = []
      mockFetch(async (_input, init) => {
        captured.push(JSON.parse(init!.body as string))
        return new Response('{"ok":true}', { status: 200 })
      })

      const binding = telegramBinding({ botToken: 'BOT:123' })
      await telegramAdapter.send(binding, {
        channel: 'telegram',
        chatId: 'group:-100123',
        text: 'hi',
      })

      expect(captured).toEqual([{ chat_id: -100_123, text: 'hi' }])
    })

    it('throws when fetch returns non-2xx', async () => {
      mockFetch(async () => new Response('Bad Request: chat not found', { status: 400 }))

      const binding = telegramBinding({ botToken: 'BOT:123' })
      await expect(
        telegramAdapter.send(binding, {
          channel: 'telegram',
          chatId: 'private:42',
          text: 'hi',
        }),
      ).rejects.toThrow(/Telegram sendMessage failed: 400/)
    })

    it('rejects malformed chatId before calling fetch', async () => {
      const fetchMock = mockFetch(async () => new Response('{}', { status: 200 }))

      const binding = telegramBinding({ botToken: 'BOT:123' })
      await expect(
        telegramAdapter.send(binding, {
          channel: 'telegram',
          chatId: 'no-colon-here',
          text: 'hi',
        }),
      ).rejects.toThrow(/malformed chatId/)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
