import type { LocalWorkspace } from '@zonease/aiworker-shared'
import type { SessionComposerMaterial } from '@zonease/aiworker-ui/components/session-composer'
import type { FormEvent } from 'react'
import type { messagesFor, normalizeLocale } from '../../i18n'
import type { CapabilityTemplate } from '../types.compat'

import { ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { createComposerAttachment, formatSessionAttachmentKind, formatSessionAttachmentSize, isSessionAttachmentImage, SessionComposer } from '@zonease/aiworker-ui/components/session-composer'
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
  mentions?: Array<{ id: string, kind: 'skill', label: string }>
}

export function WorkspaceSessionComposer({
  copy,
  engineReadiness,
  locale,
  onContextChange,
  onSubmit,
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
  const mentionQuery = resolveDollarMention(value)

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

  function addAttachmentFiles(files: FileList | File[] | null) {
    const selectedFiles = Array.from(files ?? [])
    if (selectedFiles.length === 0)
      return
    setAttachmentError(null)
    setAttachments(current => [
      ...current,
      ...selectedFiles.map((file, index) => ({
        file,
        id: `${file.name}-${file.size}-${file.lastModified}-${current.length + index}`,
        previewUrl: isSessionAttachmentImage(file) ? URL.createObjectURL(file) : undefined,
      })),
    ])
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
        mentions: resolveSkillMentions(value, templates, locale),
      })
      clearAttachments()
    }
    catch {
      setAttachmentError(copy.workspace.materialReadError)
    }
  }

  return (
    <ItemGroup className="mx-auto max-w-4xl items-stretch gap-5" data-testid="new-session-panel">
      <ItemTitle asChild size="base" className="mx-auto max-w-full">
        <h2>{copy.workspace.createSessionPrompt(workspace.name)}</h2>
      </ItemTitle>
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
        className="overflow-visible"
        disabledReason={engineReadiness.ready ? undefined : engineReadiness.detail}
        error={attachmentError}
        mentionOptions={templates.map(template => ({
          description: template.outputKind,
          id: template.id,
          label: displayTemplate(template, locale).name,
        }))}
        mentionQuery={mentionQuery}
        onAddAttachmentFiles={addAttachmentFiles}
        onAddAttachments={openFilePicker}
        onMentionDismiss={() => onContextChange(value.replace(/\$([\w.-]*)$/, ''))}
        onMentionSelect={option => onContextChange(insertMention(value, option.id))}
        onRemoveAttachment={removeAttachment}
        placeholder={copy.workspace.createSessionPlaceholder}
        submitAriaLabel={copy.workspace.createSession}
        submitDisabled={!engineReadiness.ready}
        submitting={submitting}
        value={value}
        variant="large"
        onSubmit={handleSubmit}
        onValueChange={onContextChange}
      />
      <ItemDescription asChild className="max-w-full">
        <p>{copy.workspace.createSessionHint(selectedTemplateCopy.name)}</p>
      </ItemDescription>
    </ItemGroup>
  )
}

function resolveDollarMention(value: string) {
  const match = value.match(/\$([\w.-]*)$/)
  return match ? { active: true, query: match[1] ?? '', trigger: '$' as const } : undefined
}

function insertMention(value: string, id: string): string {
  return value.replace(/\$([\w.-]*)$/, `$${id} `)
}

function resolveSkillMentions(value: string, templates: CapabilityTemplate[], locale: ReturnType<typeof normalizeLocale>) {
  const ids = new Set([...value.matchAll(/\$([\w.-]+)/g)].map(match => match[1]).filter(Boolean))
  return templates
    .filter(template => ids.has(template.id))
    .map(template => ({
      id: template.id,
      kind: 'skill' as const,
      label: displayTemplate(template, locale).name,
    }))
}
