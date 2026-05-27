import type { SoulAppMountedSurfaceScope } from './manifest'

export interface MountedMicroAppHostData {
  appId: string
  artifactId?: string | null
  expiresAt?: string | null
  mountTokenPresent?: boolean
  routePrefix?: string | null
  sessionId?: string | null
  surfaceId: string
  surfaceKind: string
  surfaceScope?: SoulAppMountedSurfaceScope | string | null
  theme?: string | null
  workerId?: string | null
  workspaceId?: string | null
}

export type MountedMicroAppChildEvent
  = | {
    appId?: string
    receivedHostData?: boolean
    surfaceId?: string
    theme?: string | null
    type: 'ready'
    workerId?: string | null
    workspaceId?: string | null
  }
  | {
    appId?: string
    code?: string
    message: string
    surfaceId?: string
    type: 'error'
  }
  | {
    appId?: string
    height: number
    surfaceId?: string
    type: 'resize'
  }
  | {
    appId?: string
    surfaceId?: string
    type: 'locator:workspace-selected'
    workerId: string
    workspaceId: string
  }
