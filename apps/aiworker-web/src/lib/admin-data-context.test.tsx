import { describe, expect, test } from 'bun:test'
import { saveAdminToken } from './admin-api-client'
import { adminDataUnavailableStateFromError, loadAdminDataFromApi } from './admin-data-context'

describe('admin data context unavailable state', () => {
  test('keeps a live control-plane failure distinct from fixture preview', () => {
    const state = adminDataUnavailableStateFromError(new Error('admin data load failed: 500'))

    expect(state.bootstrap.source).toBe('control-plane')
    expect(state.bootstrap.controlPlaneDirConfigured).toBe(true)
    expect(state.isLive).toBe(false)
    expect(state.loadError.code).toBe('control_plane_unavailable')
    expect(state.loadError.title).toBe('管理数据暂时不可用')
  })

  test('sends a stored admin token on the initial admin-data read', async () => {
    const storage = installBrowserStorage()
    const previousFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
    let observedHeaders: HeadersInit | undefined
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (_input: RequestInfo | URL, init?: RequestInit) => {
        observedHeaders = init?.headers
        return Response.json({
          approvals: [],
          bootstrap: {
            adminTokenRequired: true,
            auth: {
              authenticated: true,
              loginRequired: true,
              loginUrl: '/login',
              logoutUrl: '/logout',
              mode: 'logto',
              via: 'token',
            },
            controlPlaneDirConfigured: true,
            host: '127.0.0.1',
            remoteAccessEnabled: false,
            source: 'control-plane',
          },
          snapshot: null,
          source: 'control-plane',
        })
      },
    })

    try {
      saveAdminToken('browser-token', false)
      const state = await loadAdminDataFromApi()

      expect(observedHeaders).toEqual({ authorization: 'Bearer browser-token' })
      expect(state.bootstrap.auth.authenticated).toBe(true)
      expect(state.bootstrap.auth.via).toBe('token')
    }
    finally {
      storage.restore()
      restoreProperty('fetch', previousFetch)
    }
  })
})

function installBrowserStorage(): { restore: () => void } {
  const local = createStorage()
  const session = createStorage()
  const previousLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const previousSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')

  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session })

  return {
    restore() {
      restoreProperty('localStorage', previousLocal)
      restoreProperty('sessionStorage', previousSession)
    },
  }
}

function createStorage(): Storage {
  const data = new Map<string, string>()
  return {
    clear: () => data.clear(),
    getItem: key => data.get(key) ?? null,
    key: index => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size
    },
    removeItem: key => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  }
}

function restoreProperty(name: 'fetch' | 'localStorage' | 'sessionStorage', descriptor: PropertyDescriptor | undefined): void {
  if (descriptor)
    Object.defineProperty(globalThis, name, descriptor)
  else
    Reflect.deleteProperty(globalThis, name)
}
