import type { BusEvent } from '@/lib/hooks/useEventStream'
import { formatDistanceToNow } from 'date-fns'
import { useCallback, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEventStream } from '@/lib/hooks/useEventStream'
import { cn } from '@/lib/utils'

const MAX_EVENTS = 30

interface LiveEvent extends BusEvent {
  _id: number
}

function summarizePayload(payload: unknown): string {
  if (payload == null)
    return ''
  if (typeof payload === 'string')
    return payload
  if (typeof payload !== 'object')
    return String(payload)
  try {
    const str = JSON.stringify(payload)
    return str.length > 120 ? `${str.slice(0, 117)}...` : str
  }
  catch {
    return ''
  }
}

export function ActivityFeed() {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [connected, setConnected] = useState(false)
  const counterRef = useRef(0)

  const handleEvent = useCallback((event: BusEvent) => {
    if (!event.timestamp)
      return
    setConnected(true)
    if (event.type === 'connected')
      return
    counterRef.current += 1
    const next: LiveEvent = { ...event, _id: counterRef.current }
    setEvents(prev => [next, ...prev].slice(0, MAX_EVENTS))
  }, [])

  useEventStream(handleEvent)

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Recent activity</CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              'inline-block size-2 rounded-full',
              connected ? 'bg-emerald-500' : 'bg-muted-foreground/40',
            )}
          />
          {connected ? 'live' : 'connecting'}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        {events.length === 0
          ? (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            )
          : (
              <ul className="flex flex-col gap-2">
                {events.map(event => (
                  <li
                    key={event._id}
                    className="flex flex-col gap-1 rounded-md border border-border/50 bg-muted/30 p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {event.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="line-clamp-2 break-all text-xs text-muted-foreground">
                      {summarizePayload(event.payload)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
      </CardContent>
    </Card>
  )
}
