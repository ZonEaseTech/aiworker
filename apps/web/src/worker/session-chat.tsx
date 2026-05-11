import type {
  CapabilityTemplate,
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
  LocalWorkspace,
} from '@zonease/aiworker-shared'
import type { FormEvent } from 'react'
import type { messagesFor, SupportedLocale } from './i18n'
import type { EngineReadiness } from './session-detail'

import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  CheckCircle,
  FileText,
  MessageSquare,
  RefreshCw,
  Send,
  Settings,
  Terminal,
  Wrench,
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { displayTemplate, formatRelativeTime, formatStatus } from './i18n'

type WorkerMessages = ReturnType<typeof messagesFor>

type WorkerAgentEvent
  = | { kind: 'status', label: string, detail?: string }
    | { kind: 'text', text: string }
    | { kind: 'thinking', text: string }
    | { kind: 'tool_use', id: string, input: unknown, name: string }
    | { kind: 'tool_result', id: string, content: string, isError?: boolean, name?: string }
    | { kind: 'usage', costUsd?: number, inputTokens?: number, outputTokens?: number }
    | { kind: 'log', chunk: string, stream: 'stderr' | 'stdout' }
    | { kind: 'raw', line: string }
    | { kind: 'artifact', detail: string }
    | { kind: 'review', detail: string }
    | { kind: 'lesson', detail: string }
    | { kind: 'error', message: string }

export function WorkerSessionChat({
  copy,
  engineReadiness,
  events,
  locale,
  onOpenSettings,
  onRefresh,
  onBackToWorkspace,
  onSubmitTurn,
  onTurnInputChange,
  session,
  template,
  turnInput,
  turnSubmitting,
  turns,
  workspace,
}: {
  copy: WorkerMessages
  engineReadiness: EngineReadiness
  events: LocalSessionEvent[]
  locale: SupportedLocale
  onOpenSettings: () => void
  onRefresh: () => void
  onBackToWorkspace: () => void
  onSubmitTurn: (event: FormEvent<HTMLFormElement>) => void
  onTurnInputChange: (value: string) => void
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
  const sortedTurns = useMemo(() => [...turns].sort((a, b) => a.seq - b.seq), [turns])
  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.seq - b.seq), [events])

  useEffect(() => {
    didInitialScrollRef.current = false
    pinnedToBottomRef.current = true
  }, [session.id])

  useEffect(() => {
    const el = logRef.current
    if (!el || didInitialScrollRef.current || (sortedTurns.length === 0 && sortedEvents.length === 0))
      return
    didInitialScrollRef.current = true
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      pinnedToBottomRef.current = true
      setScrolledFromBottom(false)
    })
  }, [session.id, sortedEvents.length, sortedTurns.length])

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
  }, [sortedEvents, sortedTurns, turnSubmitting])

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
        </div>
        <div className="worker-chat-actions">
          <button type="button" className="ghost icon-btn" aria-label={copy.workspace.backToWorkspace} onClick={onBackToWorkspace}>
            <ArrowLeft aria-hidden="true" size={14} />
            <span>{copy.workspace.backToWorkspace}</span>
          </button>
          <button type="button" className="settings-trigger" aria-label={copy.accessibility.refreshWorkspace} onClick={onRefresh}>
            <RefreshCw aria-hidden="true" size={16} />
          </button>
          <button type="button" className="settings-trigger" aria-label={copy.accessibility.openSettings} onClick={onOpenSettings}>
            <Settings aria-hidden="true" size={16} />
          </button>
        </div>
      </header>

      <div className="worker-chat-log-wrap">
        <div ref={logRef} className="worker-chat-log" data-testid="worker-chat-log">
          {sortedTurns.length > 0
            ? sortedTurns.map((turn) => {
                const turnEvents = sortedEvents.filter(event => event.turnId === turn.id)
                return (
                  <Fragment key={turn.id}>
                    <UserTurn copy={copy} turn={turn} locale={locale} />
                    <AssistantTurn copy={copy} events={turnEvents} locale={locale} turn={turn} turnSubmitting={turnSubmitting && turn.status === 'running'} />
                  </Fragment>
                )
              })
            : (
                <div className="worker-chat-empty">
                  <MessageSquare aria-hidden="true" size={24} />
                  <strong>{copy.workspace.noTurns}</strong>
                  <span>{engineReadiness.detail}</span>
                </div>
              )}
          {turnSubmitting && sortedTurns.every(turn => turn.status !== 'running')
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

      <form className="worker-composer" onSubmit={onSubmitTurn}>
        <button type="button" className="worker-composer-tool" aria-label={copy.accessibility.openSettings} onClick={onOpenSettings}>
          <Settings aria-hidden="true" size={15} />
        </button>
        <textarea
          aria-label={copy.workspace.followUpInput}
          disabled={!engineReadiness.ready || turnSubmitting}
          placeholder={copy.workspace.followUpPlaceholder}
          rows={3}
          value={turnInput}
          onChange={event => onTurnInputChange(event.target.value)}
        />
        <button className="primary worker-composer-send" type="submit" disabled={!turnInput.trim() || turnSubmitting || !engineReadiness.ready}>
          <Send aria-hidden="true" size={14} />
          <span>{turnSubmitting ? copy.workspace.sendingTurn : copy.workspace.sendTurn}</span>
        </button>
      </form>
    </section>
  )
}

