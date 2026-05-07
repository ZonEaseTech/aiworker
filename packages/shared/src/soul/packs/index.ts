/// <reference path="../assets.d.ts" />

import type { SoulModule } from '../module'
import type { SoulRegistry } from '../registry'

import { findBuiltinSoulBrainSkillPacks } from '../../brain'
import { createSoulPack } from '../pack'
import { createSoulRegistry } from '../registry'

import developerSoulMd from './developer/SOUL.md' with { type: 'text' }
import devopsSreSoulMd from './devops-sre/SOUL.md' with { type: 'text' }
import financeOpsSoulMd from './finance-ops/SOUL.md' with { type: 'text' }
import generalAssistantSoulMd from './general-assistant/SOUL.md' with { type: 'text' }
import hrRecruitingSoulMd from './hr-recruiting/SOUL.md' with { type: 'text' }
import productDesignerSoulMd from './product-designer/SOUL.md' with { type: 'text' }
import projectManagerSoulMd from './project-manager/SOUL.md' with { type: 'text' }
import qaReviewerSoulMd from './qa-reviewer/SOUL.md' with { type: 'text' }
import supportOperatorSoulMd from './support-operator/SOUL.md' with { type: 'text' }

export const developerSoulPack = createSoulPack({
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('developer'),
  expectedId: 'developer',
  soulMd: developerSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/developer/SOUL.md',
})

export const projectManagerSoulPack = createSoulPack({
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('project-manager'),
  expectedId: 'project-manager',
  soulMd: projectManagerSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/project-manager/SOUL.md',
})

export const devopsSreSoulPack = createSoulPack({
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('devops-sre'),
  expectedId: 'devops-sre',
  soulMd: devopsSreSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/devops-sre/SOUL.md',
})

export const productDesignerSoulPack = createSoulPack({
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('product-designer'),
  expectedId: 'product-designer',
  soulMd: productDesignerSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/product-designer/SOUL.md',
})

export const qaReviewerSoulPack = createSoulPack({
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('qa-reviewer'),
  expectedId: 'qa-reviewer',
  soulMd: qaReviewerSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/qa-reviewer/SOUL.md',
})

export const supportOperatorSoulPack = createSoulPack({
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('support-operator'),
  expectedId: 'support-operator',
  soulMd: supportOperatorSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/support-operator/SOUL.md',
})

export const financeOpsSoulPack = createSoulPack({
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('finance-ops'),
  expectedId: 'finance-ops',
  soulMd: financeOpsSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/finance-ops/SOUL.md',
})

export const hrRecruitingSoulPack = createSoulPack({
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('hr-recruiting'),
  expectedId: 'hr-recruiting',
  soulMd: hrRecruitingSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/hr-recruiting/SOUL.md',
})

export const generalAssistantSoulPack = createSoulPack({
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('general-assistant'),
  expectedId: 'general-assistant',
  soulMd: generalAssistantSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/general-assistant/SOUL.md',
})

export const BUILTIN_SOUL_PACKS = [
  developerSoulPack,
  projectManagerSoulPack,
  devopsSreSoulPack,
  productDesignerSoulPack,
  qaReviewerSoulPack,
  supportOperatorSoulPack,
  financeOpsSoulPack,
  hrRecruitingSoulPack,
  generalAssistantSoulPack,
] as const

export const BUILTIN_SOUL_MODULES: readonly SoulModule[] = BUILTIN_SOUL_PACKS.map(pack => pack.module)

export function createBuiltinSoulRegistry(): SoulRegistry {
  return createSoulRegistry(BUILTIN_SOUL_MODULES)
}

export function findBuiltinSoulPack(id: string): (typeof BUILTIN_SOUL_PACKS)[number] | undefined {
  return BUILTIN_SOUL_PACKS.find(pack => pack.module.manifest.id === id)
}
