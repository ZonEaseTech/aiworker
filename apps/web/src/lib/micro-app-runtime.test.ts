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

    await pushMountedMicroAppRoute('aiworker-demo-people--workbench', '/workbench/items/item-ben')
    await replaceMountedMicroAppRoute('aiworker-demo-people--workbench', '/workbench')

    expect(push).toHaveBeenCalledWith({ name: 'aiworker-demo-people--workbench', path: '/workbench/items/item-ben' })
    expect(replace).toHaveBeenCalledWith({ name: 'aiworker-demo-people--workbench', path: '/workbench' })
  })

  it('returns the current route for one mounted child app', async () => {
    const get = vi.fn().mockReturnValue({ pathname: '/workbench/items/item-ben', search: '?tab=summary' })
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

    await expect(getMountedMicroAppCurrentRoute('aiworker-demo-people--workbench')).resolves.toEqual({
      pathname: '/workbench/items/item-ben',
      search: '?tab=summary',
    })
    expect(get).toHaveBeenCalledWith('aiworker-demo-people--workbench')
  })

  it('binds route afterEach for the target app and returns cleanup', async () => {
    const cleanup = vi.fn()
    const afterEach = vi.fn().mockImplementation((listeners) => {
      listeners['aiworker-demo-people--workbench']({ pathname: '/workbench/items/item-stella' }, { pathname: '/workbench' })
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

    const stop = await addMountedMicroAppRouteListener('aiworker-demo-people--workbench', listener)
    stop()

    expect(afterEach).toHaveBeenCalledWith({
      'aiworker-demo-people--workbench': expect.any(Function),
    })
    expect(listener).toHaveBeenCalledWith({ pathname: '/workbench/items/item-stella' }, { pathname: '/workbench' })
    expect(cleanup).toHaveBeenCalled()
  })
})
