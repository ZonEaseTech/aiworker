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
import type { messagesFor, SupportedLocale } from './i18n'

import { ChevronLeft, ChevronRight, Circle, ClipboardCheck, Eye, FileText, MessageSquare, RefreshCw, Send, Settings, Sparkles, Terminal } from 'lucide-react'

import {
  displayTemplate,
  formatRelativeTime,
  formatReviewVerdict,
  formatStatus,
} from './i18n'

export interface ArtifactPreviewState {
  artifactId: string | null
  content: string
  error: string | null
  loading: boolean
}

export interface EngineReadiness {
  detail: string
  label: string
  ready: boolean
}

type WorkerMessages = ReturnType<typeof messagesFor>
type SettingsSection = 'execution' | 'soul-packs' | 'connectors' | 'mcp' | 'external-mcp' | 'language' | 'appearance' | 'about'

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
  onCollapsedChange,
  onOpenSettings,
  onRefresh,
  onReview,
  onSubmitTurn,
  onTurnInputChange,
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
  onCollapsedChange?: (collapsed: boolean) => void
  onOpenSettings: (section?: SettingsSection) => void
  onRefresh: () => void
  onReview: () => void
  onSubmitTurn: (event: FormEvent<HTMLFormElement>) => void
  onTurnInputChange: (value: string) => void
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
      <aside className="artifact-rail session-panel collapsed" aria-label={copy.accessibility.businessArtifactPreview}>
        <button
          type="button"
          className="drawer-restore"
          aria-label={copy.accessibility.expandSessionDetail}
          title={copy.accessibility.expandSessionDetail}
          onClick={() => onCollapsedChange?.(false)}
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
      </aside>
    )
  }

  return (
    <aside className="artifact-rail session-panel" aria-label={copy.accessibility.businessArtifactPreview}>
      <header className="artifact-rail-head">
        <div className="artifact-rail-title">
          <MessageSquare aria-hidden="true" size={14} />
          <strong>{copy.workspace.sessionDetail}</strong>
        </div>
        <div className="artifact-rail-head-actions">
          <button type="button" className="artifact-rail-collapse" aria-label={copy.accessibility.refreshWorkspace} onClick={onRefresh}>
            <RefreshCw size={14} />
          </button>
          <button type="button" className="artifact-rail-collapse" aria-label={copy.accessibility.artifactSettings} onClick={() => onOpenSettings('execution')}>
            <Settings size={14} />
          </button>
          <button
            type="button"
            className="artifact-rail-collapse"
            aria-label={copy.accessibility.collapseSessionDetail}
            title={copy.accessibility.collapseSessionDetail}
            onClick={() => onCollapsedChange?.(true)}
          >
            <ChevronRight size={14} />
          </button>
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
                <span className="artifact-rail-status-pill">
                  <Circle aria-hidden="true" size={10} />
                  <span>{formatStatus(session.status, locale)}</span>
                </span>
              </section>

              <section className="rail-metadata">
                <strong>{templateCopy?.name ?? session.capabilityTemplateId}</strong>
                <small>{templateCopy?.outputKind ?? session.capabilityTemplateId}</small>
                <small>{copy.workspace.updated(formatRelativeTime(session.updatedAt, locale))}</small>
              </section>

              {mode === 'full'
                ? (
                    <section className="turn-composer">
                      <div className="section-head compact">
                        <div>
                          <h3>{copy.workspace.continueSession}</h3>
                          <p className="hint">{engineReadiness.detail}</p>
                        </div>
                      </div>
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
                <div className="artifact-section-head">
                  <div>
                    <strong>{copy.artifact.label}</strong>
                    <small>{copy.workspace.artifactCount(artifacts.length)}</small>
                  </div>
                  <Eye aria-hidden="true" size={14} />
                </div>
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
                      <div className="artifact-preview-state">{copy.artifact.empty}</div>
                    )}
              </section>

              {mode === 'full'
                ? (
                    <details className="session-subpanel compact-details">
                      <summary className="artifact-section-head">
                        <div>
                          <strong>{copy.workspace.turnHistory}</strong>
                          <small>{copy.workspace.turnCount(turns.length)}</small>
                        </div>
                        <MessageSquare aria-hidden="true" size={14} />
                      </summary>
                      {turns.length > 0
                        ? (
                            <div className="turn-list">
                              {turns.map(turn => (
                                <article key={turn.id} className="turn-row">
                                  <span>{turn.seq}</span>
                                  <div>
                                    <strong>{formatStatus(turn.status, locale)}</strong>
                                    <small>{turn.input}</small>
                                    {turn.error ? <small className="danger-text">{turn.error}</small> : null}
                                  </div>
                                </article>
                              ))}
                            </div>
                          )
                        : <div className="artifact-preview-state">{copy.workspace.noTurns}</div>}
                    </details>
                  )
                : null}

              <section className="session-subpanel">
                <div className="artifact-section-head">
                  <div>
                    <strong>{copy.artifact.review}</strong>
                    <small>{review ? formatReviewVerdict(review.verdict, locale) : copy.artifact.reviewCount(reviews.length)}</small>
                  </div>
                  <ClipboardCheck aria-hidden="true" size={14} />
                </div>
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
                <div className="artifact-section-head">
                  <div>
                    <strong>{copy.workspace.memoryCandidates}</strong>
                    <small>{copy.artifact.memoryCandidates(lessons.length)}</small>
                  </div>
                  <Sparkles aria-hidden="true" size={14} />
                </div>
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
                  <div>
                    <strong>{copy.workspace.eventStream}</strong>
                    <small>{copy.workspace.eventCount(events.length)}</small>
                  </div>
                  <Terminal aria-hidden="true" size={14} />
                </summary>
                {recentEvents.length > 0
                  ? (
                      <div className="event-list">
                        {recentEvents.map(event => (
                          <article key={event.id} className="event-row">
                            <strong>{event.type}</strong>
                            <small>{formatRelativeTime(event.createdAt, locale)}</small>
                          </article>
                        ))}
                      </div>
                    )
                  : <div className="artifact-preview-state">{copy.workspace.noEvents}</div>}
              </details>
            </>
          )
        : (
            <div className="empty-session-state">
              <FileText aria-hidden="true" size={22} />
              <strong>{copy.workspace.noSelectionTitle}</strong>
              <span>{copy.workspace.noSelectionDetail}</span>
            </div>
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
