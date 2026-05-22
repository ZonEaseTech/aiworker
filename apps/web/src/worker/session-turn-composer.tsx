import type { SessionComposerMaterial, SessionComposerUsage } from '@zonease/aiworker-ui/components/session-composer'
import type { FormEvent } from 'react'
import type { messagesFor } from '../features/i18n'
import type { EngineReadiness } from '../features/session/engine-readiness'

import { MailSend02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createComposerAttachment, formatSessionAttachmentKind, formatSessionAttachmentSize, isSessionAttachmentImage, SessionComposer } from '@zonease/aiworker-ui/components/session-composer'
import { useEffect, useMemo, useRef, useState } from 'react'

type WorkerMessages = ReturnType<typeof messagesFor>

interface SessionTurnAttachment {
  file: File
  id: string
  previewUrl?: string
}

export interface SessionTurnDraft {
  input: string
  materialCopy?: {
    binaryTitle?: string
    heading: string
    instruction: string
  }
  materials?: SessionComposerMaterial[]
}

export interface SessionTurnComposerProps {
  className?: string
  copy: WorkerMessages
  description?: string
  engineReadiness: EngineReadiness
  onSubmit: (event: FormEvent<HTMLFormElement>, draft?: SessionTurnDraft) => Promise<void> | void
  onValueChange: (value: string) => void
  submitting: boolean
  title?: string
  usage?: SessionComposerUsage
  value: string
  variant?: 'compact' | 'large' | 'panel'
}

export function SessionTurnComposer({
  className,
  copy,
  description,
  engineReadiness,
  onSubmit,
  onValueChange,
  submitting,
  title,
  usage,
  value,
  variant = 'compact',
}: SessionTurnComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const attachmentsRef = useRef<SessionTurnAttachment[]>([])
  const [attachments, setAttachments] = useState<SessionTurnAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    return () => clearAttachmentPreviews(attachmentsRef.current)
  }, [])

  const attachmentItems = useMemo(() => attachments.map(attachment => ({
    id: attachment.id,
    kind: formatSessionAttachmentKind(attachment.file),
    closePreviewLabel: copy.workspace.closeSourceMaterialPreview,
    mediaType: attachment.previewUrl ? 'image' as const : 'file' as const,
    name: attachment.file.name,
    onPreviewLabel: copy.workspace.previewSourceMaterial(attachment.file.name),
    previewAlt: attachment.file.name,
    previewTitle: attachment.file.name,
    previewUrl: attachment.previewUrl,
    removeLabel: copy.workspace.removeSourceMaterial(attachment.file.name),
    size: formatSessionAttachmentSize(attachment.file.size),
  })), [attachments, copy])

  function addAttachmentFiles(files: FileList | File[] | null) {
    const selectedFiles = Array.from(files ?? [])
    if (selectedFiles.length === 0)
      return
    setAttachmentError(null)
    setAttachments((current) => {
      const seen = new Set(current.map(attachment => attachmentFileKey(attachment.file)))
      const nextFiles = selectedFiles.filter((file) => {
        const key = attachmentFileKey(file)
        if (seen.has(key))
          return false
        seen.add(key)
        return true
      })
      if (nextFiles.length === 0)
        return current
      return [
        ...current,
        ...nextFiles.map((file, index) => ({
          file,
          id: `${file.name}-${file.size}-${file.type}-${current.length + index}`,
          previewUrl: isSessionAttachmentImage(file) ? URL.createObjectURL(file) : undefined,
        })),
      ]
    })
    if (fileInputRef.current)
      fileInputRef.current.value = ''
  }

  function openFilePicker() {
    const input = fileInputRef.current
    if (!input)
      return
    input.value = ''
    input.click()
  }

  function removeAttachment(id: string) {
    setAttachments(current => current.filter((attachment) => {
      if (attachment.id === id && attachment.previewUrl)
        URL.revokeObjectURL(attachment.previewUrl)
      return attachment.id !== id
    }))
  }

  function clearAttachments() {
    setAttachments((current) => {
      clearAttachmentPreviews(current)
      return []
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!engineReadiness.ready || (!value.trim() && attachments.length === 0))
      return
    try {
      setAttachmentError(null)
      const materials = await Promise.all(attachments.map(attachment => createComposerAttachment(attachment.file)))
      const submitResult = onSubmit(event, {
        input: value,
        materialCopy: {
          binaryTitle: 'Uploaded Source Material',
          heading: 'Attached source material:',
          instruction: 'Use these workspace file paths as source material before continuing the session.',
        },
        materials,
      })
      clearAttachments()
      await submitResult
    }
    catch {
      setAttachmentError(copy.workspace.materialReadError)
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        multiple
        aria-hidden="true"
        tabIndex={-1}
        onChange={event => addAttachmentFiles(event.currentTarget.files)}
      />
      <SessionComposer
        ariaLabel={copy.workspace.followUpInput}
        attachmentCountLabel={copy.workspace.attachedSourceMaterials}
        attachmentTriggerLabel={copy.workspace.addSourceMaterials}
        attachments={attachmentItems}
        className={className}
        description={description}
        disabled={!engineReadiness.ready}
        disabledReason={engineReadiness.ready ? undefined : engineReadiness.detail}
        error={attachmentError}
        onAddAttachmentFiles={addAttachmentFiles}
        onAddAttachments={openFilePicker}
        onRemoveAttachment={removeAttachment}
        placeholder={copy.workspace.followUpPlaceholder}
        submitAriaLabel={submitting ? copy.workspace.sendingTurn : copy.workspace.sendTurn}
        submitDisabled={!engineReadiness.ready}
        submitIcon={<HugeiconsIcon icon={MailSend02Icon} strokeWidth={2} aria-hidden="true" />}
        submitting={submitting}
        submitTitle={submitting ? copy.workspace.sendingTurn : copy.workspace.sendTurn}
        title={title}
        usage={usage}
        value={value}
        variant={variant}
        onSubmit={handleSubmit}
        onValueChange={onValueChange}
      />
    </>
  )
}

function clearAttachmentPreviews(attachments: SessionTurnAttachment[]) {
  for (const attachment of attachments) {
    if (attachment.previewUrl)
      URL.revokeObjectURL(attachment.previewUrl)
  }
}

function attachmentFileKey(file: Pick<File, 'name' | 'size' | 'type'>): string {
  return `${file.name}:${file.size}:${file.type}`
}
