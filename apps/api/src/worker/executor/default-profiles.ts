import type {
  AcpVariantBody,
  ClaudeCodeVariantBody,
  CliVariantBody,
  CmdOverrides,
  EngineKind,
  ExecutorProfile,
  HttpVariantBody,
  McpVariantBody,
  PermissionPolicy,
  VariantBodyByEngine,
} from '@aiworker/shared'

/**
 * Engine variant catalogue. Embedded as code so a worker boot does not need
 * an external JSON fetch and so type checking enforces the variant body shape
 * declared in `packages/shared/src/fleet/executor.ts`.
 *
 * Adding a new variant is data-only: drop a key under the appropriate engine
 * (typecheck enforces the body shape) and register it in the front-end picker
 * metadata at `apps/web/.../executor-variants.ts`.
 */
export const DEFAULT_PROFILES: {
  [Engine in EngineKind]: { variants: Record<string, VariantBodyByEngine[Engine]> }
} = {
  'http': {
    variants: {
      'default': {
        baseUrl: '',
        apiKey: '',
        model: 'gpt-4o-mini',
        timeoutMs: 30_000,
      } satisfies HttpVariantBody,
      'gemini-openai-compat': {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: '',
        model: 'gemini-2.5-flash',
        timeoutMs: 30_000,
      } satisfies HttpVariantBody,
      'deepseek': {
        baseUrl: 'https://api.deepseek.com',
        apiKey: '',
        model: 'deepseek-chat',
        timeoutMs: 30_000,
      } satisfies HttpVariantBody,
      'siliconflow': {
        baseUrl: 'https://api.siliconflow.cn/v1',
        apiKey: '',
        model: 'Qwen/Qwen2.5-7B-Instruct',
        timeoutMs: 30_000,
      } satisfies HttpVariantBody,
      'openrouter': {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '',
        model: 'anthropic/claude-sonnet-4.5',
        timeoutMs: 30_000,
      } satisfies HttpVariantBody,
    },
  },
  'mcp': {
    variants: {
      default: {
        url: '',
        token: '',
        timeoutMs: 30_000,
      } satisfies McpVariantBody,
    },
  },
  'cli': {
    variants: {
      default: {
        command: '',
        args: [],
        timeoutMs: 30_000,
      } satisfies CliVariantBody,
    },
  },
  'claude-code': {
    variants: {
      'default': {
        model: 'sonnet',
        timeoutMs: 120_000,
      } satisfies ClaudeCodeVariantBody,
      'opus-plan': {
        model: 'opus',
        permissionPolicy: 'plan',
        timeoutMs: 180_000,
      } satisfies ClaudeCodeVariantBody,
    },
  },
  'acp': {
    variants: {
      gemini: {
        agent: 'gemini',
        timeoutMs: 120_000,
      } satisfies AcpVariantBody,
      qwen: {
        agent: 'qwen',
        timeoutMs: 120_000,
      } satisfies AcpVariantBody,
    },
  },
}

/** Default `ExecutorProfile` written into a freshly seeded worker_config. */
export const DEFAULT_EXECUTOR_PROFILE: ExecutorProfile = {
  engine: 'http',
  variant: 'default',
  overrides: {
    baseUrl: 'http://localhost:9999',
    model: 'stub',
  },
}

export interface ResolvedVariant<Engine extends EngineKind = EngineKind> {
  engine: Engine
  body: VariantBodyByEngine[Engine]
  cmd?: CmdOverrides
  modelId?: string
  reasoningId?: string
  permissionPolicy?: PermissionPolicy
}

/**
 * Materialise a stored `ExecutorProfile` into the effective per-engine config
 * the factory consumes. Throws on unknown engines / variants so misconfigured
 * inputs surface at PUT time rather than runtime.
 *
 * Merge semantics:
 *   - `overrides.cmd` is split off as engine-agnostic CLI overrides.
 *   - the remaining override keys are shallow-merged onto the variant body.
 *   - per-request fields (`modelId`, `reasoningId`, `permissionPolicy`) are
 *     forwarded as-is for the factory to apply at the engine layer.
 */
