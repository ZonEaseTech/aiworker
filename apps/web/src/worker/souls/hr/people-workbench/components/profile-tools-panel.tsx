import type { CapabilityTemplate, LocalSession, LocalWorkspace } from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { EngineReadiness } from '../../../../../features/session/engine-readiness'
import type { SoulSessionDraft, SoulSessionMaterialEncoding, SoulSessionMaterialInput, WorkerLocale } from '../../../types'
import type { HrWorkbenchCopy } from '../copy'
import type { PersonProfile } from '../types'

import { IconButton, Select, Textarea } from '@zonease/aiworker-component'
import { Clock3, FileText, Paperclip, SendHorizontal, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { displayTemplate, formatRelativeTime } from '../../../../../features/i18n'

interface ProfileToolsPanelProps {
  engineReadiness: EngineReadiness
  focusedProfile: PersonProfile | null
  labels: HrWorkbenchCopy
  locale: WorkerLocale
  onOpenSession: (session: LocalSession) => void
  onSubmitSession: (event: FormEvent<HTMLFormElement>, draft?: SoulSessionDraft) => Promise<void> | void
  onTemplateChange: (templateId: string) => void
  selectedTemplate: CapabilityTemplate
  selectedWorkspace: LocalWorkspace | null
  submitting: boolean
  templates: CapabilityTemplate[]
  value: string
  onContextChange: (value: string) => void
}

interface ComposerAttachment {
  file: File
  id: string
}

export function HrProfileToolsPanel({
  engineReadiness,
  focusedProfile,
  labels,
  locale,
  onContextChange,
  onOpenSession,
  onSubmitSession,
  onTemplateChange,
  selectedTemplate,
  selectedWorkspace,
  submitting,
  templates,
  value,
}: ProfileToolsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const recentSessions = focusedProfile?.sessions.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) ?? []
  const canSubmit = Boolean(selectedWorkspace && engineReadiness.ready && !submitting && (value.trim() || attachments.length > 0))

  function handleFilesSelected(files: FileList | null) {
    if (!files?.length)
      return
    setAttachmentError(null)
    setAttachments(current => [
      ...current,
      ...Array.from(files).map((file, index) => ({
        file,
        id: `${file.name}-${file.size}-${file.lastModified}-${current.length + index}`,
      })),
    ])
    if (fileInputRef.current)
      fileInputRef.current.value = ''
  }

  function removeAttachment(id: string) {
    setAttachments(current => current.filter(attachment => attachment.id !== id))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit)
      return
    try {
      setAttachmentError(null)
      const materials = await Promise.all(attachments.map(readAttachmentMaterial))
      await onSubmitSession(event, { context: value, materials })
      setAttachments([])
    }
    catch {
      setAttachmentError(labels.materialReadError)
    }
  }

  return (
    <aside className="hr-profile-tools-panel" aria-label={labels.profileComposerTitle(focusedProfile?.name ?? labels.headerFallback)}>
      <section className="hr-tool-section hr-recent-sessions-section" aria-label={labels.recentSessionsTitle}>
        <div className="hr-compact-section-heading">
          <strong>{labels.recentSessionsTitle}</strong>
          <small>{labels.recentSessionsDetail(recentSessions.length)}</small>
        </div>
        <div className="hr-session-card-list compact">
          {recentSessions.length > 0
            ? recentSessions.map((session) => {
                const sessionLabel = displayTemplateForSession(session, templates, locale, labels)
                return (
                  <button
                    key={session.id}
                    type="button"
                    className="hr-session-card compact"
                    aria-label={labels.openSession(sessionLabel)}
                    onClick={() => onOpenSession(session)}
                  >
                    <span>
                      <strong>{sessionLabel}</strong>
                    </span>
                    <span className="hr-session-card-meta">
                      <small>
                        <Clock3 aria-hidden="true" size={12} />
                        {formatRelativeTime(session.updatedAt, locale)}
                      </small>
                    </span>
                  </button>
                )
              })
            : <span className="hr-profile-section-empty">{labels.noRecentSessions}</span>}
        </div>
      </section>

      <form className="hr-task-composer profile-draft-composer" onSubmit={handleSubmit}>
        <header className="hr-composer-heading">
          <span className="hr-composer-glyph" aria-hidden="true">
            <FileText size={18} />
          </span>
          <span>
            <strong>{labels.profileComposerTitle(focusedProfile?.name ?? labels.headerFallback)}</strong>
            <small>{selectedWorkspace ? labels.composerSafetyDetail : labels.selectProfileFirst}</small>
          </span>
        </header>

        <Textarea
          id="hr-task-context"
          aria-label={labels.candidateMaterialLabel}
          value={value}
          placeholder={labels.contextPlaceholder}
          onChange={event => onContextChange(event.target.value)}
        />

        <input
          ref={fileInputRef}
          className="hr-material-file-input"
          type="file"
          multiple
          aria-hidden="true"
          tabIndex={-1}
          onChange={event => handleFilesSelected(event.currentTarget.files)}
        />

        {attachments.length > 0
          ? (
              <div className="hr-material-list" aria-label={`${labels.attachedCandidateMaterialsLabel} list`}>
                {attachments.map(attachment => (
                  <div key={attachment.id} className="hr-material-row">
                    <span className="hr-material-kind">{fileKindLabel(attachment.file)}</span>
                    <span className="hr-material-name">{attachment.file.name}</span>
                    <span className="hr-material-size">{formatFileSize(attachment.file.size)}</span>
                    <IconButton
                      aria-label={labels.removeCandidateMaterial(attachment.file.name)}
                      title={labels.removeCandidateMaterial(attachment.file.name)}
                      onClick={() => removeAttachment(attachment.id)}
                    >
                      <X aria-hidden="true" size={13} />
                    </IconButton>
                  </div>
                ))}
              </div>
            )
          : null}

        {attachmentError
          ? <div className="inline-warning" role="status">{attachmentError}</div>
          : null}

        {!engineReadiness.ready
          ? <div className="inline-warning" role="status">{engineReadiness.detail}</div>
          : null}

        <div className="hr-composer-action-bar">
          <IconButton
            className="hr-material-add-button"
            aria-label={labels.openCandidateMaterialPicker}
            title={labels.addCandidateMaterials}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip aria-hidden="true" size={15} />
            {attachments.length > 0
              ? <span className="hr-material-count" aria-label={labels.attachedCandidateMaterialsLabel}>{attachments.length}</span>
              : null}
          </IconButton>

          <Select
            className="hr-composer-template-select"
            ariaLabel={labels.proposalTypeSelectLabel}
            label={labels.proposalTypeSelectLabel}
            value={selectedTemplate.id}
            onChange={onTemplateChange}
            options={templates.map((template) => {
              const templateCopy = displayTemplate(template, locale)
              return {
                label: labels.proposalTypeLabel(template.id, template.outputKind, templateCopy.name),
                value: template.id,
              }
            })}
          />

          <IconButton
            type="submit"
            className="primary hr-composer-submit"
            disabled={!canSubmit}
            aria-label={submitting ? labels.generatingProfileDraft : labels.generateProfileDraft}
            title={submitting ? labels.generatingProfileDraft : labels.generateProfileDraft}
          >
            <SendHorizontal aria-hidden="true" size={16} />
          </IconButton>
        </div>
      </form>
    </aside>
  )
}

