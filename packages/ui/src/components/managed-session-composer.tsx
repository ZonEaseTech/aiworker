import type { ChangeEvent, FormEvent, ReactNode } from 'react'

import {
  createComposerAttachment,
  formatSessionAttachmentKind,
  formatSessionAttachmentSize,
  isSessionAttachmentImage,
  SessionComposer,
} from './session-composer'
import type {
  SessionComposerAttachmentItem,
  SessionComposerMaterial,
  SessionComposerMentionOption,
  SessionComposerMentionQuery,
  SessionComposerProps,
} from './session-composer'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type ManagedSessionComposerOwnedProps =
  | 'attachmentCountLabel'
  | 'attachmentTriggerLabel'
  | 'attachments'
  | 'error'
  | 'onAddAttachmentFiles'
  | 'onAddAttachments'
  | 'onMentionDismiss'
  | 'onMentionSelect'
  | 'onRemoveAttachment'
  | 'onSubmit'
  | 'onValueChange'
  | 'value'

export interface ManagedSessionComposerDraft {
  text: string
  files: File[]
  materials: SessionComposerMaterial[]
  selectedTemplateId?: string
  mentions: Array<{ id: string, kind: 'skill', label: string }>
}

export interface ManagedSessionComposerAttachmentLabels {
  add: string
  attached: string
  closePreview: (name: string) => string
  materialReadError: string
  preview: (name: string) => string
  remove: (name: string) => string
}

export interface ManagedSessionComposerProps
  extends Omit<SessionComposerProps, ManagedSessionComposerOwnedProps> {
  attachmentLabels: ManagedSessionComposerAttachmentLabels
  defaultValue?: string
  onSubmitDraft: (draft: ManagedSessionComposerDraft, event: FormEvent<HTMLFormElement>) => Promise<void> | void
  onValueChange?: (value: string) => void
  value?: string
}

export interface ManagedSessionComposerAttachment {
  file: File
  id: string
  previewUrl?: string
}

export interface UseSessionComposerDraftOptions {
  defaultValue?: string
  onValueChange?: (value: string) => void
  value?: string
}

export interface UseSessionComposerDraftResult {
  addFiles: (files: File[]) => void
  attachments: ManagedSessionComposerAttachment[]
  clear: () => void
  files: File[]
  removeAttachment: (id: string) => void
  setText: (value: string) => void
  text: string
}

const TRAILING_MENTION_PATTERN = /(^|\s)\$([\w-]*)$/

export function useSessionComposerDraft({
  defaultValue = '',
  onValueChange,
  value,
}: UseSessionComposerDraftOptions = {}): UseSessionComposerDraftResult {
  const isControlled = value !== undefined
  const [localText, setLocalText] = useState(defaultValue)
  const [attachments, setAttachmentsState] = useState<ManagedSessionComposerAttachment[]>([])
  const attachmentsRef = useRef<ManagedSessionComposerAttachment[]>([])
  const text = isControlled ? value : localText

  const setAttachments = useCallback((nextAttachments: ManagedSessionComposerAttachment[]) => {
    attachmentsRef.current = nextAttachments
    setAttachmentsState(nextAttachments)
  }, [])

  const setText = useCallback((nextValue: string) => {
    if (!isControlled)
      setLocalText(nextValue)
    onValueChange?.(nextValue)
  }, [isControlled, onValueChange])

  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0)
      return

    const nextAttachments = [...attachmentsRef.current]
    const existingKeys = new Set(nextAttachments.map(attachment => attachment.id))

    for (const file of files) {
      const id = getManagedAttachmentKey(file)
      if (existingKeys.has(id))
        continue
      existingKeys.add(id)
      nextAttachments.push({
        file,
        id,
        previewUrl: createManagedPreviewUrl(file),
      })
    }

    setAttachments(nextAttachments)
  }, [setAttachments])

  const removeAttachment = useCallback((id: string) => {
    const currentAttachments = attachmentsRef.current
    const attachment = currentAttachments.find(item => item.id === id)
    if (attachment)
      releaseManagedPreviewUrl(attachment)
    setAttachments(currentAttachments.filter(item => item.id !== id))
  }, [setAttachments])

  const clear = useCallback(() => {
    releaseManagedPreviewUrls(attachmentsRef.current)
    setAttachments([])
    setText('')
  }, [setAttachments, setText])

  useEffect(() => {
    return () => releaseManagedPreviewUrls(attachmentsRef.current)
  }, [])

  return {
    addFiles,
    attachments,
    clear,
    files: attachments.map(attachment => attachment.file),
    removeAttachment,
    setText,
    text,
  }
}

