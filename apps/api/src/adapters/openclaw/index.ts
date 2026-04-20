import type { OpenClawConfig, OpenClawEvent } from './types'

import consola from 'consola'

import { readOpenClawConfig } from './config-reader'
import { OpenClawEventLogger } from './event-logger'
import { OpenClawWsClient } from './ws-client'

export { readOpenClawConfig } from './config-reader'
export { OpenClawEventLogger } from './event-logger'
export type {
  ConnectFrame,
  ErrorEvent,
  LifecycleEvent,
  OpenClawClientOptions,
  OpenClawConfig,
  OpenClawEvent,
  ToolCallEndEvent,
  ToolCallStartEvent,
} from './types'
export { OpenClawWsClient } from './ws-client'

export interface OpenClawAdapterOptions {
  wsUrl: string
  openclawHome: string
  clientName?: string
  clientVersion?: string
}

type EventHandler = (event: OpenClawEvent) => void

export class OpenClawAdapter {
  readonly client: OpenClawWsClient
  readonly logger: OpenClawEventLogger
  private readonly openclawHome: string
  private handlers: EventHandler[] = []
  private unsubscribe: (() => void) | null = null

  constructor(options: OpenClawAdapterOptions) {
    this.openclawHome = options.openclawHome
    this.client = new OpenClawWsClient({
      url: options.wsUrl,
      clientName: options.clientName,
      clientVersion: options.clientVersion,
      reconnect: true,
    })
    this.logger = new OpenClawEventLogger()
  }

  onEvent(handler: EventHandler): () => void {
    this.handlers.push(handler)
    return () => {
      const idx = this.handlers.indexOf(handler)
      if (idx !== -1)
        this.handlers.splice(idx, 1)
    }
  }

  async getConfig(): Promise<OpenClawConfig | null> {
    return readOpenClawConfig(this.openclawHome)
  }

  async start(): Promise<void> {
    this.unsubscribe = this.client.on((event) => {
      // Log tool_call_end events to SQLite
      if (event.type === 'tool_call_end') {
        this.logger.logToolCall(event).catch((err) => {
          consola.warn('[openclaw] Failed to log tool call:', err instanceof Error ? err.message : err)
        })
      }

      // Notify all subscribed handlers
      for (const handler of this.handlers) {
        try {
          handler(event)
        }
        catch {
          // Ignore handler errors
        }
      }
    })

    this.client.connect()
    consola.info('[openclaw] Adapter started')
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }

    this.client.disconnect()
    consola.info('[openclaw] Adapter stopped')
  }
}
