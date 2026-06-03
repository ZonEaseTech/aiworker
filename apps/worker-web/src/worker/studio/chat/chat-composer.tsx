import type { ManagedSessionComposerAttachmentLabels } from '@zonease/aiworker-ui/components/managed-session-composer'

import { ManagedSessionComposer } from '@zonease/aiworker-ui/components/managed-session-composer'

import { submitSessionInvocation } from '../../../features/local-workspace/api/session-invocations'

export interface ChatComposerLabels {
  ariaLabel: string
  attachment: ManagedSessionComposerAttachmentLabels
  submitAriaLabel: string
  placeholder?: string
}

export interface ChatComposerProps {
  labels: ChatComposerLabels
  onSubmitted?: (submission: { invocationId: string, text: string }) => void
  sessionId: string
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
export function ChatComposer({ labels, onSubmitted, sessionId }: ChatComposerProps) {
  return (
    <ManagedSessionComposer
      ariaLabel={labels.ariaLabel}
      attachmentLabels={labels.attachment}
      placeholder={labels.placeholder}
      submitAriaLabel={labels.submitAriaLabel}
      onSubmitDraft={async (draft) => {
        const trimmed = draft.text.trim()
        if (trimmed.length === 0)
          return
        const result = await submitSessionInvocation(sessionId, { input: trimmed })
        onSubmitted?.({ invocationId: result.invocation.id, text: trimmed })
      }}
    />
  )
}
