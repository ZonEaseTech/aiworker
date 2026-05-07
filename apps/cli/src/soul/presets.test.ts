import { BUILTIN_SOUL_MODULES } from '@zonease/aiworker-shared'
import { describe, expect, it } from 'bun:test'

import { isBuiltinCapabilityPack, isBuiltinToolset } from '../capabilities/catalog'
import {
  BUILTIN_SOUL_PRESETS,
  CUSTOMIZE_SOUL_ID,
  findBuiltinSoul,
  supportedSoulIds,
  toSelectedSoul,
} from './presets'

describe('Soul preset registry', () => {
  it('keeps preset ids unique and discoverable', () => {
    const ids = BUILTIN_SOUL_PRESETS.map(preset => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(findBuiltinSoul(id)?.id).toBe(id)
      expect(supportedSoulIds()).toContain(id)
    }
    expect(supportedSoulIds()).toContain(CUSTOMIZE_SOUL_ID)
  })

  it('defines a capability profile for every built-in preset', () => {
    for (const preset of BUILTIN_SOUL_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0)
      expect(preset.description.length).toBeGreaterThan(0)
      expect(preset.responsibilities.length).toBeGreaterThan(0)
      expect(preset.boundaries.length).toBeGreaterThan(0)
      expect(preset.packs.length).toBeGreaterThan(0)
      expect(preset.toolsets.length).toBeGreaterThan(0)
      expect(preset.communicationStyle.length).toBeGreaterThan(0)
      expect(preset.riskPolicy.length).toBeGreaterThan(0)
      expect(preset.outOfScope.length).toBeGreaterThan(0)
      expect(preset.soulMd).toContain(`# ${preset.label} Soul`)
      expect(preset.brainSkillPacks.length).toBeGreaterThan(0)
      expect(preset.brainSkillPacks.every(skill => skill.id.startsWith(`${preset.id}.`))).toBe(true)
      // BUG-063: every shipped Soul preset must declare its own
      // vague-context strategy so SOUL.md guides the LLM to ask for missing
      // information instead of brute-forcing tool exploration.
      expect(preset.vagueContextStrategy.length).toBeGreaterThan(0)
      for (const pack of preset.packs)
        expect(isBuiltinCapabilityPack(pack)).toBe(true)
      for (const toolset of preset.toolsets)
        expect(isBuiltinToolset(toolset)).toBe(true)
    }
  })

  it('converts presets into selected Soul values without losing capabilities', () => {
    const preset = findBuiltinSoul('developer')
    expect(preset).toBeDefined()
    if (!preset)
      throw new Error('developer preset missing')
    const selected = toSelectedSoul(preset, 'flag')

    expect(selected.id).toBe('developer')
    expect(selected.source).toBe('flag')
    expect(selected.highRiskRequiresApproval).toBe(true)
    expect(selected.packs).toEqual(preset.packs)
    expect(selected.toolsets).toEqual(preset.toolsets)
    expect(selected.soulMd).toBe(preset.soulMd)
    expect(selected.brainSkillPacks).toBe(preset.brainSkillPacks)
  })

  it('projects every shared Soul module into a CLI preset', () => {
    expect(BUILTIN_SOUL_PRESETS.length).toBe(BUILTIN_SOUL_MODULES.length)
    for (const module of BUILTIN_SOUL_MODULES) {
      const preset = findBuiltinSoul(module.manifest.id)
      expect(preset?.label).toBe(module.manifest.label)
      expect(preset?.communicationStyle).toBe(module.riskPolicy.communicationStyle)
      expect(preset?.outOfScope).toBe(module.riskPolicy.outOfScopeStrategy)
      expect(preset?.packs).toEqual(module.initProjection.packs)
      expect(preset?.toolsets).toEqual(module.initProjection.toolsets)
    }
  })

  it('returns undefined for unknown ids without coercing strings into BuiltinSoulPresetId', () => {
    expect(findBuiltinSoul('not-a-real-soul')).toBeUndefined()
    expect(findBuiltinSoul(CUSTOMIZE_SOUL_ID)).toBeUndefined()
  })
})
