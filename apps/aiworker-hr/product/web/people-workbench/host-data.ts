import type { HrWorkbenchHostData, HrWorkbenchTheme } from './types'

export const HR_WORKBENCH_DEFAULT_APP_ID = 'aiworker-hr'
export const HR_WORKBENCH_DEFAULT_ROUTE_PREFIX = '/api/local/apps/aiworker-hr'

export interface NormalizeHrWorkbenchHostDataInput {
  hostData?: unknown
  search?: string
}

export interface ReadHrWorkbenchHostDataOptions {
  document?: Document | null
  location?: Pick<Location, 'search'> | null
  window?: (Window & {
    __AIWORKER_MICRO_APP_HOST_DATA__?: unknown
    microApp?: {
      getData?: () => unknown
    }
  }) | null
}

export function normalizeHrWorkbenchHostData(input: NormalizeHrWorkbenchHostDataInput = {}): HrWorkbenchHostData {
  const hostData = isRecord(input.hostData) ? input.hostData : {}
  const query = new URLSearchParams((input.search ?? '').replace(/^\?/, ''))
  const appId = normalizedString(hostData.appId) ?? normalizedString(query.get('appId')) ?? HR_WORKBENCH_DEFAULT_APP_ID
  const routePrefix = normalizeRoutePrefix(
    normalizedString(hostData.routePrefix) ?? normalizedString(query.get('routePrefix')) ?? routePrefixForApp(appId),
  )
  return {
    appId,
    routePrefix,
    theme: normalizeTheme(
      Object.hasOwn(hostData, 'theme')
        ? hostData.theme
        : query.get('theme'),
    ),
    workerId: normalizedString(hostData.workerId) ?? normalizedString(query.get('workerId')),
    workspaceId: normalizedString(hostData.workspaceId) ?? normalizedString(query.get('workspaceId')),
  }
}

export function readHrWorkbenchHostData(options: ReadHrWorkbenchHostDataOptions = {}): HrWorkbenchHostData {
  const win = options.window ?? (typeof window === 'undefined' ? null : window)
  const doc = options.document ?? win?.document ?? (typeof document === 'undefined' ? null : document)
  const loc = options.location ?? win?.location ?? (typeof location === 'undefined' ? null : location)
  return normalizeHrWorkbenchHostData({
    hostData: readMountedHostData(win, doc),
    search: loc?.search,
  })
}

function routePrefixForApp(appId: string): string {
  return appId === HR_WORKBENCH_DEFAULT_APP_ID
    ? HR_WORKBENCH_DEFAULT_ROUTE_PREFIX
    : `/api/local/apps/${appId}`
}

function normalizeRoutePrefix(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed)
    return HR_WORKBENCH_DEFAULT_ROUTE_PREFIX
  return trimmed.startsWith('/') || /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `/${trimmed}`
}

function normalizeTheme(value: unknown): HrWorkbenchTheme {
  return value === 'dark' ? 'dark' : 'light'
}

function readMountedHostData(
  win: ReadHrWorkbenchHostDataOptions['window'],
  doc: Document | null,
): unknown {
  if (isRecord(win?.__AIWORKER_MICRO_APP_HOST_DATA__))
    return win.__AIWORKER_MICRO_APP_HOST_DATA__

  try {
    const microAppData = win?.microApp?.getData?.()
    if (isRecord(microAppData))
      return microAppData
  }
  catch {
    // Host data is optional; query fallback handles missing or unavailable bridge data.
  }

  const element = doc?.getElementById('aiworker-micro-app-host-data')
  const text = element?.textContent?.trim()
  if (!text)
    return null
  try {
    return JSON.parse(text) as unknown
  }
  catch {
    return null
  }
}

function normalizedString(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
