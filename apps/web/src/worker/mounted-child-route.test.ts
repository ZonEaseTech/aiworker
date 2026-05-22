import { describe, expect, it } from 'vitest'

import {
  mountedChildDefaultPath,
  mountedChildPathFromRouteInfo,
  mountedRouteMemoryKey,
  normalizeMountedChildPath,
} from './mounted-child-route'

describe('mounted child route helpers', () => {
  it('uses the manifest route path as the mounted child default', () => {
    expect(mountedChildDefaultPath('/hr')).toBe('/hr')
    expect(mountedChildDefaultPath('')).toBe('/')
  })

  it('normalizes child paths under the mounted base path', () => {
    expect(normalizeMountedChildPath('/hr/profiles/profile-ben', '/hr')).toBe('/hr/profiles/profile-ben')
    expect(normalizeMountedChildPath('/hr/profiles/profile-ben?tab=review#patch', '/hr')).toBe('/hr/profiles/profile-ben?tab=review#patch')
    expect(normalizeMountedChildPath('/qa/release', '/hr')).toBe('/hr')
    expect(normalizeMountedChildPath('', '/hr')).toBe('/hr')
    expect(normalizeMountedChildPath('/profile?tab=x#y', '/')).toBe('/profile?tab=x#y')
  })

  it('reads path-like values from micro-app route info', () => {
    expect(mountedChildPathFromRouteInfo({ fullPath: '/hr/profiles/profile-ben?tab=summary' }, '/hr')).toBe('/hr/profiles/profile-ben?tab=summary')
    expect(mountedChildPathFromRouteInfo({ pathname: '/hr/profiles/profile-stella', search: '?tab=evidence', hash: '#sources' }, '/hr')).toBe('/hr/profiles/profile-stella?tab=evidence#sources')
    expect(mountedChildPathFromRouteInfo({ href: 'http://child.local/hr/profiles/profile-ada?tab=review#patch' }, '/hr')).toBe('/hr/profiles/profile-ada?tab=review#patch')
    expect(mountedChildPathFromRouteInfo({ fullPath: '/hr/profiles/full', href: 'http://child.local/hr/profiles/href', pathname: '/hr/profiles/pathname' }, '/hr')).toBe('/hr/profiles/full')
    expect(mountedChildPathFromRouteInfo({ pathname: '/qa/release' }, '/hr')).toBe('/hr')
  })

  it('keys route memory by app, surface and workspace', () => {
    expect(mountedRouteMemoryKey({
      appId: 'aiworker-hr',
      surfaceId: 'hr-home',
      workspaceId: 'workspace-1',
    })).toBe('aiworker-hr::hr-home::workspace-1')
    expect(mountedRouteMemoryKey({
      appId: 'aiworker-hr',
      surfaceId: 'hr-home',
      workspaceId: null,
    })).toBe('aiworker-hr::hr-home::app')
  })
})
