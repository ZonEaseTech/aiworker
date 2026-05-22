import { z } from 'zod'

export const localWorkerStatusSchema = z.enum(['active', 'paused', 'disabled'])
export type LocalWorkerStatus = z.infer<typeof localWorkerStatusSchema>

export const localWorkspaceStatusSchema = z.enum(['active', 'archived'])
export type LocalWorkspaceStatus = z.infer<typeof localWorkspaceStatusSchema>

export const localSessionStatusSchema = z.enum(['active', 'completed', 'failed', 'cancelled'])
export type LocalSessionStatus = z.infer<typeof localSessionStatusSchema>

export const localTurnStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
export type LocalTurnStatus = z.infer<typeof localTurnStatusSchema>

export const localEngineInvocationStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
export type LocalEngineInvocationStatus = z.infer<typeof localEngineInvocationStatusSchema>

export const localSessionEventTypeSchema = z.enum([
  'status',
  'assistant_delta',
  'tool',
  'file_change',
  'artifact',
  'error',
  'log',
])
export type LocalSessionEventType = z.infer<typeof localSessionEventTypeSchema>

export const localFileKindSchema = z.enum(['file', 'directory', 'generated', 'uploaded'])
export type LocalFileKind = z.infer<typeof localFileKindSchema>

export const localFileSourceSchema = z.enum(['user', 'session', 'system'])
export type LocalFileSource = z.infer<typeof localFileSourceSchema>

export const localJsonObjectSchema = z.record(z.string(), z.unknown())
export type LocalJsonObject = z.infer<typeof localJsonObjectSchema>

const timestampSchema = z.string().min(1)
const idSchema = z.string().min(1)

export const localWorkerOverlayAssetKindSchema = z.enum(['entry-file', 'mcp-client', 'skill'])
export type LocalWorkerOverlayAssetKind = z.infer<typeof localWorkerOverlayAssetKindSchema>

export const localWorkerOverlayAssetSourceSchema = z.enum(['baseline', 'overlay'])
export type LocalWorkerOverlayAssetSource = z.infer<typeof localWorkerOverlayAssetSourceSchema>

export const localWorkerOverlayAssetSchema = z.object({
  content: z.string(),
  enabled: z.boolean(),
  id: idSchema,
  kind: localWorkerOverlayAssetKindSchema,
  metadataJson: localJsonObjectSchema.optional().default({}),
  source: localWorkerOverlayAssetSourceSchema,
  target: z.string().min(1),
  updatedAt: timestampSchema,
})
export type LocalWorkerOverlayAsset = z.infer<typeof localWorkerOverlayAssetSchema>

export const localWorkerOverlaySchema = z.object({
  assets: z.array(localWorkerOverlayAssetSchema),
  workerId: idSchema,
})
export type LocalWorkerOverlay = z.infer<typeof localWorkerOverlaySchema>

export const localWorkerOverlaySaveSchema = z.object({
  assets: z.array(localWorkerOverlayAssetSchema.omit({ source: true, updatedAt: true }).extend({
    source: z.literal('overlay').optional().default('overlay'),
  })),
})
export type LocalWorkerOverlaySaveInput = z.infer<typeof localWorkerOverlaySaveSchema>

export const localComposerMentionSchema = z.object({
  id: idSchema,
  kind: z.literal('skill'),
  label: z.string().min(1),
  range: z.object({
    end: z.number().int().nonnegative(),
    start: z.number().int().nonnegative(),
  }).optional(),
})
export type LocalComposerMention = z.infer<typeof localComposerMentionSchema>

