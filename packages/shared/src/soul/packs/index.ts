/// <reference path="../assets.d.ts" />

import type { SoulModule } from '../module'
import type { SoulRegistry } from '../registry'

import { findBuiltinSoulBrainSkillPacks } from '../../brain'
import { createSoulPack } from '../pack'
import { createSoulRegistry } from '../registry'

import developerAgentMd from './developer/AGENT.md' with { type: 'text' }
import developerSoulMd from './developer/SOUL.md' with { type: 'text' }
import devopsSreAgentMd from './devops-sre/AGENT.md' with { type: 'text' }
import devopsSreSoulMd from './devops-sre/SOUL.md' with { type: 'text' }
import financeOpsAgentMd from './finance-ops/AGENT.md' with { type: 'text' }
import financeOpsSoulMd from './finance-ops/SOUL.md' with { type: 'text' }
import generalAssistantAgentMd from './general-assistant/AGENT.md' with { type: 'text' }
import generalAssistantSoulMd from './general-assistant/SOUL.md' with { type: 'text' }
import hrRecruitingAgentMd from './hr-recruiting/AGENT.md' with { type: 'text' }
import hrRecruitingSoulMd from './hr-recruiting/SOUL.md' with { type: 'text' }
import productDesignerAgentMd from './product-designer/AGENT.md' with { type: 'text' }
import productDesignerSoulMd from './product-designer/SOUL.md' with { type: 'text' }
import projectManagerAgentMd from './project-manager/AGENT.md' with { type: 'text' }
import projectManagerSoulMd from './project-manager/SOUL.md' with { type: 'text' }
import qaReviewerAgentMd from './qa-reviewer/AGENT.md' with { type: 'text' }
import qaReviewerSoulMd from './qa-reviewer/SOUL.md' with { type: 'text' }
import supportOperatorAgentMd from './support-operator/AGENT.md' with { type: 'text' }
import supportOperatorSoulMd from './support-operator/SOUL.md' with { type: 'text' }

export const developerSoulPack = createSoulPack({
  agentMd: developerAgentMd,
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('developer'),
  expectedId: 'developer',
  soulMd: developerSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/developer/SOUL.md',
})

export const projectManagerSoulPack = createSoulPack({
  agentMd: projectManagerAgentMd,
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('project-manager'),
  expectedId: 'project-manager',
  soulMd: projectManagerSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/project-manager/SOUL.md',
})

export const devopsSreSoulPack = createSoulPack({
  agentMd: devopsSreAgentMd,
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('devops-sre'),
  expectedId: 'devops-sre',
  soulMd: devopsSreSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/devops-sre/SOUL.md',
})

export const productDesignerSoulPack = createSoulPack({
  agentMd: productDesignerAgentMd,
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('product-designer'),
  expectedId: 'product-designer',
  soulMd: productDesignerSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/product-designer/SOUL.md',
})

export const qaReviewerSoulPack = createSoulPack({
  agentMd: qaReviewerAgentMd,
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('qa-reviewer'),
  expectedId: 'qa-reviewer',
  soulMd: qaReviewerSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/qa-reviewer/SOUL.md',
})

export const supportOperatorSoulPack = createSoulPack({
  agentMd: supportOperatorAgentMd,
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('support-operator'),
  expectedId: 'support-operator',
  soulMd: supportOperatorSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/support-operator/SOUL.md',
})

export const financeOpsSoulPack = createSoulPack({
  agentMd: financeOpsAgentMd,
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('finance-ops'),
  expectedId: 'finance-ops',
  soulMd: financeOpsSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/finance-ops/SOUL.md',
})

export const hrRecruitingSoulPack = createSoulPack({
  agentMd: hrRecruitingAgentMd,
  brainSkillPacks: findBuiltinSoulBrainSkillPacks('hr-recruiting'),
  expectedId: 'hr-recruiting',
  soulMd: hrRecruitingSoulMd,
  sourcePath: 'packages/shared/src/soul/packs/hr-recruiting/SOUL.md',
})

export const generalAssistantSoulPack = createSoulPack({
  agentMd: generalAssistantAgentMd,
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
