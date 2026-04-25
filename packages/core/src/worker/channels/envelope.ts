import type { ChannelType, Envelope, EnvelopeAttachment, OutboundMessage } from '@aiworker/shared'

export type { ChannelType, Envelope, EnvelopeAttachment, OutboundMessage }

export function nowIso(): string {
  return new Date().toISOString()
}
