import type { LocalEngineInvocation, LocalSession } from '@zonease/aiworker-soul-descriptor'
import type { ManagedSessionComposerAttachmentLabels } from '@zonease/aiworker-ui/components/managed-session-composer'
import type { SessionComposerDockStatus } from './session-composer-dock'

import { submitSessionInvocation } from '../../../features/local-workspace/api/session-invocations'
import { SessionComposerDock } from './session-composer-dock'
import { sessionDraftToDisplayText, sessionDraftToInvocationInput } from './session-draft-input'

export interface ChatComposerLabels {
  ariaLabel: string
  attachment: ManagedSessionComposerAttachmentLabels
  submitAriaLabel: string
  placeholder?: string
}

export interface ChatComposerProps {
  focusRequestToken?: number
  labels: ChatComposerLabels
  onCancel?: () => Promise<void> | void
  onSubmitted?: (submission: { invocationId: string, session: LocalSession, status: LocalEngineInvocation['status'], text: string }) => void
  sessionId: string
  status?: SessionComposerDockStatus
}

/**
 * Composer side of a chat surface: submits the composed message as a
 * session-level follow-up invocation and reports the new invocation id so the
 * surface can point its transcript at it. Labels are injected by the caller,
 * keeping this component free of any locale dependency and trivially testable.
 *
 * The Worker renders the session chat directly: this composer is mounted by
 * worker-studio on the session route. The Soul provides no UI.
 */
export function ChatComposer({
  focusRequestToken,
  labels,
  onCancel,
  onSubmitted,
  sessionId,
  status = 'idle',
}: ChatComposerProps) {
  return (
    <SessionComposerDock
      focusRequestToken={focusRequestToken}
      labels={labels}
      onCancel={onCancel}
      onSubmitDraft={async (draft) => {
        const input = sessionDraftToInvocationInput(draft)
        if (input.length === 0)
          return
        const result = await submitSessionInvocation(sessionId, { input, waitForCompletion: false })
        onSubmitted?.({
          invocationId: result.invocation.id,
          session: result.session,
          status: result.invocation.status,
          text: sessionDraftToDisplayText(draft),
        })
      }}
      status={status}
    />
  )
}
