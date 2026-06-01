export interface WorkbenchLocator {
  sessionId: string | null
  workerId: string | null
  workspaceId: string | null
}

/**
 * Read the worker/workspace/session locator the daemon injects into the mounted
 * common workbench via `router-mode="search"` (URL query string). The mounted
 * micro-app receives no props beyond the URL, so this is the single entry point
 * for locator context. Absent params return null (e.g. no session selected yet).
 */
export function readWorkbenchLocator(search: string): WorkbenchLocator {
  const params = new URLSearchParams(search)
  return {
    sessionId: params.get('sessionId'),
    workerId: params.get('workerId'),
    workspaceId: params.get('workspaceId'),
  }
}
