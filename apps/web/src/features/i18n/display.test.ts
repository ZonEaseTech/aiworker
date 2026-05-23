import type { CapabilityTemplate, VerticalSoul } from '../local-workspace/types.compat'
import { describe, expect, it } from 'vitest'
import { displaySoul, displayTemplate } from './index'

describe('displaySoul/displayTemplate 泛化消费 manifest', () => {
  it('displaySoul 返回 manifest 投影值，不被 Host catalog 覆盖', () => {
    const soul: VerticalSoul = {
      id: 'aiworker-hr',
      name: 'Manifest HR Name',
      description: 'Manifest desc',
      domain: 'manifest-domain',
      status: 'available',
      defaultTemplates: [],
    }
    const copy = displaySoul(soul, 'en')
    expect(copy.name).toBe('Manifest HR Name')
    expect(copy.description).toBe('Manifest desc')
    expect(copy.domain).toBe('manifest-domain')
  })

  it('displayTemplate 返回 manifest 投影值且不含 reviewRubric', () => {
    const template: CapabilityTemplate = {
      id: 'aiworker-hr.person-profile',
      name: 'Manifest Template',
      description: 'Manifest tdesc',
      soulId: 'aiworker-hr',
      outputKind: 'person-profile',
      inputHints: ['a'],
      reviewRubric: ['secret rubric'],
      prompt: '',
    }
    const copy = displayTemplate(template, 'en')
    expect(copy.name).toBe('Manifest Template')
    expect(copy.description).toBe('Manifest tdesc')
    expect('reviewRubric' in copy).toBe(false)
  })
})
