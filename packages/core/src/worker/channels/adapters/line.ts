import type { Envelope, EnvelopeRichMetadata } from '@aiworker/shared'
import type { ChannelAdapter } from './types'

import { Buffer } from 'node:buffer'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import { nowIso } from '../envelope'

interface LineWebhookBody {
  destination?: string
  events: LineEvent[]
}

type LineSource
  = | { type: 'user', userId: string }
    | { type: 'group', groupId: string, userId?: string }
    | { type: 'room', roomId: string, userId?: string }

interface LineEventMessage {
  id: string
  type: string
  text?: string
  /** Set when the user replied via LINE's reply UI. */
  quotedMessageId?: string
  mention?: unknown
}

interface LineEvent {
  type: string
  replyToken?: string
  timestamp: number
  source: LineSource
  message?: LineEventMessage
  unsend?: { messageId: string }
}

function hmacSha256(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('base64')
}

function extractChatId(source: LineSource): string {
  switch (source.type) {
    case 'user': return `user:${source.userId}`
    case 'group': return `group:${source.groupId}`
    case 'room': return `room:${source.roomId}`
  }
}

/**
 * LINE webhooks expose the replied-to message via `message.quotedMessageId`
 * (and optionally inlined `quotedMessage.text`), but never the original
 * author id — that requires a separate REST round-trip. Surface the
 * quoted-message id via `quote`; do not synthesise a `replyTo` because
 * the type contract requires a non-empty `authorId`.
 */
function extractRichMetadata(ev: LineEvent): EnvelopeRichMetadata | undefined {
  const quotedId = ev.message?.quotedMessageId
  if (typeof quotedId !== 'string' || quotedId.length === 0)
    return undefined
  return { quote: quotedId }
}

export const lineAdapter: ChannelAdapter = {
  channel: 'line',

  async verify(rawBody, headers, binding) {
    if (binding.credentials.channel !== 'line')
      throw new Error('line adapter called with non-line credentials')
    const signature = headers['x-line-signature']
    if (!signature)
      throw new Error('missing X-Line-Signature header')
    const expected = hmacSha256(binding.credentials.channelSecret, rawBody)
    const got = Buffer.from(signature, 'base64')
    const exp = Buffer.from(expected, 'base64')
    if (got.length !== exp.length || !timingSafeEqual(got, exp))
      throw new Error('invalid LINE signature')
  },

  async toEnvelopes(rawBody, workerId, binding) {
    if (!binding || binding.credentials.channel !== 'line')
      throw new Error('line adapter requires a line binding for accountId derivation')
    // 用 channelAccessToken 的 sha256 前 8 字节 hex 作为 accountId：
    // LINE 没有可暴露的 bot username，token 又不能直接当稳定 id（可能轮换时
    // 重置但通常一段时间内保持），hash 既稳定又不泄漏明文 token。
    const accountId = createHash('sha256')
      .update(binding.credentials.channelAccessToken, 'utf8')
      .digest('hex')
      .slice(0, 16)

    const body = JSON.parse(rawBody) as LineWebhookBody
    const envelopes: Envelope[] = []
    for (const ev of body.events) {
      if (ev.type !== 'message' || ev.message?.type !== 'text' || !ev.message.text)
        continue
      const chatId = extractChatId(ev.source)
      const userId = ev.source.type === 'user'
        ? ev.source.userId
        : ('userId' in ev.source ? ev.source.userId : undefined)
      const richMetadata = extractRichMetadata(ev)
      envelopes.push({
        workerId,
        channel: 'line',
        accountId,
        chatId,
        ...(userId === undefined ? {} : { userId }),
        text: ev.message.text,
        ...(richMetadata === undefined ? {} : { richMetadata }),
        receivedAt: new Date(ev.timestamp).toISOString() || nowIso(),
        raw: ev,
      })
    }
    return envelopes
  },

  async send(binding, message) {
    if (binding.credentials.channel !== 'line')
      throw new Error('line adapter called with non-line credentials')
    const token = binding.credentials.channelAccessToken
    const [kind, id] = message.chatId.split(':', 2)
    if (!kind || !id)
      throw new Error(`line send: malformed chatId ${message.chatId}`)

    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: id,
        messages: [{ type: 'text', text: message.text }],
      } satisfies { to: string, messages: Array<Record<string, unknown>> }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`LINE push failed: ${res.status} ${text}`)
    }
  },
}
