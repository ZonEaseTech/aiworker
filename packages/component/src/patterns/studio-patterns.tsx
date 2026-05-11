import type { HTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export interface StudioSectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  action?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  meta?: ReactNode
  title: ReactNode
}

export function StudioSectionHeader({
  action,
  className,
  description,
  icon,
  meta,
  title,
  ...props
}: StudioSectionHeaderProps) {
  return (
    <div {...props} className={cx('studio-section-head', className)}>
      <div className="studio-section-title">
        {icon ? <span className="studio-section-icon" aria-hidden="true">{icon}</span> : null}
        <div>
          <strong>{title}</strong>
          {description ? <small>{description}</small> : null}
        </div>
      </div>
      {meta || action
        ? (
            <div className="studio-section-actions">
              {meta}
              {action}
            </div>
          )
        : null}
    </div>
  )
}

export interface StudioEmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  action?: ReactNode
  detail?: ReactNode
  icon?: ReactNode
  title: ReactNode
}

export function StudioEmptyState({
  action,
  className,
  detail,
  icon,
  title,
  ...props
}: StudioEmptyStateProps) {
  return (
    <div {...props} className={cx('studio-empty-state', className)}>
      {icon ? <span className="studio-empty-icon" aria-hidden="true">{icon}</span> : null}
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
      {action}
    </div>
  )
}

export type StudioPillTone = 'danger' | 'default' | 'muted' | 'success'

export interface StudioPillProps extends HTMLAttributes<HTMLSpanElement> {
  icon?: ReactNode
  tone?: StudioPillTone
}

export function StudioPill({
  children,
  className,
  icon,
  tone = 'default',
  ...props
}: StudioPillProps) {
  return (
    <span {...props} className={cx('studio-pill', `studio-pill-${tone}`, className)}>
      {icon ? <span className="studio-pill-icon" aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  )
}

export interface StudioStatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  active?: boolean
  detail?: ReactNode
  icon?: ReactNode
  tone?: StudioPillTone
}

export function StudioStatusPill({
  active = false,
  children,
  className,
  detail,
  icon,
  tone = 'default',
  ...props
}: StudioStatusPillProps) {
  return (
    <StudioPill {...props} tone={tone} className={cx(active && 'active', className)} icon={icon ?? <span className={cx('status-dot', active && 'active')} />}>
      <span>{children}</span>
      {detail ? <small>{detail}</small> : null}
    </StudioPill>
  )
}

export interface StudioActivityRowProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  as?: 'article' | 'div'
  detail?: ReactNode
  icon?: ReactNode
  meta?: ReactNode
  title: ReactNode
  trailing?: ReactNode
}

export function StudioActivityRow({
  as = 'article',
  children,
  className,
  detail,
  icon,
  meta,
  title,
  trailing,
  ...props
}: StudioActivityRowProps) {
  const Component = as
  return (
    <Component {...props} className={cx('studio-activity-row', className)}>
      {icon ? <span className="studio-activity-icon" aria-hidden="true">{icon}</span> : null}
      <div className="studio-activity-main">
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
        {children}
      </div>
      {meta ? <small>{meta}</small> : null}
      {trailing}
    </Component>
  )
}
