import type { SessionComposerAttachmentItem, SessionComposerOption } from '@zonease/aiworker-ui/components/session-composer'
import type { FormEvent } from 'react'

import type { HrWorkbenchCopy } from './copy'

import { formatSessionAttachmentKind, formatSessionAttachmentSize, isSessionAttachmentImage, SessionComposer } from '@zonease/aiworker-ui/components/session-composer'
import { useEffect, useMemo, useRef, useState } from 'react'

export interface HrProfileComposerAttachment {
  file?: File
  id: string
  mimeType: string
  name: string
  previewUrl?: string
  size: number
}

interface HrProfileComposerAttachmentItemLabels {
  closePreviewLabel: string
  previewLabel: string
  removeLabel: string
}

export interface HrProfileDraftOption {
  label: string
  outputKind: string
  templateId: string
}

export interface HrProfileComposerSubmitInput {
  attachments: HrProfileComposerAttachment[]
  context: string
  draft: HrProfileDraftOption
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachmentsRef = useRef<HrProfileComposerAttachment[]>([])
  const [context, setContext] = useState('')
  const [draftTemplateId, setDraftTemplateId] = useState(DEFAULT_PROFILE_DRAFT.templateId)
  const [attachments, setAttachments] = useState<HrProfileComposerAttachment[]>([])
  const [localError, setLocalError] = useState<string | null>(null)
  const selectedDraft = draftOptions.find(option => option.templateId === draftTemplateId) ?? DEFAULT_PROFILE_DRAFT
  const currentError = errorMessage ?? localError
  const submitDisabled = disabled || submitting || (!context.trim() && attachments.length === 0)
  const templateOptions = useMemo<SessionComposerOption[]>(() => draftOptions.map(option => ({
    description: option.outputKind,
    label: option.label,
    value: option.templateId,
  })), [draftOptions])
  const attachmentItems = useMemo<SessionComposerAttachmentItem[]>(() => attachments.map(attachment => ({
    ...createHrProfileComposerAttachmentItem(attachment, {
      closePreviewLabel: labels.closeCandidateMaterialPreview(attachment.name),
      previewLabel: labels.previewCandidateMaterial(attachment.name),
      removeLabel: labels.removeCandidateMaterial(attachment.name),
    }),
  })), [attachments, labels])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    return () => revokeAttachmentPreviewUrls(attachmentsRef.current)
  }, [])

  function addFiles(fileList: FileList | readonly File[] | null) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0)
      return
    setAttachments(current => [
      ...current,
      ...files.map(file => ({
        file,
        id: attachmentId(file),
        mimeType: file.type || 'application/octet-stream',
        name: file.name,
        previewUrl: createAttachmentPreviewUrl(file),
        size: file.size,
      })),
    ])
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find(attachment => attachment.id === id)
      revokeAttachmentPreviewUrl(removed)
      return current.filter(attachment => attachment.id !== id)
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)
    try {
      await onSubmit({
        attachments,
        context,
        draft: selectedDraft,
      })
      setContext('')
      setAttachments((current) => {
        revokeAttachmentPreviewUrls(current)
        return []
      })
    }
    catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        className="sr-only"
        multiple
        type="file"
        aria-hidden="true"
        aria-label={labels.addCandidateMaterials}
        tabIndex={-1}
        onChange={(event) => {
          addFiles(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
        }}
      />
      <div data-slot="hr-profile-composer" className="h-full min-h-0">
        <SessionComposer
          ariaLabel={labels.contextLabel}
          attachmentCountLabel={labels.attachedCandidateMaterialsLabel}
          attachmentTriggerLabel={labels.openCandidateMaterialPicker}
          attachments={attachmentItems}
          className={className ?? 'min-h-0'}
          description={labels.composerSafetyDetail}
          disabled={disabled}
          disabledReason={profileName ? undefined : labels.selectProfileFirst}
          error={currentError}
          onAddAttachmentFiles={addFiles}
          onAddAttachments={() => fileInputRef.current?.click()}
          onRemoveAttachment={removeAttachment}
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
          onSubmit={handleSubmit}
          onTemplateChange={setDraftTemplateId}
          onValueChange={setContext}
        />
      </div>
    </>
  )
}

export function createHrProfileComposerAttachmentItem(
  attachment: HrProfileComposerAttachment,
  labels: HrProfileComposerAttachmentItemLabels,
): SessionComposerAttachmentItem {
  const image = attachment.file && isSessionAttachmentImage(attachment.file) && attachment.previewUrl

  return {
    id: attachment.id,
    kind: attachment.file ? formatSessionAttachmentKind(attachment.file) : attachment.mimeType,
    closePreviewLabel: labels.closePreviewLabel,
    mediaType: image ? 'image' : 'file',
    name: attachment.name,
    onPreviewLabel: image ? labels.previewLabel : undefined,
    previewAlt: image ? attachment.name : undefined,
    previewTitle: image ? attachment.name : undefined,
    previewUrl: image ? attachment.previewUrl : undefined,
    removeLabel: labels.removeLabel,
    size: formatSessionAttachmentSize(attachment.size),
  }
}

function attachmentId(file: File): string {
  const entropy = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${file.name}-${file.size}-${entropy}`
}

function createAttachmentPreviewUrl(file: File): string | undefined {
  if (!isSessionAttachmentImage(file))
    return undefined
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function')
    return undefined
  return URL.createObjectURL(file)
}

function revokeAttachmentPreviewUrls(attachments: readonly HrProfileComposerAttachment[]) {
  for (const attachment of attachments)
    revokeAttachmentPreviewUrl(attachment)
}

function revokeAttachmentPreviewUrl(attachment?: HrProfileComposerAttachment) {
  if (!attachment?.previewUrl)
    return
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function')
    return
  URL.revokeObjectURL(attachment.previewUrl)
}
