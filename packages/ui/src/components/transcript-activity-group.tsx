import type { ReactNode } from 'react'
import type { TranscriptActivityModel } from './transcript-types'

import { Badge, BadgeLabel } from '#components/badge'
import { Button } from '#components/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/collapsible'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '#components/item'
import { cn } from '#lib/utils'
import { useId, useState } from 'react'

import { CommandBlock } from './command-block'

export interface TranscriptActivityGroupProps {
  activities: TranscriptActivityModel[]
  className?: string
  defaultCollapsed?: boolean
  summary: ReactNode
}

export function TranscriptActivityGroup({
  activities,
  className,
  defaultCollapsed = true,
  summary,
}: TranscriptActivityGroupProps) {
  const hasFailedActivity = activities.some(activity => activity.status === 'failed')
  const [open, setOpen] = useState(hasFailedActivity || !defaultCollapsed)
  const contentId = useId()

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-transcript-slot="activity-group"
      className={cn('min-w-0 rounded-md border border-border bg-muted/20', className)}
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          aria-label="Toggle activity details"
          aria-controls={contentId}
          aria-expanded={open}
          className="h-9 w-full justify-between px-3"
        >
          <span className="min-w-0 truncate text-left">{summary}</span>
          <Badge variant={hasFailedActivity ? 'destructive' : 'outline'}>
            <BadgeLabel>{activities.length}</BadgeLabel>
          </Badge>
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent id={contentId} className="border-t border-border p-2">
        <ItemGroup className="gap-2">
          {activities.map(activity => (
            <Item
              key={activity.id}
              data-transcript-slot="activity"
              data-transcript-activity-status={activity.status}
              variant="default"
              size="sm"
              className={cn('min-w-0', activity.status === 'failed' && 'bg-destructive/5')}
            >
              <ItemContent className="min-w-0 gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ItemTitle className="min-w-0 flex-1 truncate">
                    {activity.title}
                  </ItemTitle>
                  {activity.status
                    ? (
                        <Badge variant={activity.status === 'failed' ? 'destructive' : 'outline'}>
                          <BadgeLabel>{activity.status}</BadgeLabel>
                        </Badge>
                      )
                    : null}
                  {activity.meta ? <span className="text-xs text-muted-foreground">{activity.meta}</span> : null}
                </div>

                {activity.description
                  ? (
                      <ItemDescription
                        tone={activity.status === 'failed' ? 'destructive' : 'default'}
                        className="max-w-full line-clamp-none"
                      >
                        {activity.description}
                      </ItemDescription>
                    )
                  : null}
                {activity.command
                  ? <CommandBlock {...activity.command} status={activity.command.status ?? activity.status} />
                  : null}
                {activity.detail
                  ? <div className="text-xs/relaxed text-muted-foreground">{activity.detail}</div>
                  : null}
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </CollapsibleContent>
    </Collapsible>
  )
}
