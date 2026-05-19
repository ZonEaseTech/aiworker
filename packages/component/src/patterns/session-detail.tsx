import type { ReactNode } from 'react'

import { cx } from '../utils/cx'

export interface SessionDetailPanelProps {
  artifact?: ReactNode
  className?: string
  composer?: ReactNode
  eventStream?: ReactNode
  history?: ReactNode
  memory?: ReactNode
  review?: ReactNode
  summary?: ReactNode
}

export function SessionDetailPanel({
  artifact,
  className,
  composer,
  eventStream,
  history,
  memory,
  review,
  summary,
}: SessionDetailPanelProps) {
  return (
    <div className={cx('session-detail-panel', className)}>
      {summary ? <section className="session-detail-section">{summary}</section> : null}
      {composer ? <section className="session-detail-section">{composer}</section> : null}
      {artifact ? <section className="session-detail-section">{artifact}</section> : null}
      {history ? <section className="session-detail-section">{history}</section> : null}
      {review ? <section className="session-detail-section">{review}</section> : null}
      {memory ? <section className="session-detail-section">{memory}</section> : null}
      {eventStream ? <section className="session-detail-section">{eventStream}</section> : null}
    </div>
  )
}
