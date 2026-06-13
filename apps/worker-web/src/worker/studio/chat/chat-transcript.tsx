import type { LocalEngineInvocation, LocalSessionEvent } from '@zonease/aiworker-soul-descriptor'
import type { TranscriptItemModel, TranscriptTurnActionModel, TranscriptTurnModel } from '@zonease/aiworker-ui/components/transcript-types'
import type { ReactNode } from 'react'

import { useEffect, useMemo } from 'react'

import { buildInvocationTurns } from './bridge-event-mapper'
import { SessionTimeline } from './session-timeline'
import { useInvocationEvents } from './use-invocation-events'

const EMPTY_SESSION_EVENTS: LocalSessionEvent[] = []
const EMPTY_SESSION_INVOCATIONS: TranscriptInvocation[] = []
const TERMINAL_INVOCATION_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'lost'])
const FAILED_INVOCATION_STATUSES = new Set(['failed', 'lost'])

type TranscriptInvocation = Pick<LocalEngineInvocation, 'id' | 'metadataJson' | 'seq'> & Partial<LocalEngineInvocation>

export interface TranscriptTurnActionLabels {
  copyAsMarkdown: string
  retry: string
}

export interface ChatTranscriptProps {
  ariaLabel: string
  emptyState?: ReactNode
  initialInvocation?: (Pick<LocalEngineInvocation, 'id' | 'status'> & Partial<LocalEngineInvocation>) | null
  invocationId: string | null
  intervalMs?: number
  loading?: boolean
  onInvocationStatusChange?: (invocation: Pick<LocalEngineInvocation, 'id' | 'status'> & Partial<LocalEngineInvocation>) => void
  onRetry?: (text: string) => Promise<void> | void
  sessionEvents?: LocalSessionEvent[]
  sessionInvocations?: TranscriptInvocation[]
  sessionId: string
  turnActionLabels?: TranscriptTurnActionLabels
  userMessage?: { invocationId: string, text: string } | null
}

/**
 * View side of a chat surface: renders the live engine transcript for the
 * selected invocation. It owns no transport — `useInvocationEvents` follows
 * engine-bridge events and maps them into packages/ui transcript turns, and
 * `ChatThread` renders them. With no invocation selected it renders an empty,
 * labelled log.
 *
 * The engine bridge stream carries no user turn, so the submitted message is
 * passed in via `userMessage` and prepended as a leading `user-message` turn
 * ahead of the engine-derived turns (see `bridge-event-mapper`).
 *
 * The Worker renders the session chat directly: this transcript is mounted by
 * worker-studio on the session route. The Soul provides no UI.
 */
export function ChatTranscript({
  ariaLabel,
  emptyState,
  initialInvocation = null,
  intervalMs,
  invocationId,
  loading = false,
  onInvocationStatusChange,
  onRetry,
  sessionEvents = EMPTY_SESSION_EVENTS,
  sessionInvocations = EMPTY_SESSION_INVOCATIONS,
  sessionId,
  turnActionLabels,
  userMessage,
}: ChatTranscriptProps) {
  const activeInitialEvents = useMemo(
    () => invocationId ? sessionEvents.filter(event => event.invocationId === invocationId) : [],
    [invocationId, sessionEvents],
  )
  const { events: liveEvents, invocation: liveInvocation } = useInvocationEvents(invocationId, {
    initialEvents: activeInitialEvents,
    initialInvocation,
    intervalMs,
    sessionId,
  })
  const transcriptEvents = useMemo(
    () => mergeSessionEvents([...sessionEvents, ...liveEvents]),
    [liveEvents, sessionEvents],
  )
  const effectiveInvocation = useMemo(
    () => effectiveInvocationForTranscript(invocationId, transcriptEvents, liveInvocation),
    [invocationId, liveInvocation, transcriptEvents],
  )
  const effectiveInvocationId = effectiveInvocation?.id
  const effectiveInvocationStatus = effectiveInvocation?.status
  useEffect(() => {
    if (effectiveInvocationId && effectiveInvocationStatus)
      onInvocationStatusChange?.({ id: effectiveInvocationId, status: effectiveInvocationStatus })
  }, [effectiveInvocationId, effectiveInvocationStatus, onInvocationStatusChange])
  const engineTurns = useMemo(
    () => dropStaleProgressOnlyTurns(
      applyActiveStreamingState(buildInvocationTurns(transcriptEvents), invocationId, effectiveInvocation),
      invocationId,
    ),
    [effectiveInvocation, invocationId, transcriptEvents],
  )
  const stitchedTurns = useMemo(
    () => insertUserMessageTurns(engineTurns, sessionInvocations, userMessage),
    [engineTurns, sessionInvocations, userMessage],
  )
  const turns = useMemo(
    () => appendTurnActionRails(stitchedTurns, {
      effectiveInvocation,
      labels: turnActionLabels,
      onRetry,
      sessionInvocations,
      userMessage,
    }),
    [effectiveInvocation, onRetry, sessionInvocations, stitchedTurns, turnActionLabels, userMessage],
  )
  return <SessionTimeline ariaLabel={ariaLabel} emptyState={emptyState} loading={loading && turns.length === 0} turns={turns} />
}

