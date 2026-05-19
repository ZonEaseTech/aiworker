import type { CapabilityTemplate, LocalSession, LocalWorkspace } from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { EngineReadiness } from '../../../../../features/session/engine-readiness'
import type { SoulSessionDraft, WorkerLocale } from '../../../types'
import type { HrWorkbenchCopy } from '../copy'
import type { PersonProfile } from '../types'

import { createComposerAttachment, formatSessionAttachmentKind, formatSessionAttachmentSize, SessionComposer } from '@zonease/aiworker-component'
import { Clock3 } from 'lucide-react'
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
      const materials = await Promise.all(attachments.map(attachment => createComposerAttachment(attachment.file)))
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

      <input
        ref={fileInputRef}
        className="hr-material-file-input"
        type="file"
        multiple
        aria-hidden="true"
        tabIndex={-1}
        onChange={event => handleFilesSelected(event.currentTarget.files)}
      />

      <SessionComposer
        ariaLabel={labels.candidateMaterialLabel}
        attachmentCountLabel={labels.attachedCandidateMaterialsLabel}
        attachmentTriggerLabel={labels.openCandidateMaterialPicker}
        attachments={attachments.map(attachment => ({
          id: attachment.id,
          kind: formatSessionAttachmentKind(attachment.file),
          name: attachment.file.name,
          removeLabel: labels.removeCandidateMaterial(attachment.file.name),
          size: formatSessionAttachmentSize(attachment.file.size),
        }))}
        className="profile-draft-composer"
        description={selectedWorkspace ? labels.composerSafetyDetail : labels.selectProfileFirst}
        disabled={!selectedWorkspace}
        disabledReason={!selectedWorkspace ? labels.selectProfileFirst : !engineReadiness.ready ? engineReadiness.detail : undefined}
        error={attachmentError}
        onAddAttachments={() => fileInputRef.current?.click()}
        onRemoveAttachment={removeAttachment}
        onSubmit={handleSubmit}
        onTemplateChange={onTemplateChange}
        onValueChange={onContextChange}
        placeholder={labels.contextPlaceholder}
        selectedTemplateId={selectedTemplate.id}
        submitAriaLabel={submitting ? labels.generatingProfileDraft : labels.generateProfileDraft}
        submitDisabled={!canSubmit}
        submitting={submitting}
        submitTitle={submitting ? labels.generatingProfileDraft : labels.generateProfileDraft}
        templateClassName="hr-composer-template-select"
        templateContentClassName="hr-composer-template-select-content"
        templateLabel={labels.proposalTypeSelectLabel}
        templateOptions={templates.map((template) => {
          const templateCopy = displayTemplate(template, locale)
          return {
            label: labels.proposalTypeLabel(template.id, template.outputKind, templateCopy.name),
            value: template.id,
          }
        })}
        title={labels.profileComposerTitle(focusedProfile?.name ?? labels.headerFallback)}
        value={value}
        variant="panel"
      />
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
