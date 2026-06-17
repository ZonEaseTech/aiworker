import { describe, expect, test } from 'bun:test'
import { adminMutationHeaders, adminReadHeaders, clearAdminToken, readAdminTokenStorageState, saveAdminToken } from './admin-api-client'

describe('admin API client token storage', () => {
  test('stores session tokens and sends them as bearer headers', () => {
    const storage = installBrowserStorage()
    try {
      expect(readAdminTokenStorageState()).toEqual({ location: null, stored: false })

      expect(saveAdminToken(' session-token ', false)).toEqual({ location: 'session', stored: true })
      expect(adminReadHeaders()).toEqual({
        authorization: 'Bearer session-token',
      })
      expect(adminMutationHeaders()).toEqual({
        'authorization': 'Bearer session-token',
        'x-aiworker-admin-action': '1',
      })
      expect(storage.session.getItem('AIWORKER_WEB_ADMIN_TOKEN')).toBe('session-token')
      expect(storage.local.getItem('AIWORKER_WEB_ADMIN_TOKEN')).toBeNull()
    }
    finally {
      storage.restore()
    }
  })

  test('persistent token storage replaces session storage and clear removes both', () => {
    const storage = installBrowserStorage()
    try {
      saveAdminToken('session-token', false)
      expect(saveAdminToken('persisted-token', true)).toEqual({ location: 'local', stored: true })
      expect(storage.local.getItem('AIWORKER_WEB_ADMIN_TOKEN')).toBe('persisted-token')
      expect(storage.session.getItem('AIWORKER_WEB_ADMIN_TOKEN')).toBeNull()

      expect(clearAdminToken()).toEqual({ location: null, stored: false })
      expect(adminMutationHeaders()).toEqual({ 'x-aiworker-admin-action': '1' })
    }
    finally {
      storage.restore()
    }
  })
})

function installBrowserStorage(): { local: Storage, restore: () => void, session: Storage } {
  const local = createStorage()
  const session = createStorage()
  const previousLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const previousSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')

  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session })

  return {
    local,
    restore() {
      restoreProperty('localStorage', previousLocal)
      restoreProperty('sessionStorage', previousSession)
    },
    session,
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

function restoreProperty(name: 'localStorage' | 'sessionStorage', descriptor: PropertyDescriptor | undefined): void {
  if (descriptor)
    Object.defineProperty(globalThis, name, descriptor)
  else
    Reflect.deleteProperty(globalThis, name)
}
