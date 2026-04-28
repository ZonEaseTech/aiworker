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

  it('falls back to /admin outside known dev mounts', () => {
    expect(resolveWebRouterBasepath('fleet', '/')).toBe('/admin')
    expect(resolveWebRouterBasepath('worker', '/something-else')).toBe('/admin')
  })
})
