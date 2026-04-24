import { z } from 'zod'

/**
 * Zod schema enforcing the shared `WorkerConfig` shape at the management API
 * boundary. Shared package exports types only; the schema lives here because
 * the worker-side API is the sole validator of inbound config.
 */
const filesystemSource = z.object({
  id: z.string().min(1),
  type: z.literal('filesystem'),
  priority: z.number().int(),
  readOnly: z.boolean(),
  config: z.object({
    // `home` is optional — factory falls back to `resolveBrainHome(workerId)`
    // which resolves to `~/.aiworker/workers/<workerId>/brain/`.
    home: z.string().min(1).optional(),
  }),
})

const cloudGatewaySource = z.object({
  id: z.string().min(1),
  type: z.literal('cloud-gateway'),
  priority: z.number().int(),
  readOnly: z.boolean(),
  config: z.object({
    url: z.string().min(1),
    token: z.string(),
    defaultCategory: z.string().optional(),
    defaultTypeId: z.string().optional(),
  }),
})

const brainSourceSchema = z.discriminatedUnion('type', [filesystemSource, cloudGatewaySource])

// FEAT-014: three-tier executor config. The schema accepts only
// `{ engine, variant, overrides? }` — legacy `{ type, ...flat }` payloads are
// rejected here so dashboards holding stale clients see a clear 400. Reader-
// side migration (for already-stored configs) lives in
// `apps/api/src/worker/executor/default-profiles.ts::migrateLegacyExecutor`.

const cmdOverridesSchema = z.object({
  binary: z.string().min(1).optional(),
  extraArgs: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cliVersion: z.string().min(1).optional(),
}).strict()

// `overrides` is a free-form bag plus an optional `cmd` slot. Because each
// engine uses different keys, we don't enforce per-key shapes here — that
// would require a `discriminatedUnion` on `engine` and would couple this
// schema tightly to every variant body. Wrong keys silently no-op when
// merged; missing required keys still fail at the engine constructor.
const variantOverridesSchema = z.record(z.unknown()).and(
  z.object({ cmd: cmdOverridesSchema.optional() }).partial(),
)

const executorSchema = z.object({
  engine: z.enum(['http', 'mcp', 'cli', 'claude-code', 'acp', 'codex', 'cursor']),
  variant: z.string().min(1),
  overrides: variantOverridesSchema.optional(),
  modelId: z.string().min(1).optional(),
  reasoningId: z.string().min(1).optional(),
  permissionPolicy: z.enum(['auto', 'supervised', 'plan']).optional(),
})

const channelCredentialsSchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('web') }),
  z.object({
    channel: z.literal('line'),
    channelSecret: z.string(),
    channelAccessToken: z.string(),
  }),
  z.object({
    channel: z.literal('telegram'),
    botToken: z.string(),
    webhookSecretToken: z.string().optional(),
  }),
  z.object({
    channel: z.literal('lark'),
    appId: z.string(),
    appSecret: z.string(),
    encryptKey: z.string(),
    verificationToken: z.string(),
  }),
  z.object({
    channel: z.literal('whatsapp'),
    phoneNumberId: z.string(),
    accessToken: z.string(),
    appSecret: z.string(),
    verifyToken: z.string(),
  }),
])

const channelBindingSchema = z.object({
  channel: z.enum(['web', 'line', 'telegram', 'lark', 'whatsapp']),
  enabled: z.boolean(),
  credentials: channelCredentialsSchema,
  profile: z.object({
    displayName: z.string().optional(),
    avatarUrl: z.string().optional(),
  }).optional(),
}).refine(
  binding => binding.channel === binding.credentials.channel,
  { message: 'channel and credentials.channel must match', path: ['credentials', 'channel'] },
)

export const workerConfigSchema = z.object({
  brains: z.array(brainSourceSchema),
  brainWriteTarget: z.string(),
  brainRetrieval: z.enum(['merge-by-priority', 'first-match']),
  executor: executorSchema,
  channels: z.array(channelBindingSchema),
  evolution: z.object({
    enabled: z.boolean(),
    observationRetentionDays: z.number().int().nonnegative(),
  }),
})
