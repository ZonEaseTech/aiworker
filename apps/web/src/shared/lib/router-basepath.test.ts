import { describe, expect, it } from 'vitest'
import { resolveWebRouterBasepath } from './router-basepath'

describe('resolveWebRouterBasepath', () => {
  it('uses /admin for production-hosted admin paths', () => {
    expect(resolveWebRouterBasepath('fleet', '/admin/')).toBe('/admin')
    expect(resolveWebRouterBasepath('worker', '/admin/config')).toBe('/admin')
  })

  it('uses bundle-specific dev paths when loaded through the dev chooser', () => {
    expect(resolveWebRouterBasepath('fleet', '/fleet/workers')).toBe('/fleet')
    expect(resolveWebRouterBasepath('worker', '/worker/config')).toBe('/worker')
  })

  it('uses /w/:workerId for fleet-hosted worker paths', () => {
    expect(resolveWebRouterBasepath('worker', '/w/w_aaaabbbbcccd/config')).toBe('/w/w_aaaabbbbcccd')
    expect(resolveWebRouterBasepath('worker', '/w/not-a-worker/config')).toBe('/admin')
  })

  it('falls back to /admin outside known dev mounts', () => {
    expect(resolveWebRouterBasepath('fleet', '/')).toBe('/admin')
    expect(resolveWebRouterBasepath('worker', '/something-else')).toBe('/admin')
  })
})
