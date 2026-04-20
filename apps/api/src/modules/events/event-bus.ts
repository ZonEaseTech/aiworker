/**
 * In-process event bus for orchestrator lifecycle signals. Consumers (future
 * SSE endpoint, websocket bridge, tests) subscribe via `subscribe()` and the
 * producer side calls `publish()`.
 *
 * The payload shape is intentionally loose: each event type owns its own
 * payload contract, declared in the module that emits it.
 */
export interface BusEvent<T = unknown> {
  type: string
  payload: T
  timestamp: string
}

export type EventHandler = (event: BusEvent) => void

class EventBus {
  private readonly handlers = new Set<EventHandler>()

  publish<T>(event: Omit<BusEvent<T>, 'timestamp'> & { timestamp?: string }): void {
    const enriched: BusEvent<T> = {
      type: event.type,
      payload: event.payload,
      timestamp: event.timestamp ?? new Date().toISOString(),
    }
    for (const handler of this.handlers) {
      try {
        handler(enriched)
      }
      catch {
        // Swallow subscriber errors so one bad listener cannot break the bus.
      }
    }
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}

export const eventBus = new EventBus()
