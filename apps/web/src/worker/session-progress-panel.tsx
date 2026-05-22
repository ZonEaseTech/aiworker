import type { SessionProgressSummary } from './session-progress'

import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Card } from '@zonease/aiworker-ui/components/card'
import { ItemActions, ItemDescription, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { Progress } from '@zonease/aiworker-ui/components/progress'

export function SessionProgressPanel({
  className = '',
  compact = false,
  progress,
}: {
  className?: string
  compact?: boolean
  progress: SessionProgressSummary
}) {
  const progressValue = progressValueForTone(progress.tone)
  return (
    <Card
      aria-live={progress.live ? 'polite' : undefined}
      className={[
        'min-w-0 gap-2 px-3 py-3',
        compact ? 'gap-1.5 px-2.5 py-2.5' : '',
        className,
      ].filter(Boolean).join(' ')}
      data-testid="session-progress-panel"
      data-stage={progress.stage}
      data-tone={progress.tone}
      size="sm"
    >
      <ItemActions className="min-w-0 gap-2">
        <Badge variant={badgeVariantForTone(progress.tone)} className="max-w-full">
          {progress.label}
        </Badge>
      </ItemActions>
      {progress.title ? <ItemTitle className="max-w-full">{progress.title}</ItemTitle> : null}
      <Progress value={progressValue} aria-label={typeof progress.label === 'string' ? progress.label : undefined} />
      {progress.detail ? <ItemDescription className="line-clamp-none">{progress.detail}</ItemDescription> : null}
    </Card>
  )
}

function badgeVariantForTone(tone: SessionProgressSummary['tone']): 'default' | 'destructive' | 'outline' | 'secondary' {
  if (tone === 'risk')
    return 'destructive'
  if (tone === 'muted')
    return 'outline'
  return 'default'
}

function progressValueForTone(tone: SessionProgressSummary['tone']): number {
  if (tone === 'risk')
    return 100
  if (tone === 'working')
    return 45
  return 20
}
