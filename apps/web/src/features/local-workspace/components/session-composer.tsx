import type { SessionComposerMaterial } from '@zonease/aiworker-component'
import type { CapabilityTemplate, LocalWorkspace } from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { messagesFor, normalizeLocale } from '../../i18n'

import { createComposerAttachment, formatSessionAttachmentKind, formatSessionAttachmentSize, isSessionAttachmentImage, SessionComposer } from '@zonease/aiworker-component'
import { useEffect, useRef, useState } from 'react'
import { displayTemplate } from '../../i18n'

type WorkerMessages = ReturnType<typeof messagesFor>

interface WorkspaceComposerAttachment {
  file: File
  id: string
  previewUrl?: string
}

interface WorkspaceSessionDraft {
  context?: string
  materialCopy?: {
    binaryTitle?: string
    heading: string
    instruction: string
  }
  materials?: SessionComposerMaterial[]
}

export function WorkspaceSessionComposer({
  copy,
  engineReadiness,
  locale,
  onContextChange,
  onSubmit,
  onTemplateChange,
  selectedTemplate,
  submitting,
  templates,
  value,
  workspace,
}: {
  copy: WorkerMessages
  engineReadiness: { detail: string, ready: boolean }
  locale: ReturnType<typeof normalizeLocale>
  onContextChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>, draft?: WorkspaceSessionDraft) => Promise<void> | void
  onTemplateChange: (value: string) => void
  selectedTemplate: CapabilityTemplate
  submitting: boolean
  templates: CapabilityTemplate[]
  value: string
  workspace: LocalWorkspace
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const attachmentsRef = useRef<WorkspaceComposerAttachment[]>([])
  const [attachments, setAttachments] = useState<WorkspaceComposerAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const selectedTemplateCopy = displayTemplate(selectedTemplate, locale)

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    return () => {
      for (const attachment of attachmentsRef.current) {
        if (attachment.previewUrl)
          URL.revokeObjectURL(attachment.previewUrl)
      }
    }
  }, [])

  function handleFilesSelected(files: FileList | null) {
    if (!files?.length)
      return
    setAttachmentError(null)
    setAttachments(current => [
      ...current,
      ...Array.from(files).map((file, index) => ({
        file,
        id: `${file.name}-${file.size}-${file.lastModified}-${current.length + index}`,
        previewUrl: isSessionAttachmentImage(file) ? URL.createObjectURL(file) : undefined,
      })),
    ])
    if (fileInputRef.current)
      fileInputRef.current.value = ''
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
      for (const attachment of current) {
        if (attachment.previewUrl)
          URL.revokeObjectURL(attachment.previewUrl)
      }
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
      await onSubmit(event, {
        context: value,
        materialCopy: {
          binaryTitle: 'Uploaded Source Material',
          heading: 'Attached source material:',
          instruction: 'Use these workspace file paths as source material before producing the requested output.',
        },
        materials,
      })
      clearAttachments()
    }
    catch {
      setAttachmentError(copy.workspace.materialReadError)
    }
  }

  return (
    <section className="workspace-session-composer" data-testid="new-session-panel">
      <h2 className="workspace-composer-title">{copy.workspace.createSessionPrompt(workspace.name)}</h2>
      <input
        ref={fileInputRef}
        className="workspace-material-file-input"
        type="file"
        multiple
        aria-hidden="true"
        tabIndex={-1}
        onChange={event => handleFilesSelected(event.currentTarget.files)}
      />
      <SessionComposer
        ariaLabel={copy.create.businessContext}
        attachmentCountLabel={copy.workspace.attachedSourceMaterials}
        attachmentTriggerLabel={copy.workspace.addSourceMaterials}
        attachments={attachments.map(attachment => ({
          id: attachment.id,
          kind: formatSessionAttachmentKind(attachment.file),
          closePreviewLabel: copy.workspace.closeSourceMaterialPreview,
          mediaType: attachment.previewUrl ? 'image' : 'file',
          name: attachment.file.name,
          onPreviewLabel: copy.workspace.previewSourceMaterial(attachment.file.name),
          previewAlt: attachment.file.name,
          previewTitle: attachment.file.name,
          previewUrl: attachment.previewUrl,
          removeLabel: copy.workspace.removeSourceMaterial(attachment.file.name),
          size: formatSessionAttachmentSize(attachment.file.size),
        }))}
        className="workspace-composer-box"
        disabledReason={engineReadiness.ready ? undefined : engineReadiness.detail}
        error={attachmentError}
        onAddAttachments={() => fileInputRef.current?.click()}
        onRemoveAttachment={removeAttachment}
        placeholder={copy.workspace.createSessionPlaceholder}
        selectedTemplateId={selectedTemplate.id}
        submitAriaLabel={copy.workspace.createSession}
        submitDisabled={!engineReadiness.ready}
        submitting={submitting}
        templateLabel={copy.create.capabilityTemplate}
        templateOptions={templates.map((template) => {
          const templateCopy = displayTemplate(template, locale)
          return {
            description: template.outputKind,
            label: templateCopy.name,
            value: template.id,
          }
        })}
        value={value}
        variant="large"
        onSubmit={handleSubmit}
        onTemplateChange={onTemplateChange}
        onValueChange={onContextChange}
      />
      <p className="workspace-composer-hint">{copy.workspace.createSessionHint(selectedTemplateCopy.name)}</p>
    </section>
  )
}
