import type { ManagedSessionComposerDraft, SessionComposerOption } from '@zonease/aiworker-ui/components/session-composer'
import type { HrWorkbenchCopy } from './copy'

import { ManagedSessionComposer } from '@zonease/aiworker-ui/components/session-composer'
import { useMemo, useState } from 'react'

export interface HrProfileDraftOption {
  label: string
  outputKind: string
  templateId: string
}

export interface HrProfileComposerSubmitInput {
  attachments: Array<{
    file: File
    mimeType: string
    name: string
    size: number
  }>
  context: string
  draft: HrProfileDraftOption
  materials: ManagedSessionComposerDraft['materials']
}

export const DEFAULT_PROFILE_DRAFT: HrProfileDraftOption = {
  label: '候选人档案草案',
  outputKind: 'profile-update-draft',
  templateId: 'profile-update-draft',
}

const DEFAULT_DRAFT_OPTIONS: HrProfileDraftOption[] = [
  DEFAULT_PROFILE_DRAFT,
  {
    label: '证据整理',
    outputKind: 'candidate-screen',
    templateId: 'candidate-screen',
  },
  {
    label: '面试提纲',
    outputKind: 'interview-brief',
    templateId: 'interview-brief',
  },
  {
    label: '风险检查',
    outputKind: 'hiring-risk',
    templateId: 'hiring-risk',
  },
]

export interface HrProfileComposerProps {
  className?: string
  disabled?: boolean
  errorMessage?: string | null
  labels: HrWorkbenchCopy
  onSubmit: (input: HrProfileComposerSubmitInput) => Promise<void> | void
  profileName?: string
  draftOptions?: HrProfileDraftOption[]
  submitting?: boolean
}

export function HrProfileComposer({
  className,
  disabled = false,
  errorMessage = null,
  labels,
  onSubmit,
  profileName,
  draftOptions = DEFAULT_DRAFT_OPTIONS,
  submitting = false,
}: HrProfileComposerProps) {
  const [context, setContext] = useState('')
  const [draftTemplateId, setDraftTemplateId] = useState(DEFAULT_PROFILE_DRAFT.templateId)
  const [localError, setLocalError] = useState<string | null>(null)
  const selectedDraft = draftOptions.find(option => option.templateId === draftTemplateId) ?? DEFAULT_PROFILE_DRAFT
  const submitDisabled = disabled || submitting || !profileName
  const templateOptions = useMemo<SessionComposerOption[]>(() => draftOptions.map(option => ({
    description: option.outputKind,
    label: option.label,
    value: option.templateId,
  })), [draftOptions])

  async function handleSubmitDraft(draft: ManagedSessionComposerDraft) {
    setLocalError(null)
    try {
      await onSubmit({
        attachments: draft.files.map(file => ({
          file,
          mimeType: file.type || 'application/octet-stream',
          name: file.name,
          size: file.size,
        })),
        context: draft.text,
        draft: selectedDraft,
        materials: draft.materials,
      })
      setContext('')
    }
    catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  return (
    <div data-slot="hr-profile-composer" className="h-full min-h-0">
      <ManagedSessionComposer
        ariaLabel={labels.contextLabel}
        attachmentLabels={{
          add: labels.openCandidateMaterialPicker,
          attached: labels.attachedCandidateMaterialsLabel,
          closePreview: labels.closeCandidateMaterialPreview,
          materialReadError: labels.materialReadError,
          preview: labels.previewCandidateMaterial,
          remove: labels.removeCandidateMaterial,
        }}
        className={className ?? 'min-h-0'}
        description={labels.composerSafetyDetail}
        disabled={disabled || !profileName}
        disabledReason={profileName ? undefined : labels.selectProfileFirst}
        error={errorMessage ?? localError}
        placeholder={profileName ? labels.contextPlaceholder : labels.selectProfileFirst}
        selectedTemplateId={draftTemplateId}
        submitAriaLabel={submitting ? labels.generatingProfileDraft : labels.generateProfileDraft}
        submitDisabled={submitDisabled}
        submitting={submitting}
        submitTitle={submitting ? labels.generatingProfileDraft : labels.generateProfileDraft}
        templateLabel={labels.draftTypeSelectLabel}
        templateOptions={templateOptions}
        title={selectedDraft.label}
        value={context}
        variant="panel"
        onSubmitDraft={handleSubmitDraft}
        onTemplateChange={setDraftTemplateId}
        onValueChange={setContext}
      />
    </div>
  )
}
