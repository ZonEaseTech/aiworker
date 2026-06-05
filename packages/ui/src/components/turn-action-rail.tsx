import type { TranscriptTurnActionModel } from './transcript-types'

import { Button } from '#components/button'
import { cn } from '#lib/utils'

export interface TurnActionRailProps {
  actions: TranscriptTurnActionModel[]
  className?: string
}

function normalizeActionHref(href: string | undefined): string | undefined {
  if (!href)
    return undefined

  const value = href.trim()
  if (!value || hasControlCharacter(value))
    return undefined

  try {
    const url = new URL(value, 'https://aiworker.local')
    if (url.protocol === 'http:' || url.protocol === 'https:')
      return value
  }
  catch {
    return undefined
  }

  return undefined
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || code === 127)
      return true
  }
  return false
}

export function TurnActionRail({ actions, className }: TurnActionRailProps) {
  if (actions.length === 0)
    return null

  return (
    <div
      data-transcript-slot="turn-action-rail"
      className={cn('flex min-w-0 items-center gap-1 pt-1 text-muted-foreground', className)}
    >
      {actions.map((action) => {
        const href = action.disabled ? undefined : normalizeActionHref(action.href)
        if (href) {
          return (
            <Button key={action.id} asChild variant="ghost" size="sm">
              <a href={href} target="_blank" rel="noreferrer">{action.label}</a>
            </Button>
          )
        }

        return (
          <Button
            key={action.id}
            type="button"
            variant="ghost"
            size="sm"
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        )
      })}
    </div>
  )
}
