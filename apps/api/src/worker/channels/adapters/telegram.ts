import type { ChannelAdapter } from './types'

import { ChannelNotImplementedError } from './types'

/** Stub — full implementation tracked in FEAT-003. */
export const telegramAdapter: ChannelAdapter = {
  channel: 'telegram',
  async verify() { throw new ChannelNotImplementedError('telegram') },
  async toEnvelopes() { throw new ChannelNotImplementedError('telegram') },
  async send() { throw new ChannelNotImplementedError('telegram') },
}
