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

/**
 * Submit a session-level follow-up invocation — the worker-web chat composer's
 * submit target. Canonical follow-up route is `POST /api/sessions/:id/invocations`
 * (docs/runtime.md); employees connect to the Worker web directly, so this hits
 * the local broker with no Host on the path.
 *
 * This is the platform-generic session surface (composer → invocation), owned by
 * worker-web per the Model A boundary (generic chat = worker-web; Soul domain UI =
 * mounted workbench). It is a new surface at a non-retired path; the retired
 * Host-era session module (`api/sessions.ts`, `session-composer.tsx`, etc.) stays
 * removed and guard-blocked.
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
