import { describe, expect, it } from 'vitest'

import { componentCatalog, componentGovernanceRules, componentMigrationQueue } from './catalog'

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

  it('keeps the component-library preflight rule discoverable', () => {
    const preflight = componentGovernanceRules.find(rule => rule.id === 'component-library-preflight')

    expect(preflight).toBeTruthy()
    expect(preflight?.appliesTo).toContain('apps/web')
    expect(preflight?.requiredEvidence.join('\n')).toContain('componentMigrationQueue')
  })
})
