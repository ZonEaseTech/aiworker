import type { ChannelBinding, ChannelType } from '@zonease/aiworker-shared'
import type { ChannelAdapter } from './adapters/types'

import { larkAdapter } from './adapters/lark'
import { lineAdapter } from './adapters/line'
import { telegramAdapter } from './adapters/telegram'
import { webAdapter } from './adapters/web'
import { whatsappAdapter } from './adapters/whatsapp'

const adapters: Record<ChannelType, ChannelAdapter> = {
  web: webAdapter,
  line: lineAdapter,
  telegram: telegramAdapter,
  lark: larkAdapter,
  whatsapp: whatsappAdapter,
}

export function getChannelAdapter(channel: ChannelType): ChannelAdapter {
  return adapters[channel]
}

export class ChannelRegistry {
  private readonly byChannel: Map<ChannelType, ChannelBinding>

  constructor(bindings: ChannelBinding[]) {
    this.byChannel = new Map()
    for (const b of bindings) {
      if (b.enabled)
        this.byChannel.set(b.channel, b)
    }
  }

  list(): ChannelBinding[] {
    return Array.from(this.byChannel.values())
  }

  get(channel: ChannelType): ChannelBinding | null {
    return this.byChannel.get(channel) ?? null
  }

  adapter(channel: ChannelType): ChannelAdapter {
    return getChannelAdapter(channel)
  }
}
