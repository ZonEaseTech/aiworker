import type {
  CapabilityTemplate,
  LocalArtifact,
  LocalLesson,
  LocalLessonStatus,
  LocalReview,
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { messagesFor, SupportedLocale } from '../features/i18n'
import type { EngineReadiness } from '../features/session/engine-readiness'
import type { SessionProgressSummary } from './session-progress'

import { StudioActivityRow, StudioEmptyState, StudioSectionHeader, StudioStatusPill } from '@zonease/aiworker-component'
import { Circle, ClipboardCheck, Eye, FileText, MessageSquare, Send, Sparkles, Terminal } from 'lucide-react'

import {
  displayTemplate,
  formatRelativeTime,
  formatReviewVerdict,
  formatStatus,
} from '../features/i18n'
import { SessionProgressPanel } from './session-progress-panel'

export interface ArtifactPreviewState {
  artifactId: string | null
  content: string
  error: string | null
  loading: boolean
}

type WorkerMessages = ReturnType<typeof messagesFor>

export function SessionDetail({
  artifact,
  artifactCopy,
  artifactPreview,
  artifacts,
  collapsed = false,
  copy,
  engineReadiness,
  events,
  lessonBusyId,
  lessons,
  locale,
  onLessonStatus,
  onReview,
  onSubmitTurn,
  onTurnInputChange,
  progress,
  review,
  reviewSubmitting,
  reviews,
  session,
  mode = 'full',
  template,
  turnInput,
  turnSubmitting,
  turns,
  workspace,
}: {
  artifact: LocalArtifact | null
  artifactCopy: { name: string, outputKind: string } | null
  artifactPreview: ArtifactPreviewState
  artifacts: LocalArtifact[]
  collapsed?: boolean
  copy: WorkerMessages
  engineReadiness: EngineReadiness
  events: LocalSessionEvent[]
  lessonBusyId: string | null
  lessons: LocalLesson[]
  locale: SupportedLocale
  onLessonStatus: (lesson: LocalLesson, status: LocalLessonStatus) => void
  onReview: () => void
  onSubmitTurn: (event: FormEvent<HTMLFormElement>) => void
  onTurnInputChange: (value: string) => void
  progress: SessionProgressSummary | null
  review: LocalReview | null
  reviewSubmitting: boolean
  reviews: LocalReview[]
  session: LocalSession | null
  mode?: 'artifact' | 'full'
  template: CapabilityTemplate | null
  turnInput: string
  turnSubmitting: boolean
  turns: LocalTurn[]
  workspace: LocalWorkspace | null
}) {
  const templateCopy = template ? displayTemplate(template, locale) : null
  const recentEvents = events.slice(-6).reverse()

  if (collapsed) {
    return (
      <aside className="artifact-rail session-panel collapsed" aria-hidden="true" />
    )
  }

  return (
    <aside className="artifact-rail session-panel" aria-label={copy.accessibility.businessArtifactPreview}>
      <header className="artifact-rail-head">
        <div className="artifact-rail-title">
          <MessageSquare aria-hidden="true" size={14} />
          <strong>{copy.workspace.sessionDetail}</strong>
        </div>
      </header>

      {workspace && session
        ? (
            <>
              <section className="session-summary">
                <div>
                  <span className="kicker">{copy.workspace.selectedWorkspace}</span>
                  <h2>{workspace.name}</h2>
                </div>
                <StudioStatusPill active className="artifact-rail-status-pill" icon={<Circle size={10} />}>
                  {formatStatus(session.status, locale)}
                </StudioStatusPill>
              </section>

              <section className="rail-metadata">
                <strong>{templateCopy?.name ?? session.capabilityTemplateId}</strong>
                <small>{templateCopy?.outputKind ?? session.capabilityTemplateId}</small>
                <small>{copy.workspace.updated(formatRelativeTime(session.updatedAt, locale))}</small>
              </section>

              {progress ? <SessionProgressPanel compact className="artifact-session-progress" progress={progress} /> : null}

              {mode === 'full'
                ? (
                    <section className="turn-composer">
                      <StudioSectionHeader
                        className="section-head compact"
                        title={copy.workspace.continueSession}
                        description={engineReadiness.detail}
                      />
                      <form onSubmit={onSubmitTurn}>
                        <textarea
                          aria-label={copy.workspace.followUpInput}
                          placeholder={copy.workspace.followUpPlaceholder}
                          value={turnInput}
                          onChange={event => onTurnInputChange(event.target.value)}
                        />
                        <button className="primary" type="submit" disabled={!turnInput.trim() || turnSubmitting || !engineReadiness.ready}>
                          <Send aria-hidden="true" size={13} />
                          <span>{turnSubmitting ? copy.workspace.sendingTurn : copy.workspace.sendTurn}</span>
                        </button>
                      </form>
                    </section>
                  )
                : null}

              <section className="artifact-panel">
                <StudioSectionHeader
                  className="artifact-section-head"
                  icon={<Eye size={14} />}
                  title={copy.artifact.label}
                  description={copy.workspace.artifactCount(artifacts.length)}
                />
                {artifact
                  ? (
                      <>
                        <div className="rail-metadata">
                          <strong>{artifactCopy?.name ?? artifact.title}</strong>
                          <small>{artifactCopy?.outputKind ?? artifact.kind}</small>
                          <small>{artifact.path}</small>
                        </div>
                        {artifactPreview.loading ? <div className="artifact-preview-state">{copy.artifact.loading}</div> : null}
                        {artifactPreview.error ? <div className="artifact-preview-state" role="alert">{artifactPreview.error}</div> : null}
                        {!artifactPreview.loading && !artifactPreview.error
                          ? <pre className="artifact-preview">{artifactPreview.content}</pre>
                          : null}
                      </>
                    )
                  : (
                      <div className="artifact-preview-state">{progress?.previewDetail ?? copy.artifact.empty}</div>
                    )}
              </section>

              {mode === 'full'
                ? (
                    <details className="session-subpanel compact-details">
                      <summary className="artifact-section-head">
                        <span className="artifact-summary-icon" aria-hidden="true">
                          <MessageSquare size={14} />
                        </span>
                        <div>
                          <strong>{copy.workspace.turnHistory}</strong>
                          <small>{copy.workspace.turnCount(turns.length)}</small>
                        </div>
                      </summary>
                      {turns.length > 0
                        ? (
                            <div className="turn-list">
                              {turns.map(turn => (
                                <StudioActivityRow
                                  key={turn.id}
                                  className="turn-row"
                                  title={formatStatus(turn.status, locale)}
                                  detail={turn.input}
                                  meta={turn.seq}
                                >
                                  {turn.error ? <small className="danger-text">{turn.error}</small> : null}
                                </StudioActivityRow>
                              ))}
                            </div>
                          )
                        : <div className="artifact-preview-state">{copy.workspace.noTurns}</div>}
                    </details>
                  )
                : null}

              <section className="session-subpanel">
                <StudioSectionHeader
                  className="artifact-section-head"
                  icon={<ClipboardCheck size={14} />}
                  title={copy.artifact.review}
                  description={review ? formatReviewVerdict(review.verdict, locale) : copy.artifact.reviewCount(reviews.length)}
                />
                {review
                  ? (
                      <div className="review-list">
                        {reviewItems(review).map(item => <span key={item}>{item}</span>)}
                      </div>
                    )
                  : artifact
                    ? (
                        <button type="button" className="ghost review-action" disabled={reviewSubmitting} onClick={onReview}>
                          <ClipboardCheck aria-hidden="true" size={13} />
                          <span>{reviewSubmitting ? copy.workspace.requestingReview : copy.workspace.requestReview}</span>
                        </button>
                      )
                    : <div className="artifact-preview-state">{copy.workspace.reviewWaiting}</div>}
              </section>

              <section className="session-subpanel memory-subpanel">
                <StudioSectionHeader
                  className="artifact-section-head"
                  icon={<Sparkles size={14} />}
                  title={copy.workspace.memoryCandidates}
                  description={copy.artifact.memoryCandidates(lessons.length)}
                />
                {lessons.length > 0
                  ? (
                      <div className="memory-list">
                        {lessons.map(lesson => (
                          <article key={lesson.id} className="memory-row">
                            <div>
                              <strong>{formatLessonStatus(lesson.status, copy)}</strong>
                              <span>{lesson.statement}</span>
                            </div>
                            <div className="memory-actions">
                              <button type="button" className="ghost" disabled={lessonBusyId === lesson.id || lesson.status === 'accepted'} onClick={() => onLessonStatus(lesson, 'accepted')}>
                                {copy.workspace.accept}
                              </button>
                              <button type="button" className="ghost" disabled={lessonBusyId === lesson.id || lesson.status === 'rejected'} onClick={() => onLessonStatus(lesson, 'rejected')}>
                                {copy.workspace.reject}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )
                  : <div className="artifact-preview-state">{copy.workspace.noMemoryCandidates}</div>}
              </section>

              <details className="session-subpanel compact-details">
                <summary className="artifact-section-head">
                  <span className="artifact-summary-icon" aria-hidden="true">
                    <Terminal size={14} />
                  </span>
                  <div>
                    <strong>{copy.workspace.eventStream}</strong>
                    <small>{copy.workspace.eventCount(events.length)}</small>
                  </div>
                </summary>
                {recentEvents.length > 0
                  ? (
                      <div className="event-list">
                        {recentEvents.map(event => (
                          <StudioActivityRow
                            key={event.id}
                            className="event-row"
                            title={event.type}
                            meta={formatRelativeTime(event.createdAt, locale)}
                          />
                        ))}
                      </div>
                    )
                  : <div className="artifact-preview-state">{copy.workspace.noEvents}</div>}
              </details>
            </>
          )
        : (
            <StudioEmptyState
              className="empty-session-state"
              icon={<FileText size={22} />}
              title={copy.workspace.noSelectionTitle}
              detail={copy.workspace.noSelectionDetail}
            />
          )}
    </aside>
  )
}

function reviewItems(review: LocalReview): string[] {
  const findings = review.findingsJson.map(item => String(item.message ?? item.summary ?? JSON.stringify(item)))
  const risks = review.risksJson.map(item => String(item.message ?? item.summary ?? JSON.stringify(item)))
  return [...findings, ...risks].filter(Boolean)
}

function formatLessonStatus(status: LocalLessonStatus, copy: WorkerMessages): string {
  if (status === 'accepted')
    return copy.workspace.accepted
  if (status === 'rejected')
    return copy.workspace.rejected
  return copy.workspace.proposed
}