function displayTemplateForSession(session: LocalSession, templates: CapabilityTemplate[], locale: WorkerLocale, labels: HrWorkbenchCopy): string {
  const template = templates.find(item => item.id === session.capabilityTemplateId)
  if (!template)
    return session.capabilityTemplateId.replace(/-/g, ' ')
  const templateCopy = displayTemplate(template, locale)
  return labels.proposalTypeLabel(template.id, template.outputKind, templateCopy.name)
}

async function readAttachmentMaterial(attachment: ComposerAttachment): Promise<SoulSessionMaterialInput> {
  const encoding: SoulSessionMaterialEncoding = isTextLikeFile(attachment.file) ? 'utf8' : 'base64'
  const content = encoding === 'utf8'
    ? await attachment.file.text()
    : arrayBufferToBase64(await attachment.file.arrayBuffer())
  return {
    content,
    encoding,
    mimeType: attachment.file.type || 'application/octet-stream',
    name: attachment.file.name,
    size: attachment.file.size,
  }
}

function isTextLikeFile(file: File): boolean {
  if (file.type.startsWith('text/'))
    return true
  if (['application/csv', 'application/json', 'application/xml', 'application/yaml'].includes(file.type))
    return true
  return /\.(?:csv|json|log|md|txt|ya?ml)$/i.test(file.name)
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  return btoa(binary)
}

function fileKindLabel(file: File): string {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : ''
  return (extension || file.type.split('/').pop() || 'file').slice(0, 5).toUpperCase()
}

function formatFileSize(size: number): string {
  if (size < 1024)
    return `${size} B`
  if (size < 1024 * 1024)
    return `${Math.round(size / 102.4) / 10} KB`
  return `${Math.round(size / 1024 / 102.4) / 10} MB`
}
