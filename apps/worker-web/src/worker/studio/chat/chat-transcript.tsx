import type { LocalEngineInvocation, LocalSessionEvent } from '@zonease/aiworker-soul-descriptor'
import type { TranscriptTurnModel } from '@zonease/aiworker-ui/components/transcript-types'
import type { ReactNode } from 'react'

import { ChatThread } from '@zonease/aiworker-ui/components/chat-thread'
import { useMemo } from 'react'

import { buildInvocationTurns } from './bridge-event-mapper'
import { useInvocationEvents } from './use-invocation-events'

const EMPTY_SESSION_EVENTS: LocalSessionEvent[] = []
const EMPTY_SESSION_INVOCATIONS: TranscriptInvocation[] = []
const TERMINAL_INVOCATION_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'lost'])

type TranscriptInvocation = Pick<LocalEngineInvocation, 'id' | 'metadataJson' | 'seq'> & Partial<LocalEngineInvocation>

export interface ChatTranscriptProps {
  ariaLabel: string
  emptyState?: ReactNode
  initialInvocation?: (Pick<LocalEngineInvocation, 'id' | 'status'> & Partial<LocalEngineInvocation>) | null
  invocationId: string | null
  intervalMs?: number
  loading?: boolean
  sessionEvents?: LocalSessionEvent[]
  sessionInvocations?: TranscriptInvocation[]
  sessionId: string
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
  sessionEvents = EMPTY_SESSION_EVENTS,
  sessionInvocations = EMPTY_SESSION_INVOCATIONS,
  sessionId,
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
    () => mergeSessionEvents([
      ...sessionEvents.filter(event => event.invocationId !== invocationId),
      ...liveEvents,
    ]),
    [invocationId, liveEvents, sessionEvents],
  )
  const engineTurns = useMemo(
    () => applyActiveStreamingState(buildInvocationTurns(transcriptEvents), invocationId, liveInvocation),
    [invocationId, liveInvocation, transcriptEvents],
  )
  const turns = useMemo(
    () => insertUserMessageTurns(engineTurns, sessionInvocations, userMessage),
    [engineTurns, sessionInvocations, userMessage],
  )
  return <ChatThread ariaLabel={ariaLabel} emptyState={emptyState} loading={loading && turns.length === 0} turns={turns} />
}

function mergeSessionEvents(events: LocalSessionEvent[]): LocalSessionEvent[] {
  const byId = new Map(events.map(event => [event.id, event]))
  return [...byId.values()].sort((left, right) => left.id - right.id)
}

function insertUserMessageTurns(
  turns: TranscriptTurnModel[],
  invocations: TranscriptInvocation[],
  userMessage: { invocationId: string, text: string } | null | undefined,
): TranscriptTurnModel[] {
  const userTurnsByInvocation = userTurnsForInvocations(invocations, userMessage)
  if (userTurnsByInvocation.size === 0)
    return turns
  const engineTurnsByInvocation = new Map(turns.map(turn => [turn.id, turn]))
  const orderedInvocationIds = orderedTranscriptInvocationIds(invocations, turns, userMessage)
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
  if (!invocationId || !invocation || invocation.id !== invocationId || TERMINAL_INVOCATION_STATUSES.has(invocation.status))
    return turns

  const existingIndex = turns.findIndex(turn => turn.id === invocationId)
  if (existingIndex === -1)
    return [...turns, streamingAssistantTurn(invocationId)]

  return turns.map((turn, index) => index === existingIndex ? markTurnAssistantStreaming(turn) : turn)
}

function streamingAssistantTurn(invocationId: string): TranscriptTurnModel {
  return {
    id: invocationId,
    items: [streamingAssistantItem(invocationId)],
  }
}

function markTurnAssistantStreaming(turn: TranscriptTurnModel): TranscriptTurnModel {
  const hasAssistant = turn.items.some(item => item.kind === 'assistant-markdown')
  if (!hasAssistant)
    return { ...turn, items: [...turn.items, streamingAssistantItem(turn.id)] }
  return {
    ...turn,
    items: turn.items.map(item => item.kind === 'assistant-markdown' ? { ...item, streaming: true } : item),
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
