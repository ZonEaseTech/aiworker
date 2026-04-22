import type { Envelope } from '@aiworker/shared'
import type { ChannelAdapter } from './types'

import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

interface WhatsAppContact {
  wa_id?: string
  profile?: { name?: string }
}

interface WhatsAppTextBody {
  body?: string
}

interface WhatsAppMediaBody {
  caption?: string
}

interface WhatsAppMessage {
  id?: string
  from: string
  timestamp: string
  type: string
  text?: WhatsAppTextBody
  image?: WhatsAppMediaBody
  audio?: WhatsAppMediaBody
  video?: WhatsAppMediaBody
  document?: WhatsAppMediaBody
  [k: string]: unknown
}

interface WhatsAppChangeValue {
  messaging_product?: string
  metadata?: unknown
  contacts?: WhatsAppContact[]
  messages?: WhatsAppMessage[]
  statuses?: unknown[]
}

interface WhatsAppWebhookBody {
  entry?: Array<{ changes?: Array<{ value?: WhatsAppChangeValue }> }>
}

const GRAPH_API_VERSION = 'v21.0'

export const whatsappAdapter: ChannelAdapter = {
  channel: 'whatsapp',

  async verify(rawBody, headers, binding) {
    if (binding.credentials.channel !== 'whatsapp')
      throw new Error('whatsapp adapter called with non-whatsapp credentials')
    const header = headers['x-hub-signature-256']
    if (!header)
      throw new Error('missing X-Hub-Signature-256 header')
    const [scheme, hex] = header.split('=', 2)
    if (scheme !== 'sha256' || !hex)
      throw new Error('invalid X-Hub-Signature-256 format')
    const expectedHex = createHmac('sha256', binding.credentials.appSecret)
      .update(rawBody, 'utf8')
      .digest('hex')
    const got = Buffer.from(hex, 'hex')
    const exp = Buffer.from(expectedHex, 'hex')
    if (got.length !== exp.length || !timingSafeEqual(got, exp))
      throw new Error('invalid WhatsApp signature')
  },

  async toEnvelopes(rawBody, workerId) {
    const body = JSON.parse(rawBody) as WhatsAppWebhookBody
    const envelopes: Envelope[] = []
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        if (!value || !value.messages || value.messages.length === 0)
          continue
        const contacts = value.contacts ?? []
        for (const msg of value.messages) {
          const text = extractText(msg)
          if (text === undefined)
            continue
          const chatId = msg.from
          const contact = contacts.find(c => c.wa_id === chatId)
          const displayName = contact?.profile?.name
          envelopes.push({
            workerId,
            channel: 'whatsapp',
            chatId,
            userId: chatId,
            ...(displayName ? { userDisplayName: displayName } : {}),
            text,
            receivedAt: new Date(Number(msg.timestamp) * 1000).toISOString(),
            raw: msg,
          })
        }
      }
    }
    return envelopes
  },

  async send(binding, message) {
    if (binding.credentials.channel !== 'whatsapp')
      throw new Error('whatsapp adapter called with non-whatsapp credentials')
    const { phoneNumberId, accessToken } = binding.credentials
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: message.chatId,
        type: 'text',
        text: { preview_url: false, body: message.text },
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`WhatsApp send failed: ${res.status} ${text}`)
    }
  },
}

function extractText(msg: WhatsAppMessage): string | undefined {
  switch (msg.type) {
    case 'text':
      return msg.text?.body
    case 'image':
      return msg.image?.caption
    case 'audio':
      return msg.audio?.caption
    case 'video':
      return msg.video?.caption
    case 'document':
      return msg.document?.caption
    default:
      return undefined
  }
}
