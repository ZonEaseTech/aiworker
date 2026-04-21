import type { ChannelBinding, Envelope, OutboundMessage } from '@aiworker/shared'

export interface ChannelAdapter {
  readonly channel: ChannelBinding['channel']
  /** Verify the inbound request (HMAC signature, secret token, ...). Throws on mismatch. */
  verify: (rawBody: string, headers: Record<string, string | undefined>, binding: ChannelBinding) => Promise<void>
  /** Normalise a platform-specific webhook payload into one or more envelopes. */
  toEnvelopes: (rawBody: string, workerId: string) => Promise<Envelope[]>
  /** Dispatch an outbound reply using the platform's send API. */
  send: (binding: ChannelBinding, message: OutboundMessage) => Promise<void>
}

export class ChannelNotImplementedError extends Error {
  constructor(public readonly channel: ChannelBinding['channel']) {
    super(`Channel adapter "${channel}" is not implemented yet`)
    this.name = 'ChannelNotImplementedError'
  }
}
