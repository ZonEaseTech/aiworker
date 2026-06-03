import type {
  LocalEngineInvocation,
  LocalFile,
  LocalSession,
  LocalSessionEvent,
} from '@zonease/aiworker-soul-descriptor'

import { localJson } from '../../../shared/api/local-client'

export interface SubmitSessionInvocationBody {
  input: string
  metadata?: Record<string, unknown>
  waitForCompletion?: boolean
}

export interface SessionInvocationResponse {
  events: LocalSessionEvent[]
  files: LocalFile[]
  invocation: LocalEngineInvocation
  session: LocalSession
}

export interface InvocationEventsResponse {
  events: LocalSessionEvent[]
  invocation: LocalEngineInvocation
}

export interface SessionDetailResponse {
  events: LocalSessionEvent[]
  invocations: LocalEngineInvocation[]
  session: LocalSession
}

/**
 * Submit a session-level follow-up invocation. Canonical follow-up route is
 * `POST /api/sessions/:id/invocations` (docs/runtime.md); this hits the local
 * broker with no Host on the path.
 *
 * The Worker renders the session chat directly: this client backs the chat
 * composer that worker-studio mounts on the session route. It is at a
 * non-retired path and does not resurrect the retired Host-era session module.
 */
export function submitSessionInvocation(
  sessionId: string,
  body: SubmitSessionInvocationBody,
): Promise<SessionInvocationResponse> {
  return localJson<SessionInvocationResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/invocations`, {
    body: JSON.stringify(body),
    method: 'POST',
  })
}

/**
 * Read a persisted session snapshot for browser reload recovery. The daemon
 * returns session lifecycle data plus session-level invocations and redacted
 * bridge events, so the Workbench can replay the transcript before following
 * the latest invocation's live stream.
 */
export function fetchSessionDetail(sessionId: string): Promise<SessionDetailResponse> {
  return localJson<SessionDetailResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`)
}

/**
 * Read an engine invocation's events for the chat view, with optional
 * `after`/`limit` paging. Canonical route is `GET /api/engine/invocations/:id/events`
 * (docs/protocol.md), which returns the redacted event window plus the current
 * invocation snapshot. This backs the worker-web chat-view poll fallback; the
 * browser's primary live path uses the same route as an SSE stream.
 */
export function fetchInvocationEvents(
  invocationId: string,
  options: { after?: number, limit?: number } = {},
): Promise<InvocationEventsResponse> {
  const params = new URLSearchParams()
  if (options.after !== undefined)
    params.set('after', String(options.after))
  if (options.limit !== undefined)
    params.set('limit', String(options.limit))
  const query = params.toString()
  return localJson<InvocationEventsResponse>(
    `/api/engine/invocations/${encodeURIComponent(invocationId)}/events${query ? `?${query}` : ''}`,
  )
}
