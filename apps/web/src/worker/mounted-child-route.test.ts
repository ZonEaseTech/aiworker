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
    expect(normalizeMountedChildPath('/workbench/items/item-ben', '/workbench')).toBe('/workbench/items/item-ben')
    expect(normalizeMountedChildPath('/workbench/items/item-ben?tab=review#patch', '/workbench')).toBe('/workbench/items/item-ben?tab=review#patch')
    expect(normalizeMountedChildPath('/outside/release', '/workbench')).toBe('/workbench')
    expect(normalizeMountedChildPath('', '/workbench')).toBe('/workbench')
    expect(normalizeMountedChildPath('/item?tab=x#y', '/')).toBe('/item?tab=x#y')
  })

  it('reads path-like values from micro-app route info', () => {
    expect(mountedChildPathFromRouteInfo({ fullPath: '/workbench/items/item-ben?tab=summary' }, '/workbench')).toBe('/workbench/items/item-ben?tab=summary')
    expect(mountedChildPathFromRouteInfo({ pathname: '/workbench/items/item-stella', search: '?tab=evidence', hash: '#sources' }, '/workbench')).toBe('/workbench/items/item-stella?tab=evidence#sources')
    expect(mountedChildPathFromRouteInfo({ href: 'http://child.local/workbench/items/item-ada?tab=review#patch' }, '/workbench')).toBe('/workbench/items/item-ada?tab=review#patch')
    expect(mountedChildPathFromRouteInfo({ fullPath: '/workbench/items/full', href: 'http://child.local/workbench/items/href', pathname: '/workbench/items/pathname' }, '/workbench')).toBe('/workbench/items/full')
    expect(mountedChildPathFromRouteInfo({ pathname: '/outside/release' }, '/workbench')).toBe('/workbench')
  })

  it('keys route memory by app, surface and workspace', () => {
    expect(mountedRouteMemoryKey({
      appId: 'aiworker-demo-people',
      surfaceId: 'workbench',
      workspaceId: 'workspace-1',
    })).toBe('aiworker-demo-people::workbench::workspace-1')
    expect(mountedRouteMemoryKey({
      appId: 'aiworker-demo-people',
      surfaceId: 'workbench',
      workspaceId: null,
    })).toBe('aiworker-demo-people::workbench::app')
  })
})
