import type {
  LocalEngineInvocation,
  LocalSessionEvent,
} from '@zonease/aiworker-soul-descriptor'
import type { TranscriptTurnModel } from '@zonease/aiworker-ui/components/transcript-types'

import { useEffect, useMemo, useState } from 'react'

import { fetchInvocationEvents } from '../../../features/local-workspace/api/session-invocations'
import { buildInvocationTurns } from './bridge-event-mapper'

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'lost'])
const DEFAULT_POLL_INTERVAL_MS = 1000

interface InvocationEventsState {
  events: LocalSessionEvent[]
  forInvocationId: string | null
  invocation: LocalEngineInvocation | null
}

export interface UseInvocationEventsResult {
  invocation: LocalEngineInvocation | null
  turns: TranscriptTurnModel[]
}

const EMPTY_STATE: InvocationEventsState = { events: [], forInvocationId: null, invocation: null }

/**
 * Live event source for a chat view. Polls `GET /api/engine/invocations/:id/events`
 * from an `after` event-id cursor, accumulates events, and stops once the
 * invocation reaches a terminal status. The transport is deliberately behind this
 * hook: a future SSE endpoint can replace the poll loop without changing callers.
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
  options: { intervalMs?: number } = {},
): UseInvocationEventsResult {
  const [state, setState] = useState<InvocationEventsState>(EMPTY_STATE)
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS

  useEffect(() => {
    if (!invocationId)
      return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let cursor = 0
    const collected: LocalSessionEvent[] = []

    async function poll(): Promise<void> {
      if (cancelled)
        return
      try {
        const result = await fetchInvocationEvents(invocationId!, { after: cursor })
        if (cancelled)
          return
        for (const event of result.events) {
          collected.push(event)
          if (event.id > cursor)
            cursor = event.id
        }
        setState({ events: [...collected], forInvocationId: invocationId, invocation: result.invocation })
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
  }, [invocationId, intervalMs])

  const matches = invocationId !== null && state.forInvocationId === invocationId
  const turns = useMemo(() => (matches ? buildInvocationTurns(state.events) : []), [matches, state.events])
  return { invocation: matches ? state.invocation : null, turns }
}