function mergeSessionEvents(events: LocalSessionEvent[]): LocalSessionEvent[] {
  const byId = new Map(events.map(event => [event.id, event]))
  return [...byId.values()].sort((left, right) => left.id - right.id)
}

function effectiveInvocationForTranscript(
  invocationId: string | null,
  events: LocalSessionEvent[],
  invocation: (Pick<LocalEngineInvocation, 'id' | 'status'> & Partial<LocalEngineInvocation>) | null,
): (Pick<LocalEngineInvocation, 'id' | 'status'> & Partial<LocalEngineInvocation>) | null {
  if (!invocationId)
    return invocation

  const terminalStatus = terminalInvocationStatusFromEvents(invocationId, events)
  if (terminalStatus)
    return { ...invocation, id: invocationId, status: terminalStatus }

  return invocation
}

function terminalInvocationStatusFromEvents(
  invocationId: string,
  events: LocalSessionEvent[],
): LocalEngineInvocation['status'] | null {
  const invocationEvents = events
    .filter(event => event.invocationId === invocationId)
    .sort((left, right) => left.seq - right.seq)

  let status: LocalEngineInvocation['status'] | null = null
  for (const event of invocationEvents) {
    const eventStatus = readTerminalStatus(event)
    if (eventStatus)
      status = eventStatus
  }
  return status
}

function readTerminalStatus(event: LocalSessionEvent): LocalEngineInvocation['status'] | null {
  const bridgeEvent = readBridgeEvent(event)
  if (bridgeEvent === 'invocation.completed' || bridgeEvent === 'process.exited')
    return 'succeeded'
  if (bridgeEvent === 'invocation.cancelled')
    return 'cancelled'
  if (bridgeEvent === 'invocation.error' || bridgeEvent === 'process.lost')
    return 'failed'

  const payload = event.payloadJson
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return null
  const status = (payload as Record<string, unknown>).status
  return typeof status === 'string' && TERMINAL_INVOCATION_STATUSES.has(status)
    ? status as LocalEngineInvocation['status']
    : null
}

function readBridgeEvent(event: LocalSessionEvent): string {
  const payload = event.payloadJson
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return ''
  const bridgeEvent = (payload as Record<string, unknown>).bridgeEvent
  return typeof bridgeEvent === 'string' ? bridgeEvent : ''
}

interface TurnActionRailContext {
  effectiveInvocation: (Pick<LocalEngineInvocation, 'id' | 'status'> & Partial<LocalEngineInvocation>) | null
  labels: TranscriptTurnActionLabels | undefined
  onRetry: ((text: string) => Promise<void> | void) | undefined
  sessionInvocations: TranscriptInvocation[]
  userMessage: { invocationId: string, text: string } | null | undefined
}

/**
 * Append a turn-action rail to each terminal engine turn:
 * - a succeeded turn gets "copy as Markdown" (the raw assistant source),
 * - a failed/lost turn gets "retry" that re-sends the same input.
 *
 * Rails are derived in this view layer (not in the pure `buildInvocationTurns`)
 * so terminal status comes from the same reconciled `effectiveInvocation` /
 * `sessionInvocations` source the rest of the transcript already trusts, and the
 * retry callback can close over the session submit path the surface owns.
 */
function appendTurnActionRails(
  turns: TranscriptTurnModel[],
  context: TurnActionRailContext,
): TranscriptTurnModel[] {
  const { labels } = context
  if (!labels)
    return turns

  return turns.map((turn) => {
    if (turn.id.endsWith(':user'))
      return turn
    const status = terminalStatusForTurn(turn.id, context)
    if (!status)
      return turn
    const action = turnActionForStatus(turn, status, context)
    if (!action)
      return turn
    return {
      ...turn,
      items: [...turn.items, { actions: [action], id: `${turn.id}:turn-actions`, kind: 'turn-action-rail' }],
    }
  })
}

