import { z } from 'zod'

export const SOUL_DESCRIPTOR_V1_PROTOCOL = 'soul/v1'
export const SOUL_DESCRIPTOR_OUTPUT_PATH = 'dist/soul.descriptor.json'

const jsonObjectSchema = z.record(z.string(), z.unknown())

const forbiddenProtocolConceptKeys = new Set([
  'agentgovernance',
  'agentruntime',
  'enginememory',
  'governance',
  'lesson',
  'memory',
  'runtimegovernance',
])

const forbiddenDescriptorSecretKeys = new Set([
  'apikey',
  'authorization',
  'bearer',
  'password',
  'secret',
  'token',
])

function normalizeDescriptorKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function findForbiddenDescriptorKey(
  value: unknown,
  forbiddenKeys: ReadonlySet<string>,
  path: Array<number | string> = [],
): Array<number | string> | undefined {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const nestedPath = findForbiddenDescriptorKey(item, forbiddenKeys, [...path, index])
      if (nestedPath)
        return nestedPath
    }

    return undefined
  }

  if (!value || typeof value !== 'object')
    return undefined

  for (const [key, item] of Object.entries(value)) {
    const keyPath = [...path, key]

    if (forbiddenKeys.has(normalizeDescriptorKey(key)))
      return keyPath

    const nestedPath = findForbiddenDescriptorKey(item, forbiddenKeys, keyPath)
    if (nestedPath)
      return nestedPath
  }

  return undefined
}

function rejectForbiddenProtocolConcepts(value: unknown, ctx: z.RefinementCtx): void {
  const forbiddenPath = findForbiddenDescriptorKey(value, forbiddenProtocolConceptKeys)
  if (!forbiddenPath)
    return

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'descriptor v1 must not include memory, lesson, or governance concepts',
    path: forbiddenPath,
  })
}

function rejectForbiddenDescriptorSecrets(value: unknown, ctx: z.RefinementCtx): void {
  const forbiddenPath = findForbiddenDescriptorKey(value, forbiddenDescriptorSecretKeys)
  if (!forbiddenPath)
    return

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'descriptor v1 must not include literal secret fields',
    path: forbiddenPath,
  })
}

function rejectForbiddenHostInterpretedFields(value: unknown, ctx: z.RefinementCtx): void {
  rejectForbiddenProtocolConcepts(value, ctx)
  rejectForbiddenDescriptorSecrets(value, ctx)
}

function isSafeBuiltDistPath(
  value: string,
  options: { extension?: '.html' | '.js' | '.json' | '.toml', prefix: string },
): boolean {
  if (!value.startsWith(options.prefix))
    return false
  if (options.extension && !value.endsWith(options.extension))
    return false
  if (value.includes('\\') || value.includes('\0') || value.includes('?') || value.includes('#'))
    return false

  const segments = value.split('/')
  if (segments[0] !== 'dist')
    return false

  return segments.slice(1).every((segment) => {
    if (!segment || segment === '.' || segment === '..')
      return false
    return segment !== 'host-adapter'
  })
}

function isSafeAppOwnedApiMount(value: string): boolean {
  return /^\/api\/apps\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)
}

const hostInterpretedObjectSchema = jsonObjectSchema.superRefine(rejectForbiddenHostInterpretedFields)
const hostInterpretedArraySchema = z
  .array(z.unknown())
  .superRefine(rejectForbiddenHostInterpretedFields)
const externalObjectSchema = jsonObjectSchema.superRefine(rejectForbiddenDescriptorSecrets)

const builtHtmlEntrySchema = z.string().refine(
  value => isSafeBuiltDistPath(value, { extension: '.html', prefix: 'dist/' }),
  'mounted workbench entry must point to a built HTML file under dist/',
)

const builtServiceEntrySchema = z.string().refine(
  value => isSafeBuiltDistPath(value, { extension: '.js', prefix: 'dist/' }),
  'app-owned API entry must point to a built JavaScript file under dist/',
)

const engineAssetDirectorySchema = z.string().refine(
  value => isSafeBuiltDistPath(value, { prefix: 'dist/engine-assets/' }),
  'engine asset source must point to a built engine asset directory under dist/engine-assets/',
)

const engineMcpFileSchema = z.string().refine(
  value =>
    isSafeBuiltDistPath(value, { extension: '.toml', prefix: 'dist/engine-assets/mcp/' })
    || isSafeBuiltDistPath(value, { extension: '.json', prefix: 'dist/engine-assets/mcp/' }),
  'native MCP descriptor file must point to a built .toml or .json file under dist/engine-assets/mcp/',
)

const appOwnedApiMountSchema = z.string().refine(
  isSafeAppOwnedApiMount,
  'app-owned API mount must use /api/apps/:appId',
)

const workbenchRouterSchema = z
  .object({
    mode: z.literal('search').default('search'),
  })
  .strict()

