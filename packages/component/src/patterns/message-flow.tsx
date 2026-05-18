import type { HTMLAttributes, ReactNode } from 'react'

import { cx } from '../utils/cx'

export type MessageFlowTone = 'danger' | 'info' | 'muted' | 'success' | 'warning'

export function MessageFlow({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cx('message-flow', className)}>
      {children}
    </div>
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
    <article {...props} className={cx('message-row', `message-row-${tone}`, className)}>
      <div className="message-row-role">
        <span>{roleLabel}</span>
        {timestamp ? <time>{timestamp}</time> : null}
      </div>
      <div className="message-row-body">{children}</div>
    </article>
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
    <section {...props} className={cx('tool-result-card', `tool-result-card-${tone}`, className)}>
      {command ? <code>{command}</code> : null}
      <pre>{result}</pre>
    </section>
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
    <span {...props} className={cx('status-event-pill', `status-event-pill-${tone}`, className)}>
      <span>{children}</span>
      {detail ? <small>{detail}</small> : null}
    </span>
  )
}
