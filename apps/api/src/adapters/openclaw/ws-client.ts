import type { ConnectFrame, OpenClawClientOptions, OpenClawEvent } from './types'

import consola from 'consola'

type EventHandler = (event: OpenClawEvent) => void

const DEFAULT_CLIENT_NAME = 'aiworker'
const DEFAULT_CLIENT_VERSION = '0.1.0'
const INITIAL_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30_000

export class OpenClawWsClient {
  private ws: WebSocket | null = null
  private handlers: EventHandler[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = INITIAL_RECONNECT_DELAY
  private shouldReconnect: boolean
  private maxReconnectDelay: number
  private running = false

  private readonly url: string
  private readonly clientName: string
  private readonly clientVersion: string

  constructor(options: OpenClawClientOptions) {
    this.url = options.url
    this.clientName = options.clientName ?? DEFAULT_CLIENT_NAME
    this.clientVersion = options.clientVersion ?? DEFAULT_CLIENT_VERSION
    this.shouldReconnect = options.reconnect ?? true
    this.maxReconnectDelay = options.maxReconnectDelay ?? MAX_RECONNECT_DELAY
  }

  on(handler: EventHandler): () => void {
    this.handlers.push(handler)
    return () => {
      const idx = this.handlers.indexOf(handler)
      if (idx !== -1)
        this.handlers.splice(idx, 1)
    }
  }

  private emit(event: OpenClawEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event)
      }
      catch {
        // Ignore handler errors
      }
    }
  }

  connect(): void {
    if (this.ws)
      return

    this.running = true

    try {
      this.ws = new WebSocket(this.url)
    }
    catch (err) {
      consola.warn('[openclaw] Failed to create WebSocket:', err instanceof Error ? err.message : err)
      this.scheduleReconnect()
      return
    }

    this.ws.addEventListener('open', () => {
      consola.info('[openclaw] WebSocket connected to', this.url)
      this.reconnectDelay = INITIAL_RECONNECT_DELAY
      this.sendConnectFrame()
    })

    this.ws.addEventListener('message', (event) => {
      this.handleMessage(event.data)
    })

    this.ws.addEventListener('close', () => {
      consola.info('[openclaw] WebSocket disconnected')
      this.ws = null
      this.scheduleReconnect()
    })

    this.ws.addEventListener('error', (event) => {
      const errorMessage = event instanceof ErrorEvent ? event.message : 'WebSocket error'
      consola.warn('[openclaw] WebSocket error:', errorMessage)
      this.emit({
        type: 'error',
        payload: {
          code: 'WS_ERROR',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      })
    })
  }

  disconnect(): void {
    this.running = false
    this.shouldReconnect = false
    this.clearReconnectTimer()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  get isRunning(): boolean {
    return this.running
  }

  private sendConnectFrame(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      return

    const frame: ConnectFrame = {
      type: 'connect',
      payload: {
        client: this.clientName,
        version: this.clientVersion,
      },
    }

    this.ws.send(JSON.stringify(frame))
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string')
      return

    try {
      const parsed = JSON.parse(data) as Record<string, unknown>
      const type = parsed.type

      if (type === 'tool_call_start' || type === 'tool_call_end' || type === 'lifecycle' || type === 'error') {
        this.emit(parsed as unknown as OpenClawEvent)
      }
    }
    catch {
      consola.debug('[openclaw] Failed to parse WebSocket message')
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || !this.running)
      return

    this.clearReconnectTimer()

    consola.debug(`[openclaw] Reconnecting in ${this.reconnectDelay}ms`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.ws = null
      this.connect()
    }, this.reconnectDelay)

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}
