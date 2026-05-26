import type { ReactNode } from 'react'
import type { SessionTimelineActivityEvent, SessionTimelineEvent, SessionTimelineTurnViewModel } from './session-view-model'

import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  CodeSquareIcon,
  File02Icon,
  ListTreeIcon,
  PlayIcon,
  Search01Icon,
  TerminalIcon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@zonease/aiworker-ui/components/collapsible'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { cn } from '@zonease/aiworker-ui/lib/utils'
import { Fragment } from 'react'
import { MessageFlow, MessageRow, SessionCodeBlock, ToolResultCard } from './message-flow'

export interface SessionTimelineProps {
  assistantRoleLabel: ReactNode
  assistantTimestampForTurn?: (turn: SessionTimelineTurnViewModel['turn']) => ReactNode
  className?: string
  empty?: ReactNode
  operatorRoleLabel: ReactNode
  placeholderForTurn?: (turn: SessionTimelineTurnViewModel['turn']) => ReactNode
  renderEvent?: (event: SessionTimelineEvent) => ReactNode
  timestampForTurn?: (turn: SessionTimelineTurnViewModel['turn']) => ReactNode
  turns: SessionTimelineTurnViewModel[]
}

export function SessionTimeline({
  assistantRoleLabel,
  assistantTimestampForTurn,
  className,
  empty,
  operatorRoleLabel,
  placeholderForTurn,
  renderEvent,
  timestampForTurn,
  turns,
}: SessionTimelineProps) {
  if (turns.length === 0) {
    return (
      <ItemGroup data-session-slot="session-timeline-empty" className="min-h-24">
        {empty}
      </ItemGroup>
    )
  }

  return (
    <ItemGroup data-session-slot="session-timeline" className={cn('min-w-0', className)}>
      {turns.map((item) => {
        const toolResults = collectToolResults(item.events)
        const placeholder = item.events.length === 0 ? placeholderForTurn?.(item.turn) : null
        return (
          <ItemGroup key={item.turn.id} data-session-slot="session-timeline-turn" className="grid min-w-0 gap-3">
            <MessageRow roleLabel={operatorRoleLabel} timestamp={timestampForTurn?.(item.turn)}>
              <Item variant="muted" size="sm">
                <ItemContent>
                  <ItemDescription className="line-clamp-none max-w-full whitespace-pre-wrap">{item.turn.input}</ItemDescription>
                </ItemContent>
              </Item>
            </MessageRow>
            <MessageRow roleLabel={assistantRoleLabel} timestamp={assistantTimestampForTurn?.(item.turn) ?? item.turn.status}>
              <MessageFlow>
                {placeholder}
                {item.events.map(event => (
                  <Fragment key={event.id}>
                    {renderEvent?.(event) ?? <DefaultSessionEvent event={event} toolResult={event.kind === 'tool_use' ? toolResults.get(event.toolUseId) : undefined} />}
                  </Fragment>
                ))}
                {shouldRenderTurnErrorFallback(item.events, item.turn.error)
                  ? <DefaultSessionEvent event={{ id: `error-${item.turn.id}`, kind: 'error', message: item.turn.error!, turnId: item.turn.id }} />
                  : null}
              </MessageFlow>
            </MessageRow>
          </ItemGroup>
        )
      })}
    </ItemGroup>
  )
}

