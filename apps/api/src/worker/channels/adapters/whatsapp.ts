import type { ChannelAdapter } from './types'

import { ChannelNotImplementedError } from './types'

/** Stub — full implementation tracked in FEAT-005. */
export const whatsappAdapter: ChannelAdapter = {
  channel: 'whatsapp',
  async verify() { throw new ChannelNotImplementedError('whatsapp') },
  async toEnvelopes() { throw new ChannelNotImplementedError('whatsapp') },
  async send() { throw new ChannelNotImplementedError('whatsapp') },
}
