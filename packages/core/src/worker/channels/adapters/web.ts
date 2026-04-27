import type { Envelope, EnvelopeRichMetadata } from '@zonease/aiworker-shared'
import type { ChannelAdapter } from './types'

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
 * Web channel: the dashboard's own chat widget. No external signature — relies
 * on the dashboard session / internal shared secret (enforced by the route
 * handler, not this adapter).
 */
export const webAdapter: ChannelAdapter = {
  channel: 'web',
  async verify() {
    // nothing: ingress is trusted internal
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