const workbenchSchema = z
  .object({
    entry: builtHtmlEntrySchema,
    mode: z.enum(['sdk-common', 'custom']).default('sdk-common'),
    router: workbenchRouterSchema.default({ mode: 'search' }),
    type: z.literal('micro-app'),
  })
  .strict()

const appOwnedApiSchema = z
  .object({
    entry: builtServiceEntrySchema,
    mount: appOwnedApiMountSchema,
    type: z.literal('local-service'),
  })
  .strict()

const engineAssetSourceSchema = z
  .object({
    source: engineAssetDirectorySchema,
  })
  .strict()

const engineMcpTargetSchema = z
  .object({
    file: engineMcpFileSchema,
  })
  .strict()

const engineMcpSchema = z
  .object({
    targets: z.record(z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/), engineMcpTargetSchema),
  })
  .strict()

const engineSchema = z
  .object({
    workspaceAssets: engineAssetSourceSchema.optional(),
    skills: engineAssetSourceSchema.optional(),
    mcp: engineMcpSchema.optional(),
  })
  .strict()
  .superRefine(rejectForbiddenHostInterpretedFields)

export const soulDescriptorV1Schema = z
  .object({
    protocol: z.literal(SOUL_DESCRIPTOR_V1_PROTOCOL),
    identity: hostInterpretedObjectSchema,
    compatibility: hostInterpretedObjectSchema,
    capabilities: hostInterpretedArraySchema,
    configuration: hostInterpretedObjectSchema,
    workbench: workbenchSchema,
    api: appOwnedApiSchema.nullable(),
    engine: engineSchema,
    health: hostInterpretedObjectSchema,
    extensions: hostInterpretedObjectSchema,
    external: externalObjectSchema,
  })
  .strict()

export type SoulDescriptorV1 = z.infer<typeof soulDescriptorV1Schema>

export function parseSoulDescriptorV1(descriptor: unknown): SoulDescriptorV1 {
  return soulDescriptorV1Schema.parse(descriptor)
}

export const soulProtocolPackage = {
  name: '@zonease/aiworker-soul-protocol',
  descriptor: SOUL_DESCRIPTOR_OUTPUT_PATH,
  sections: [
    'protocol',
    'identity',
    'compatibility',
    'capabilities',
    'configuration',
    'workbench',
    'api',
    'engine',
    'health',
    'extensions',
    'external',
  ],
} as const

export { AppError } from './errors'
export { mintWorkerId, slugify, WORKER_ID_ALPHABET, WORKER_ID_PATTERN } from './lib/ids'
export {
  localAppearanceSchema,
  localComposerMentionSchema,
  localEngineInvocationSchema,
  localEngineInvocationStatusSchema,
  localEngineReadinessSettingsSchema,
  localEngineStatusSchema,
  localExecutionModeSchema,
  localFileKindSchema,
  localFileSchema,
  localFileSourceSchema,
  localJsonObjectSchema,
  localSessionEventSchema,
  localSessionEventTypeSchema,
  localSessionSchema,
  localSessionStatusSchema,
  localSettingSchema,
  localSettingsConfigSchema,
  localWorkerConfigKindSchema,
  localWorkerConfigTargetSchema,
  localWorkerConfigUpdatedBySchema,
  localWorkerConfigValueInputSchema,
  localWorkerConfigValueSchema,
  localWorkerOverlayAssetKindSchema,
  localWorkerOverlayAssetSchema,
  localWorkerOverlayAssetSourceSchema,
  localWorkerOverlaySaveSchema,
  localWorkerOverlaySchema,
  localWorkerSchema,
  localWorkerStatusSchema,
  localWorkspaceSchema,
  localWorkspaceStatusSchema,
} from './local-workspace'
export type {
  LocalAppearance,
  LocalComposerMention,
  LocalEngineInvocation,
  LocalEngineInvocationStatus,
  LocalEngineReadinessSettings,
  LocalEngineStatus,
  LocalExecutionMode,
  LocalFile,
  LocalFileKind,
  LocalFileSource,
  LocalJsonObject,
  LocalSession,
  LocalSessionEvent,
  LocalSessionEventType,
  LocalSessionStatus,
  LocalSetting,
  LocalSettingsConfig,
  LocalWorker,
  LocalWorkerConfigKind,
  LocalWorkerConfigTarget,
  LocalWorkerConfigUpdatedBy,
  LocalWorkerConfigValue,
  LocalWorkerConfigValueInput,
  LocalWorkerOverlay,
  LocalWorkerOverlayAsset,
  LocalWorkerOverlayAssetKind,
  LocalWorkerOverlayAssetSource,
  LocalWorkerOverlaySaveInput,
  LocalWorkerStatus,
  LocalWorkspace,
  LocalWorkspaceStatus,
} from './local-workspace'
export * from './soul-app'