function terminalStatusForTurn(
  invocationId: string,
  context: TurnActionRailContext,
): LocalEngineInvocation['status'] | null {
  if (context.effectiveInvocation?.id === invocationId && TERMINAL_INVOCATION_STATUSES.has(context.effectiveInvocation.status))
    return context.effectiveInvocation.status
  const invocation = context.sessionInvocations.find(candidate => candidate.id === invocationId)
  if (invocation?.status && TERMINAL_INVOCATION_STATUSES.has(invocation.status))
    return invocation.status
  return null
}

function turnActionForStatus(
  turn: TranscriptTurnModel,
  status: LocalEngineInvocation['status'],
  context: TurnActionRailContext,
): TranscriptTurnActionModel | null {
  const { labels } = context
  if (status === 'succeeded') {
    const markdown = assistantMarkdownForTurn(turn)
    if (!markdown)
      return null
    return {
      id: `${turn.id}:copy-markdown`,
      label: labels!.copyAsMarkdown,
      onClick: () => {
        void copyTextToClipboard(markdown)
      },
    }
  }
  if (FAILED_INVOCATION_STATUSES.has(status) && context.onRetry) {
    const text = retryTextForTurn(turn.id, context)
    if (!text)
      return null
    return {
      id: `${turn.id}:retry`,
      label: labels!.retry,
      onClick: () => {
        void context.onRetry?.(text)
      },
    }
  }
  return null
}

function assistantMarkdownForTurn(turn: TranscriptTurnModel): string {
  return turn.items
    .filter((item): item is Extract<TranscriptItemModel, { kind: 'assistant-markdown' }> => item.kind === 'assistant-markdown')
    .map(item => item.markdown)
    .join('')
    .trim()
}

function retryTextForTurn(invocationId: string, context: TurnActionRailContext): string {
  if (context.userMessage?.invocationId === invocationId && context.userMessage.text.trim().length > 0)
    return context.userMessage.text
  const invocation = context.sessionInvocations.find(candidate => candidate.id === invocationId)
  return invocation ? uiUserDisplayText(invocation) ?? '' : ''
}

function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText)
    return navigator.clipboard.writeText(text)
  return Promise.resolve()
}

function insertUserMessageTurns(
  turns: TranscriptTurnModel[],
  invocations: TranscriptInvocation[],
  userMessage: { invocationId: string, text: string } | null | undefined,
): TranscriptTurnModel[] {
  const visibleInvocations = invocations.filter(invocation => !isInternalTranscriptInvocation(invocation))
  const userTurnsByInvocation = userTurnsForInvocations(visibleInvocations, userMessage)
  if (userTurnsByInvocation.size === 0)
    return turns
  const engineTurnsByInvocation = new Map(turns.map(turn => [turn.id, turn]))
  const orderedInvocationIds = orderedTranscriptInvocationIds(visibleInvocations, turns, userMessage)
  const stitched: TranscriptTurnModel[] = []
  for (const invocationId of orderedInvocationIds) {
    const userTurn = userTurnsByInvocation.get(invocationId)
    if (userTurn)
      stitched.push(userTurn)
    const engineTurn = engineTurnsByInvocation.get(invocationId)
    if (engineTurn)
      stitched.push(engineTurn)
  }
  return stitched
}

function userTurnsForInvocations(
  invocations: TranscriptInvocation[],
  userMessage: { invocationId: string, text: string } | null | undefined,
): Map<string, TranscriptTurnModel> {
  const turns = new Map<string, TranscriptTurnModel>()
  for (const invocation of invocations) {
    const text = uiUserDisplayText(invocation)
    if (text)
      turns.set(invocation.id, userTurn(invocation.id, text))
  }
  if (userMessage)
    turns.set(userMessage.invocationId, userTurn(userMessage.invocationId, userMessage.text))
  return turns
}

function orderedTranscriptInvocationIds(
  invocations: TranscriptInvocation[],
  turns: TranscriptTurnModel[],
  userMessage: { invocationId: string, text: string } | null | undefined,
): string[] {
  const ordered = new Set<string>()
  for (const invocation of invocations.slice().sort((left, right) => left.seq - right.seq))
    ordered.add(invocation.id)
  for (const turn of turns)
    ordered.add(turn.id)
  if (userMessage)
    ordered.add(userMessage.invocationId)
  return [...ordered]
}

