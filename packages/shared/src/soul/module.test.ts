import { describe, expect, it } from 'bun:test'

import { soulModuleSchema } from './module'
import {
  developerSoulModule,
  hrRecruitingSoulModule,
} from './modules'

describe('Soul module contract', () => {
  it('parses every built-in module without error', async () => {
    const { BUILTIN_SOUL_MODULES } = await import('./modules')
    for (const module of BUILTIN_SOUL_MODULES)
      expect(soulModuleSchema.safeParse(module).success).toBe(true)
  })

  it('requires the manifest id to be kebab-case', () => {
    const result = soulModuleSchema.safeParse({
      ...developerSoulModule,
      manifest: { ...developerSoulModule.manifest, id: 'Developer' },
    })
    expect(result.success).toBe(false)
  })

  it('requires the manifest version to be semver-ish', () => {
    const result = soulModuleSchema.safeParse({
      ...developerSoulModule,
      manifest: { ...developerSoulModule.manifest, version: '0.1' },
    })
    expect(result.success).toBe(false)
  })

  it('requires primaryScopeKind to appear in supportedScopeKinds', () => {
    const result = soulModuleSchema.safeParse({
      ...developerSoulModule,
      primaryScopeKind: 'finance-period',
      supportedScopeKinds: ['developer-repo', 'general'],
    })
    expect(result.success).toBe(false)
  })

  it('requires protectedSections to be a subset of defaultSections', () => {
    const result = soulModuleSchema.safeParse({
      ...developerSoulModule,
      briefHooks: {
        defaultSections: ['agent', 'soul'],
        protectedSections: ['risk-policy'],
      },
    })
    expect(result.success).toBe(false)
  })

  it('requires non-empty initProjection arrays', () => {
    const result = soulModuleSchema.safeParse({
      ...developerSoulModule,
      initProjection: {
        boundaries: [],
        packs: ['code'],
        responsibilities: ['x'],
        toolsets: ['filesystem-read'],
      },
    })
    expect(result.success).toBe(false)
  })

  it('covers developer + hr-recruiting with the same contract', () => {
    expect(soulModuleSchema.safeParse(developerSoulModule).success).toBe(true)
    expect(soulModuleSchema.safeParse(hrRecruitingSoulModule).success).toBe(true)

    expect(developerSoulModule.primaryScopeKind).toBe('developer-repo')
    expect(hrRecruitingSoulModule.primaryScopeKind).toBe('hiring-pool')

    expect(developerSoulModule.briefHooks.protectedSections).toContain('risk-policy')
    expect(hrRecruitingSoulModule.briefHooks.protectedSections).toContain('compliance')
  })
})