export function resolveVariant(profile: ExecutorProfile): ResolvedVariant {
  const engineEntry = DEFAULT_PROFILES[profile.engine]
  if (!engineEntry)
    throw new Error(`unknown executor engine: ${profile.engine}`)

  const variantBody = engineEntry.variants[profile.variant]
  if (!variantBody)
    throw new Error(`unknown executor variant '${profile.variant}' for engine '${profile.engine}'`)

  const { cmd, ...rest } = profile.overrides ?? {}
  const merged = { ...variantBody, ...rest } as VariantBodyByEngine[EngineKind]

  return {
    engine: profile.engine,
    body: merged,
    ...(cmd ? { cmd } : {}),
    ...(profile.modelId === undefined ? {} : { modelId: profile.modelId }),
    ...(profile.reasoningId === undefined ? {} : { reasoningId: profile.reasoningId }),
    ...(profile.permissionPolicy === undefined ? {} : { permissionPolicy: profile.permissionPolicy }),
  }
}

/**
 * Reader-only migration from the legacy flat `ExecutorConfig` (FEAT-011 →
 * FEAT-013) into the FEAT-014 three-tier shape. Bootstrap calls this on every
 * load so already-stored configs continue to work without a write-back; the
 * next `PUT /config` naturally writes the new shape.
 *
 * Anything that already has the `engine` key is returned untouched.
 */
export function migrateLegacyExecutor(input: unknown): ExecutorProfile {
  if (!input || typeof input !== 'object')
    return { ...DEFAULT_EXECUTOR_PROFILE }

  const obj = input as Record<string, unknown>

  // Already in the FEAT-014 shape.
  if (typeof obj.engine === 'string')
    return obj as unknown as ExecutorProfile

  const legacyType = obj.type
  if (typeof legacyType !== 'string')
    return { ...DEFAULT_EXECUTOR_PROFILE }

  switch (legacyType) {
    case 'http':
      return {
        engine: 'http',
        variant: 'default',
        overrides: pickDefined({
          baseUrl: obj.baseUrl,
          apiKey: obj.apiKey,
          model: obj.model,
          timeoutMs: obj.timeoutMs,
        }),
      }
    case 'mcp':
      return {
        engine: 'mcp',
        variant: 'default',
        overrides: pickDefined({
          url: obj.url,
          token: obj.token,
          defaultModel: obj.defaultModel,
          tools: obj.tools,
          timeoutMs: obj.timeoutMs,
        }),
      }
    case 'cli':
      return {
        engine: 'cli',
        variant: 'default',
        overrides: pickDefined({
          command: obj.command,
          args: obj.args,
          cwd: obj.cwd,
          env: obj.env,
          timeoutMs: obj.timeoutMs,
          sandbox: obj.sandbox,
        }),
      }
    case 'claude-code':
      return {
        engine: 'claude-code',
        variant: 'default',
        overrides: pickDefined({
          model: obj.model,
          cliVersion: obj.cliVersion,
          extraArgs: obj.extraArgs,
          env: obj.env,
          workspaceRoot: obj.workspaceRoot,
          timeoutMs: obj.timeoutMs,
        }),
      }
    case 'acp': {
      // Migration: agent → variant key. Body keeps `agent` for round-tripping.
      const agent = obj.agent === 'qwen' ? 'qwen' : 'gemini'
      return {
        engine: 'acp',
        variant: agent,
        overrides: pickDefined({
          model: obj.model,
          cliVersion: obj.cliVersion,
          extraArgs: obj.extraArgs,
          env: obj.env,
          timeoutMs: obj.timeoutMs,
        }),
      }
    }
    default:
      return { ...DEFAULT_EXECUTOR_PROFILE }
  }
}

function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined)
      out[k] = v
  }
  return out as Partial<T>
}
