import { WORKER_ID_PATTERN } from '@zonease/aiworker-shared'

const WORKER_API_BASE = '/api/worker'

export function resolveWorkerApiBasePath(
  pathname = globalThis.location?.pathname ?? '/admin/',
): string {
  const workerId = fleetHostedWorkerId(pathname)
  if (!workerId)
    return WORKER_API_BASE
  return `/w/${workerId}${WORKER_API_BASE}`
}

export function isFleetHostedWorkerPath(
  pathname = globalThis.location?.pathname ?? '/admin/',
): boolean {
  return fleetHostedWorkerId(pathname) !== null
}

export function workerApiUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  if (suffix === WORKER_API_BASE || suffix.startsWith(`${WORKER_API_BASE}/`))
    return `${resolveWorkerApiBasePath()}${suffix.slice(WORKER_API_BASE.length)}`
  return `${resolveWorkerApiBasePath()}${suffix}`
}

function fleetHostedWorkerId(pathname: string): string | null {
  const match = /^\/w\/([^/]+)(?:\/|$)/.exec(pathname)
  if (!match)
    return null
  const workerId = match[1]!
  return WORKER_ID_PATTERN.test(workerId) ? workerId : null
}
