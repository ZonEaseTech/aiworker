import type {
  LocalEngineInvocation,
  LocalSessionEvent,
} from '@zonease/aiworker-soul-descriptor'
import type { TranscriptTurnModel } from '@zonease/aiworker-ui/components/transcript-types'

import { useEffect, useMemo, useReducer, useRef } from 'react'

import { fetchInvocationEvents } from '../../../features/local-workspace/api/session-invocations'
import { buildInvocationTurns } from './bridge-event-mapper'

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'lost'])
const DEFAULT_POLL_INTERVAL_MS = 1000
const EMPTY_INITIAL_EVENTS: LocalSessionEvent[] = []

type InvocationEventInvocation = Pick<LocalEngineInvocation, 'id' | 'status'> & Partial<LocalEngineInvocation>

interface InitialEventsRef {
  events: LocalSessionEvent[]
  key: string
}

interface InitialInvocationRef {
  invocation: InvocationEventInvocation | null
  key: string
}

interface InvocationEventsState {
  events: LocalSessionEvent[]
  forInvocationId: string | null
  invocation: InvocationEventInvocation | null
}

interface InvocationEventsAction {
  state: InvocationEventsState
  type: 'replace'
}

export interface UseInvocationEventsResult {
  events: LocalSessionEvent[]
  invocation: InvocationEventInvocation | null
  turns: TranscriptTurnModel[]
}

export interface UseInvocationEventsOptions {
  eventSource?: boolean
  initialEvents?: LocalSessionEvent[]
  initialInvocation?: InvocationEventInvocation | null
  intervalMs?: number
  sessionId?: string | null
}

const EMPTY_STATE: InvocationEventsState = { events: [], forInvocationId: null, invocation: null }

/**
 * Live event source for a chat view. EventSource is the browser default for
 * `GET /api/engine/invocations/:id/events`; JSON polling remains the fallback
 * for tests, non-browser environments, and callers that pass `eventSource: false`.
 * It accumulates events and stops once the invocation reaches a terminal status.
 *
 * The Worker renders the session chat directly: this hook backs the chat
 * transcript that worker-studio mounts on the session route. The Soul has no UI.
 *
 * State carries the invocation id it belongs to; switching invocations (or
 * clearing it) derives empty until the new id's first poll lands, so no stale
 * transcript leaks across sessions and the effect never sets state synchronously.
 */
