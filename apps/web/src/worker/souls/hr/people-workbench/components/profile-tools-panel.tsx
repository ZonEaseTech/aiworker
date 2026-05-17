import type { CapabilityTemplate, LocalArtifact, LocalSession, LocalWorkspace, SoulWorkbenchAction } from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { EngineReadiness } from '../../../../../features/session/engine-readiness'
import type { SoulArtifactPreviewState, SoulProfilePreviewState, WorkerLocale, WorkerMessages } from '../../../types'
import type { HrWorkbenchCopy } from '../copy'
import type { ProfileRevisionReviewState } from '../revision-review'
import type { PersonProfile, ProfileTimelineItem } from '../types'
import type { HrProfileToolsRailTarget } from './profile-tools-rail'

import { ArrowRight, CheckCircle2, Clock3, FileCheck2, FileText, ListChecks, MessageSquareText, Sparkles } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { displayTemplate, formatRelativeTime, formatStatus } from '../../../../../features/i18n'
import { WorkbenchSectionTitle } from '../../../common'
import { displayActionLabel } from '../model'
import { buildProfileRevisionReview } from '../revision-review'

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
  profilePreview: SoulProfilePreviewState
  onActionSelect: (action: SoulWorkbenchAction) => void
  onContextChange: (value: string) => void
  onOpenSession: (session: LocalSession) => void
  onProfileToolsFocusTargetHandled: () => void
  onPromoteProfileRevision: () => Promise<void> | void
  onSubmitSession: (event: FormEvent<HTMLFormElement>) => void
  onTemplateChange: (templateId: string) => void
  profileRevisionSubmitting: boolean
  profileToolsFocusTarget: HrProfileToolsRailTarget | null
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
  profilePreview,
  onActionSelect,
  onContextChange,
  onOpenSession,
  onProfileToolsFocusTargetHandled,
  onPromoteProfileRevision,
  onSubmitSession,
  onTemplateChange,
  profileRevisionSubmitting,
  profileToolsFocusTarget,
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
  const guardrailsSectionRef = useRef<HTMLElement | null>(null)
  const proposalSectionRef = useRef<HTMLElement | null>(null)
  const sessionsSectionRef = useRef<HTMLElement | null>(null)
  const sourcesSectionRef = useRef<HTMLElement | null>(null)
  const profilePreviewMatchesProfile = Boolean(focusedProfile && profilePreview.workspaceId === focusedProfile.id)
  const revisionReview = buildProfileRevisionReview({
    artifactContent: previewMatchesArtifact ? artifactPreview.content : '',
    artifactError: previewMatchesArtifact ? artifactPreview.error : null,
    artifactLoading: !previewMatchesArtifact || artifactPreview.loading,
    currentProfileContent: profilePreviewMatchesProfile ? profilePreview.content : '',
    currentProfileError: profilePreviewMatchesProfile ? profilePreview.error : null,
    currentProfileLoading: !profilePreviewMatchesProfile || profilePreview.loading,
    hasArtifact: Boolean(artifact),
  })
  const approveProfileRevisionDisabled = !artifact || profileRevisionSubmitting || revisionReview.status !== 'ready'

  useEffect(() => {
    if (!profileToolsFocusTarget)
      return

    const target = profileToolsFocusTarget === 'proposal'
      ? proposalSectionRef.current
      : profileToolsFocusTarget === 'guardrails'
        ? guardrailsSectionRef.current
        : profileToolsFocusTarget === 'sessions'
          ? sessionsSectionRef.current
          : sourcesSectionRef.current

    target?.scrollIntoView({ block: 'start' })
    onProfileToolsFocusTargetHandled()
  }, [onProfileToolsFocusTargetHandled, profileToolsFocusTarget])

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

        <section className="hr-tool-section hr-next-action-section" aria-label={labels.suggestedToolsTitle}>
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

        <section ref={sourcesSectionRef} className="hr-tool-section" aria-label={labels.sourcesTitle}>
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

        <section ref={proposalSectionRef} className="hr-tool-section hr-artifact-preview-card" aria-label={labels.artifactPreviewTitle} data-testid="hr-proposed-change">
          <WorkbenchSectionTitle
            icon={<FileCheck2 size={15} />}
            title={labels.artifactPreviewTitle}
            detail={artifact ? formatRelativeTime(artifact.updatedAt, locale) : labels.artifactPreviewDetail}
          />
          {artifact ? <strong className="hr-artifact-preview-name">{artifact.title}</strong> : null}
          <RevisionReviewStatus labels={labels} review={revisionReview} />
          {revisionReview.currentSummary || revisionReview.proposedSummary
            ? <RevisionReviewComparison labels={labels} review={revisionReview} />
            : null}
          {renderArtifactPreview({
            artifact,
            artifactPreview,
            empty: labels.artifactPreviewEmpty,
            error: labels.artifactPreviewError,
            loading: labels.artifactPreviewLoading,
            markdownContent: revisionReview.status === 'ready' ? revisionReview.proposedMarkdown : artifactPreview.content,
            previewMatchesArtifact,
          })}
          <div className="hr-proposed-change-actions">
            <span className="hr-muted-note">{labels.promoteProfileRevisionHint}</span>
            <button
              type="button"
              className="secondary hr-profile-promote-button"
              disabled={approveProfileRevisionDisabled}
              onClick={() => void onPromoteProfileRevision()}
            >
              <CheckCircle2 aria-hidden="true" size={14} />
              <span>{profileRevisionSubmitting ? labels.approvingProfileRevision : labels.approveProfileRevision}</span>
            </button>
          </div>
        </section>

        <section ref={guardrailsSectionRef} className="hr-tool-section" aria-label={labels.guardrailsTitle}>
          <WorkbenchSectionTitle icon={<ListChecks size={15} />} title={labels.guardrailsTitle} detail={labels.guardrailsDetail} />
          <ul className="hr-guardrail-list">
            {reviewGuardrails.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section ref={sessionsSectionRef} className="hr-tool-section" aria-label={labels.recentSessionsTitle}>
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

function RevisionReviewStatus({
  labels,
  review,
}: {
  labels: HrWorkbenchCopy
  review: ProfileRevisionReviewState
}) {
  if (review.status === 'empty')
    return null

  const isReady = review.status === 'ready'
  const statusLabel = isReady ? labels.revisionReady : labels.revisionBlocked
  return (
    <div className={`hr-revision-status ${review.status}`} role={isReady ? 'status' : 'alert'}>
      <span>
        <strong>{statusLabel}</strong>
        <small>{labels.revisionStatusTitle}</small>
      </span>
      {review.issues.length > 0
        ? (
            <ul>
              {review.issues.map(issue => <li key={issue}>{issue}</li>)}
            </ul>
          )
        : null}
    </div>
  )
}

function RevisionReviewComparison({
  labels,
  review,
}: {
  labels: HrWorkbenchCopy
  review: ProfileRevisionReviewState
}) {
  return (
    <div className="hr-revision-comparison" aria-label={labels.revisionComparisonTitle}>
      <div>
        <strong>{labels.revisionCurrentTitle}</strong>
        <p>{review.currentSummary || labels.currentProfileEmpty}</p>
      </div>
      <div>
        <strong>{labels.revisionDraftTitle}</strong>
        <p>{review.proposedSummary || labels.artifactPreviewEmpty}</p>
      </div>
    </div>
  )
}

function renderArtifactPreview({
  artifact,
  artifactPreview,
  empty,
  error,
  loading,
  markdownContent,
  previewMatchesArtifact,
}: {
  artifact: LocalArtifact | null
  artifactPreview: SoulArtifactPreviewState
  empty: string
  error: string
  loading: string
  markdownContent: string
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
        content={markdownContent}
        data-testid="hr-artifact-markdown-preview"
        empty={<span>{empty}</span>}
      />
    </Suspense>
  )
}
