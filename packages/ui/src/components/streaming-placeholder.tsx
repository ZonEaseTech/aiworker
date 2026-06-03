import type { ReactNode } from 'react'

import { Skeleton } from '#components/skeleton'
import { cn } from '#lib/utils'

export interface StreamingPlaceholderProps {
  ariaLabel?: string
  className?: string
  label: ReactNode
}

export function StreamingPlaceholder({ ariaLabel, className, label }: StreamingPlaceholderProps) {
  const statusLabel = ariaLabel ?? (typeof label === 'string' ? label : undefined)

  return (
    <div
      data-transcript-slot="streaming-placeholder"
      role="status"
      aria-label={statusLabel}
      aria-live="polite"
      className={cn('grid min-h-20 max-w-3xl min-w-0 gap-3 rounded-lg bg-muted/20 px-3 py-3', className)}
    >
      <div className="grid min-w-0 gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <p className="text-xs/relaxed text-muted-foreground">{label}</p>
    </div>
  )
}
