import type { CapabilityTemplate, LocalArtifact, LocalSession, LocalWorkspace, SoulWorkbenchAction } from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { EngineReadiness } from '../../../../../features/session/engine-readiness'
import type { SoulArtifactPreviewState, WorkerLocale, WorkerMessages } from '../../../types'
import type { HrWorkbenchCopy } from '../copy'
import type { PersonProfile, ProfileTimelineItem } from '../types'

import { ArrowRight, CheckCircle2, Clock3, FileCheck2, FileText, ListChecks, MessageSquareText, Sparkles } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { displayTemplate, formatRelativeTime, formatStatus } from '../../../../../features/i18n'
import { WorkbenchSectionTitle } from '../../../common'
import { displayActionLabel } from '../model'

const MarkdownPreview = lazy(() => import('@zonease/aiworker-component/markdown-preview').then(module => ({ default: module.MarkdownPreview })))

interface ProfileToolsPanelProps {
  activeActions: readonly SoulWorkbenchAction[]
  artifact: LocalArtifact | null
  artifactPreview: SoulArtifactPreviewState
  copy: WorkerMessages
  engineReadiness: EngineReadiness
  focusedProfile: PersonProfile | null
  labels: HrWorkbenchCopy
  locale: WorkerLocale
  onActionSelect: (action: SoulWorkbenchAction) => void
  onContextChange: (value: string) => void
  onOpenSession: (session: LocalSession) => void
  onPromoteProfileRevision: () => Promise<void> | void
  onSubmitSession: (event: FormEvent<HTMLFormElement>) => void
  onTemplateChange: (templateId: string) => void
  profileRevisionSubmitting: boolean
  reviewGuardrails: readonly string[]
  selectedTemplate: CapabilityTemplate
  selectedWorkspace: LocalWorkspace | null
  submitting: boolean
  templates: CapabilityTemplate[]
  timeline: ProfileTimelineItem[]
  value: string
}

export function HrProfileToolsPanel({
  activeActions,
  artifact,
  artifactPreview,
  copy,
  engineReadiness,
  focusedProfile,
  labels,
  locale,
  onActionSelect,
  onContextChange,
  onOpenSession,
  onPromoteProfileRevision,
  onSubmitSession,
  onTemplateChange,
  profileRevisionSubmitting,
  reviewGuardrails,
  selectedTemplate,
  selectedWorkspace,
  submitting,
  templates,
  timeline,
  value,
}: ProfileToolsPanelProps) {
  const selectedTemplateCopy = displayTemplate(selectedTemplate, locale)
  const recentSessions = focusedProfile?.sessions.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3) ?? []
  const previewMatchesArtifact = Boolean(artifact && artifactPreview.artifactId === artifact.id)

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

        <section className="hr-tool-section" aria-label={labels.sourcesTitle}>
          <WorkbenchSectionTitle icon={<FileText size={15} />} title={labels.sourcesTitle} detail={labels.sourcesDetail} />
          <div className="hr-source-grid">
            {labels.sourceCards(
              focusedProfile?.artifacts.length ?? 0,
              focusedProfile?.sessions.length ?? 0,
              focusedProfile?.reviews.length ?? 0,
            ).map(source => (
              <div key={source.label} className="hr-source-row">
                <span>{source.label}</span>
                <strong>{source.count}</strong>
                <small>{source.detail}</small>
              </div>
            ))}
          </div>

          <div className="hr-profile-timeline" aria-label={labels.timelineTitle}>
            <strong>{labels.timelineTitle}</strong>
            {timeline.length > 0
              ? timeline.map(item => (
                  <div key={`${item.label}-${item.detail}`} className="hr-timeline-row">
                    <span className={`hr-timeline-dot ${item.tone}`} aria-hidden="true" />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                  </div>
                ))
              : <span className="hr-muted-note">{labels.noTimeline}</span>}
          </div>
        </section>

        <section className="hr-tool-section hr-artifact-preview-card" aria-label={labels.artifactPreviewTitle} data-testid="hr-proposed-change">
          <WorkbenchSectionTitle
            icon={<FileCheck2 size={15} />}
            title={labels.artifactPreviewTitle}
            detail={artifact ? formatRelativeTime(artifact.updatedAt, locale) : labels.artifactPreviewDetail}
          />
          {artifact ? <strong className="hr-artifact-preview-name">{artifact.title}</strong> : null}
          {renderArtifactPreview({
            artifact,
            artifactPreview,
            empty: labels.artifactPreviewEmpty,
            error: labels.artifactPreviewError,
            loading: labels.artifactPreviewLoading,
            previewMatchesArtifact,
          })}
          <div className="hr-proposed-change-actions">
            <span className="hr-muted-note">{labels.promoteProfileRevisionHint}</span>
            <button
              type="button"
              className="secondary hr-profile-promote-button"
              disabled={!artifact || profileRevisionSubmitting}
              onClick={() => void onPromoteProfileRevision()}
            >
              <CheckCircle2 aria-hidden="true" size={14} />
              <span>{profileRevisionSubmitting ? labels.approvingProfileRevision : labels.approveProfileRevision}</span>
            </button>
          </div>
        </section>

        <section className="hr-tool-section" aria-label={labels.guardrailsTitle}>
          <WorkbenchSectionTitle icon={<ListChecks size={15} />} title={labels.guardrailsTitle} detail={labels.guardrailsDetail} />
          <ul className="hr-guardrail-list">
            {reviewGuardrails.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

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

function renderArtifactPreview({
  artifact,
  artifactPreview,
  empty,
  error,
  loading,
  previewMatchesArtifact,
}: {
  artifact: LocalArtifact | null
  artifactPreview: SoulArtifactPreviewState
  empty: string
  error: string
  loading: string
  previewMatchesArtifact: boolean
}) {
  if (!artifact)
    return <div className="hr-artifact-preview-empty">{empty}</div>

  if (!previewMatchesArtifact || artifactPreview.loading)
    return <div className="hr-artifact-preview-empty">{loading}</div>

  if (artifactPreview.error)
    return <div className="hr-artifact-preview-empty" role="alert">{`${error} ${artifactPreview.error}`}</div>

  return (
    <Suspense fallback={<div className="hr-markdown-preview" data-testid="hr-artifact-markdown-preview-loading" />}>
      <MarkdownPreview
        className="hr-markdown-preview"
        content={artifactPreview.content}
        data-testid="hr-artifact-markdown-preview"
        empty={<span>{empty}</span>}
      />
    </Suspense>
  )
}
