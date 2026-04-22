import type { Envelope } from '@aiworker/shared'
import type { ChannelAdapter } from './types'

import { Buffer } from 'node:buffer'
import { createDecipheriv, createHash } from 'node:crypto'

interface LarkSenderId {
  open_id?: string
  union_id?: string
  user_id?: string
  name?: string
}

interface LarkSender {
  sender_id?: LarkSenderId
  sender_type?: string
  tenant_key?: string
}

interface LarkMessage {
  message_id: string
  create_time: string
  chat_id: string
  chat_type: 'p2p' | 'group'
  message_type: string
  content: string
}

interface LarkEventV2 {
  schema?: string
  header?: {
    event_id?: string
    event_type?: string
    create_time?: string
    token?: string
    app_id?: string
    tenant_key?: string
  }
  event?: {
    sender?: LarkSender
    message?: LarkMessage
  }
}

type LarkPayload = LarkEventV2 & {
  type?: string
  challenge?: string
  token?: string
  encrypt?: string
}

interface TokenCacheEntry {
  token: string
  expiresAt: number
}

interface TokenCacheSlot {
  current?: TokenCacheEntry
  inflight?: Promise<TokenCacheEntry>
}

const TOKEN_REFRESH_MARGIN_MS = 60_000

const tokenCache: Map<string, TokenCacheSlot> = new Map()

function decryptLarkPayload(encrypted: string, encryptKey: string): string {
  const key = createHash('sha256').update(encryptKey, 'utf8').digest()
  const data = Buffer.from(encrypted, 'base64')
  if (data.length <= 16)
    throw new Error('lark: encrypted payload too short')
  const iv = data.subarray(0, 16)
  const ciphertext = data.subarray(16)
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}

function parseLarkBody(rawBody: string, encryptKey: string | undefined): LarkPayload {
  const parsed = JSON.parse(rawBody) as LarkPayload
  if (typeof parsed.encrypt === 'string') {
    if (!encryptKey)
      throw new Error('lark: encrypted payload received but encryptKey is missing')
    return JSON.parse(decryptLarkPayload(parsed.encrypt, encryptKey)) as LarkPayload
  }
  return parsed
}

function isUrlVerification(payload: LarkPayload): boolean {
  return payload.type === 'url_verification'
    || payload.header?.event_type === 'url_verification'
}

function extractToken(payload: LarkPayload): string | undefined {
  if (typeof payload.header?.token === 'string')
    return payload.header.token
  if (typeof payload.token === 'string')
    return payload.token
  return undefined
}

async function fetchTenantToken(appId: string, appSecret: string): Promise<TokenCacheEntry> {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Lark token exchange HTTP ${res.status}: ${text}`)
  }
  const data = await res.json() as {
    code?: number
    msg?: string
    tenant_access_token?: string
    expire?: number
  }
  if (typeof data.code === 'number' && data.code !== 0)
    throw new Error(`Lark token exchange error ${data.code}: ${data.msg ?? 'unknown'}`)
  if (!data.tenant_access_token || typeof data.expire !== 'number')
    throw new Error('Lark token exchange returned malformed response')
  return {
    token: data.tenant_access_token,
    expiresAt: Date.now() + data.expire * 1000,
  }
}

async function getTenantToken(appId: string, appSecret: string): Promise<string> {
  let slot = tokenCache.get(appId)
  if (!slot) {
    slot = {}
    tokenCache.set(appId, slot)
  }
  if (slot.current && slot.current.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS)
    return slot.current.token
  if (slot.inflight)
    return (await slot.inflight).token

  const slotRef = slot
  slotRef.inflight = fetchTenantToken(appId, appSecret)
    .then((entry) => {
      slotRef.current = entry
      return entry
    })
    .finally(() => {
      slotRef.inflight = undefined
    })
  return (await slotRef.inflight).token
}

export const larkAdapter: ChannelAdapter = {
  channel: 'lark',

  async verify(rawBody, _headers, binding) {
    if (binding.credentials.channel !== 'lark')
      throw new Error('lark adapter called with non-lark credentials')
    const payload = parseLarkBody(rawBody, binding.credentials.encryptKey)
    const token = extractToken(payload)
    if (token === undefined || token !== binding.credentials.verificationToken)
      throw new Error('invalid Lark verification token')
  },

  async toEnvelopes(rawBody, workerId, binding) {
    const encryptKey = binding?.credentials.channel === 'lark'
      ? binding.credentials.encryptKey
      : undefined
    const payload = parseLarkBody(rawBody, encryptKey)
    if (isUrlVerification(payload))
      return []
    if (payload.header?.event_type !== 'im.message.receive_v1')
      return []

    const message = payload.event?.message
    if (!message || message.message_type !== 'text')
      return []

    let text = ''
    try {
      const content = JSON.parse(message.content) as { text?: string }
      text = typeof content.text === 'string' ? content.text : ''
    }
    catch {
      return []
    }
    if (!text)
      return []

    const sender = payload.event?.sender
    const openId = sender?.sender_id?.open_id
    const displayName = sender?.sender_id?.name

    const chatId = message.chat_type === 'group'
      ? `group:${message.chat_id}`
      : `p2p:${openId ?? ''}`

    const envelope: Envelope = {
      workerId,
      channel: 'lark',
      chatId,
      ...(openId === undefined ? {} : { userId: openId }),
      ...(displayName === undefined ? {} : { userDisplayName: displayName }),
      text,
      receivedAt: new Date(Number(message.create_time)).toISOString(),
      raw: payload,
    }
    return [envelope]
  },

  async send(binding, message) {
    if (binding.credentials.channel !== 'lark')
      throw new Error('lark adapter called with non-lark credentials')
    const { appId, appSecret } = binding.credentials
    const token = await getTenantToken(appId, appSecret)

    const [kind, id] = message.chatId.split(':', 2)
    if (!kind || !id)
      throw new Error(`lark send: malformed chatId ${message.chatId}`)
    if (kind !== 'group' && kind !== 'p2p')
      throw new Error(`lark send: unsupported chat kind "${kind}"`)
    const receiveIdType = kind === 'group' ? 'chat_id' : 'open_id'

    const res = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receive_id: id,
          msg_type: 'text',
          content: JSON.stringify({ text: message.text }),
        }),
      },
    )
    const data = await res.json().catch(() => ({})) as { code?: number, msg?: string }
    if (data.code !== 0)
      throw new Error(`Lark send failed: ${data.code ?? res.status} ${data.msg ?? res.statusText}`)
  },
}

/** Internals exposed for tests only. Do not import from production code. */
export const __larkInternals = {
  resetTokenCache(): void {
    tokenCache.clear()
  },
  decryptLarkPayload,
}
