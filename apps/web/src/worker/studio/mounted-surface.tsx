import type {
  MountedMicroAppChildEvent,
  MountedMicroAppHostData,
} from '@zonease/aiworker-soul-protocol'
import type { MutableRefObject } from 'react'
import type { ResolvedTheme } from '../../features/theme/system-theme'

import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { CardContent } from '@zonease/aiworker-ui/components/card'
import { ItemDescription } from '@zonease/aiworker-ui/components/item'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveMountedWorkbench } from '../../features/local-workspace/api/workspace-data'
import {
  addMountedMicroAppDataListener,
  addMountedMicroAppRouteListener,
  ensureMicroAppStarted,
  getMountedMicroAppCurrentRoute,
  pushMountedMicroAppRoute,
  replaceMountedMicroAppRoute,
  sendMountedMicroAppData,
  setMountedMicroAppElementData,
} from '../../lib/micro-app-runtime'
import {
  mountedChildDefaultPath,
  mountedChildPathFromRouteInfo,
  mountedRouteMemoryKey,
  normalizeMountedChildPath,
} from '../mounted-child-route'

interface OpenMountedChildRouteOptions {
  replace?: boolean
}

export interface MountedWorkbenchRoute {
  id: string
  label: string
  path: string
  surface: {
    renderer: 'micro-app'
    scope: 'app' | 'artifact' | 'review' | 'session' | 'workspace'
  }
}

interface MountedWorkbenchResponse {
  locator: {
    sessionId: string | null
    workerId: string
    workspaceId: string | null
  }
  microApp: {
    data: MountedMicroAppHostData
    name: string
    url: string
  }
  mount: {
    appId: string
    entry: string
    surfaceId: string
    type: 'micro-app'
  }
  routerMode: 'search'
  surface: {
    id: string
    kind: string
    label: string
    renderer: 'micro-app'
  }
}

