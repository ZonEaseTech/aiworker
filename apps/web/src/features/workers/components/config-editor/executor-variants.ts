import type { EngineKind, ExecutorProfile } from '@aiworker/shared'
import { z } from 'zod'

/**
 * Front-end metadata describing each engine + variant the picker can render.
 * The variant body schemas embedded here drive the dynamic form mapper —
 * they must stay in sync with `apps/api/.../default-profiles.ts` (kept in
 * sync by the FEAT-014 acceptance test that resolves every catalog entry).
 *
 * `secretFields` is purely presentational: keys listed here render via the
 * masked `<SecretField>` and are treated as redacted on read (empty string =
 * "leave the stored secret untouched", matching the worker_secrets contract).
 */
export interface VariantMeta {
  label: string
  description?: string
  /** Zod schema for the variant body — drives the dynamic form. */
  schema: z.ZodObject<z.ZodRawShape>
  /** Variant body keys treated as secrets in the UI. */
  secretFields?: string[]
}

export interface EngineMeta {
  label: string
  description: string
  variants: Record<string, VariantMeta>
}

const httpVariantSchema = z.object({
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
  timeoutMs: z.number().int().positive(),
})

const httpHelpers = { secretFields: ['apiKey'] }

const mcpVariantSchema = z.object({
  url: z.string(),
  token: z.string(),
  defaultModel: z.string().optional(),
  tools: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
})

const cliVariantSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
  sandbox: z.boolean().optional(),
})

const claudeCodeVariantSchema = z.object({
  model: z.string().optional(),
  cliVersion: z.string().optional(),
  extraArgs: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  workspaceRoot: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  permissionPolicy: z.enum(['auto', 'supervised', 'plan']).optional(),
})

const acpVariantSchema = z.object({
  agent: z.enum(['gemini', 'qwen']),
  model: z.string().optional(),
  cliVersion: z.string().optional(),
  extraArgs: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
})

const codexVariantSchema = z.object({
  model: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
})

const cursorVariantSchema = z.object({
  model: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
})

export const ENGINE_CATALOG: Record<EngineKind, EngineMeta> = {
  'http': {
    label: 'HTTP (OpenAI-compatible)',
    description: 'Generic chat-completions endpoint that speaks the OpenAI wire format.',
    variants: {
      'default': {
        label: 'Default',
        description: 'Empty preset — fill in baseUrl, apiKey, model.',
        schema: httpVariantSchema,
        ...httpHelpers,
      },
      'gemini-openai-compat': {
        label: 'Gemini (OpenAI-compat)',
        description: 'generativelanguage.googleapis.com OpenAI compatibility endpoint.',
        schema: httpVariantSchema,
        ...httpHelpers,
      },
      'deepseek': {
        label: 'DeepSeek',
        description: 'api.deepseek.com — model defaults to deepseek-chat.',
        schema: httpVariantSchema,
        ...httpHelpers,
      },
      'siliconflow': {
        label: 'SiliconFlow',
        description: 'api.siliconflow.cn/v1 — Chinese OpenAI-compatible aggregator.',
        schema: httpVariantSchema,
        ...httpHelpers,
      },
      'openrouter': {
        label: 'OpenRouter',
        description: 'openrouter.ai/api/v1 — fanout to 100+ provider models.',
        schema: httpVariantSchema,
        ...httpHelpers,
      },
    },
  },
  'mcp': {
    label: 'MCP (tool source)',
    description: 'Model Context Protocol streamable-http server. Exposes tools, not chat.',
    variants: {
      default: {
        label: 'Default',
        description: 'MCP server with bearer auth.',
        schema: mcpVariantSchema,
        secretFields: ['token'],
      },
    },
  },
  'cli': {
    label: 'Generic CLI',
    description: 'Spawn an arbitrary CLI per turn. Reserved for stub / debug use.',
    variants: {
      default: {
        label: 'Default',
        description: 'Manual command + args.',
        schema: cliVariantSchema,
      },
    },
  },
  'claude-code': {
    label: 'Claude Code',
    description: 'Anthropic Claude Code CLI in stream-json mode (FEAT-012).',
    variants: {
      'default': {
        label: 'Default (sonnet)',
        description: 'Auto-approve, sonnet model, 120s turn timeout.',
        schema: claudeCodeVariantSchema,
      },
      'opus-plan': {
        label: 'Opus + Plan policy',
        description: 'Opus model with plan-mode permission policy, 180s turn timeout.',
        schema: claudeCodeVariantSchema,
      },
    },
  },
  'acp': {
    label: 'ACP (Gemini / Qwen)',
    description: 'Agent Client Protocol harness — variant key selects the CLI agent.',
    variants: {
      gemini: {
        label: 'Gemini CLI',
        description: 'google-gemini/gemini-cli with --experimental-acp + --yolo.',
        schema: acpVariantSchema,
      },
      qwen: {
        label: 'Qwen Code',
        description: 'qwenlm/qwen-code with --acp + --yolo.',
        schema: acpVariantSchema,
      },
    },
  },
  'codex': {
    label: 'Codex',
    description: 'OpenAI @openai/codex app-server via JSON-RPC over stdio (FEAT-016).',
    variants: {
      default: {
        label: 'Default (gpt-5.2-codex)',
        description: 'Auto-approve (approval_policy=never), 120s turn timeout.',
        schema: codexVariantSchema,
      },
    },
  },
  'cursor': {
    label: 'Cursor Agent',
    description: 'Cursor CLI in stream-json mode — no npm fallback (install cursor-agent) (FEAT-016).',
    variants: {
      default: {
        label: 'Default (auto model)',
        description: 'cursor-agent -p --output-format=stream-json, 120s turn timeout.',
        schema: cursorVariantSchema,
      },
    },
  },
}

export function getEngineMeta(engine: EngineKind): EngineMeta {
  return ENGINE_CATALOG[engine]
}

export function listEngines(): EngineKind[] {
  return Object.keys(ENGINE_CATALOG) as EngineKind[]
}

export function listVariantsFor(engine: EngineKind): string[] {
  return Object.keys(ENGINE_CATALOG[engine].variants)
}

/**
 * Pick a sensible default profile when the user picks an engine without
 * supplying overrides. The variant defaults to `default` if it exists, else
 * the first registered variant. Useful for the picker's "switch engine"
 * fallback.
 */
export function defaultProfileFor(engine: EngineKind): ExecutorProfile {
  const variants = listVariantsFor(engine)
  const variant = variants.includes('default') ? 'default' : variants[0]!
  return { engine, variant }
}
