/**
 * Minimal broker client for the mounted SDK common workbench (方案 C).
 *
 * The workbench talks to the worker daemon broker over same-origin HTTP using the
 * locator-injected session id. It owns only the calls the chat surface needs:
 * submitting a session-level follow-up invocation and locating the invocation's
 * SSE event stream (consumed via EventSource in the browser).
 */

export interface SubmitInvocationResult {
  invocationId: string
}

/** Path of the invocation-scoped SSE event stream (US-005 text/event-stream). */
export function invocationEventStreamPath(invocationId: string): string {
  return `/api/engine/invocations/${invocationId}/events`
}

/**
 * Create a session-level follow-up invocation. Mirrors the broker contract
 * `POST /api/sessions/:sessionId/invocations` with a `{ input }` body and returns
 * the new invocation id so the transcript can stream its events.
 */
export async function submitInvocation(
  sessionId: string,
  input: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<SubmitInvocationResult> {
  const response = await fetchImpl(`/api/sessions/${sessionId}/invocations`, {
    body: JSON.stringify({ input }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok)
    throw new Error(`submitInvocation failed: ${response.status}`)
  const body = await response.json() as { invocation?: { id?: unknown } }
  const invocationId = body.invocation?.id
  if (typeof invocationId !== 'string' || invocationId.length === 0)
    throw new Error('submitInvocation: response missing invocation id')
  return { invocationId }
}
