import type { SessionProgressSummary } from './session-progress'

import { ProgressCard } from '@zonease/aiworker-component'

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
    <ProgressCard
      className={className}
      compact={compact}
      detail={progress.detail}
      label={progress.label}
      live={progress.live}
      stage={progress.stage}
      title={progress.title}
      tone={progress.tone}
    />
  )
}
