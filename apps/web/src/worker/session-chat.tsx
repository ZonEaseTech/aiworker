import type {
  CapabilityTemplate,
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { messagesFor, SupportedLocale } from '../features/i18n'
import type { EngineReadiness } from '../features/session/engine-readiness'
import type { SessionProgressSummary } from './session-progress'
import type { SessionTurnDraft } from './session-turn-composer'

import {
  createSessionTimelineViewModel,
  IconButton,
  MessageFlow,
  MessageRow,
  normalizeSessionEvents,
  SessionTimeline,
  StatusEventPill,
  summarizeSessionUsage,
} from '@zonease/aiworker-component'
import {
  ArrowDown,
  ArrowLeft,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Settings,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { displayTemplate, formatRelativeTime, formatStatus } from '../features/i18n'
import { SessionProgressPanel } from './session-progress-panel'
import { SessionTurnComposer } from './session-turn-composer'

type WorkerMessages = ReturnType<typeof messagesFor>

export function WorkerSessionChat({
  copy,
  engineReadiness,
  events,
  locale,
  detailDrawerOpen,
  onBackToWorkspace,
  onOpenSettings,
  onRefresh,
  onToggleDetailDrawer,
  onSubmitTurn,
  onTurnInputChange,
  progress,
  session,
  template,
  turnInput,
  turnSubmitting,
  turns,
  workspace,
}: {
  copy: WorkerMessages
  detailDrawerOpen: boolean
  engineReadiness: EngineReadiness
  events: LocalSessionEvent[]
  locale: SupportedLocale
  onBackToWorkspace: () => void
  onOpenSettings: () => void
  onRefresh: () => void
  onToggleDetailDrawer: () => void
  onSubmitTurn: (event: FormEvent<HTMLFormElement>, draft?: SessionTurnDraft) => void
  onTurnInputChange: (value: string) => void
  progress: SessionProgressSummary
  session: LocalSession
  template: CapabilityTemplate | null
  turnInput: string
  turnSubmitting: boolean
  turns: LocalTurn[]
  workspace: LocalWorkspace
}) {
  const logRef = useRef<HTMLDivElement | null>(null)
  const didInitialScrollRef = useRef(false)
  const pinnedToBottomRef = useRef(true)
  const [scrolledFromBottom, setScrolledFromBottom] = useState(false)
  const templateCopy = template ? displayTemplate(template, locale) : null
  const normalizedEvents = useMemo(() => normalizeSessionEvents(events, { parser: 'codex-cli' }), [events])
  const timeline = useMemo(() => createSessionTimelineViewModel({
    events: normalizedEvents,
    turns,
  }), [normalizedEvents, turns])
  const usage = useMemo(() => summarizeSessionUsage(normalizedEvents), [normalizedEvents])
  const composerUsage = usage && (usage.inputTokens != null || usage.outputTokens != null)
    ? {
        ariaLabel: `Usage ${formatUsagePair(usage.inputTokens, usage.outputTokens)}`,
        label: 'Usage',
        title: `Usage ${formatUsagePair(usage.inputTokens, usage.outputTokens)}`,
        value: formatUsagePair(usage.inputTokens, usage.outputTokens),
      }
    : undefined

  useEffect(() => {
    didInitialScrollRef.current = false
    pinnedToBottomRef.current = true
  }, [session.id])

  useEffect(() => {
    const el = logRef.current
    if (!el || didInitialScrollRef.current || (timeline.turns.length === 0 && events.length === 0))
      return
    didInitialScrollRef.current = true
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      pinnedToBottomRef.current = true
      setScrolledFromBottom(false)
    })
  }, [events.length, session.id, timeline.turns.length])

  useEffect(() => {
    const el = logRef.current
    if (!el)
      return
    if (!pinnedToBottomRef.current)
      return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      setScrolledFromBottom(false)
    })
  }, [timeline, turnSubmitting])

  useEffect(() => {
    const el = logRef.current
    if (!el)
      return
    const onScroll = () => {
      const target = logRef.current
      if (!target)
        return
      const distance = target.scrollHeight - target.scrollTop - target.clientHeight
      pinnedToBottomRef.current = distance < 80
      setScrolledFromBottom(distance > 140)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  function jumpToBottom() {
    const el = logRef.current
    if (!el)
      return
    pinnedToBottomRef.current = true
    el.scrollTo({ behavior: 'smooth', top: el.scrollHeight })
    setScrolledFromBottom(false)
  }

  return (
    <section className="worker-chat-pane" aria-label={copy.workspace.sessionDetail}>
      <header className="worker-chat-header">
        <div className="worker-chat-title">
          <span className="kicker">{copy.workspace.selectedWorkspace}</span>
          <h1>{workspace.name}</h1>
          <div className="worker-chat-meta">
            <span>{templateCopy?.name ?? session.capabilityTemplateId}</span>
            <span>{formatStatus(session.status, locale)}</span>
            <span>{copy.workspace.updated(formatRelativeTime(session.updatedAt, locale))}</span>
          </div>
          <SessionProgressPanel compact className="worker-chat-progress" progress={progress} />
        </div>
        <div className="worker-chat-actions">
          <IconButton aria-label={copy.workspace.backToWorkspace} title={copy.workspace.backToWorkspace} onClick={onBackToWorkspace}>
            <ArrowLeft aria-hidden="true" size={16} />
          </IconButton>
          <IconButton aria-label={copy.accessibility.refreshWorkspace} onClick={onRefresh}>
            <RefreshCw aria-hidden="true" size={16} />
          </IconButton>
          <IconButton aria-label={copy.accessibility.openSettings} onClick={onOpenSettings}>
            <Settings aria-hidden="true" size={16} />
          </IconButton>
          <IconButton
            aria-label={detailDrawerOpen ? copy.accessibility.collapseSessionDetail : copy.accessibility.expandSessionDetail}
            aria-pressed={detailDrawerOpen}
            className={detailDrawerOpen ? 'session-detail-toggle active' : 'session-detail-toggle'}
            title={detailDrawerOpen ? copy.accessibility.collapseSessionDetail : copy.accessibility.expandSessionDetail}
            onClick={onToggleDetailDrawer}
          >
            {detailDrawerOpen
              ? <PanelRightClose aria-hidden="true" size={16} />
              : <PanelRightOpen aria-hidden="true" size={16} />}
          </IconButton>
        </div>
      </header>

      <div className="worker-chat-log-wrap">
        <div ref={logRef} className="worker-chat-log" data-testid="worker-chat-log">
          {timeline.turns.length > 0
            ? (
                <SessionTimeline
                  assistantRoleLabel={copy.workspace.engineRole}
                  assistantTimestampForTurn={turn => formatStatus(turn.status, locale)}
                  className="worker-session-timeline"
                  operatorRoleLabel={copy.workspace.operatorRole}
                  placeholderForTurn={turn => turn.status === 'running' ? <WaitingPill detail={copy.workspace.engineStarting} /> : null}
                  timestampForTurn={turn => turn.createdAt ? formatRelativeTime(turn.createdAt, locale) : undefined}
                  turns={timeline.turns}
                />
              )
            : (
                <div className="worker-chat-empty">
                  <MessageSquare aria-hidden="true" size={24} />
                  <strong>{copy.workspace.noTurns}</strong>
                  <span>{engineReadiness.detail}</span>
                </div>
              )}
          {turnSubmitting && timeline.turns.every(({ turn }) => turn.status !== 'running')
            ? <AssistantWaiting detail={engineReadiness.detail} role={copy.workspace.engineRole} />
            : null}
        </div>

        {scrolledFromBottom
          ? (
              <button type="button" className="worker-chat-jump" onClick={jumpToBottom}>
                <ArrowDown aria-hidden="true" size={14} />
                <span>{copy.workspace.latest}</span>
              </button>
            )
          : null}
      </div>

      <SessionTurnComposer
        className="worker-composer"
        copy={copy}
        engineReadiness={engineReadiness}
        usage={composerUsage}
        value={turnInput}
        submitting={turnSubmitting}
        variant="compact"
        onSubmit={onSubmitTurn}
        onValueChange={onTurnInputChange}
      />
    </section>
  )
}

function formatUsagePair(inputTokens?: number, outputTokens?: number): string {
  return [inputTokens, outputTokens]
    .map(value => value == null ? '0' : String(value))
    .join(' / ')
}

function AssistantWaiting({ detail, role }: { detail: string, role: string }) {
  return (
    <MessageRow className="session-message assistant" roleLabel={role}>
      <MessageFlow className="session-assistant-flow">
        <WaitingPill detail={detail} />
      </MessageFlow>
    </MessageRow>
  )
}

function WaitingPill({ detail }: { detail: string }) {
  return (
    <StatusEventPill className="session-status-pill" tone="success">{detail}</StatusEventPill>
  )
}
