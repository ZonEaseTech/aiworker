import type {
  ManagedSessionComposerAttachmentLabels,
  ManagedSessionComposerDraft,
} from '@zonease/aiworker-ui/components/managed-session-composer'
import type { ReactNode } from 'react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ManagedSessionComposer } from '@zonease/aiworker-ui/components/managed-session-composer'

export type SessionComposerDockStatus = 'cancelled' | 'completed' | 'failed' | 'idle' | 'running' | 'submitting'

export interface SessionComposerDockLabels {
  ariaLabel: string
  attachment: ManagedSessionComposerAttachmentLabels
  placeholder?: string
  stop: string
  stopAriaLabel: string
  submitAriaLabel: string
}

export interface SessionComposerDockProps {
  className?: string
  disabled?: boolean
  disabledReason?: ReactNode
  focusRequestToken?: number
  labels: SessionComposerDockLabels
  onCancel?: () => Promise<void> | void
  onSubmitDraft: (draft: ManagedSessionComposerDraft) => Promise<void> | void
  status?: SessionComposerDockStatus
}

export function SessionComposerDock({
  className,
  disabled = false,
  disabledReason,
  focusRequestToken,
  labels,
  onCancel,
  onSubmitDraft,
  status = 'idle',
}: SessionComposerDockProps) {
  const running = status === 'running'

  return (
    <div data-session-composer-dock="true" className={className}>
      <ManagedSessionComposer
        ariaLabel={labels.ariaLabel}
        attachmentLabels={labels.attachment}
        disabled={disabled}
        disabledReason={disabledReason}
        focusRequestToken={focusRequestToken}
        placeholder={labels.placeholder}
        statusAction={running
          ? {
              ariaLabel: labels.stopAriaLabel,
              icon: <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} aria-hidden="true" />,
              id: 'stop-invocation',
              label: labels.stop,
              onClick: () => {
                void onCancel?.()
              },
              title: labels.stopAriaLabel,
            }
          : undefined}
        submitAriaLabel={labels.submitAriaLabel}
        submitDisabled={running || disabled}
        submitting={status === 'submitting'}
        onSubmitDraft={onSubmitDraft}
      />
    </div>
  )
}
