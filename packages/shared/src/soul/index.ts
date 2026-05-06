export {
  assertSoulModule,
  isSoulModule,
  soulBriefHooksSchema,
  soulIdSchema,
  soulInitProjectionSchema,
  soulManifestSchema,
  soulModuleSchema,
  soulRetentionDefaultSchema,
  soulRiskPolicySchema,
  soulSchemaPackSchema,
  soulScopeKindSchema,
  soulVersionSchema,
} from './module'

export type {
  SoulBriefHooks,
  SoulInitProjection,
  SoulManifest,
  SoulModule,
  SoulRetentionDefault,
  SoulRiskPolicy,
  SoulSchemaPack,
} from './module'

export {
  BUILTIN_SOUL_MODULES,
  createBuiltinSoulRegistry,
  developerSoulModule,
  devopsSreSoulModule,
  financeOpsSoulModule,
  generalAssistantSoulModule,
  hrRecruitingSoulModule,
  productDesignerSoulModule,
  projectManagerSoulModule,
  qaReviewerSoulModule,
  supportOperatorSoulModule,
} from './modules'

export {
  createSoulPack,
  stripMarkdownFrontmatter,
} from './pack'
export type {
  SoulPack,
  SoulPackSource,
} from './pack'

export {
  BUILTIN_SOUL_PACKS,
  developerSoulPack,
  devopsSreSoulPack,
  financeOpsSoulPack,
  findBuiltinSoulPack,
  generalAssistantSoulPack,
  hrRecruitingSoulPack,
  productDesignerSoulPack,
  projectManagerSoulPack,
  qaReviewerSoulPack,
  supportOperatorSoulPack,
} from './packs'

export { createSoulRegistry, SoulRegistry } from './registry'
