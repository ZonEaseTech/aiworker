import type { Envelope, EnvelopeRichMetadata } from '@zonease/aiworker-shared'
import type { ChannelAdapter } from './types'

import { Buffer } from 'node:buffer'
import { createDecipheriv, createHash } from 'node:crypto'

import { timingSafeEqualStrings } from '../../secrets/crypto'

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
  /** Set when the user is replying to / quoting another message. */
  parent_id?: string
  root_id?: string
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
    if (token === undefined || !timingSafeEqualStrings(token, binding.credentials.verificationToken))
      throw new Error('invalid Lark verification token')
  },

  async toEnvelopes(rawBody, workerId, binding) {
    if (!binding || binding.credentials.channel !== 'lark')
      throw new Error('lark adapter requires a lark binding for accountId derivation')
    const accountId = binding.credentials.appId
    const encryptKey = binding.credentials.encryptKey
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

    const richMetadata = extractRichMetadata(message)

    const envelope: Envelope = {
      workerId,
      channel: 'lark',
      accountId,
      chatId,
      ...(openId === undefined ? {} : { userId: openId }),
      ...(displayName === undefined ? {} : { userDisplayName: displayName }),
      text,
      ...(richMetadata === undefined ? {} : { richMetadata }),
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

/**
 * Lark webhooks include `parent_id` when the user replies to / quotes another
 * message but expose neither the parent author nor body — those require an
 * extra `im.message.get` round-trip. Surface the parent id via `quote`; the
 * downstream consumer can hydrate it on demand.
 */
function extractRichMetadata(message: LarkMessage): EnvelopeRichMetadata | undefined {
  const parentId = typeof message.parent_id === 'string' && message.parent_id.length > 0
    ? message.parent_id
    : undefined
  if (!parentId)
    return undefined
  return { quote: parentId }
}

/**
 * 清空 lark tenant_access_token 模块级缓存。
 *
 * lark adapter 是导出的单例对象（非工厂），`tokenCache` 也是模块级 `Map`，
 * 所以 hot-reload 时旧 config 的 token 条目不会被新 runtime 自动顶掉。
 * 当 worker config 里的 lark 凭据被换掉（appId / appSecret 旋转或解绑）
 * 而旧 token 仍未到 `expiresAt` 时，新 runtime 仍会复用过期的旧 token。
 *
 * `runtime.dispose()` 在 hot-reload 阶段调它一次，强制下一次发送重新拉
 * tenant_access_token——比缓存条目滞留两小时更安全。
 *
 * 注意：worker 进程是 single-tenant（一 worker.db / 一进程），没有多
 * appId 共享缓存的需求，全清是合适的；如果未来切到多 worker per process
 * 模型，再下沉到 ChannelRegistry 实例。
 */
export function resetLarkTokenCache(): void {
  tokenCache.clear()
}

/** Internals exposed for tests only. Do not import from production code. */
export const __larkInternals = {
  resetTokenCache: resetLarkTokenCache,
  decryptLarkPayload,
}
