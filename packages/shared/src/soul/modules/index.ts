import type { SoulModule } from '../module'

import {
  BUILTIN_SOUL_MODULES,
  createBuiltinSoulRegistry,
  developerSoulPack,
  devopsSreSoulPack,
  financeOpsSoulPack,
  generalAssistantSoulPack,
  hrRecruitingSoulPack,
  productDesignerSoulPack,
  projectManagerSoulPack,
  qaReviewerSoulPack,
  supportOperatorSoulPack,
} from '../packs'

export const developerSoulModule: SoulModule = developerSoulPack.module
export const devopsSreSoulModule: SoulModule = devopsSreSoulPack.module
export const financeOpsSoulModule: SoulModule = financeOpsSoulPack.module
export const generalAssistantSoulModule: SoulModule = generalAssistantSoulPack.module
export const hrRecruitingSoulModule: SoulModule = hrRecruitingSoulPack.module
export const productDesignerSoulModule: SoulModule = productDesignerSoulPack.module
export const projectManagerSoulModule: SoulModule = projectManagerSoulPack.module
export const qaReviewerSoulModule: SoulModule = qaReviewerSoulPack.module
export const supportOperatorSoulModule: SoulModule = supportOperatorSoulPack.module

export {
  BUILTIN_SOUL_MODULES,
  createBuiltinSoulRegistry,
}
