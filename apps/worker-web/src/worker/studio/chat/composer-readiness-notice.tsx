import type { messagesFor } from '../../../features/i18n'
import type { ComposerReadiness } from './composer-readiness'

import { Button } from '@zonease/aiworker-ui/components/button'
import { composerReadinessMessage } from './composer-readiness'

type WorkerMessages = ReturnType<typeof messagesFor>

export interface ComposerReadinessNoticeProps {
  copy: WorkerMessages
  onOpenSettings: () => void
  readiness: ComposerReadiness
}

/**
 * Employee-facing readiness guidance shown above the composer when the selected
 * engine/BYOK is not yet ready to run. It renders the already-translated reason
 * plus the generic engine posture disclosure and a one-click "open settings"
 * action, so a non-technical employee is guided instead of submitting into a
 * developer-facing runtime error.
 */
export function ComposerReadinessNotice({ copy, onOpenSettings, readiness }: ComposerReadinessNoticeProps) {
  if (readiness.ready || !readiness.reason)
    return null

  return (
    <div
      data-chat-slot="composer-readiness"
      className="grid gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-sm"
    >
      <p className="text-foreground">{composerReadinessMessage(readiness.reason, copy)}</p>
      <p className="text-xs/relaxed text-muted-foreground">{copy.workspace.enginePosture}</p>
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-chat-slot="composer-readiness-action"
          onClick={onOpenSettings}
        >
          {copy.workspace.composerReadyAction}
        </Button>
      </div>
    </div>
  )
}
