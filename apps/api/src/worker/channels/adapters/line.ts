import type { Envelope } from '@aiworker/shared'
import type { ChannelAdapter } from './types'

import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

import { nowIso } from '../envelope'

interface LineWebhookBody {
  destination?: string
  events: LineEvent[]
}

type LineSource
  = | { type: 'user', userId: string }
    | { type: 'group', groupId: string, userId?: string }
    | { type: 'room', roomId: string, userId?: string }

interface LineEvent {
  type: string
  replyToken?: string
  timestamp: number
  source: LineSource
  message?: { id: string, type: string, text?: string }
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

  async toEnvelopes(rawBody, workerId) {
    const body = JSON.parse(rawBody) as LineWebhookBody
    const envelopes: Envelope[] = []
    for (const ev of body.events) {
      if (ev.type !== 'message' || ev.message?.type !== 'text' || !ev.message.text)
        continue
      const chatId = extractChatId(ev.source)
      const userId = ev.source.type === 'user'
        ? ev.source.userId
        : ('userId' in ev.source ? ev.source.userId : undefined)
      envelopes.push({
        workerId,
        channel: 'line',
        chatId,
        ...(userId === undefined ? {} : { userId }),
        text: ev.message.text,
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
