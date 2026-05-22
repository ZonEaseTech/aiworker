import type { MountedMicroAppRouteInfo } from '../lib/micro-app-runtime'

export function mountedChildDefaultPath(routePath: string | null | undefined): string {
  return routePath && routePath.startsWith('/') ? routePath : '/'
}

export function normalizeMountedChildPath(path: string | null | undefined, basePath: string): string {
  const fallback = mountedChildDefaultPath(basePath)
  if (!path)
    return fallback
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (fallback === '/')
    return normalized
  const pathname = normalized.split(/[?#]/, 1)[0] || '/'
  return pathname === fallback || pathname.startsWith(`${fallback}/`) ? normalized : fallback
}

export function mountedChildPathFromRouteInfo(route: MountedMicroAppRouteInfo | null | undefined, basePath: string): string {
  if (!route)
    return mountedChildDefaultPath(basePath)
  if (route.fullPath)
    return normalizeMountedChildPath(route.fullPath, basePath)
  if (route.href) {
    try {
      const url = new URL(route.href, 'http://aiworker.local')
      return normalizeMountedChildPath(`${url.pathname}${url.search}${url.hash}`, basePath)
    }
    catch {
      return normalizeMountedChildPath(route.href, basePath)
    }
  }
  const path = `${route.pathname ?? ''}${route.search ?? ''}${route.hash ?? ''}`
  return normalizeMountedChildPath(path, basePath)
}

export function mountedRouteMemoryKey(input: {
  appId: string
  surfaceId: string
  workspaceId?: string | null
}): string {
  return `${input.appId}::${input.surfaceId}::${input.workspaceId || 'app'}`
}
