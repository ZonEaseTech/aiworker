export const activeMountedRoutePreferenceKey = 'aiworker:worker-studio:active-mounted-route'

export function defaultStorage(): Storage | null {
  if (typeof window === 'undefined')
    return null
  try {
    return window.localStorage
  }
  catch {
    return null
  }
}

export function readActiveMountedRoutePreferences(
  storage: Storage | null = defaultStorage(),
): Record<string, string> {
  if (!storage)
    return {}
  try {
    const raw = storage.getItem(activeMountedRoutePreferenceKey)
    if (!raw)
      return {}
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed))
      return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  }
  catch {
    return {}
  }
}

export function persistActiveMountedRoutePreferences(
  preferences: Record<string, string>,
  storage: Storage | null = defaultStorage(),
): void {
  if (!storage)
    return
  try {
    storage.setItem(activeMountedRoutePreferenceKey, JSON.stringify(preferences))
  }
  catch {
    // Shell preferences are best-effort and must not block Host mounting.
  }
}

export function updateWorkerMountedRoutePreference(input: {
  current: Record<string, string>
  routeId: string
  workerId: string
}): Record<string, string> {
  return {
    ...input.current,
    [input.workerId]: input.routeId,
  }
}

export function resolveActiveMountedRoute<T extends { id: string }>(input: {
  preferences: Record<string, string>
  routes: readonly T[]
  workerId: string
}): T | null {
  const fallbackRoute = input.routes[0] ?? null
  const activeRouteId = input.preferences[input.workerId]

  if (!activeRouteId)
    return fallbackRoute

  return input.routes.find(route => route.id === activeRouteId) ?? fallbackRoute
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
