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
      className={cn('min-h-20 rounded-md border border-dashed border-border bg-muted/20 p-3', className)}
    >
      <Skeleton className="mb-3 h-3 w-2/5" />
      <Skeleton className="mb-3 h-3 w-3/5" />
      <p className="text-xs/relaxed text-muted-foreground">{label}</p>
    </div>
  )
}
