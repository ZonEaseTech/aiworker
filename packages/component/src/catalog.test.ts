import { describe, expect, it } from 'vitest'

import { componentCatalog, componentMigrationQueue } from './catalog'

describe('component catalog', () => {
  it('has unique component names', () => {
    const names = componentCatalog.map(item => item.name)

    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps every component owned by the shared Host/Soul library', () => {
    expect(componentCatalog.every(item => item.owner === 'host-soul-shared')).toBe(true)
  })

  it('tracks a concrete migration queue', () => {
    expect(componentMigrationQueue.length).toBeGreaterThan(0)
    expect(componentMigrationQueue.every(item => item.source && item.target && item.reason)).toBe(true)
  })
})
