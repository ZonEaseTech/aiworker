import type { CapabilityTemplate, LocalSession, LocalWorkspace, SoulWorkbenchAction } from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { EngineReadiness } from '../../../../../features/session/engine-readiness'
import type { WorkerLocale, WorkerMessages } from '../../../types'
import type { HrWorkbenchCopy } from '../copy'
import type { PersonProfile } from '../types'

import { ArrowRight, Clock3, MessageSquareText, Sparkles } from 'lucide-react'
import { displayTemplate, formatRelativeTime, formatStatus } from '../../../../../features/i18n'
import { WorkbenchSectionTitle } from '../../../common'
import { displayActionLabel } from '../model'

interface ProfileToolsPanelProps {
  activeActions: readonly SoulWorkbenchAction[]
  copy: WorkerMessages
  engineReadiness: EngineReadiness
  focusedProfile: PersonProfile | null
  labels: HrWorkbenchCopy
  locale: WorkerLocale
  onActionSelect: (action: SoulWorkbenchAction) => void
  onContextChange: (value: string) => void
  onOpenSession: (session: LocalSession) => void
  onSubmitSession: (event: FormEvent<HTMLFormElement>) => void
  onTemplateChange: (templateId: string) => void
  selectedTemplate: CapabilityTemplate
  selectedWorkspace: LocalWorkspace | null
  submitting: boolean
  templates: CapabilityTemplate[]
  value: string
}

export function HrProfileToolsPanel({
  activeActions,
  copy,
  engineReadiness,
  focusedProfile,
  labels,
  locale,
  onActionSelect,
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
  const selectedTemplateCopy = displayTemplate(selectedTemplate, locale)
  const recentSessions = focusedProfile?.sessions.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3) ?? []

  return (
    <aside className="hr-profile-tools-panel" aria-label={labels.actionComposerTitle}>
      <WorkbenchSectionTitle
        icon={<Sparkles size={15} />}
        title={labels.actionComposerTitle}
        detail={focusedProfile ? labels.actionComposerDetail(focusedProfile.name) : labels.actionComposerEmpty}
      />

      <div className="hr-profile-tools-scroll">
        {focusedProfile
          ? (
              <div className="hr-action-profile-card">
                <span className="hr-profile-avatar large" aria-hidden="true">{focusedProfile.initials}</span>
                <span>
                  <strong>{focusedProfile.name}</strong>
                  <small>{`${labels.lifecycleLabels[focusedProfile.lifecycle]} · ${focusedProfile.moment}`}</small>
                </span>
              </div>
            )
          : null}

        <section className="hr-tool-section" aria-label={labels.recentSessionsTitle}>
          <WorkbenchSectionTitle
            icon={<MessageSquareText size={15} />}
            title={labels.recentSessionsTitle}
            detail={labels.recentSessionsDetail(recentSessions.length)}
          />
          <div className="hr-session-card-list">
            {recentSessions.length > 0
              ? recentSessions.map(session => (
                  <button
                    key={session.id}
                    type="button"
                    className="hr-session-card"
                    aria-label={labels.openSession(session.title)}
                    onClick={() => onOpenSession(session)}
                  >
                    <span>
                      <strong>{session.title}</strong>
                      <small>{displayTemplateForSession(session, templates, locale)}</small>
                    </span>
                    <span className="hr-session-card-meta">
                      <em>{formatStatus(session.status, locale)}</em>
                      <small>
                        <Clock3 aria-hidden="true" size={12} />
                        {formatRelativeTime(session.updatedAt, locale)}
                      </small>
                    </span>
                  </button>
                ))
              : <span className="hr-profile-section-empty">{labels.noRecentSessions}</span>}
          </div>
        </section>

        <section className="hr-tool-section" aria-label={labels.suggestedToolsTitle}>
          <WorkbenchSectionTitle icon={<Sparkles size={15} />} title={labels.suggestedToolsTitle} detail={labels.proposalOnly} />
          <div className="hr-action-list">
            {activeActions.map((action, index) => (
              <button
                key={action.id}
                type="button"
                className={`hr-action-row ${index === 0 ? 'suggested' : ''}`}
                disabled={!selectedWorkspace}
                onClick={() => onActionSelect(action)}
              >
                <span>
                  <strong>{displayActionLabel(action, labels)}</strong>
                  <small>{labels.actionMeta(action.scope, action.outputKind)}</small>
                </span>
                {index === 0 ? <em>{labels.recommended}</em> : <ArrowRight aria-hidden="true" size={14} />}
              </button>
            ))}
          </div>
        </section>
      </div>

      <form className="hr-task-composer" onSubmit={onSubmitSession}>
        <div className="hr-composer-heading">
          <strong>{labels.proposalComposerTitle}</strong>
          <small>{selectedWorkspace ? labels.proposalComposerDetail : labels.selectProfileFirst}</small>
        </div>

        <label htmlFor="hr-task-template">{labels.artifactTargetLabel}</label>
        <select
          id="hr-task-template"
          value={selectedTemplate.id}
          onChange={event => onTemplateChange(event.target.value)}
        >
          {templates.map(template => (
            <option key={template.id} value={template.id}>{displayTemplate(template, locale).name}</option>
          ))}
        </select>

        <label htmlFor="hr-task-context">{labels.contextLabel}</label>
        <textarea
          id="hr-task-context"
          value={value}
          placeholder={labels.contextPlaceholder}
          onChange={event => onContextChange(event.target.value)}
        />

        {!engineReadiness.ready
          ? <div className="inline-warning" role="status">{engineReadiness.detail}</div>
          : null}

        <button
          type="submit"
          className="primary"
          disabled={!selectedWorkspace || !value.trim() || submitting || !engineReadiness.ready}
        >
          <span>{submitting ? copy.workspace.createSession : labels.generate(selectedTemplateCopy.outputKind)}</span>
        </button>
      </form>
    </aside>
  )
}

function displayTemplateForSession(session: LocalSession, templates: CapabilityTemplate[], locale: WorkerLocale): string {
  const template = templates.find(item => item.id === session.capabilityTemplateId)
  return template ? displayTemplate(template, locale).name : session.capabilityTemplateId.replace(/-/g, ' ')
}
