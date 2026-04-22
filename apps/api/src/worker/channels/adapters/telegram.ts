import type { Envelope } from '@aiworker/shared'
import type { ChannelAdapter } from './types'

import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

import { nowIso } from '../envelope'

const TELEGRAM_MAX_MESSAGE_CHARS = 4096
const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token'
const WHITESPACE = /\s/

interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
}

interface TelegramUser {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
}

interface TelegramMessage {
  message_id: number
  date: number
  chat: TelegramChat
  from?: TelegramUser
  text?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  channel_post?: TelegramMessage
  edited_channel_post?: TelegramMessage
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length)
    return false
  return timingSafeEqual(bufA, bufB)
}

function displayName(from: TelegramUser | undefined): string | undefined {
  if (!from)
    return undefined
  if (from.first_name)
    return from.last_name ? `${from.first_name} ${from.last_name}` : from.first_name
  return from.username
}

function chunkByLimit(text: string, limit: number): string[] {
  if (text.length <= limit)
    return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > limit) {
    let sliceAt = -1
    for (let i = limit - 1; i > 0; i--) {
      if (WHITESPACE.test(remaining[i]!)) {
        sliceAt = i
        break
      }
    }
    if (sliceAt > 0) {
      chunks.push(remaining.slice(0, sliceAt))
      remaining = remaining.slice(sliceAt + 1)
    }
    else {
      chunks.push(remaining.slice(0, limit))
      remaining = remaining.slice(limit)
    }
  }
  if (remaining.length > 0)
    chunks.push(remaining)
  return chunks
}

export const telegramAdapter: ChannelAdapter = {
  channel: 'telegram',

  async verify(_rawBody, headers, binding) {
    if (binding.credentials.channel !== 'telegram')
      throw new Error('telegram adapter called with non-telegram credentials')
    const expected = binding.credentials.webhookSecretToken
    if (!expected)
      return
    const got = headers[TELEGRAM_SECRET_HEADER]
    if (!got || !timingSafeStringEqual(got, expected))
      throw new Error('invalid X-Telegram-Bot-Api-Secret-Token')
  },

  async toEnvelopes(rawBody, workerId) {
    const update = JSON.parse(rawBody) as TelegramUpdate
    const msg = update.message
    if (!msg || typeof msg.text !== 'string')
      return []
    const chatId = `${msg.chat.type}:${msg.chat.id}`
    const userId = msg.from?.id?.toString()
    const name = displayName(msg.from)
    const receivedAt = Number.isFinite(msg.date)
      ? new Date(msg.date * 1000).toISOString()
      : nowIso()
    const envelope: Envelope = {
      workerId,
      channel: 'telegram',
      chatId,
      ...(userId === undefined ? {} : { userId }),
      ...(name === undefined ? {} : { userDisplayName: name }),
      text: msg.text,
      receivedAt,
      raw: update,
    }
    return [envelope]
  },

  async send(binding, message) {
    if (binding.credentials.channel !== 'telegram')
      throw new Error('telegram adapter called with non-telegram credentials')
    const token = binding.credentials.botToken
    const colonIdx = message.chatId.indexOf(':')
    if (colonIdx <= 0 || colonIdx === message.chatId.length - 1)
      throw new Error(`telegram send: malformed chatId ${message.chatId}`)
    const idRaw = message.chatId.slice(colonIdx + 1)
    const chatIdNum = Number(idRaw)
    if (!Number.isFinite(chatIdNum) || !Number.isInteger(chatIdNum))
      throw new Error(`telegram send: malformed chatId ${message.chatId}`)

    const url = `https://api.telegram.org/bot${token}/sendMessage`
    const chunks = chunkByLimit(message.text, TELEGRAM_MAX_MESSAGE_CHARS)
    for (const chunk of chunks) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatIdNum, text: chunk }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Telegram sendMessage failed: ${res.status} ${text}`)
      }
    }
  },
}
