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

export { createSoulRegistry, SoulRegistry } from './registry'
