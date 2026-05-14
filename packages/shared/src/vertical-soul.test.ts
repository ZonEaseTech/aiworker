import { describe, expect, it } from 'bun:test'

import {
  BUILTIN_CAPABILITY_TEMPLATES,
  BUILTIN_VERTICAL_SOULS,
  capabilityTemplateSchema,
  listCapabilityTemplatesForSoul,
  verticalSoulSchema,
} from './vertical-soul'

describe('vertical Soul catalog', () => {
  it('ships available HR, PM, QA, and DevOps Souls with templates', () => {
    for (const id of ['hr', 'pm', 'qa', 'devops'] as const) {
      const soul = BUILTIN_VERTICAL_SOULS.find(item => item.id === id)
      expect(verticalSoulSchema.safeParse(soul).success).toBe(true)
      expect(soul?.status).toBe('available')
      expect(listCapabilityTemplatesForSoul(id).length).toBeGreaterThanOrEqual(4)
    }
  })

  it('keeps every template tied to a known Soul and review rubric', () => {
    const soulIds = new Set<string>(BUILTIN_VERTICAL_SOULS.map(soul => soul.id))
    for (const template of BUILTIN_CAPABILITY_TEMPLATES) {
      expect(capabilityTemplateSchema.safeParse(template).success).toBe(true)
      expect(soulIds.has(template.soulId)).toBe(true)
      expect(template.inputHints.length).toBeGreaterThan(0)
      expect(template.reviewRubric.length).toBeGreaterThan(0)
    }
  })
})