export function useInvocationEvents(
  invocationId: string | null,
  options: UseInvocationEventsOptions = {},
): UseInvocationEventsResult {
  const [state, dispatchState] = useReducer(invocationEventsReducer, EMPTY_STATE)
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const eventSourceEnabled = options.eventSource !== false
  const initialEvents = options.initialEvents ?? EMPTY_INITIAL_EVENTS
  const initialInvocation = options.initialInvocation ?? null
  const sessionId = options.sessionId ?? null
  const initialEventsKey = useMemo(
    () => initialEvents.map(event => `${event.id}:${event.invocationId}`).join('|'),
    [initialEvents],
  )
  const initialEventsRef = useRef<InitialEventsRef>({ events: [], key: '' })
  if (initialEventsRef.current.key !== initialEventsKey)
    initialEventsRef.current = { events: initialEvents, key: initialEventsKey }
  const initialInvocationKey = [
    initialInvocation?.id ?? '',
    initialInvocation?.status ?? '',
    initialInvocation?.updatedAt ?? '',
  ].join(':')
  const initialInvocationRef = useRef<InitialInvocationRef>({
    invocation: null,
    key: '',
  })
  if (initialInvocationRef.current.key !== initialInvocationKey)
    initialInvocationRef.current = { invocation: initialInvocation, key: initialInvocationKey }

  useEffect(() => {
    if (!invocationId) {
      dispatchState({ state: EMPTY_STATE, type: 'replace' })
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let source: EventSource | undefined
    const seededEvents = initialEventsRef.current.events.filter(event => event.invocationId === invocationId)
    const seededInvocation = initialInvocationRef.current.invocation?.id === invocationId
      ? initialInvocationRef.current.invocation
      : null
    let cursor = maxEventId(seededEvents)
    let collected: LocalSessionEvent[] = [...seededEvents]
    const publish = (invocation: InvocationEventInvocation | null) => {
      dispatchState({ state: { events: [...collected], forInvocationId: invocationId, invocation }, type: 'replace' })
    }

    publish(seededInvocation)
    if (seededInvocation && TERMINAL_STATUSES.has(seededInvocation.status))
      return

    if (eventSourceEnabled && sessionId && typeof EventSource !== 'undefined') {
      source = new EventSource(invocationEventsPath(invocationId, cursor))
      const handleDone = () => {
        source?.close()
      }
      source.onmessage = (message) => {
        if (cancelled)
          return
        const event = sessionEventFromBridgeMessage(message.data, { invocationId, sessionId })
        if (!event)
          return
        collected = upsertEvents(collected, [event])
        if (event.id > cursor)
          cursor = event.id
        publish(seededInvocation)
      }
      source.addEventListener('done', handleDone)
      return () => {
        cancelled = true
        source?.removeEventListener?.('done', handleDone)
        source?.close()
      }
    }

    async function poll(): Promise<void> {
      if (cancelled)
        return
      try {
        const result = await fetchInvocationEvents(invocationId!, { after: cursor })
        if (cancelled)
          return
        collected = upsertEvents(collected, result.events)
        cursor = maxEventId(collected)
        publish(result.invocation)
        if (TERMINAL_STATUSES.has(result.invocation.status))
          return
      }
      catch {
        // Transient read failure: keep polling rather than dropping the stream.
      }
      if (!cancelled)
        timer = setTimeout(poll, intervalMs)
    }

    void poll()

    return () => {
      cancelled = true
      if (timer)
        clearTimeout(timer)
    }
  }, [eventSourceEnabled, initialEventsKey, initialInvocationKey, intervalMs, invocationId, sessionId])

  const matches = invocationId !== null && state.forInvocationId === invocationId
  const turns = useMemo(() => (matches ? buildInvocationTurns(state.events) : []), [matches, state.events])
  return { events: matches ? state.events : [], invocation: matches ? state.invocation : null, turns }
}

function invocationEventsPath(invocationId: string, after: number): string {
  return `/api/engine/invocations/${encodeURIComponent(invocationId)}/events?after=${after}`
}

function maxEventId(events: LocalSessionEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.id), 0)
}

function upsertEvents(current: LocalSessionEvent[], next: LocalSessionEvent[]): LocalSessionEvent[] {
  const byId = new Map(current.map(event => [event.id, event]))
  for (const event of next)
    byId.set(event.id, event)
  return [...byId.values()].sort((left, right) => left.id - right.id)
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function sessionEventFromBridgeMessage(
  data: string,
  context: { invocationId: string, sessionId: string },
): LocalSessionEvent | null {
  try {
    const bridgeEvent = readRecord(JSON.parse(data) as unknown)
    const id = readPositiveNumber(bridgeEvent.id, 0)
    if (id === 0)
      return null
    const type = readString(bridgeEvent.type, 'invocation.progress')
    const invocationId = readString(bridgeEvent.invocationId, context.invocationId)
    const { id: _id, invocationId: _invocationId, type: _type, ...payloadJson } = bridgeEvent
    return {
      createdAt: new Date().toISOString(),
      id,
      invocationId,
      payloadJson: { ...payloadJson, bridgeEvent: type },
      seq: id,
      sessionId: context.sessionId,
      type: sessionEventTypeFromBridgeEvent(type),
    }
  }
  catch {
    return null
  }
}

function sessionEventTypeFromBridgeEvent(type: string): LocalSessionEvent['type'] {
  if (type === 'invocation.output.delta' || type === 'invocation.output.snapshot')
    return 'assistant_delta'
  if (type === 'invocation.tool.observed')
    return 'tool'
  if (type === 'invocation.error')
    return 'error'
  return 'status'
}

function invocationEventsReducer(_state: InvocationEventsState, action: InvocationEventsAction): InvocationEventsState {
  return action.state
}
