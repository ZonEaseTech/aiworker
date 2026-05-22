import type {
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type { FormEvent, ReactNode } from 'react'
import type { messagesFor, SupportedLocale } from '../features/i18n'
import type { CapabilityTemplate } from '../features/local-workspace/types.compat'
import type { EngineReadiness } from '../features/session/engine-readiness'
import type { SessionProgressSummary } from './session-progress'
import type { SessionTurnDraft } from './session-turn-composer'

import {
  CircleIcon,
  File02Icon,
  Message02Icon,
  TerminalIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@zonease/aiworker-ui/components/collapsible'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { cn } from '@zonease/aiworker-ui/lib/utils'
import { useMemo } from 'react'
import {
  displayTemplate,
  formatRelativeTime,
  formatStatus,
} from '../features/i18n'

import {
  normalizeSessionEvents,
  summarizeSessionUsage,
} from '../features/session/session-view-model'
import { StudioEmptyState } from './components/studio-shell'
import { SessionProgressPanel } from './session-progress-panel'
import { SessionTurnComposer } from './session-turn-composer'

type WorkerMessages = ReturnType<typeof messagesFor>

export function SessionDetail({
  collapsed = false,
  copy,
  engineReadiness,
  events,
  locale,
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
  collapsed?: boolean
  copy: WorkerMessages
  engineReadiness: EngineReadiness
  events: LocalSessionEvent[]
  locale: SupportedLocale
  onSubmitTurn: (event: FormEvent<HTMLFormElement>, draft?: SessionTurnDraft) => void
  onTurnInputChange: (value: string) => void
  progress: SessionProgressSummary | null
  session: LocalSession | null
  template: CapabilityTemplate | null
  turnInput: string
  turnSubmitting: boolean
  turns: LocalTurn[]
  workspace: LocalWorkspace | null
}) {
  const templateCopy = template ? displayTemplate(template, locale) : null
  const recentEvents = events.slice(-6).reverse()
  const normalizedEvents = useMemo(() => normalizeSessionEvents(events, { parser: 'codex-cli' }), [events])
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

  if (collapsed) {
    return (
      <aside
        className="w-0 max-w-0 overflow-hidden p-0 opacity-0 pointer-events-none"
        data-slot="artifact-rail"
        data-state="collapsed"
        data-testid="artifact-rail-collapsed"
        aria-hidden="true"
      />
    )
  }

  return (
    <aside
      className="relative flex min-h-0 w-80 min-w-0 flex-none flex-col gap-3 overflow-y-auto p-3 transition-all max-md:h-48 max-md:w-full"
      data-slot="artifact-rail"
      data-state="expanded"
      aria-label={copy.accessibility.businessArtifactPreview}
    >
      <Item variant="default" size="xs" className="px-0 py-0" data-testid="artifact-rail-heading">
        <ItemMedia variant="icon" aria-hidden="true">
          <HugeiconsIcon icon={Message02Icon} strokeWidth={2} data-icon="inline-start" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{copy.workspace.sessionDetail}</ItemTitle>
        </ItemContent>
      </Item>

      {workspace && session
        ? (
            <SessionDetailPanel
              summary={(
                <ItemGroup className="gap-3">
                  <Item variant="default" size="xs" className="items-start px-0 py-0" data-testid="artifact-rail-summary-heading">
                    <ItemContent className="min-w-0 gap-0.5">
                      <ItemDescription>{copy.workspace.selectedWorkspace}</ItemDescription>
                      <ItemTitle asChild size="base" className="max-w-full">
                        <h2>{workspace.name}</h2>
                      </ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <Badge data-testid="artifact-rail-status" variant="secondary">
                        <HugeiconsIcon icon={CircleIcon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
                        {formatStatus(session.status, locale)}
                      </Badge>
                    </ItemActions>
                  </Item>

                  <Item variant="muted" size="xs">
                    <ItemContent>
                      <ItemTitle>{templateCopy?.name ?? session.capabilityTemplateId}</ItemTitle>
                      <ItemDescription>{templateCopy?.outputKind ?? session.capabilityTemplateId}</ItemDescription>
                      <ItemDescription>{copy.workspace.updated(formatRelativeTime(session.updatedAt, locale))}</ItemDescription>
                    </ItemContent>
                  </Item>

                  {progress ? <SessionProgressPanel compact progress={progress} /> : null}
                </ItemGroup>
              )}
              composer={(
                <SessionTurnComposer
                  className="min-w-0"
                  copy={copy}
                  description={engineReadiness.detail}
                  engineReadiness={engineReadiness}
                  submitting={composerBusy}
                  title={copy.workspace.continueSession}
                  usage={composerUsage}
                  value={turnInput}
                  variant="compact"
                  onSubmit={onSubmitTurn}
                  onValueChange={onTurnInputChange}
                />
              )}
              history={(
                <SessionDetailDisclosure
                  icon={<HugeiconsIcon icon={Message02Icon} strokeWidth={2} aria-hidden="true" />}
                  title={copy.workspace.turnHistory}
                  detail={copy.workspace.turnCount(turns.length)}
                >
                  {turns.length > 0
                    ? (
                        <ItemGroup className="gap-2">
                          {turns.map(turn => (
                            <StudioActivityRow
                              key={turn.id}
                              title={formatStatus(turn.status, locale)}
                              detail={turn.input}
                              meta={turn.seq}
                            >
                              {turn.error ? <ItemDescription tone="destructive">{turn.error}</ItemDescription> : null}
                            </StudioActivityRow>
                          ))}
                        </ItemGroup>
                      )
                    : <Item variant="muted" size="xs"><ItemContent><ItemDescription>{copy.workspace.noTurns}</ItemDescription></ItemContent></Item>}
                </SessionDetailDisclosure>
              )}
              eventStream={(
                <SessionDetailDisclosure
                  icon={<HugeiconsIcon icon={TerminalIcon} strokeWidth={2} aria-hidden="true" />}
                  title={copy.workspace.eventStream}
                  detail={copy.workspace.eventCount(events.length)}
                >
                  {recentEvents.length > 0
                    ? (
                        <ItemGroup className="gap-2">
                          {recentEvents.map(event => (
                            <StudioActivityRow
                              key={event.id}
                              title={event.type}
                              meta={formatRelativeTime(event.createdAt, locale)}
                            />
                          ))}
                        </ItemGroup>
                      )
                    : <Item variant="muted" size="xs"><ItemContent><ItemDescription>{copy.workspace.noEvents}</ItemDescription></ItemContent></Item>}
                </SessionDetailDisclosure>
              )}
            />
          )
        : (
            <StudioEmptyState
              className="min-h-56"
              icon={<HugeiconsIcon icon={File02Icon} strokeWidth={2} aria-hidden="true" />}
              title={copy.workspace.noSelectionTitle}
              detail={copy.workspace.noSelectionDetail}
            />
          )}
    </aside>
  )
}

function SessionDetailPanel({
  className,
  composer,
  eventStream,
  history,
  summary,
}: {
  className?: string
  composer?: ReactNode
  eventStream?: ReactNode
  history?: ReactNode
  summary?: ReactNode
}) {
  return (
    <ItemGroup className={cn('gap-3', className)} data-testid="session-detail-panel">
      {summary ? <section>{summary}</section> : null}
      {composer ? <section>{composer}</section> : null}
      {history ? <section>{history}</section> : null}
      {eventStream ? <section>{eventStream}</section> : null}
    </ItemGroup>
  )
}

function SessionDetailDisclosure({
  children,
  detail,
  icon,
  title,
}: {
  children: ReactNode
  detail?: ReactNode
  icon: ReactNode
  title: ReactNode
}) {
  return (
    <Collapsible data-session-slot="detail-disclosure">
      <CollapsibleTrigger asChild>
        <Item asChild variant="muted" size="sm" className="min-w-0 flex-nowrap items-start">
          <button type="button">
            <ItemMedia variant="icon">{icon}</ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="max-w-full">{title}</ItemTitle>
              {detail ? <ItemDescription className="max-w-full">{detail}</ItemDescription> : null}
            </ItemContent>
          </button>
        </Item>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pl-7">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

function StudioActivityRow({
  children,
  className,
  detail,
  meta,
  title,
}: {
  children?: ReactNode
  className?: string
  detail?: ReactNode
  meta?: ReactNode
  title: ReactNode
}) {
  return (
    <Item variant="muted" size="xs" className={cn('min-w-0 flex-nowrap items-start justify-between', className)}>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        {detail ? <ItemDescription>{detail}</ItemDescription> : null}
        {children}
      </ItemContent>
      {meta ? <ItemDescription asChild><span>{meta}</span></ItemDescription> : null}
    </Item>
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