export function MountedSoulAppRouteSurface({
  appId,
  resolvedTheme,
  route,
  routeMemoryRef,
  sessionId,
  onSelectWorkspace,
  workerId,
  workspaceId,
}: {
  appId: string
  resolvedTheme: ResolvedTheme
  route: MountedWorkbenchRoute
  routeMemoryRef: MutableRefObject<Map<string, string>>
  sessionId?: string | null
  onSelectWorkspace?: (workspaceId: string) => void
  workerId?: string | null
  workspaceId?: string | null
}) {
  const microAppRef = useRef<(HTMLElement & { data?: MountedMicroAppHostData }) | null>(null)
  const [surface, setSurface] = useState<MountedWorkbenchResponse | null>(null)
  const [childError, setChildError] = useState<string | null>(null)
  const [childReady, setChildReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const childBasePath = mountedChildDefaultPath(route.path)
  const mountedChildRouteMemoryKeyValue = mountedRouteMemoryKey({
    appId,
    surfaceId: route.id,
    workspaceId,
  })
  const mountedMicroAppData = useMemo<MountedMicroAppHostData | null>(() => {
    if (!surface)
      return null
    return {
      ...surface.microApp.data,
      appId: surface.microApp.data.appId ?? appId,
      surfaceId: surface.microApp.data.surfaceId ?? route.id,
      surfaceKind: surface.surface.kind,
      sessionId: sessionId ?? null,
      theme: resolvedTheme,
      workerId: workerId ?? null,
      workspaceId: workspaceId ?? null,
    }
  }, [appId, resolvedTheme, route.id, sessionId, surface, workerId, workspaceId])

  useEffect(() => {
    ensureMicroAppStarted()
  }, [])

  const handleMountedMicroAppChildEvent = useCallback((event: MountedMicroAppChildEvent): void => {
    if (event.type === 'ready') {
      setChildReady(true)
      return
    }
    if (event.type === 'error') {
      setChildError(event.message)
      return
    }
    if (event.type === 'locator:workspace-selected') {
      if (event.workerId === workerId)
        onSelectWorkspace?.(event.workspaceId)
    }
  }, [onSelectWorkspace, workerId])

  useEffect(() => {
    if (!surface || !mountedMicroAppData)
      return undefined
    setMountedMicroAppElementData(microAppRef.current, mountedMicroAppData)
    const stopListening = addMountedMicroAppDataListener(surface.microApp.name, (event) => {
      if (event.appId && event.appId !== appId)
        return
      if (event.surfaceId && event.surfaceId !== surface.surface.id)
        return
      handleMountedMicroAppChildEvent(event)
    }, { autoTrigger: true })
    sendMountedMicroAppData(surface.microApp.name, mountedMicroAppData, { force: true })
    return stopListening
  }, [appId, handleMountedMicroAppChildEvent, mountedMicroAppData, surface])

  useEffect(() => {
    if (!surface)
      return undefined
    let active = true
    let stopRouteListening: (() => void) | null = null

    void getMountedMicroAppCurrentRoute(surface.microApp.name).then((currentRoute) => {
      if (!active)
        return
      const currentPath = mountedChildPathFromRouteInfo(currentRoute, childBasePath)
      const rememberedPath = routeMemoryRef.current.get(mountedChildRouteMemoryKeyValue)
      if (rememberedPath) {
        if (rememberedPath !== currentPath) {
          void openMountedChildRoute(
            surface.microApp.name,
            routeMemoryRef,
            mountedChildRouteMemoryKeyValue,
            childBasePath,
            rememberedPath,
            { replace: true },
          )
        }
        return
      }
      routeMemoryRef.current.set(mountedChildRouteMemoryKeyValue, childBasePath)
      if (currentPath !== childBasePath) {
        void openMountedChildRoute(
          surface.microApp.name,
          routeMemoryRef,
          mountedChildRouteMemoryKeyValue,
          childBasePath,
          childBasePath,
          { replace: true },
        )
      }
    })

    void addMountedMicroAppRouteListener(surface.microApp.name, (to) => {
      if (!active)
        return
      routeMemoryRef.current.set(mountedChildRouteMemoryKeyValue, mountedChildPathFromRouteInfo(to, childBasePath))
    }).then((cleanup) => {
      if (!active) {
        cleanup()
        return
      }
      stopRouteListening = cleanup
    })

    return () => {
      active = false
      stopRouteListening?.()
    }
  }, [childBasePath, mountedChildRouteMemoryKeyValue, routeMemoryRef, surface])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setChildError(null)
    resolveMountedWorkbench<MountedWorkbenchResponse>({
      sessionId,
      theme: resolvedTheme,
      workerId,
      workspaceId,
    })
      .then((response) => {
        if (!cancelled)
          setSurface(response)
      })
      .catch((caught: unknown) => {
        if (!cancelled)
          setError(caught instanceof Error ? caught.message : String(caught))
      })
      .finally(() => {
        if (!cancelled)
          setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [appId, resolvedTheme, route.id, sessionId, workerId, workspaceId])

  return (
    <>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-7 py-3 max-md:px-4">
        {error
          ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )
          : null}
        {childError
          ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{childError}</AlertDescription>
              </Alert>
            )
          : null}
        {loading
          ? <ItemDescription role="status">Loading mounted Soul App surface...</ItemDescription>
          : null}
        {surface
          ? (
              <micro-app
                ref={microAppRef}
                data-child-ready={childReady ? 'true' : 'false'}
                data-slot="soul-app-mounted-micro-app"
                destroy
                baseroute={childBasePath}
                name={surface.microApp.name}
                router-mode="search"
                title={surface.surface.label}
                url={surface.microApp.url}
                className="min-h-0 w-full flex-1"
              />
            )
          : null}
      </CardContent>
    </>
  )
}

async function openMountedChildRoute(
  microAppName: string,
  routeMemoryRef: MutableRefObject<Map<string, string>>,
  memoryKey: string,
  basePath: string,
  path: string,
  options: OpenMountedChildRouteOptions = {},
): Promise<void> {
  const nextPath = normalizeMountedChildPath(path, basePath)
  if (options.replace)
    await replaceMountedMicroAppRoute(microAppName, nextPath)
  else
    await pushMountedMicroAppRoute(microAppName, nextPath)
  routeMemoryRef.current.set(memoryKey, nextPath)
}
