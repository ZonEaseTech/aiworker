import { describe, expect, it } from 'bun:test'

import {
  BUILTIN_SOUL_MODULES,
  createBuiltinSoulRegistry,
  developerSoulModule,
  hrRecruitingSoulModule,
} from './modules'
import { createSoulRegistry, SoulRegistry } from './registry'

describe('SoulRegistry', () => {
  it('registers and looks up modules', () => {
    const registry = new SoulRegistry()
    registry.register(developerSoulModule)
    expect(registry.has('developer')).toBe(true)
    expect(registry.get('developer')).toEqual(developerSoulModule)
    expect(registry.list().length).toBe(1)
    expect(registry.size()).toBe(1)
    expect(registry.ids()).toEqual(['developer'])
  })

  it('require() throws on unknown id', () => {
    const registry = new SoulRegistry()
    expect(() => registry.require('developer')).toThrow(/unknown Soul id/)
  })

  it('rejects duplicate ids', () => {
    const registry = new SoulRegistry()
    registry.register(developerSoulModule)
    expect(() => registry.register(developerSoulModule)).toThrow(/duplicate Soul id/)
  })

  it('rejects malformed Soul modules at register time', () => {
    const registry = new SoulRegistry()
    expect(() => registry.register({
      ...developerSoulModule,
      manifest: { ...developerSoulModule.manifest, id: 'Developer' },
    } as unknown as typeof developerSoulModule)).toThrow()
  })

  it('filters modules by supported scope kind', () => {
    const registry = createBuiltinSoulRegistry()
    const hiringSouls = registry.findByScopeKind('hiring-pool').map(module => module.manifest.id)
    expect(hiringSouls).toEqual(['hr-recruiting'])

    const repoSouls = registry.findByScopeKind('developer-repo').map(module => module.manifest.id)
    expect(repoSouls).toContain('developer')
    expect(repoSouls).toContain('qa-reviewer')
  })

  it('createSoulRegistry seeds modules eagerly', () => {
    const registry = createSoulRegistry([developerSoulModule, hrRecruitingSoulModule])
    expect(registry.size()).toBe(2)
    expect([...registry.ids()].sort()).toEqual(['developer', 'hr-recruiting'])
  })

  it('createBuiltinSoulRegistry exposes every built-in module', () => {
    const registry = createBuiltinSoulRegistry()
    expect(registry.size()).toBe(BUILTIN_SOUL_MODULES.length)
    for (const module of BUILTIN_SOUL_MODULES)
      expect(registry.has(module.manifest.id)).toBe(true)
  })

  it('keeps built-in module ids unique', () => {
    const ids = BUILTIN_SOUL_MODULES.map(module => module.manifest.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
