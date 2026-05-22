import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  addMountedMicroAppRouteListener,
  getMountedMicroAppCurrentRoute,
  pushMountedMicroAppRoute,
  replaceMountedMicroAppRoute,
  setMicroAppRuntimeForTest,
} from './micro-app-runtime'

describe('micro-app-runtime route helpers', () => {
  afterEach(() => {
    setMicroAppRuntimeForTest(null)
  })

  it('pushes and replaces mounted child routes through micro-app router', async () => {
    const push = vi.fn()
    const replace = vi.fn()
    setMicroAppRuntimeForTest({
      addDataListener: vi.fn(),
      forceSetData: vi.fn(),
      removeDataListener: vi.fn(),
      router: {
        afterEach: vi.fn(),
        current: { get: vi.fn() },
        push,
        replace,
      },
      setData: vi.fn(),
      start: vi.fn(),
    })

    await pushMountedMicroAppRoute('aiworker-hr--hr-home', '/hr/profiles/profile-ben')
    await replaceMountedMicroAppRoute('aiworker-hr--hr-home', '/hr')

    expect(push).toHaveBeenCalledWith({ name: 'aiworker-hr--hr-home', path: '/hr/profiles/profile-ben' })
    expect(replace).toHaveBeenCalledWith({ name: 'aiworker-hr--hr-home', path: '/hr' })
  })

  it('returns the current route for one mounted child app', async () => {
    const get = vi.fn().mockReturnValue({ pathname: '/hr/profiles/profile-ben', search: '?tab=summary' })
    setMicroAppRuntimeForTest({
      addDataListener: vi.fn(),
      forceSetData: vi.fn(),
      removeDataListener: vi.fn(),
      router: {
        afterEach: vi.fn(),
        current: { get },
        push: vi.fn(),
        replace: vi.fn(),
      },
      setData: vi.fn(),
      start: vi.fn(),
    })

    await expect(getMountedMicroAppCurrentRoute('aiworker-hr--hr-home')).resolves.toEqual({
      pathname: '/hr/profiles/profile-ben',
      search: '?tab=summary',
    })
    expect(get).toHaveBeenCalledWith('aiworker-hr--hr-home')
  })

  it('binds route afterEach for the target app and returns cleanup', async () => {
    const cleanup = vi.fn()
    const afterEach = vi.fn().mockImplementation((listeners) => {
      listeners['aiworker-hr--hr-home']({ pathname: '/hr/profiles/profile-stella' }, { pathname: '/hr' })
      return cleanup
    })
    const listener = vi.fn()
    setMicroAppRuntimeForTest({
      addDataListener: vi.fn(),
      forceSetData: vi.fn(),
      removeDataListener: vi.fn(),
      router: {
        afterEach,
        current: { get: vi.fn() },
        push: vi.fn(),
        replace: vi.fn(),
      },
      setData: vi.fn(),
      start: vi.fn(),
    })

    const stop = await addMountedMicroAppRouteListener('aiworker-hr--hr-home', listener)
    stop()

    expect(afterEach).toHaveBeenCalledWith({
      'aiworker-hr--hr-home': expect.any(Function),
    })
    expect(listener).toHaveBeenCalledWith({ pathname: '/hr/profiles/profile-stella' }, { pathname: '/hr' })
    expect(cleanup).toHaveBeenCalled()
  })
})