export function ManagedSessionComposer({
  allowSubmitWithoutText = false,
  ariaLabel,
  attachmentLabels,
  defaultValue,
  disabled = false,
  mentionOptions = [],
  mentionQuery,
  onSubmitDraft,
  onValueChange,
  selectedTemplateId,
  submitDisabled = false,
  submitting = false,
  value,
  ...props
}: ManagedSessionComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const localSubmittingRef = useRef(false)
  const [localSubmitting, setLocalSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<ReactNode>(null)
  const draft = useSessionComposerDraft({ defaultValue, onValueChange, value })
  const composerSubmitting = submitting || localSubmitting
  const attachmentInputDisabled = disabled || composerSubmitting
  const resolvedMentionQuery = mentionQuery ?? deriveSessionMentionQuery(draft.text)
  const composerAttachments = useMemo(
    () => draft.attachments.map(attachment => toSessionComposerAttachmentItem(attachment, attachmentLabels)),
    [attachmentLabels, draft.attachments],
  )

  const addManagedFiles = useCallback((files: File[]) => {
    if (attachmentInputDisabled)
      return
    draft.addFiles(files)
  }, [attachmentInputDisabled, draft])

  const handleAddAttachments = useCallback(() => {
    if (attachmentInputDisabled)
      return
    fileInputRef.current?.click()
  }, [attachmentInputDisabled])

  const handleFileInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    addManagedFiles(Array.from(event.currentTarget.files ?? []))
    event.currentTarget.value = ''
  }, [addManagedFiles])

  const handleMentionSelect = useCallback((option: SessionComposerMentionOption) => {
    draft.setText(insertSessionMention(draft.text, option.id))
  }, [draft])

  const handleMentionDismiss = useCallback(() => {
    draft.setText(removeTrailingSessionMention(draft.text))
  }, [draft])

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const hasDraftContent = draft.text.trim().length > 0 || draft.files.length > 0
    if (disabled || submitDisabled || submitting || localSubmittingRef.current || (!allowSubmitWithoutText && !hasDraftContent))
      return

    localSubmittingRef.current = true
    setLocalSubmitting(true)
    setSubmitError(null)

    try {
      const materials = await Promise.all(draft.files.map(file => createComposerAttachment(file)))
      await onSubmitDraft({
        text: draft.text,
        files: draft.files,
        materials,
        selectedTemplateId,
        mentions: resolveSessionMentions(draft.text, mentionOptions),
      }, event)
      draft.clear()
    }
    catch (error) {
      setSubmitError(error instanceof Error ? error.message : attachmentLabels.materialReadError)
    }
    finally {
      localSubmittingRef.current = false
      setLocalSubmitting(false)
    }
  }, [
    allowSubmitWithoutText,
    attachmentLabels.materialReadError,
    disabled,
    draft,
    mentionOptions,
    onSubmitDraft,
    selectedTemplateId,
    submitDisabled,
    submitting,
  ])

  return (
    <>
      <input
        ref={fileInputRef}
        aria-label={attachmentLabels.add}
        className="sr-only"
        data-testid="managed-session-file-input"
        disabled={attachmentInputDisabled}
        multiple
        tabIndex={-1}
        type="file"
        onChange={handleFileInputChange}
      />
      <SessionComposer
        {...props}
        allowSubmitWithoutText={allowSubmitWithoutText}
        ariaLabel={ariaLabel}
        attachmentCountLabel={attachmentLabels.attached}
        attachmentTriggerLabel={attachmentLabels.add}
        attachments={composerAttachments}
        disabled={disabled}
        error={submitError}
        mentionOptions={mentionOptions}
        mentionQuery={resolvedMentionQuery}
        onAddAttachmentFiles={addManagedFiles}
        onAddAttachments={handleAddAttachments}
        onMentionDismiss={handleMentionDismiss}
        onMentionSelect={handleMentionSelect}
        onRemoveAttachment={draft.removeAttachment}
        onSubmit={handleSubmit}
        onValueChange={draft.setText}
        selectedTemplateId={selectedTemplateId}
        submitDisabled={submitDisabled}
        submitting={composerSubmitting}
        value={draft.text}
      />
    </>
  )
}

