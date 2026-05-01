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
  })
})
