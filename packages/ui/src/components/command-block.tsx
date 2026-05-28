import type { ReactNode } from 'react'
import type { TranscriptActivityStatus } from './transcript-types'

import { Badge, BadgeLabel } from '#components/badge'
import { Button } from '#components/button'
import { cn } from '#lib/utils'
import { useEffect, useReducer, useState } from 'react'

export interface CommandBlockProps {
  className?: string
  command: string
  defaultExpanded?: boolean
  language?: string
  output?: string
  status?: TranscriptActivityStatus
  title?: ReactNode
}

type ExpandedAction = boolean | ((current: boolean) => boolean)

function expandedReducer(current: boolean, action: ExpandedAction): boolean {
  return typeof action === 'function' ? action(current) : action
}

export function CommandBlock({
  className,
  command,
  defaultExpanded = true,
  language = 'shell',
  output,
  status = 'idle',
  title,
}: CommandBlockProps) {
  const hasOutput = output !== undefined && output !== ''
  const [expanded, dispatchExpanded] = useReducer(expandedReducer, status === 'failed' ? true : defaultExpanded)
  const [wrapped, setWrapped] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (status === 'failed' && hasOutput)
      dispatchExpanded(true)
  }, [hasOutput, status])

  async function copyCommand() {
    if (!navigator.clipboard)
      return

    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
    }
    catch {
      setCopied(false)
    }
  }

  return (
    <figure
      data-transcript-slot="command-block"
      data-transcript-command-status={status}
      className={cn(
        'min-w-0 overflow-hidden rounded-md border border-border bg-muted/30 text-xs/relaxed',
        status === 'failed' && 'border-destructive/40 bg-destructive/5',
        className,
      )}
    >
      <figcaption className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 truncate font-medium text-foreground">{title ?? 'Command'}</span>
          <Badge variant="outline">
            <BadgeLabel>{language}</BadgeLabel>
          </Badge>
          <Badge variant={status === 'failed' ? 'destructive' : 'secondary'}>
            <BadgeLabel>{status}</BadgeLabel>
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" aria-label="Copy command" onClick={copyCommand}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Wrap command output"
            aria-pressed={wrapped}
            onClick={() => setWrapped(value => !value)}
          >
            Wrap
          </Button>
          {hasOutput
            ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={expanded ? 'Collapse command output' : 'Expand command output'}
                  aria-expanded={expanded}
                  onClick={() => dispatchExpanded(value => !value)}
                >
                  {expanded ? 'Collapse' : 'Expand'}
                </Button>
              )
            : null}
        </div>
      </figcaption>

      <pre
        data-testid="command-command"
        data-transcript-wrapped={wrapped ? 'true' : 'false'}
        className={cn(
          'overflow-x-auto p-3 font-mono text-foreground',
          wrapped ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
        )}
        dir="ltr"
      >
        <code>{command}</code>
      </pre>

      {hasOutput && expanded
        ? (
            <pre
              data-testid="command-output"
              data-transcript-wrapped={wrapped ? 'true' : 'false'}
              className={cn(
                'max-h-72 overflow-auto border-t border-border p-3 font-mono text-muted-foreground',
                status === 'failed' && 'text-foreground',
                wrapped ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
              )}
              dir="ltr"
            >
              <code>{output}</code>
            </pre>
          )
        : null}
    </figure>
  )
}
