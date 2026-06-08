import type { ReactNode } from 'react'
import type { TranscriptActivityModel } from './transcript-types'

import { Button } from '#components/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/collapsible'
import { cn } from '#lib/utils'
import { useId, useReducer } from 'react'

import { CommandBlock } from './command-block'

export interface TranscriptActivityGroupProps {
  activities: TranscriptActivityModel[]
  className?: string
  defaultCollapsed?: boolean
  summary: ReactNode
}

function isFailedActivity(activity: TranscriptActivityModel) {
  return activity.status === 'failed' || activity.command?.status === 'failed'
}

type OpenAction = boolean | ((current: boolean) => boolean)

function openReducer(current: boolean, action: OpenAction) {
  return typeof action === 'function' ? action(current) : action
}

export function TranscriptActivityGroup({
  activities,
  className,
  defaultCollapsed = true,
  summary,
}: TranscriptActivityGroupProps) {
  const hasFailedActivity = activities.some(isFailedActivity)
  const [open, dispatchOpen] = useReducer(openReducer, !defaultCollapsed)
  const contentId = useId()
  const summaryLabel = typeof summary === 'string'
    ? `Toggle activity details: ${summary}`
    : 'Toggle activity details'

  return (
    <Collapsible
      open={open}
      onOpenChange={dispatchOpen}
      data-transcript-slot="activity-group"
      className={cn('min-w-0', className)}
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={summaryLabel}
          aria-controls={contentId}
          aria-expanded={open}
          className="h-auto min-h-7 w-full items-center justify-start gap-2 px-2 py-1 text-xs/relaxed whitespace-normal text-muted-foreground transition-all duration-200 hover:bg-muted/35 hover:text-foreground aria-expanded:bg-transparent"
        >
          <span
            data-transcript-slot="activity-dot"
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 self-center rounded-full bg-muted-foreground/45 transition-colors duration-200',
              hasFailedActivity && 'bg-destructive',
            )}
          />
          <span data-transcript-slot="activity-summary" className="min-w-0 flex-1 whitespace-normal break-words text-left">{summary}</span>
          {hasFailedActivity ? <span className="shrink-0 text-destructive">failed</span> : null}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent
        id={contentId}
        className="overflow-hidden pl-4 pt-1 duration-150 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-top-1"
      >
        <div className="grid min-w-0 gap-2 border-l border-border/60 pl-3">
          {activities.map((activity) => {
            const failed = isFailedActivity(activity)
            const status = failed ? 'failed' : activity.status

            return (
              <div
                key={activity.id}
                data-transcript-slot="activity"
                data-transcript-activity-status={status}
                className="min-w-0 text-xs/relaxed"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn('min-w-0 flex-1 whitespace-normal break-words text-foreground', failed && 'text-destructive')}>
                    {activity.title}
                  </span>
                  {status ? <span className={cn('shrink-0 text-muted-foreground', failed && 'text-destructive')}>{status}</span> : null}
                  {activity.meta ? <span className="shrink-0 text-muted-foreground">{activity.meta}</span> : null}
                </div>

                {activity.description
                  ? (
                      <div
                        data-transcript-activity-description="true"
                        data-tone={failed ? 'destructive' : 'default'}
                        className={cn('mt-1 max-w-full text-muted-foreground', failed && 'text-destructive')}
                      >
                        {activity.description}
                      </div>
                    )
                  : null}
                {activity.command
                  ? <div className="mt-2"><CommandBlock {...activity.command} status={activity.command.status ?? activity.status} /></div>
                  : null}
                {activity.detail
                  ? <div className="mt-1 text-muted-foreground">{activity.detail}</div>
                  : null}
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
