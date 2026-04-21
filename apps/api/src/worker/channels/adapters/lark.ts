import type { ChannelAdapter } from './types'

import { ChannelNotImplementedError } from './types'

/** Stub — full implementation tracked in FEAT-004. */
export const larkAdapter: ChannelAdapter = {
  channel: 'lark',
  async verify() { throw new ChannelNotImplementedError('lark') },
  async toEnvelopes() { throw new ChannelNotImplementedError('lark') },
  async send() { throw new ChannelNotImplementedError('lark') },
}
