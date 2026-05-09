import type { ExecutorProfile } from '@zonease/aiworker-shared'
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

const executorErrorKindSchema = z.enum([
  'rate-limit',
  'timeout',
  'auth',
  'network',
  'server-5xx',
  'unknown',
])

// `executorSchema` is recursive — each `fallbacks[].executor` is itself a full
// executor profile, so chains nest arbitrarily deep. The fallback entry is
// inlined inside the lazy body so the self-reference resolves at parse time
// without tripping `no-use-before-define`.
const executorSchema: z.ZodType<ExecutorProfile> = z.lazy(() => z.object({
  engine: z.enum(['http', 'mcp', 'cli', 'claude-code', 'acp', 'codex', 'cursor']),
  variant: z.string().min(1),
  overrides: variantOverridesSchema.optional(),
  modelId: z.string().min(1).optional(),
  reasoningId: z.string().min(1).optional(),
  permissionPolicy: z.enum(['auto', 'supervised', 'plan']).optional(),
  fallbacks: z.array(z.object({
    executor: executorSchema,
    onErrorKinds: z.array(executorErrorKindSchema).min(1),
    maxRetries: z.number().int().min(1).optional(),
  })).optional(),
}))

const channelCredentialsSchema = z.discriminatedUnion('channel', [
  z.object({
    channel: z.literal('web'),
    inboundToken: z.string().optional(),
  }),
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

// PLAN-014 F2: per-tool approval policy. `pattern` 当前只支持字面量 + `*`
// 通配符，rule 顺序匹配；都不命中走 `default`。schema 是可选的，旧 config
// 缺该字段时视同 `{ default: 'auto', rules: [] }`，保持向前兼容。
const toolPolicyActionSchema = z.enum(['auto', 'ask', 'deny'])

const toolPolicySchema = z.object({
  default: toolPolicyActionSchema,
  rules: z.array(z.object({
    pattern: z.string().min(1),
    action: toolPolicyActionSchema,
  })),
})

const orchestratorCompactionSchema = z.object({
  enabled: z.boolean().optional(),
  triggerTokens: z.number().int().min(1).max(2_000_000).optional(),
  maxSummaryMessages: z.number().int().min(1).max(500).optional(),
  memoryFlush: z.object({
    enabled: z.boolean().optional(),
  }).optional(),
})

const deadLoopSchema = z.object({
  enabled: z.boolean().optional(),
  threshold: z.number().int().min(1).optional(),
})

const decisionPipelineSchema = z.object({
  executor: executorSchema.optional(),
  intentClassifier: z.object({
    evaluator: z.enum(['heuristic', 'llm']).optional(),
  }).optional(),
  qualityGate: z.object({
    evaluator: z.enum(['heuristic', 'llm']).optional(),
    mode: z.enum(['observe', 'warn', 'retry', 'block']).optional(),
    threshold: z.number().min(0).max(10).optional(),
    budgetMs: z.number().int().min(1).optional(),
  }).optional(),
}).strict()

// Orchestrator runtime tuning. `maxHistoryMessages` is kept as the
// backward-compatible fallback cap; setting any token field enables S2
// token-budget context assembly.
const orchestratorConfigSchema = z.object({
  contextWindowTokens: z.number().int().min(512).max(2_000_000).optional(),
  reserveTokens: z.number().int().min(0).max(1_000_000).optional(),
  keepRecentTokens: z.number().int().min(1).max(2_000_000).optional(),
  maxHistoryMessages: z.number().int().min(1).max(200).optional(),
  compaction: orchestratorCompactionSchema.optional(),
  decisionPipeline: decisionPipelineSchema.optional(),
  deadLoop: deadLoopSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.contextWindowTokens !== undefined && value.reserveTokens !== undefined && value.reserveTokens >= value.contextWindowTokens) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reserveTokens'],
      message: 'reserveTokens must be lower than contextWindowTokens',
    })
  }
  if (value.contextWindowTokens !== undefined && value.compaction?.triggerTokens !== undefined && value.compaction.triggerTokens > value.contextWindowTokens) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['compaction', 'triggerTokens'],
      message: 'compaction.triggerTokens must not exceed contextWindowTokens',
    })
  }
})

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
  toolPolicy: toolPolicySchema.optional(),
  orchestrator: orchestratorConfigSchema.optional(),
})
