import type { SyncEventDto } from './types'
import { formatDistanceToNow } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface SyncTimelineProps {
  events: SyncEventDto[]
}

function statusVariant(status: SyncEventDto['status']) {
  switch (status) {
    case 'completed': return 'success' as const
    case 'failed': return 'destructive' as const
    case 'running': return 'warning' as const
    default: return 'outline' as const
  }
}

export function SyncTimeline({ events }: SyncTimelineProps) {
  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No sync events yet.</p>
  }

  return (
    <ol className="flex flex-col gap-2">
      {events.map(ev => (
        <li key={ev.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Badge variant={statusVariant(ev.status)} className="shrink-0">
            {ev.status}
          </Badge>
          <span className="truncate font-medium">{ev.type}</span>
          <div className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">
            <span>{ev.source}</span>
            <ArrowRight className="size-3" />
            <span>{ev.target}</span>
          </div>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
          </span>
        </li>
      ))}
    </ol>
  )
}
