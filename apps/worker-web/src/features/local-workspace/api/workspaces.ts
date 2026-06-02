import type { LocalSession, LocalWorkspace } from '@zonease/aiworker-soul-descriptor'

import { localJson } from '../../../shared/api/local-client'

export function createWorkspace(workerId: string, input: {
  metadata?: Record<string, unknown>
  name: string
  sourcePointers?: Record<string, unknown>[]
  type?: string
}): Promise<{ workspace: LocalWorkspace }> {
  return localJson('/api/workspace-locators', { method: 'POST', body: JSON.stringify({ workerId, ...input }) })
}

/**
 * Create a session inside a workspace. Canonical route is `POST /api/sessions`
 * (docs/runtime.md); the body carries locator metadata (worker + workspace) plus
 * a title, no Host-owned context text. This backs the worker-web Workbench
 * "new session" action; the session experience renders directly in the Workbench
 * chat surface, not a mounted micro-app.
 */
export function createSession(input: {
  metadata?: Record<string, unknown>
  title: string
  workerId: string
  workspaceId: string
}): Promise<{ session: LocalSession }> {
  return localJson('/api/sessions', { method: 'POST', body: JSON.stringify(input) })
}
