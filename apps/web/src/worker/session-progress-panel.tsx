import type { SessionProgressSummary } from './session-progress'

export function SessionProgressPanel({
  className = '',
  compact = false,
  progress,
}: {
  className?: string
  compact?: boolean
  progress: SessionProgressSummary
}) {
  return (
    <section
      aria-live={progress.live ? 'polite' : undefined}
      className={`session-progress-card ${compact ? 'compact' : ''} ${className}`.trim()}
      data-stage={progress.stage}
      data-tone={progress.tone}
    >
      <div className="session-progress-head">
        <span className="session-progress-dot" aria-hidden="true" />
        <span className="session-progress-label">{progress.label}</span>
      </div>
      <strong>{progress.title}</strong>
      <span className="session-progress-detail">{progress.detail}</span>
    </section>
  )
}
