import type { LocalArtifact } from '@zonease/aiworker-shared'
import type { SoulArtifactPreviewState, SoulProfilePreviewState, WorkerLocale } from '../../../types'
import type { HrWorkbenchCopy } from '../copy'
import type { PersonProfile, ProfileTimelineItem } from '../types'

import { CheckCircle2, FileText, ListChecks, NotebookText } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { formatRelativeTime } from '../../../../../features/i18n'
import { WorkbenchSectionTitle } from '../../../common'

const MarkdownPreview = lazy(() => import('@zonease/aiworker-component/markdown-preview').then(module => ({ default: module.MarkdownPreview })))

interface ProfileDetailsProps {
  artifact: LocalArtifact | null
  artifactPreview: SoulArtifactPreviewState
  focusedProfile: PersonProfile | null
  labels: HrWorkbenchCopy
  locale: WorkerLocale
  onPromoteProfileRevision: () => Promise<void> | void
  profilePreview: SoulProfilePreviewState
  profileRevisionSubmitting: boolean
  reviewGuardrails: readonly string[]
  timeline: ProfileTimelineItem[]
}

export function HrProfileDetails({
  artifact,
  artifactPreview,
  focusedProfile,
  labels,
  locale,
  onPromoteProfileRevision,
  profilePreview,
  profileRevisionSubmitting,
  reviewGuardrails,
  timeline,
}: ProfileDetailsProps) {
  const previewMatchesArtifact = Boolean(artifact && artifactPreview.artifactId === artifact.id)
  const profilePreviewMatchesProfile = Boolean(focusedProfile && profilePreview.workspaceId === focusedProfile.id)

  return (
    <section className="hr-profile-details" aria-label={labels.profileDetailsTitle}>
      <WorkbenchSectionTitle
        icon={<NotebookText size={15} />}
        title={labels.profileDetailsTitle}
        detail={focusedProfile ? labels.profileDetailsDetail(focusedProfile.name) : labels.profileDetailsEmpty}
      />

      <div className="hr-profile-details-scroll">
        <article className="hr-current-profile-card" data-testid="hr-current-profile-summary">
          <div className="hr-current-profile-head">
            {focusedProfile
              ? (
                  <span className="hr-profile-avatar large" aria-hidden="true">{focusedProfile.initials}</span>
                )
              : null}
            <span>
              <strong>{focusedProfile?.name ?? labels.profileDetailsTitle}</strong>
              <small>README.md</small>
            </span>
          </div>
          {renderProfilePreview({
            empty: labels.currentProfileEmpty,
            error: labels.currentProfileError,
            loading: labels.currentProfileLoading,
            profilePreview,
            profilePreviewMatchesProfile,
          })}
        </article>

        <div className="hr-details-grid">
          <article className="hr-details-card">
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
          </article>

          <article className="hr-details-card hr-artifact-preview-card" data-testid="hr-proposed-change">
            <WorkbenchSectionTitle
              icon={<FileText size={15} />}
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
          </article>
        </div>

        <div className="hr-guardrail-panel">
          <WorkbenchSectionTitle icon={<ListChecks size={15} />} title={labels.guardrailsTitle} detail={labels.guardrailsDetail} />
          <ul className="hr-guardrail-list">
            {reviewGuardrails.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function renderProfilePreview({
  empty,
  error,
  loading,
  profilePreview,
  profilePreviewMatchesProfile,
}: {
  empty: string
  error: string
  loading: string
  profilePreview: SoulProfilePreviewState
  profilePreviewMatchesProfile: boolean
}) {
  if (!profilePreviewMatchesProfile || profilePreview.loading)
    return <div className="hr-artifact-preview-empty">{loading}</div>

  if (profilePreview.error)
    return <div className="hr-artifact-preview-empty" role="alert">{`${error} ${profilePreview.error}`}</div>

  return (
    <Suspense fallback={<div className="hr-markdown-preview hr-current-profile-markdown" data-testid="hr-current-profile-markdown-loading" />}>
      <MarkdownPreview
        className="hr-markdown-preview hr-current-profile-markdown"
        content={profilePreview.content}
        data-testid="hr-current-profile-markdown"
        empty={<span>{empty}</span>}
      />
    </Suspense>
  )
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
