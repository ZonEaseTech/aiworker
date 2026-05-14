import { useEffect, useState } from 'react'

export type WorkerRoute
  = | { kind: 'home' }
    | { kind: 'worker', workerId: string }
    | { kind: 'workspace', workerId: string, workspaceId: string }
    | { kind: 'session', sessionId: string, workerId: string, workspaceId: string }

export function parseWorkerRoute(pathname: string): WorkerRoute {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts.length === 0)
    return { kind: 'home' }
  if (parts[0] === 'workers' && parts[1]) {
    const workerId = decodeURIComponent(parts[1])
    if (parts[2] === 'workspaces' && parts[3]) {
      const workspaceId = decodeURIComponent(parts[3])
      if (parts[4] === 'sessions' && parts[5]) {
        return {
          kind: 'session',
          sessionId: decodeURIComponent(parts[5]),
          workerId,
          workspaceId,
        }
      }
      return { kind: 'workspace', workerId, workspaceId }
    }
    return { kind: 'worker', workerId }
  }
  if (parts[0] === 'workspaces' && parts[1]) {
    const workspaceId = decodeURIComponent(parts[1])
    if (parts[2] === 'sessions' && parts[3]) {
      return {
        kind: 'session',
        sessionId: decodeURIComponent(parts[3]),
        workerId: '',
        workspaceId,
      }
    }
    return { kind: 'workspace', workerId: '', workspaceId }
  }
  return { kind: 'home' }
}

export function buildWorkerPath(route: WorkerRoute): string {
  if (route.kind === 'home')
    return '/'
  if (route.kind === 'worker')
    return `/workers/${encodeURIComponent(route.workerId)}`
  const workerId = encodeURIComponent(route.workerId)
  const workspaceId = encodeURIComponent(route.workspaceId)
  if (route.kind === 'session')
    return `/workers/${workerId}/workspaces/${workspaceId}/sessions/${encodeURIComponent(route.sessionId)}`
  return `/workers/${workerId}/workspaces/${workspaceId}`
}

export function navigateWorkerRoute(route: WorkerRoute, options: { replace?: boolean } = {}): void {
  const target = buildWorkerPath(route)
  if (target === window.location.pathname)
    return
  if (options.replace)
    window.history.replaceState(null, '', target)
  else
    window.history.pushState(null, '', target)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useWorkerRoute(): WorkerRoute {
  const [route, setRoute] = useState<WorkerRoute>(() => parseWorkerRoute(window.location.pathname))
  useEffect(() => {
    const onPop = () => setRoute(parseWorkerRoute(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return route
}
