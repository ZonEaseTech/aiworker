import type {
  LocalEngineInvocation,
  LocalFile,
  LocalSession,
  LocalSessionEvent,
} from '@zonease/aiworker-soul-protocol'

import { localJson } from '../../../shared/api/local-client'

export interface SubmitSessionInvocationBody {
  input: string
  metadata?: Record<string, unknown>
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

/**
 * Submit a session-level follow-up invocation. Canonical follow-up route is
 * `POST /api/sessions/:id/invocations` (docs/runtime.md); this hits the local
 * broker with no Host on the path.
 *
 * STATUS: unwired reusable foundation — canonical architecture is mounted-owns-chat
 * (the session experience renders in the mounted soul workbench, not worker-web;
 * guards worker-studio.test.tsx:1786/1807 + Freeform browser proof). Chat's home
 * is the soul-app-sdk sdk-common workbench. This client is at a non-retired path
 * and does not resurrect the retired Host-era session module. See memory
 * worker-standalone-release-map-2026-06-01.
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
 * Read an engine invocation's events for the chat view, with optional
 * `after`/`limit` paging. Canonical route is `GET /api/engine/invocations/:id/events`
 * (docs/protocol.md), which returns the redacted event window plus the current
 * invocation snapshot. This backs the worker-web chat-view event source (poll
 * now; an SSE transport can reuse the same `after`/Last-Event-ID cursor later).
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
