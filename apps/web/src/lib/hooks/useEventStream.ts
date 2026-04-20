import { useEffect } from 'react'

export interface BusEvent {
  type: string
  payload: unknown
  timestamp: string
}

const EVENT_TYPES = [
  'connected',
  'tool_call_start',
  'tool_call_end',
  'sync_started',
  'sync_completed',
  'sync_failed',
  'memory_write',
  'skill_updated',
] as const

export function useEventStream(onEvent: (event: BusEvent) => void, enabled = true) {
  useEffect(() => {
    if (!enabled)
      return undefined

    const source = new EventSource('/api/events/stream')
    const handler = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data) as BusEvent
        onEvent(parsed)
      }
      catch {}
    }

    source.onmessage = handler
    const listener = handler as EventListener
    for (const t of EVENT_TYPES) source.addEventListener(t, listener)

    return () => {
      for (const t of EVENT_TYPES) source.removeEventListener(t, listener)
      source.close()
    }
  }, [onEvent, enabled])
}