function DefaultSessionEvent({
  event,
  toolResult,
}: {
  event: SessionTimelineEvent
  toolResult?: Extract<SessionTimelineEvent, { kind: 'tool_result' }>
}) {
  if (event.kind === 'text') {
    return (
      <ItemDescription asChild className="line-clamp-none whitespace-pre-wrap">
        <div data-slot="session-event-text">{event.text}</div>
      </ItemDescription>
    )
  }
  if (event.kind === 'thinking')
    return <SessionCodeBlock>{event.text}</SessionCodeBlock>
  if (event.kind === 'log')
    return <SessionLogCard label={event.stream} value={event.chunk} />
  if (event.kind === 'raw')
    return <SessionLogCard label="raw" value={event.line} />
  if (event.kind === 'status')
    return <SessionSignalRow signal={{ ...event, kind: 'signal', label: event.label, signalKind: 'status' }} />
  if (event.kind === 'signal')
    return <SessionSignalRow signal={event} />
  if (event.kind === 'usage')
    return null
  if (event.kind === 'artifact') {
    return (
      <Badge variant="outline" className="max-w-full gap-1">
        <HugeiconsIcon icon={File02Icon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
        <span>{event.kind}</span>
        <small>{event.detail}</small>
      </Badge>
    )
  }
  if (event.kind === 'tool_result')
    return null
  if (event.kind === 'activity')
    return <SessionActivityRow activity={event} />
  if (event.kind === 'activity_group')
    return <SessionActivityGroup group={event} />
  if (event.kind === 'tool_use')
    return <SessionToolCard result={toolResult} tool={event} />
  if (event.kind === 'error') {
    return (
      <Alert variant="destructive">
        <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
        <AlertDescription>{event.message}</AlertDescription>
      </Alert>
    )
  }
  return null
}

function SessionActivityGroup({
  group,
}: {
  group: Extract<SessionTimelineEvent, { kind: 'activity_group' }>
}) {
  return (
    <SessionDisclosure
      icon={<HugeiconsIcon icon={Search01Icon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />}
      title={group.label}
      detail={group.detail}
      action={<ActivityResult status={group.status} />}
    >
      <ItemGroup className="gap-2">
        {group.activities.map(activity => <SessionActivityRow key={activity.id} activity={activity} nested />)}
      </ItemGroup>
    </SessionDisclosure>
  )
}

function SessionSignalRow({
  signal,
}: {
  signal: Extract<SessionTimelineEvent, { kind: 'signal' }>
}) {
  const hasDetails = signal.details && signal.details.length > 0
  const icon = signal.signalKind === 'output'
    ? <HugeiconsIcon icon={File02Icon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
    : <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
  if (!hasDetails) {
    return (
      <SessionEventItem
        icon={icon}
        title={signal.label}
        detail={signal.detail}
        action={signal.status ? <ActivityResult status={signal.status} /> : null}
      />
    )
  }
  return (
    <SessionDisclosure
      icon={icon}
      title={signal.label}
      detail={signal.detail}
      action={signal.status ? <ActivityResult status={signal.status} /> : null}
    >
      <ActivityDetails details={signal.details ?? []} id={signal.id} />
    </SessionDisclosure>
  )
}

function SessionActivityRow({
  activity,
  nested = false,
}: {
  activity: SessionTimelineActivityEvent
  nested?: boolean
}) {
  const hasDetails = activity.details && activity.details.length > 0
  const icon = activityIcon(activity)
  if (!hasDetails) {
    return (
      <SessionEventItem
        nested={nested}
        icon={icon}
        title={activity.label}
        detail={activity.detail}
        action={<ActivityResult status={activity.status} />}
      />
    )
  }
  return (
    <SessionDisclosure
      nested={nested}
      defaultOpen={activity.status === 'failed' || Boolean(activity.details?.some(detail => detail.label === 'Command'))}
      icon={icon}
      title={activity.label}
      detail={activity.detail}
      action={<ActivityResult status={activity.status} />}
    >
      {hasDetails ? <ActivityDetails details={activity.details ?? []} id={activity.id} /> : null}
    </SessionDisclosure>
  )
}

function ActivityResult({ status }: { status: 'failed' | 'running' | 'succeeded' }) {
  return (
    <Badge variant={status === 'failed' ? 'destructive' : 'secondary'}>
      {status === 'running' ? 'running' : status === 'failed' ? 'failed' : 'done'}
    </Badge>
  )
}

function ActivityDetails({ details, id }: { details: Array<{ label: string, value: string }>, id: string }) {
  return (
    <ItemGroup className="gap-1.5">
      {details.map((detail, index) => (
        <Item key={`${id}-${index}-${detail.label}-${detail.value}`} size="xs" className="min-w-0 items-start">
          <ItemContent className="min-w-0">
            <ItemTitle>{detail.label}</ItemTitle>
            <SessionCodeBlock scrollAreaClassName="max-h-64">{detail.value}</SessionCodeBlock>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  )
}

function activityIcon(activity: SessionTimelineActivityEvent) {
  if (activity.activityKind === 'search')
    return <HugeiconsIcon icon={Search01Icon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
  if (activity.activityKind === 'list')
    return <HugeiconsIcon icon={ListTreeIcon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
  if (activity.activityKind === 'read')
    return <HugeiconsIcon icon={File02Icon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
  if (['build', 'lint', 'test'].includes(activity.activityKind))
    return <HugeiconsIcon icon={PlayIcon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
  if (['create', 'delete', 'edit', 'file'].includes(activity.activityKind))
    return <HugeiconsIcon icon={CodeSquareIcon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
  return <HugeiconsIcon icon={TerminalIcon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
}

function SessionLogCard({ label, value }: { label: string, value: string }) {
  return (
    <SessionDisclosure
      icon={<HugeiconsIcon icon={TerminalIcon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />}
      title={label}
    >
      <SessionCodeBlock>{value}</SessionCodeBlock>
    </SessionDisclosure>
  )
}

function SessionToolCard({
  result,
  tool,
}: {
  result?: Extract<SessionTimelineEvent, { kind: 'tool_result' }>
  tool: Extract<SessionTimelineEvent, { kind: 'tool_use' }>
}) {
  const input = isRecord(tool.input) ? tool.input : {}
  const command = typeof input.command === 'string' ? input.command : ''
  const description = typeof input.description === 'string' ? input.description : tool.name
  return (
    <SessionDisclosure
      defaultOpen={Boolean(command || result?.content)}
      icon={<HugeiconsIcon icon={Wrench01Icon} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />}
      title={tool.name}
      detail={description}
      action={result ? <Badge variant={result.isError ? 'destructive' : 'secondary'}>{result.isError ? 'failed' : 'done'}</Badge> : null}
    >
      {command || result?.content
        ? (
            <ToolResultCard
              className="mt-0"
              command={command || undefined}
              result={result?.content ?? ''}
              tone={result?.isError ? 'danger' : 'muted'}
            />
          )
        : null}
    </SessionDisclosure>
  )
}

function SessionDisclosure({
  action,
  children,
  defaultOpen,
  detail,
  icon,
  nested = false,
  title,
}: {
  action?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  detail?: ReactNode
  icon: ReactNode
  nested?: boolean
  title: ReactNode
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} data-session-slot="event-disclosure" className="min-w-0 max-w-full">
      <CollapsibleTrigger asChild>
        <Item
          asChild
          data-nested={nested ? 'true' : undefined}
          variant="muted"
          size="xs"
          className="min-w-0 flex-nowrap items-start"
        >
          <button type="button">
            <ItemMedia variant="icon">{icon}</ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="max-w-full">{title}</ItemTitle>
              {detail ? <ItemDescription className="max-w-full">{detail}</ItemDescription> : null}
            </ItemContent>
            {action ? <ItemActions>{action}</ItemActions> : null}
          </button>
        </Item>
      </CollapsibleTrigger>
      <CollapsibleContent className="min-w-0 max-w-full overflow-hidden pt-2 pl-7">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

function SessionEventItem({
  action,
  detail,
  icon,
  nested = false,
  title,
}: {
  action?: ReactNode
  detail?: ReactNode
  icon: ReactNode
  nested?: boolean
  title: ReactNode
}) {
  return (
    <Item data-nested={nested ? 'true' : undefined} variant="muted" size="xs" className="min-w-0 flex-nowrap items-start">
      <ItemMedia variant="icon">{icon}</ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full">{title}</ItemTitle>
        {detail ? <ItemDescription className="max-w-full">{detail}</ItemDescription> : null}
      </ItemContent>
      {action ? <ItemActions>{action}</ItemActions> : null}
    </Item>
  )
}

function collectToolResults(events: SessionTimelineEvent[]): Map<string, Extract<SessionTimelineEvent, { kind: 'tool_result' }>> {
  const results = new Map<string, Extract<SessionTimelineEvent, { kind: 'tool_result' }>>()
  for (const event of events) {
    if (event.kind === 'tool_result')
      results.set(event.toolUseId, event)
  }
  return results
}

function shouldRenderTurnErrorFallback(events: SessionTimelineEvent[], error: string | null | undefined): boolean {
  const normalized = error?.trim()
  if (!normalized)
    return false
  return !events.some(event => event.kind === 'error' && event.message.trim() === normalized)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