export const localWorkerSchema = z.object({
  id: idSchema,
  soulId: idSchema,
  name: z.string().min(1),
  status: localWorkerStatusSchema,
  defaultEngineId: z.string().nullable(),
  metadataJson: localJsonObjectSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type LocalWorker = z.infer<typeof localWorkerSchema>

export const localWorkspaceSchema = z.object({
  id: idSchema,
  workerId: idSchema,
  name: z.string().min(1),
  rootPath: z.string().min(1),
  type: z.string().min(1),
  status: localWorkspaceStatusSchema,
  sourcePointersJson: z.array(localJsonObjectSchema),
  metadataJson: localJsonObjectSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type LocalWorkspace = z.infer<typeof localWorkspaceSchema>

export const localSessionSchema = z.object({
  id: idSchema,
  workerId: idSchema,
  workspaceId: idSchema,
  capabilityTemplateId: idSchema,
  title: z.string().min(1),
  context: z.string(),
  status: localSessionStatusSchema,
  metadataJson: localJsonObjectSchema,
  startedAt: timestampSchema.nullable(),
  endedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type LocalSession = z.infer<typeof localSessionSchema>

export const localTurnSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  seq: z.number().int().positive(),
  input: z.string().min(1),
  response: z.string().nullable(),
  status: localTurnStatusSchema,
  error: z.string().nullable(),
  metadataJson: localJsonObjectSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type LocalTurn = z.infer<typeof localTurnSchema>

export const localEngineInvocationSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  turnId: idSchema,
  seq: z.number().int().positive(),
  engineId: z.string().min(1),
  engineCommand: z.string().nullable(),
  status: localEngineInvocationStatusSchema,
  prompt: z.string().min(1),
  summary: z.string().nullable(),
  error: z.string().nullable(),
  metadataJson: localJsonObjectSchema,
  startedAt: timestampSchema.nullable(),
  finishedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type LocalEngineInvocation = z.infer<typeof localEngineInvocationSchema>

export const localSessionEventSchema = z.object({
  id: z.number().int().positive(),
  sessionId: idSchema,
  turnId: idSchema.nullable(),
  invocationId: idSchema.nullable(),
  seq: z.number().int().nonnegative(),
  type: localSessionEventTypeSchema,
  payloadJson: localJsonObjectSchema,
  createdAt: timestampSchema,
})
export type LocalSessionEvent = z.infer<typeof localSessionEventSchema>

export const localFileSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  path: z.string().min(1),
  kind: localFileKindSchema,
  size: z.number().int().nonnegative().nullable(),
  mtime: z.number().int().nonnegative().nullable(),
  hash: z.string().nullable(),
  source: localFileSourceSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
export type LocalFile = z.infer<typeof localFileSchema>

export const localSettingSchema = z.object({
  key: z.string().min(1),
  valueJson: localJsonObjectSchema,
  updatedAt: timestampSchema,
})
export type LocalSetting = z.infer<typeof localSettingSchema>

export const localExecutionModeSchema = z.enum(['local-cli', 'byok'])
export type LocalExecutionMode = z.infer<typeof localExecutionModeSchema>

export const localAppearanceSchema = z.enum(['system', 'light', 'dark'])
export type LocalAppearance = z.infer<typeof localAppearanceSchema>

export const localEngineStatusSchema = z.object({
  command: z.string().min(1),
  id: idSchema,
  installed: z.boolean(),
  name: z.string().min(1),
  path: z.string().nullable(),
  version: z.string().nullable(),
})
export type LocalEngineStatus = z.infer<typeof localEngineStatusSchema>

export const localSettingsConfigSchema = z.object({
  appearance: localAppearanceSchema,
  byok: z.object({
    apiKeyRef: z.string(),
    baseUrl: z.string(),
    model: z.string(),
    provider: z.string(),
  }),
  connectors: z.array(z.object({
    enabled: z.boolean(),
    id: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(['configured', 'not_configured']),
  })),
  engineId: z.string().min(1),
  engines: z.array(localEngineStatusSchema),
  executionMode: localExecutionModeSchema,
  externalMcpServers: z.array(z.object({
    command: z.string(),
    enabled: z.boolean(),
    id: z.string().min(1),
    name: z.string().min(1),
  })),
  language: z.string().min(1),
  localMcpServer: z.object({
    enabled: z.boolean(),
    url: z.string(),
  }),
  updatedAt: timestampSchema,
})
export type LocalSettingsConfig = z.infer<typeof localSettingsConfigSchema>