function UserTurn({ copy, locale, turn }: { copy: WorkerMessages, locale: SupportedLocale, turn: LocalTurn }) {
  return (
    <article className="worker-message user">
      <div className="worker-message-role">
        <span>{copy.workspace.operatorRole}</span>
        <time>{formatRelativeTime(turn.createdAt, locale)}</time>
      </div>
      <div className="worker-user-bubble">{turn.input}</div>
    </article>
  )
}

function AssistantTurn({
  copy,
  events,
  locale,
  turn,
  turnSubmitting,
}: {
  copy: WorkerMessages
  events: LocalSessionEvent[]
  locale: SupportedLocale
  turn: LocalTurn
  turnSubmitting: boolean
}) {
  const agentEvents = compactAgentEvents(events.map(event => ({ event: coerceAgentEvent(event), key: String(event.id) })))
  if (agentEvents.length === 0 && turn.response)
    agentEvents.push({ event: { kind: 'text', text: turn.response }, key: `response-${turn.id}` })

  const toolResults = new Map<string, Extract<WorkerAgentEvent, { kind: 'tool_result' }>>()
  for (const { event } of agentEvents) {
    if (event.kind === 'tool_result')
      toolResults.set(event.id, event)
  }

  return (
    <article className="worker-message assistant">
      <div className="worker-message-role">
        <span>{copy.workspace.engineRole}</span>
        <time>{formatStatus(turn.status, locale)}</time>
      </div>
      <div className="worker-assistant-flow">
        {agentEvents.length === 0 && (turn.status === 'running' || turnSubmitting)
          ? <WaitingPill detail={copy.workspace.engineStarting} />
          : null}
        {agentEvents.map(({ event, key }) => {
          if (event.kind === 'tool_result')
            return null
          if (event.kind === 'tool_use')
            return <EngineToolCard key={key} result={toolResults.get(event.id)} tool={event} />
          return <AgentEventBlock key={key} event={event} />
        })}
        {turn.error ? <AgentEventBlock event={{ kind: 'error', message: turn.error }} /> : null}
      </div>
    </article>
  )
}

function AssistantWaiting({ detail, role }: { detail: string, role: string }) {
  return (
    <article className="worker-message assistant">
      <div className="worker-message-role">
        <span>{role}</span>
      </div>
      <div className="worker-assistant-flow">
        <WaitingPill detail={detail} />
      </div>
    </article>
  )
}

function WaitingPill({ detail }: { detail: string }) {
  return (
    <div className="worker-status-pill active">
      <span className="status-dot active" />
      <span>{detail}</span>
    </div>
  )
}

function AgentEventBlock({ event }: { event: WorkerAgentEvent }) {
  if (event.kind === 'text') {
    return <div className="worker-prose">{event.text}</div>
  }
  if (event.kind === 'thinking') {
    return <pre className="worker-log thinking">{event.text}</pre>
  }
  if (event.kind === 'log') {
    return (
      <details className="worker-log-card">
        <summary>
          <Terminal aria-hidden="true" size={14} />
          <span>{event.stream}</span>
        </summary>
        <pre>{event.chunk}</pre>
      </details>
    )
  }
  if (event.kind === 'raw') {
    return (
      <details className="worker-log-card">
        <summary>
          <Terminal aria-hidden="true" size={14} />
          <span>raw</span>
        </summary>
        <pre>{event.line}</pre>
      </details>
    )
  }
  if (event.kind === 'status') {
    return (
      <div className="worker-status-pill">
        <span className="status-dot active" />
        <span>{event.label}</span>
        {event.detail ? <small>{event.detail}</small> : null}
      </div>
    )
  }
  if (event.kind === 'usage') {
    return (
      <div className="worker-status-pill">
        <CheckCircle aria-hidden="true" size={14} />
        <span>Usage</span>
        <small>{[event.inputTokens, event.outputTokens].filter(value => value != null).join(' / ')}</small>
      </div>
    )
  }
  if (event.kind === 'artifact' || event.kind === 'review' || event.kind === 'lesson') {
    return (
      <div className="worker-produced-chip">
        <FileText aria-hidden="true" size={14} />
        <span>{event.kind}</span>
        <small>{event.detail}</small>
      </div>
    )
  }
  if (event.kind === 'error') {
    return (
      <div className="worker-error-card" role="alert">
        <AlertCircle aria-hidden="true" size={15} />
        <span>{event.message}</span>
      </div>
    )
  }
  return null
}

