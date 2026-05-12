import type { LocalArtifact } from '@zonease/aiworker-shared'
import type { SoulArtifactPreviewState, WorkerLocale } from '../../../types'
import type { HrWorkbenchCopy } from '../copy'
import type { PersonProfile, ProfileTimelineItem } from '../types'

import { MarkdownPreview } from '@zonease/aiworker-component'
import { FileText, ListChecks, NotebookText } from 'lucide-react'
import { formatRelativeTime } from '../../../../../features/i18n'
import { WorkbenchSectionTitle } from '../../../common'

interface ProfileDetailsProps {
  artifact: LocalArtifact | null
  artifactPreview: SoulArtifactPreviewState
  focusedProfile: PersonProfile | null
  labels: HrWorkbenchCopy
  locale: WorkerLocale
  reviewGuardrails: readonly string[]
  timeline: ProfileTimelineItem[]
}

export function HrProfileDetails({
  artifact,
  artifactPreview,
  focusedProfile,
  labels,
  locale,
  reviewGuardrails,
  timeline,
}: ProfileDetailsProps) {
  const previewMatchesArtifact = Boolean(artifact && artifactPreview.artifactId === artifact.id)

  return (
    <section className="hr-profile-details" aria-label={labels.profileDetailsTitle}>
      <WorkbenchSectionTitle
        icon={<NotebookText size={15} />}
        title={labels.profileDetailsTitle}
        detail={focusedProfile ? labels.profileDetailsDetail(focusedProfile.name) : labels.profileDetailsEmpty}
      />

      <div className="hr-profile-details-scroll">
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

          <article className="hr-details-card hr-artifact-preview-card">
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
    <MarkdownPreview
      className="hr-markdown-preview"
      content={artifactPreview.content}
      data-testid="hr-artifact-markdown-preview"
      empty={<span>{empty}</span>}
    />
  )
}
