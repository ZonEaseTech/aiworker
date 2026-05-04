import type { SoulModule } from '../module'
import type { SoulRegistry } from '../registry'
import { createSoulRegistry } from '../registry'
import { developerSoulModule } from './developer'
import { devopsSreSoulModule } from './devops-sre'
import { financeOpsSoulModule } from './finance-ops'
import { generalAssistantSoulModule } from './general-assistant'
import { hrRecruitingSoulModule } from './hr-recruiting'
import { productDesignerSoulModule } from './product-designer'
import { projectManagerSoulModule } from './project-manager'
import { qaReviewerSoulModule } from './qa-reviewer'
import { supportOperatorSoulModule } from './support-operator'

export {
  developerSoulModule,
  devopsSreSoulModule,
  financeOpsSoulModule,
  generalAssistantSoulModule,
  hrRecruitingSoulModule,
  productDesignerSoulModule,
  projectManagerSoulModule,
  qaReviewerSoulModule,
  supportOperatorSoulModule,
}

export const BUILTIN_SOUL_MODULES: readonly SoulModule[] = [
  developerSoulModule,
  projectManagerSoulModule,
  devopsSreSoulModule,
  productDesignerSoulModule,
  qaReviewerSoulModule,
  supportOperatorSoulModule,
  financeOpsSoulModule,
  hrRecruitingSoulModule,
  generalAssistantSoulModule,
]

export function createBuiltinSoulRegistry(): SoulRegistry {
  return createSoulRegistry(BUILTIN_SOUL_MODULES)
}
