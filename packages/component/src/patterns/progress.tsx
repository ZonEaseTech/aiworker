import type { HTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export type ProgressCardTone = 'finalizing' | 'muted' | 'ready' | 'reviewed' | 'risk' | 'working'

export interface ProgressCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  compact?: boolean
  detail?: ReactNode
  label: ReactNode
  live?: boolean
  stage?: string
  title?: ReactNode
  tone?: ProgressCardTone
}

export function ProgressCard({
  className,
  compact = false,
  detail,
  label,
  live = false,
  stage,
  title,
  tone,
  ...props
}: ProgressCardProps) {
  return (
    <section
      {...props}
      aria-live={live ? 'polite' : props['aria-live']}
      className={cx('session-progress-card', compact && 'compact', className)}
      data-stage={stage}
      data-tone={tone}
    >
      <div className="session-progress-head">
        <span className="session-progress-dot" aria-hidden="true" />
        <span className="session-progress-label">{label}</span>
      </div>
      {title ? <strong>{title}</strong> : null}
      {detail ? <span className="session-progress-detail">{detail}</span> : null}
    </section>
  )
}
