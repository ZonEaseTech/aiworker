import type { ChannelType, Envelope, EnvelopeAttachment, OutboundMessage } from '@zonease/aiworker-shared'

export type { ChannelType, Envelope, EnvelopeAttachment, OutboundMessage }

export function nowIso(): string {
  return new Date().toISOString()
}