function EngineToolCard({
  result,
  tool,
}: {
  result?: Extract<WorkerAgentEvent, { kind: 'tool_result' }>
  tool: Extract<WorkerAgentEvent, { kind: 'tool_use' }>
}) {
  const input = isRecord(tool.input) ? tool.input : {}
  const command = typeof input.command === 'string' ? input.command : ''
  const description = typeof input.description === 'string' ? input.description : tool.name
  return (
    <details className="worker-tool-card" open={!result?.content}>
      <summary>
        <span className="worker-tool-icon">
          <Wrench aria-hidden="true" size={14} />
        </span>
        <span>{tool.name}</span>
        <small>{description}</small>
        {result ? <span className={`worker-tool-result ${result.isError ? 'failed' : 'ok'}`}>{result.isError ? 'failed' : 'done'}</span> : null}
      </summary>
      {command ? <pre className="worker-tool-command">{command}</pre> : null}
      {result?.content ? <pre className="worker-tool-output">{result.content}</pre> : null}
    </details>
  )
}

function coerceAgentEvent(event: LocalSessionEvent): WorkerAgentEvent {
  const payload = event.payloadJson
  const agentEvent = isRecord(payload.agentEvent) ? payload.agentEvent : null
  if (agentEvent && typeof agentEvent.kind === 'string') {
    const kind = agentEvent.kind
    if (kind === 'status')
      return { detail: readString(agentEvent.detail), kind, label: readString(agentEvent.label, event.type) }
    if (kind === 'text')
      return { kind, text: readString(agentEvent.text) }
    if (kind === 'thinking')
      return { kind, text: readString(agentEvent.text) }
    if (kind === 'log')
      return { chunk: readString(agentEvent.chunk), kind, stream: agentEvent.stream === 'stderr' ? 'stderr' : 'stdout' }
    if (kind === 'tool_use')
      return { id: readString(agentEvent.id, String(event.id)), input: agentEvent.input, kind, name: readString(agentEvent.name, 'Tool') }
    if (kind === 'tool_result')
      return { content: readString(agentEvent.content), id: readString(agentEvent.id ?? agentEvent.toolUseId, String(event.id)), isError: agentEvent.isError === true, kind, name: readString(agentEvent.name) }
    if (kind === 'usage')
      return { costUsd: readNumber(agentEvent.costUsd), inputTokens: readNumber(agentEvent.inputTokens), kind, outputTokens: readNumber(agentEvent.outputTokens) }
    if (kind === 'raw')
      return { kind, line: readString(agentEvent.line) }
  }

  if (event.type === 'assistant_delta')
    return { kind: 'text', text: readString(payload.text ?? payload.delta) }
  if (event.type === 'artifact')
    return { detail: readString(payload.path ?? payload.artifactId, 'artifact'), kind: 'artifact' }
  if (event.type === 'review')
    return { detail: readString(payload.verdict ?? payload.reviewId, 'review'), kind: 'review' }
  if (event.type === 'lesson')
    return { detail: readString(payload.lessonId, 'memory candidate'), kind: 'lesson' }
  if (event.type === 'error')
    return { kind: 'error', message: readString(payload.message, 'Session turn failed.') }
  if (event.type === 'log')
    return { chunk: JSON.stringify(payload, null, 2), kind: 'log', stream: 'stdout' }
  return { detail: readString(payload.status, event.type), kind: 'status', label: event.type }
}

function compactAgentEvents(items: Array<{ event: WorkerAgentEvent, key: string }>): Array<{ event: WorkerAgentEvent, key: string }> {
  const compacted: Array<{ event: WorkerAgentEvent, key: string }> = []
  for (const item of items) {
    const last = compacted.at(-1)
    if (item.event.kind === 'text' && last?.event.kind === 'text') {
      last.event = {
        ...last.event,
        text: `${last.event.text}${item.event.text}`,
      }
      continue
    }
    if (item.event.kind === 'thinking' && last?.event.kind === 'thinking') {
      last.event = {
        ...last.event,
        text: truncateLog(`${last.event.text}${item.event.text}`),
      }
      continue
    }
    if (item.event.kind === 'log' && last?.event.kind === 'log' && last.event.stream === item.event.stream) {
      last.event = {
        ...last.event,
        chunk: truncateLog(`${last.event.chunk}${item.event.chunk}`),
      }
      continue
    }
    compacted.push(item.event.kind === 'log'
      ? { event: { ...item.event, chunk: truncateLog(item.event.chunk) }, key: item.key }
      : item)
  }
  return compacted
}

function truncateLog(value: string): string {
  const max = 12_000
  if (value.length <= max)
    return value
  return `${value.slice(0, max)}\n...[truncated]`
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
