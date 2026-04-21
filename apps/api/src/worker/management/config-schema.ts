import { z } from 'zod'

/**
 * Zod schema enforcing the shared `WorkerConfig` shape at the management API
 * boundary. Shared package exports types only; the schema lives here because
 * the worker-side API is the sole validator of inbound config.
 */
const hermesSource = z.object({
  id: z.string().min(1),
  type: z.literal('hermes'),
  priority: z.number().int(),
  readOnly: z.boolean(),
  config: z.object({
    apiUrl: z.string().min(1),
    home: z.string().min(1),
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

const brainSourceSchema = z.discriminatedUnion('type', [hermesSource, cloudGatewaySource])

const executorSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('http'),
    baseUrl: z.string().min(1),
    apiKey: z.string(),
    model: z.string().min(1),
    timeoutMs: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('mcp'),
    url: z.string().min(1),
    token: z.string(),
    defaultModel: z.string().optional(),
    tools: z.array(z.string()).optional(),
    timeoutMs: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('cli'),
    command: z.string().min(1),
    args: z.array(z.string()),
    cwd: z.string().optional(),
    env: z.record(z.string()).optional(),
    timeoutMs: z.number().int().positive().optional(),
    sandbox: z.boolean().optional(),
  }),
])

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
