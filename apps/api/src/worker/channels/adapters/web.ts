import type { Envelope } from '@aiworker/shared'
import type { ChannelAdapter } from './types'

import { nowIso } from '../envelope'

interface WebInboundBody {
  chatId: string
  threadId?: string
  userId?: string
  userDisplayName?: string
  text: string
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
  async toEnvelopes(rawBody, workerId) {
    const body = JSON.parse(rawBody) as WebInboundBody
    const envelope: Envelope = {
      workerId,
      channel: 'web',
      chatId: body.chatId,
      ...(body.threadId === undefined ? {} : { threadId: body.threadId }),
      ...(body.userId === undefined ? {} : { userId: body.userId }),
      ...(body.userDisplayName === undefined ? {} : { userDisplayName: body.userDisplayName }),
      text: body.text,
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
