/**
 * Minimal broker client for the mounted SDK common workbench (方案 C).
 *
 * The workbench talks to the worker daemon broker over same-origin HTTP using the
 * locator-injected session/workspace ids. It owns only the calls the chat surface
 * needs: submitting a session-level follow-up invocation, locating the invocation's
 * SSE event stream (consumed via EventSource), and listing workspace artifacts.
 */

import type { EngineTarget, WorkerConfigValue, WorkerOverlayAsset } from './config-mapper'
import type { ProjectionReceiptStatus } from './lifecycle-mapper'
import type { WorkbenchFile } from './transcript-mapper'

export interface SubmitInvocationResult {
  invocationId: string
}

/** Path of the invocation-scoped SSE event stream (US-005 text/event-stream). */
export function invocationEventStreamPath(invocationId: string): string {
  return `/api/engine/invocations/${invocationId}/events`
}

/**
 * List the workspace's files for the mounted artifacts surface. Workspace-scoped
 * because session artifacts live in the workspace, not on a single invocation.
 */
export async function fetchWorkspaceFiles(
  workspaceId: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<WorkbenchFile[]> {
  const response = await fetchImpl(`/api/workspace-locators/${workspaceId}/files`)
  if (!response.ok)
    throw new Error(`fetchWorkspaceFiles failed: ${response.status}`)
  const body = await response.json() as { files?: unknown }
  return Array.isArray(body.files) ? body.files as WorkbenchFile[] : []
}

/** Read the worker's configuration values for the mounted configuration modules. */
export async function fetchWorkerConfig(
  workerId: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<WorkerConfigValue[]> {
  const response = await fetchImpl(`/api/workers/${workerId}/config`)
  if (!response.ok)
    throw new Error(`fetchWorkerConfig failed: ${response.status}`)
  const body = await response.json() as { config?: { values?: unknown } }
  return Array.isArray(body.config?.values) ? body.config.values as WorkerConfigValue[] : []
}

/** Read the local engine targets for the mounted engine-readiness module. */
export async function fetchEngineTargets(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<EngineTarget[]> {
  const response = await fetchImpl('/api/engine/targets')
  if (!response.ok)
    throw new Error(`fetchEngineTargets failed: ${response.status}`)
  const body = await response.json() as { engines?: unknown }
  return Array.isArray(body.engines) ? body.engines as EngineTarget[] : []
}

/**
 * Read the worker's overlay assets (skills / MCP clients / entry files) from the
 * worker-config response for the mounted overlay modules.
 */
export async function fetchWorkerOverlay(
  workerId: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<WorkerOverlayAsset[]> {
  const response = await fetchImpl(`/api/workers/${workerId}/config`)
  if (!response.ok)
    throw new Error(`fetchWorkerOverlay failed: ${response.status}`)
  const body = await response.json() as { overlay?: { assets?: unknown } }
  return Array.isArray(body.overlay?.assets) ? body.overlay.assets as WorkerOverlayAsset[] : []
}

/** Read the workspace projection receipt status for the mounted lifecycle module. */
export async function fetchProjectionReceipt(
  workspaceId: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<ProjectionReceiptStatus> {
  const response = await fetchImpl(`/api/projections/receipts/${workspaceId}`)
  // 404 (not_found) and 409 (stale) carry a valid receipt status, not a hard error.
  if (!response.ok && response.status !== 404 && response.status !== 409)
    throw new Error(`fetchProjectionReceipt failed: ${response.status}`)
  return await response.json() as ProjectionReceiptStatus
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
