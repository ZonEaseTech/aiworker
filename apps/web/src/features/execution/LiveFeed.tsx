import type { LiveExecutionEvent } from './types'
import { formatDistanceToNow } from 'date-fns'
import { Badge } from '@/components/ui/badge'

interface LiveFeedProps {
  events: LiveExecutionEvent[]
}

function statusVariant(status: LiveExecutionEvent['status']) {
  switch (status) {
    case 'success': return 'success' as const
    case 'error': return 'destructive' as const
    case 'running': return 'warning' as const
    default: return 'outline' as const
  }
}

export function LiveFeed({ events }: LiveFeedProps) {
  if (events.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Waiting for execution events...
      </p>
    )
  }

  return (
    <ul className="flex max-h-80 flex-col gap-1 overflow-auto font-mono text-xs">
      {events.map(ev => (
        <li
          key={ev.id}
          className="flex items-center gap-2 rounded-sm border px-2 py-1"
        >
          <span className="shrink-0 text-muted-foreground">
            {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true })}
          </span>
          <Badge variant={statusVariant(ev.status)} className="shrink-0">
            {ev.status}
          </Badge>
          <span className="truncate font-semibold">{ev.toolName || ev.type}</span>
          {ev.duration != null && (
            <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
              {ev.duration}
              ms
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
