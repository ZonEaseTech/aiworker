import type { MountedMicroAppChildEvent, MountedMicroAppHostData } from '@zonease/aiworker-shared'

export interface MountedMicroAppRouteInfo {
  fullPath?: string
  hash?: string
  href?: string
  pathname?: string
  search?: string
}

interface MicroAppRouter {
  afterEach: (listeners: Record<string, (to: MountedMicroAppRouteInfo, from: MountedMicroAppRouteInfo) => unknown>) => () => void
  current: {
    get: (appName: string) => MountedMicroAppRouteInfo | null | undefined
  }
  push: (route: { name: string, path: string }) => void
  replace: (route: { name: string, path: string }) => void
}

interface MicroAppRuntime {
  addDataListener: (appName: string, cb: (data: Record<PropertyKey, unknown>) => unknown, autoTrigger?: boolean) => void
  forceSetData: (appName: string, data: Record<PropertyKey, unknown>, nextStep?: CallableFunction) => void
  removeDataListener: (appName: string, cb: (data: Record<PropertyKey, unknown>) => unknown) => void
  router?: MicroAppRouter
  setData: (appName: string, data: Record<PropertyKey, unknown>, nextStep?: CallableFunction, force?: boolean) => void
  start: (options?: Record<string, unknown>) => void
}

let runtime: MicroAppRuntime | null = null
let started = false
let starting: Promise<MicroAppRuntime | null> | null = null

export function ensureMicroAppStarted(): void {
  void loadMicroAppRuntime()
}

export function setMountedMicroAppElementData(element: (HTMLElement & { data?: MountedMicroAppHostData }) | null, data: MountedMicroAppHostData): void {
  if (element)
    element.data = data
}

export function sendMountedMicroAppData(appName: string, data: MountedMicroAppHostData, options: { force?: boolean } = {}): void {
  void loadMicroAppRuntime().then((microApp) => {
    if (!microApp)
      return
    if (options.force)
      microApp.forceSetData(appName, data as unknown as Record<PropertyKey, unknown>)
    else
      microApp.setData(appName, data as unknown as Record<PropertyKey, unknown>)
  })
}

export function addMountedMicroAppDataListener(
  appName: string,
  listener: (event: MountedMicroAppChildEvent) => void,
  options: { autoTrigger?: boolean } = {},
): () => void {
  let active = true
  let boundRuntime: MicroAppRuntime | null = null
  const wrapped = (data: Record<PropertyKey, unknown>) => {
    const event = normalizeMountedMicroAppChildEvent(data)
    if (event)
      listener(event)
  }
  void loadMicroAppRuntime().then((microApp) => {
    if (!microApp || !active)
      return
    boundRuntime = microApp
    microApp.addDataListener(appName, wrapped, options.autoTrigger)
  })
  return () => {
    active = false
    if (boundRuntime)
      boundRuntime.removeDataListener(appName, wrapped)
  }
}

export async function pushMountedMicroAppRoute(appName: string, path: string): Promise<void> {
  const microApp = await loadMicroAppRuntime()
  microApp?.router?.push({ name: appName, path })
}

export async function replaceMountedMicroAppRoute(appName: string, path: string): Promise<void> {
  const microApp = await loadMicroAppRuntime()
  microApp?.router?.replace({ name: appName, path })
}

export async function getMountedMicroAppCurrentRoute(appName: string): Promise<MountedMicroAppRouteInfo | null | undefined> {
  const microApp = await loadMicroAppRuntime()
  return microApp?.router?.current.get(appName)
}

export async function addMountedMicroAppRouteListener(
  appName: string,
  listener: (to: MountedMicroAppRouteInfo, from: MountedMicroAppRouteInfo) => void,
): Promise<() => void> {
  const microApp = await loadMicroAppRuntime()
  return microApp?.router?.afterEach({
    [appName]: listener,
  }) ?? noop
}

export function setMicroAppRuntimeForTest(value: MicroAppRuntime | null): void {
  if (import.meta.env.MODE !== 'test')
    throw new Error('setMicroAppRuntimeForTest is only available in test')
  runtime = value
  started = Boolean(value)
  starting = null
}

function loadMicroAppRuntime(): Promise<MicroAppRuntime | null> {
  if (runtime)
    return Promise.resolve(runtime)
  if (!canUseMicroAppRuntime())
    return Promise.resolve(null)
  if (starting)
    return starting
  starting = import('@micro-zoe/micro-app')
    .then(({ default: microApp }) => {
      runtime = microApp
      if (!started) {
        microApp.start({
          'disable-sandbox': false,
          'disable-scopecss': false,
          'iframe': false,
        })
        started = true
      }
      return microApp
    })
    .finally(() => {
      starting = null
    })
  return starting
}

function noop(): void {}

function canUseMicroAppRuntime(): boolean {
  if (started && runtime)
    return true
  if (typeof window === 'undefined' || !('customElements' in window))
    return false
  if (import.meta.env.MODE === 'test')
    return false
  return true
}

function normalizeMountedMicroAppChildEvent(data: Record<PropertyKey, unknown>): MountedMicroAppChildEvent | null {
  if (typeof data.type !== 'string')
    return null
  switch (data.type) {
    case 'ready':
      return {
        appId: stringOrUndefined(data.appId),
        receivedHostData: typeof data.receivedHostData === 'boolean' ? data.receivedHostData : undefined,
        surfaceId: stringOrUndefined(data.surfaceId),
        theme: stringOrNull(data.theme),
        type: 'ready',
        workerId: stringOrNull(data.workerId),
        workspaceId: stringOrNull(data.workspaceId),
      }
    case 'error':
      if (typeof data.message !== 'string' || !data.message)
        return null
      return {
        appId: stringOrUndefined(data.appId),
        code: stringOrUndefined(data.code),
        message: data.message,
        surfaceId: stringOrUndefined(data.surfaceId),
        type: 'error',
      }
    case 'resize':
      if (typeof data.height !== 'number' || !Number.isFinite(data.height))
        return null
      return {
        appId: stringOrUndefined(data.appId),
        height: data.height,
        surfaceId: stringOrUndefined(data.surfaceId),
        type: 'resize',
      }
    case 'locator:workspace-selected': {
      const workerId = stringOrUndefined(data.workerId)
      const workspaceId = stringOrUndefined(data.workspaceId)
      if (!workerId || !workspaceId)
        return null
      return {
        appId: stringOrUndefined(data.appId),
        surfaceId: stringOrUndefined(data.surfaceId),
        type: 'locator:workspace-selected',
        workerId,
        workspaceId,
      }
    }
    default:
      return null
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function stringOrNull(value: unknown): string | null | undefined {
  if (value === null)
    return null
  return stringOrUndefined(value)
}
