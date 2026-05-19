import type { ReactNode } from 'react'
import type { SessionTimelineEvent, SessionTimelineTurnViewModel } from './session-view-model'

import { AlertCircle, CheckCircle, FileText, Terminal, Wrench } from 'lucide-react'
import { Fragment } from 'react'
import { MessageFlow, MessageRow, StatusEventPill, ToolResultCard } from './message-flow'
import { StudioPill } from './studio-patterns'

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
      <div className="session-timeline-empty">
        {empty}
      </div>
    )
  }

  return (
    <div className={className ? `session-timeline ${className}` : 'session-timeline'}>
      {turns.map((item) => {
        const toolResults = collectToolResults(item.events)
        const placeholder = item.events.length === 0 ? placeholderForTurn?.(item.turn) : null
        return (
          <div key={item.turn.id} className="session-timeline-turn">
            <MessageRow className="session-message user" roleLabel={operatorRoleLabel} timestamp={timestampForTurn?.(item.turn)}>
              <div className="session-user-bubble">{item.turn.input}</div>
            </MessageRow>
            <MessageRow className="session-message assistant" roleLabel={assistantRoleLabel} timestamp={assistantTimestampForTurn?.(item.turn) ?? item.turn.status}>
              <MessageFlow className="session-assistant-flow">
                {placeholder}
                {item.events.map(event => (
                  <Fragment key={event.id}>
                    {renderEvent?.(event) ?? <DefaultSessionEvent event={event} toolResult={event.kind === 'tool_use' ? toolResults.get(event.toolUseId) : undefined} />}
                  </Fragment>
                ))}
                {item.turn.error ? <DefaultSessionEvent event={{ id: `error-${item.turn.id}`, kind: 'error', message: item.turn.error, turnId: item.turn.id }} /> : null}
              </MessageFlow>
            </MessageRow>
          </div>
        )
      })}
    </div>
  )
}

function DefaultSessionEvent({
  event,
  toolResult,
}: {
  event: SessionTimelineEvent
  toolResult?: Extract<SessionTimelineEvent, { kind: 'tool_result' }>
}) {
  if (event.kind === 'text')
    return <div className="session-prose">{event.text}</div>
  if (event.kind === 'thinking')
    return <pre className="session-log thinking">{event.text}</pre>
  if (event.kind === 'log')
    return <SessionLogCard label={event.stream} value={event.chunk} />
  if (event.kind === 'raw')
    return <SessionLogCard label="raw" value={event.line} />
  if (event.kind === 'status')
    return <StatusEventPill className="session-status-pill" detail={event.detail} tone="success">{event.label}</StatusEventPill>
  if (event.kind === 'usage') {
    return (
      <StudioPill className="session-status-pill" icon={<CheckCircle size={14} />}>
        <span>Usage</span>
        <small>{[event.inputTokens, event.outputTokens].filter(value => value != null).join(' / ')}</small>
      </StudioPill>
    )
  }
  if (event.kind === 'artifact' || event.kind === 'review' || event.kind === 'lesson') {
    return (
      <StudioPill className="session-produced-chip" icon={<FileText size={14} />}>
        <span>{event.kind}</span>
        <small>{event.detail}</small>
      </StudioPill>
    )
  }
  if (event.kind === 'tool_result')
    return null
  if (event.kind === 'tool_use')
    return <SessionToolCard result={toolResult} tool={event} />
  if (event.kind === 'error') {
    return (
      <div className="session-error-card" role="alert">
        <AlertCircle aria-hidden="true" size={15} />
        <span>{event.message}</span>
      </div>
    )
  }
  return null
}

function SessionLogCard({ label, value }: { label: string, value: string }) {
  return (
    <details className="session-log-card">
      <summary>
        <Terminal aria-hidden="true" size={14} />
        <span>{label}</span>
      </summary>
      <pre>{value}</pre>
    </details>
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
    <details className="session-tool-card" open={!result?.content}>
      <summary>
        <span className="session-tool-icon">
          <Wrench aria-hidden="true" size={14} />
        </span>
        <span>{tool.name}</span>
        <small>{description}</small>
        {result ? <span className={`session-tool-result ${result.isError ? 'failed' : 'ok'}`}>{result.isError ? 'failed' : 'done'}</span> : null}
      </summary>
      {command || result?.content
        ? (
            <ToolResultCard
              className="session-tool-output"
              command={command || undefined}
              result={result?.content ?? ''}
              tone={result?.isError ? 'danger' : 'muted'}
            />
          )
        : null}
    </details>
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
