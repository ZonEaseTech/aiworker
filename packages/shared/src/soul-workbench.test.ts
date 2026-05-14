import { describe, expect, it } from 'bun:test'

import {
  BUILTIN_SOUL_WORKBENCHES,
  findSoulWorkbenchForSoul,
  hasSpecializedSoulWorkbench,
  soulWorkbenchDescriptorSchema,
} from './index'
import { BUILTIN_CAPABILITY_TEMPLATES } from './vertical-soul'

describe('Soul workbench descriptors', () => {
  it('ships HR as the first specialized workbench and leaves other Souls on fallback', () => {
    expect(BUILTIN_SOUL_WORKBENCHES).toHaveLength(1)
    expect(findSoulWorkbenchForSoul('aiworker-hr')?.id).toBe('hr-people-workbench')
    expect(hasSpecializedSoulWorkbench('aiworker-hr')).toBe(true)
    expect(findSoulWorkbenchForSoul('hr')).toBeNull()
    expect(findSoulWorkbenchForSoul('pm')).toBeNull()
    expect(hasSpecializedSoulWorkbench('qa')).toBe(false)
  })

  it('keeps HR actions tied to available capability templates and reviewable artifacts', () => {
    const workbench = soulWorkbenchDescriptorSchema.parse(findSoulWorkbenchForSoul('aiworker-hr'))
    const templateIds = new Set(BUILTIN_CAPABILITY_TEMPLATES.filter(template => template.soulId === 'hr').map(template => `aiworker-hr.${template.id}`))

    expect(workbench.workspaceTypes.some(type => type.id === 'people-profile' && type.primary)).toBe(true)
    expect(workbench.primaryObjects.some(object => object.id === 'person-profile')).toBe(true)
    expect(workbench.artifactKinds).toEqual(expect.arrayContaining(['person-profile', 'lifecycle-next-step', 'candidate-screen', 'onboarding-plan', 'offboarding-summary']))
    expect(workbench.reviewChecklist.some(item => item.includes('human-owned'))).toBe(true)
    for (const action of workbench.actions)
      expect(templateIds.has(action.templateId)).toBe(true)
  })
})
