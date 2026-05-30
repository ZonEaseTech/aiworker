import { describe, expect, it } from 'vitest'

import {
  mountedChildDefaultPath,
  mountedChildPathFromRouteInfo,
  mountedRouteMemoryKey,
  normalizeMountedChildPath,
} from './mounted-child-route'

describe('mounted child route helpers', () => {
  it('uses the manifest route path as the mounted child default', () => {
    expect(mountedChildDefaultPath('/workbench')).toBe('/workbench')
    expect(mountedChildDefaultPath('')).toBe('/')
  })

  it('normalizes child paths under the mounted base path', () => {
    expect(normalizeMountedChildPath('/workbench/items/item-alpha', '/workbench')).toBe('/workbench/items/item-alpha')
    expect(normalizeMountedChildPath('/workbench/items/item-alpha?tab=notes#patch', '/workbench')).toBe('/workbench/items/item-alpha?tab=notes#patch')
    expect(normalizeMountedChildPath('/outside/other', '/workbench')).toBe('/workbench')
    expect(normalizeMountedChildPath('', '/workbench')).toBe('/workbench')
    expect(normalizeMountedChildPath('/item?tab=x#y', '/')).toBe('/item?tab=x#y')
  })

  it('reads path-like values from micro-app route info', () => {
    expect(mountedChildPathFromRouteInfo({ fullPath: '/workbench/items/item-alpha?tab=summary' }, '/workbench')).toBe('/workbench/items/item-alpha?tab=summary')
    expect(mountedChildPathFromRouteInfo({ pathname: '/workbench/items/item-beta', search: '?tab=evidence', hash: '#sources' }, '/workbench')).toBe('/workbench/items/item-beta?tab=evidence#sources')
    expect(mountedChildPathFromRouteInfo({ href: 'http://child.local/workbench/items/item-gamma?tab=notes#patch' }, '/workbench')).toBe('/workbench/items/item-gamma?tab=notes#patch')
    expect(mountedChildPathFromRouteInfo({ fullPath: '/workbench/items/full', href: 'http://child.local/workbench/items/href', pathname: '/workbench/items/pathname' }, '/workbench')).toBe('/workbench/items/full')
    expect(mountedChildPathFromRouteInfo({ pathname: '/outside/other' }, '/workbench')).toBe('/workbench')
  })

  it('keys route memory by app, surface and workspace', () => {
    expect(mountedRouteMemoryKey({
      appId: 'aiworker-demo-primary',
      surfaceId: 'workbench',
      workspaceId: 'workspace-1',
    })).toBe('aiworker-demo-primary::workbench::workspace-1')
    expect(mountedRouteMemoryKey({
      appId: 'aiworker-demo-primary',
      surfaceId: 'workbench',
      workspaceId: null,
    })).toBe('aiworker-demo-primary::workbench::app')
  })
})
