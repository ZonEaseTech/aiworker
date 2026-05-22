import type { HTMLAttributes, ReactNode } from 'react'

import { Badge } from '#components/badge'
import { Button } from '#components/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#components/collapsible'
import { ItemTitle } from '#components/item'
import { cn } from '#lib/utils'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export interface CollapsibleGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  children?: ReactNode
  collapsed: boolean
  controlsId?: string
  description?: ReactNode
  drawerProps?: HTMLAttributes<HTMLDivElement>
  meta?: ReactNode
  onToggle: () => void
  title: ReactNode
  toggleAriaLabel: string
}

export function CollapsibleGroup({
  children,
  className,
  collapsed,
  controlsId,
  description,
  drawerProps,
  meta,
  onToggle,
  title,
  toggleAriaLabel,
  ...props
}: CollapsibleGroupProps) {
  const { className: drawerClassName, ...restDrawerProps } = drawerProps ?? {}
  const open = !collapsed

  return (
    <Collapsible
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen !== open)
          onToggle()
      }}
      {...props}
      data-has-description={description ? 'true' : undefined}
      data-collapsed={collapsed ? 'true' : undefined}
      className={cn('flex min-w-0 flex-col gap-2', className)}
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="h-7 min-h-7 w-full justify-between gap-1.5 overflow-hidden px-2 py-0 text-muted-foreground whitespace-nowrap hover:bg-muted/50 hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground dark:hover:bg-muted/30"
          aria-label={toggleAriaLabel}
          aria-controls={controlsId}
        >
          <ItemTitle className="min-w-0 flex-1 truncate text-left text-muted-foreground">{title}</ItemTitle>
          {meta !== null && meta !== undefined ? <Badge variant="ghost" className="text-muted-foreground">{meta}</Badge> : null}
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} data-icon="inline-end" className={cn('text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent
        {...restDrawerProps}
        id={controlsId}
        className={cn('flex min-w-0 flex-col gap-2 overflow-hidden', drawerClassName)}
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
