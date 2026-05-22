import type { HTMLAttributes, ReactNode } from 'react'

import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Card, CardContent } from '@zonease/aiworker-ui/components/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup } from '@zonease/aiworker-ui/components/item'
import { ScrollArea } from '@zonease/aiworker-ui/components/scroll-area'
import { cn } from '@zonease/aiworker-ui/lib/utils'

export type MessageFlowTone = 'danger' | 'info' | 'muted' | 'success' | 'warning'

export function MessageFlow({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <ItemGroup {...props} data-session-slot="message-flow" className={cn('min-w-0 max-w-full gap-3', className)}>
      {children}
    </ItemGroup>
  )
}

export interface MessageRowProps extends HTMLAttributes<HTMLElement> {
  roleLabel: ReactNode
  timestamp?: ReactNode
  tone?: MessageFlowTone
}

export function MessageRow({
  children,
  className,
  roleLabel,
  timestamp,
  tone = 'info',
  ...props
}: MessageRowProps) {
  return (
    <Item asChild variant="default" size="xs" className={cn('grid min-w-0 gap-2 px-0 py-0', className)} data-tone={tone}>
      <article {...props} data-session-slot="message-row">
        <ItemActions asChild className="min-w-0 justify-between gap-2">
          <header>
            <ItemDescription asChild>
              <span>{roleLabel}</span>
            </ItemDescription>
            {timestamp
              ? (
                  <ItemDescription asChild>
                    <time>{timestamp}</time>
                  </ItemDescription>
                )
              : null}
          </header>
        </ItemActions>
        <ItemContent data-session-slot="message-content" className="min-w-0 max-w-full gap-0">{children}</ItemContent>
      </article>
    </Item>
  )
}

export interface ToolResultCardProps extends HTMLAttributes<HTMLElement> {
  command?: ReactNode
  result: ReactNode
  tone?: MessageFlowTone
}

export function ToolResultCard({
  className,
  command,
  result,
  tone = 'muted',
  ...props
}: ToolResultCardProps) {
  return (
    <Card {...props} data-session-slot="tool-result-card" data-tone={tone} className={cn('min-w-0 max-w-full py-0', className)}>
      <CardContent className="grid min-w-0 max-w-full gap-2 p-2">
        {command ? <SessionCodeBlock as="code">{command}</SessionCodeBlock> : null}
        <SessionCodeBlock>{result}</SessionCodeBlock>
      </CardContent>
    </Card>
  )
}

export function SessionCodeBlock({
  as = 'pre',
  children,
  className,
  scrollAreaClassName,
}: {
  as?: 'code' | 'pre'
  children: ReactNode
  className?: string
  scrollAreaClassName?: string
}) {
  const Comp = as
  return (
    <ScrollArea className={cn('max-h-72 min-w-0 max-w-full overflow-hidden', scrollAreaClassName)}>
      <Comp className={cn('block min-w-0 max-w-full break-words whitespace-pre-wrap p-2', className)}>{children}</Comp>
    </ScrollArea>
  )
}

export interface StatusEventPillProps extends HTMLAttributes<HTMLSpanElement> {
  detail?: ReactNode
  tone?: MessageFlowTone
}

export function StatusEventPill({
  children,
  className,
  detail,
  tone = 'info',
  ...props
}: StatusEventPillProps) {
  return (
    <Badge
      {...props}
      variant={tone === 'danger' ? 'destructive' : tone === 'success' ? 'secondary' : 'outline'}
      data-tone={tone}
      className={cn('gap-1', className)}
    >
      <span>{children}</span>
      {detail ? <small>{detail}</small> : null}
    </Badge>
  )
}
