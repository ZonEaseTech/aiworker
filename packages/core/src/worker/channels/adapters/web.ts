import type { Envelope, EnvelopeRichMetadata } from '@zonease/aiworker-shared'
import type { ChannelAdapter } from './types'

import { timingSafeEqualStrings } from '../../secrets/crypto'
import { nowIso } from '../envelope'

interface WebInboundReplyTo {
  authorId: string
  text: string
}

interface WebInboundRichMetadata {
  isEdit?: boolean
  isDelete?: boolean
  replyTo?: WebInboundReplyTo
  quote?: string
}

interface WebInboundBody {
  chatId: string
  threadId?: string
  userId?: string
  userDisplayName?: string
  text: string
  /** Optional rich-metadata signals forwarded from the browser client. */
  metadata?: WebInboundRichMetadata
}

const DEFAULT_WEB_ACCOUNT_ID = 'default'

function normalizeRichMetadata(input: WebInboundRichMetadata | undefined): EnvelopeRichMetadata | undefined {
  if (!input)
    return undefined
  const meta: EnvelopeRichMetadata = {}
  if (input.isEdit === true)
    meta.isEdit = true
  if (input.isDelete === true)
    meta.isDelete = true
  if (input.replyTo && typeof input.replyTo.authorId === 'string' && typeof input.replyTo.text === 'string')
    meta.replyTo = { authorId: input.replyTo.authorId, text: input.replyTo.text }
  if (typeof input.quote === 'string' && input.quote.length > 0)
    meta.quote = input.quote
  return Object.keys(meta).length === 0 ? undefined : meta
}

/**
 * Extract the bearer token from an `Authorization: Bearer <token>` header.
 * Returns `null` if the header is missing or not a valid Bearer scheme — the
 * caller maps `null` to a verification failure.
 */
function extractBearerToken(headers: Record<string, string | undefined>): string | null {
  const header = headers.authorization
  if (!header)
    return null
  const match = /^bearer\s+(\S+)\s*$/i.exec(header)
  return match ? match[1]! : null
}

/**
 * Web channel: receives envelopes from the dashboard chat widget or any other
 * in-house client. The route is mounted at the worker root with no
 * transport-level auth, so this adapter MUST authenticate every request via a
 * per-binding bearer token (`credentials.inboundToken`). Fail-closed: missing
 * or empty token rejects all traffic. See BUG-016.
 */
export const webAdapter: ChannelAdapter = {
  channel: 'web',
  async verify(_rawBody, headers, binding) {
    if (binding.credentials.channel !== 'web')
      throw new Error('web adapter called with non-web credentials')
    const expected = binding.credentials.inboundToken
    if (!expected || expected.length === 0)
      throw new Error('web channel binding has no inboundToken — refusing inbound traffic')
    const presented = extractBearerToken(headers)
    if (!presented || !timingSafeEqualStrings(presented, expected))
      throw new Error('invalid Authorization bearer token')
  },
  async toEnvelopes(rawBody, workerId, binding) {
    const accountId = (binding?.id && binding.id.length > 0) ? binding.id : DEFAULT_WEB_ACCOUNT_ID
    const body = JSON.parse(rawBody) as WebInboundBody
    const richMetadata = normalizeRichMetadata(body.metadata)
    const envelope: Envelope = {
      workerId,
      channel: 'web',
      accountId,
      chatId: body.chatId,
      ...(body.threadId === undefined ? {} : { threadId: body.threadId }),
      ...(body.userId === undefined ? {} : { userId: body.userId }),
      ...(body.userDisplayName === undefined ? {} : { userDisplayName: body.userDisplayName }),
      text: body.text,
      ...(richMetadata === undefined ? {} : { richMetadata }),
      receivedAt: nowIso(),
      raw: body,
    }
    return [envelope]
  },
  async send() {
    // Web channel replies are delivered via SSE to connected browser clients,
    // not pushed from here. The orchestrator emits events; the SSE route
    // forwards them. This method is a no-op for web.
  },
}
