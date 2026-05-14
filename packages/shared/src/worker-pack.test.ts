import { describe, expect, it } from 'bun:test'

import {
  BUILTIN_WORKER_PACKS,
  createBuiltinWorkerPackRegistry,
  findBuiltinWorkerPack,
  supportedWorkerPackIds,
  WorkerPackRegistry,
} from './worker-pack'

describe('worker pack registry', () => {
  it('keeps built-in pack ids unique and discoverable', () => {
    const ids = BUILTIN_WORKER_PACKS.map(pack => pack.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining([
      'developer',
      'hr-recruiting',
      'project-manager',
      'qa-reviewer',
    ]))
    for (const id of ids) {
      expect(findBuiltinWorkerPack(id)?.id).toBe(id)
      expect(supportedWorkerPackIds()).toContain(id)
    }
  })

  it('ships OD-style SKILL and DOMAIN markdown for every pack', () => {
    for (const pack of BUILTIN_WORKER_PACKS) {
      expect(pack.skillMd).toContain('# ')
      expect(pack.skillMd).toContain('## Work Loop')
      expect(pack.domainMd).toContain('# ')
      expect(pack.domainMd).toContain('## Inputs')
      expect(pack.workOrderTemplates.length).toBeGreaterThan(0)
      expect(pack.artifactKinds.length).toBeGreaterThan(0)
      expect(pack.defaultReviewChecklist.length).toBeGreaterThan(0)
    }
  })

  it('returns a fresh registry so callers can extend without mutating built-ins', () => {
    const registry = createBuiltinWorkerPackRegistry()
    const custom = {
      ...registry.require('developer'),
      id: 'custom-developer',
      label: 'Custom Developer',
    }

    registry.register(custom)

    expect(registry.get('custom-developer')?.label).toBe('Custom Developer')
    expect(findBuiltinWorkerPack('custom-developer')).toBeUndefined()
  })

  it('rejects duplicate pack ids', () => {
    const registry = new WorkerPackRegistry()
    const pack = createBuiltinWorkerPackRegistry().require('developer')

    registry.register(pack)
    expect(() => registry.register(pack)).toThrow('duplicate worker pack id')
  })
})
