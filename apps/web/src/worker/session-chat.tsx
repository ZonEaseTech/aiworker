import type {
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { messagesFor, SupportedLocale } from '../features/i18n'
import type { CapabilityTemplate } from '../features/local-workspace/types.compat'
import type { EngineReadiness } from '../features/session/engine-readiness'
import type { SessionProgressSummary } from './session-progress'
import type { SessionTurnDraft } from './session-turn-composer'

import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  Message02Icon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  RefreshIcon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { ScrollArea } from '@zonease/aiworker-ui/components/scroll-area'
import { useEffect, useMemo, useRef, useState } from 'react'
import { displayTemplate, formatRelativeTime, formatStatus } from '../features/i18n'
import { MessageFlow, MessageRow, StatusEventPill } from '../features/session/message-flow'
import { SessionTimeline } from '../features/session/session-timeline'
import {
  createSessionTimelineViewModel,
  normalizeSessionEvents,
  summarizeSessionUsage,
} from '../features/session/session-view-model'
import { StudioChromeHeader, StudioEmptyState, StudioTitleBlock } from './components/studio-shell'
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
        ariaLabel: formatUsageLabel(usage.inputTokens, usage.outputTokens),
        label: 'Usage',
        meterValue: usageMeterValue(usage.inputTokens, usage.outputTokens),
        title: formatUsageLabel(usage.inputTokens, usage.outputTokens),
        value: formatUsageValue(usage.inputTokens, usage.outputTokens),
      }
    : undefined
  const composerBusy = turnSubmitting || turns.some(turn => turn.status === 'running')

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
    <section
      className="relative flex h-full min-h-0 min-w-0 flex-col transition-colors"
      data-session-slot="session-chat-pane"
      data-testid="worker-chat-pane"
      aria-label={copy.workspace.sessionDetail}
    >
      <StudioChromeHeader
        data-testid="worker-chat-header"
        actionProps={{ 'className': 'max-md:justify-end', 'data-testid': 'worker-chat-actions' }}
        actions={(
          <>
            <Button type="button" variant="ghost" size="icon" aria-label={copy.workspace.backToWorkspace} title={copy.workspace.backToWorkspace} onClick={onBackToWorkspace}>
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={copy.accessibility.refreshWorkspace} onClick={onRefresh}>
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={copy.accessibility.openSettings} onClick={onOpenSettings}>
              <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button
              aria-label={detailDrawerOpen ? copy.accessibility.collapseSessionDetail : copy.accessibility.expandSessionDetail}
              aria-pressed={detailDrawerOpen}
              size="icon"
              title={detailDrawerOpen ? copy.accessibility.collapseSessionDetail : copy.accessibility.expandSessionDetail}
              type="button"
              variant="ghost"
              onClick={onToggleDetailDrawer}
            >
              {detailDrawerOpen
                ? <HugeiconsIcon icon={PanelRightCloseIcon} strokeWidth={2} aria-hidden="true" />
                : <HugeiconsIcon icon={PanelRightOpenIcon} strokeWidth={2} aria-hidden="true" />}
            </Button>
          </>
        )}
        className="min-w-0 max-w-full px-6 py-3 transition-colors max-md:min-h-0 max-md:flex-col max-md:items-stretch max-md:px-4 max-md:py-2.5"
      >
        <StudioTitleBlock
          kicker={copy.workspace.selectedWorkspace}
          title={workspace.name}
          meta={(
            <>
              <span>{templateCopy?.name ?? session.capabilityTemplateId}</span>
              <span>{formatStatus(session.status, locale)}</span>
              <span>{copy.workspace.updated(formatRelativeTime(session.updatedAt, locale))}</span>
              <Badge variant={progress.tone === 'risk' ? 'destructive' : 'outline'}>
                {progress.label}
              </Badge>
            </>
          )}
        />
      </StudioChromeHeader>

      <ScrollArea
        className="min-h-0 min-w-0 flex-1"
        overlay={scrolledFromBottom
          ? (
              <Button type="button" variant="secondary" size="sm" className="absolute right-6 bottom-4" onClick={jumpToBottom}>
                <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-start" />
                <span>{copy.workspace.latest}</span>
              </Button>
            )
          : null}
        viewportClassName="flex min-h-0 min-w-0 scroll-smooth flex-col gap-4 px-6 pt-5 pb-6 transition-all max-md:px-4"
        viewportProps={{
          'data-session-slot': 'session-chat-log',
          'data-testid': 'worker-chat-log',
        }}
        viewportRef={logRef}
        data-session-slot="session-chat-log-frame"
      >
        {timeline.turns.length > 0
          ? (
              <SessionTimeline
                assistantRoleLabel={copy.workspace.engineRole}
                assistantTimestampForTurn={turn => formatStatus(turn.status, locale)}
                className="min-w-0"
                operatorRoleLabel={copy.workspace.operatorRole}
                placeholderForTurn={turn => turn.status === 'running' ? <WaitingPill detail={copy.workspace.engineStarting} /> : null}
                timestampForTurn={turn => turn.createdAt ? formatRelativeTime(turn.createdAt, locale) : undefined}
                turns={timeline.turns}
              />
            )
          : (
              <StudioEmptyState
                className="min-h-64"
                icon={<HugeiconsIcon icon={Message02Icon} strokeWidth={2} aria-hidden="true" />}
                title={copy.workspace.noTurns}
                detail={engineReadiness.detail}
              />
            )}
        {turnSubmitting && timeline.turns.every(({ turn }) => turn.status !== 'running')
          ? <AssistantWaiting detail={engineReadiness.detail} role={copy.workspace.engineRole} />
          : null}
      </ScrollArea>

      <SessionTurnComposer
        className="min-w-0 max-w-full px-6 pt-3 pb-4 max-md:px-4"
        copy={copy}
        engineReadiness={engineReadiness}
        usage={composerUsage}
        value={turnInput}
        submitting={composerBusy}
        variant="compact"
        onSubmit={onSubmitTurn}
        onValueChange={onTurnInputChange}
      />
    </section>
  )
}

function formatUsageLabel(inputTokens?: number, outputTokens?: number): string {
  return `Usage ${formatTokenCount(inputTokens)} input tokens, ${formatTokenCount(outputTokens)} output tokens`
}

function formatUsageValue(inputTokens?: number, outputTokens?: number): string {
  return `${formatCompactTokenCount(inputTokens)} in / ${formatCompactTokenCount(outputTokens)} out`
}

function formatTokenCount(value?: number): string {
  return value == null ? '0' : value.toLocaleString('en-US')
}

function formatCompactTokenCount(value?: number): string {
  if (value == null)
    return '0'
  if (value >= 1000)
    return `${Number((value / 1000).toFixed(value >= 10000 ? 0 : 1))}K`
  return String(value)
}

function usageMeterValue(inputTokens?: number, outputTokens?: number): number | undefined {
  const input = inputTokens ?? 0
  const output = outputTokens ?? 0
  const total = input + output
  return total > 0 ? input / total : undefined
}

function AssistantWaiting({ detail, role }: { detail: string, role: string }) {
  return (
    <MessageRow roleLabel={role}>
      <MessageFlow>
        <WaitingPill detail={detail} />
      </MessageFlow>
    </MessageRow>
  )
}

function WaitingPill({ detail }: { detail: string }) {
  return (
    <StatusEventPill tone="success">{detail}</StatusEventPill>
  )
}