function toSessionComposerAttachmentItem(
  attachment: ManagedSessionComposerAttachment,
  labels: ManagedSessionComposerAttachmentLabels,
): SessionComposerAttachmentItem {
  const { file, id, previewUrl } = attachment
  const isImage = Boolean(previewUrl)

  return {
    id,
    kind: formatSessionAttachmentKind(file),
    closePreviewLabel: labels.closePreview(file.name),
    mediaType: isImage ? 'image' : 'file',
    name: file.name,
    onPreviewLabel: isImage ? labels.preview(file.name) : undefined,
    previewAlt: isImage ? file.name : undefined,
    previewTitle: isImage ? labels.preview(file.name) : undefined,
    previewUrl,
    removeLabel: labels.remove(file.name),
    size: formatSessionAttachmentSize(file.size),
  }
}

function deriveSessionMentionQuery(text: string): SessionComposerMentionQuery | undefined {
  const match = text.match(TRAILING_MENTION_PATTERN)
  if (!match)
    return undefined
  return { active: true, query: match[2] ?? '', trigger: '$' }
}

function insertSessionMention(text: string, id: string): string {
  const match = text.match(TRAILING_MENTION_PATTERN)
  if (!match)
    return `${text}${text.length > 0 && !/\s$/.test(text) ? ' ' : ''}$${id} `
  return `${text.slice(0, match.index)}${match[1]}$${id} `
}

function removeTrailingSessionMention(text: string): string {
  return text.replace(TRAILING_MENTION_PATTERN, '').trimEnd()
}

function resolveSessionMentions(
  text: string,
  mentionOptions: SessionComposerMentionOption[],
): ManagedSessionComposerDraft['mentions'] {
  const optionsById = new Map(mentionOptions.map(option => [option.id, option]))
  const mentions: ManagedSessionComposerDraft['mentions'] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(/\$([\w-]+)/g)) {
    const id = match[1]
    if (!id || seen.has(id) || !optionsById.has(id))
      continue
    seen.add(id)
    const option = optionsById.get(id)
    mentions.push({
      id,
      kind: 'skill',
      label: typeof option?.label === 'string' ? option.label : id,
    })
  }

  return mentions
}

function getManagedAttachmentKey(file: File): string {
  return `${file.name}:${file.size}:${file.type}`
}

function createManagedPreviewUrl(file: File): string | undefined {
  if (!isSessionAttachmentImage(file) || typeof URL.createObjectURL !== 'function')
    return undefined
  return URL.createObjectURL(file)
}

function releaseManagedPreviewUrls(attachments: ManagedSessionComposerAttachment[]) {
  for (const attachment of attachments)
    releaseManagedPreviewUrl(attachment)
}

function releaseManagedPreviewUrl(attachment: ManagedSessionComposerAttachment) {
  if (!attachment.previewUrl || typeof URL.revokeObjectURL !== 'function')
    return
  URL.revokeObjectURL(attachment.previewUrl)
}