function dropStaleProgressOnlyTurns(turns: TranscriptTurnModel[], activeInvocationId: string | null): TranscriptTurnModel[] {
  return turns.filter((turn) => {
    if (turn.id === activeInvocationId)
      return true
    return !turn.items.every(item =>
      item.kind === 'timeline-step'
      && item.status === 'running'
      && (item.category === 'progress' || item.category === 'lifecycle'),
    )
  })
}

function userTurn(invocationId: string, text: string): TranscriptTurnModel {
  const userTurn: TranscriptTurnModel = {
    id: `${invocationId}:user`,
    items: [{ body: text, id: `${invocationId}:user-message`, kind: 'user-message' }],
  }
  return userTurn
}

function applyActiveStreamingState(
  turns: TranscriptTurnModel[],
  invocationId: string | null,
  invocation: (Pick<LocalEngineInvocation, 'id' | 'status'> & Partial<LocalEngineInvocation>) | null,
): TranscriptTurnModel[] {
  if (!invocationId || !invocation || invocation.id !== invocationId)
    return turns

  if (TERMINAL_INVOCATION_STATUSES.has(invocation.status))
    return removeTerminalRunningChrome(turns, invocationId)

  const existingIndex = turns.findIndex(turn => turn.id === invocationId)
  if (existingIndex === -1)
    return [...turns, streamingAssistantTurn(invocationId)]

  return turns.map((turn, index) => index === existingIndex ? markTurnAssistantStreaming(turn) : turn)
}

function removeTerminalRunningChrome(turns: TranscriptTurnModel[], invocationId: string): TranscriptTurnModel[] {
  return turns.map((turn) => {
    if (turn.id !== invocationId || !turnHasAssistantText(turn))
      return turn

    const items = turn.items
      .filter(item => !(
        item.kind === 'timeline-step'
        && item.status === 'running'
        && (item.category === 'progress' || item.category === 'lifecycle')
      ))
      .map(item => item.kind === 'assistant-markdown' && item.streaming
        ? { ...item, streaming: false }
        : item)

    return items.length === turn.items.length
      ? turn
      : { ...turn, items }
  })
}

function turnHasAssistantText(turn: TranscriptTurnModel): boolean {
  return turn.items.some(item => item.kind === 'assistant-markdown' && item.markdown.trim().length > 0)
}

function streamingAssistantTurn(invocationId: string): TranscriptTurnModel {
  return {
    id: invocationId,
    items: [optimisticTimelineStepItem(invocationId), streamingAssistantItem(invocationId)],
  }
}

function markTurnAssistantStreaming(turn: TranscriptTurnModel): TranscriptTurnModel {
  const lastAssistantIndex = findLastAssistantMarkdownIndex(turn)
  if (lastAssistantIndex === -1)
    return { ...turn, items: [...turn.items, streamingAssistantItem(turn.id)] }
  return {
    ...turn,
    items: turn.items.map((item, index) => item.kind === 'assistant-markdown'
      ? { ...item, streaming: index === lastAssistantIndex }
      : item),
  }
}

function findLastAssistantMarkdownIndex(turn: TranscriptTurnModel): number {
  for (let index = turn.items.length - 1; index >= 0; index -= 1) {
    if (turn.items[index]?.kind === 'assistant-markdown')
      return index
  }
  return -1
}

function optimisticTimelineStepItem(invocationId: string): TranscriptTurnModel['items'][number] {
  return {
    body: 'Waiting for the native engine to emit its first event.',
    id: `${invocationId}:timeline:optimistic-start`,
    kind: 'timeline-step',
    provenance: 'optimistic',
    status: 'waiting',
    title: 'Starting invocation',
  }
}

function streamingAssistantItem(invocationId: string): TranscriptTurnModel['items'][number] {
  return {
    id: `${invocationId}:assistant`,
    kind: 'assistant-markdown',
    markdown: '',
    streaming: true,
  }
}

function uiUserDisplayText(invocation: TranscriptInvocation): string | null {
  const value = invocation.metadataJson?.uiUserDisplayText
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function isInternalTranscriptInvocation(invocation: TranscriptInvocation): boolean {
  const metadata = invocation.metadataJson
  return Boolean(metadata && typeof metadata === 'object' && !Array.isArray(metadata) && metadata.kind === 'internal')
}
