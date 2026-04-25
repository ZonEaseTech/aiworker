/**
 * Three-tier executor configuration introduced by FEAT-014.
 *
 * Layer 1 — `engine`: which executor implementation runs the agent (HTTP /
 * MCP / CLI / Claude Code / ACP).
 * Layer 2 — `variant`: a named preset per engine living in `default-profiles`
 * (e.g. `claude-code-default`, `acp/gemini`, `http/deepseek`). The user's
 * worker config stores only `{ engine, variant, overrides }`; the variant
 * body is materialised on the worker at runtime.
 * Layer 3 — `overrides`: shallow-merged onto the variant body, plus per-
 * request knobs (`modelId`, `reasoningId`, `permissionPolicy`) and a
 * universal `cmd` slot for binary / extraArgs / env / cliVersion overrides.
 *
 * Variant body schemas are exported from this module so the worker config
 * boundary (Zod schema) and the front-end picker (lean schema → form
 * mapper) read from the same source of truth.
 */

/** Engine kinds the fleet currently knows about. */
export type EngineKind = 'http' | 'mcp' | 'cli' | 'claude-code' | 'acp' | 'codex' | 'cursor'

/**
 * Engine-agnostic CLI overrides. Apply to any engine that spawns a binary
 * (cli / claude-code / acp); the HTTP and MCP engines ignore these fields.
 */
export interface CmdOverrides {
  binary?: string
  extraArgs?: string[]
  env?: Record<string, string>
  /** For npx-style fallbacks; engine decides how to resolve. */
  cliVersion?: string
}

/** Optional permission policy carried at the profile level. */
export type PermissionPolicy = 'auto' | 'supervised' | 'plan'

/**
 * Top-level executor configuration as persisted in `worker_config.configJson`.
 * The full variant body is intentionally NOT stored here — clients send only
 * the diff and the worker reconstructs the effective config from
 * `DEFAULT_PROFILES` on every load and reload.
 */
export interface ExecutorProfile {
  engine: EngineKind
  /** Key into `DEFAULT_PROFILES[engine].variants`. */
  variant: string
  /**
   * Shallow-merged onto the variant body (per-engine field set). Reserve the
   * `cmd` key for engine-agnostic CLI overrides; everything else is
   * variant-body-shaped.
   */
  overrides?: VariantOverrides
  /** Per-request model override; trumps `variantBody.model`. */
  modelId?: string
  /** Reasoning preset, reserved for future agent-cli integration. */
  reasoningId?: string
  /** Approval policy hint, reserved for future agent-cli integration. */
  permissionPolicy?: PermissionPolicy
  /**
   * Optional fallback chain (PLAN-014 §F3). When the primary executor throws
   * during a run, the worker classifies the error via `inferErrorKind` and
   * swaps in the first entry whose `onErrorKinds` includes the classified
   * kind. Each entry's `executor` is itself an `ExecutorProfile`, so chains
   * can be nested arbitrarily deep.
   */
  fallbacks?: ExecutorFallbackEntry[]
}

/** Error categories that drive fallback selection. */
export type ExecutorErrorKind
  = | 'rate-limit'
    | 'timeout'
    | 'auth'
    | 'network'
    | 'server-5xx'
    | 'unknown'

/** A single fallback link in an executor chain. */
export interface ExecutorFallbackEntry {
  executor: ExecutorProfile
  onErrorKinds: ExecutorErrorKind[]
  /**
   * Total attempts on this fallback before bubbling to the next entry.
   * Defaults to 1 (single attempt, no extra retry). Initial call is included
   * in the count, so `maxRetries: 3` runs the fallback up to 3 times.
   */
  maxRetries?: number
}

export type VariantOverrides = { cmd?: CmdOverrides } & Record<string, unknown>

// -- Variant bodies (per engine) -------------------------------------------

export interface HttpVariantBody {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export interface McpVariantBody {
  url: string
  token: string
  defaultModel?: string
  tools?: string[]
  timeoutMs?: number
}

export interface CliVariantBody {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  /** Wrap each invocation in a one-shot docker sandbox. */
  sandbox?: boolean
}

export interface ClaudeCodeVariantBody {
  model?: string
  cliVersion?: string
  extraArgs?: string[]
  env?: Record<string, string>
  workspaceRoot?: string
  timeoutMs?: number
  permissionPolicy?: PermissionPolicy
}

/** ACP agent identifiers — must match worker-side `AcpAgentId` exactly. */
export type AcpAgentId = 'gemini' | 'qwen'

export interface AcpVariantBody {
  agent: AcpAgentId
  model?: string
  cliVersion?: string
  extraArgs?: string[]
  env?: Record<string, string>
  timeoutMs?: number
}

/**
 * Codex (`@openai/codex app-server`) variant body. FEAT-016 keeps the
 * exposed surface minimal — `model` maps to the `thread_start` param, all
 * other Codex-specific knobs (sandbox / approval_policy / reasoning effort)
 * tunnel through `CmdOverrides.extraArgs` so variant bodies don't balloon.
 */
export interface CodexVariantBody {
  model?: string
  timeoutMs?: number
}

/**
 * Cursor Agent (`cursor-agent -p --output-format=stream-json`) variant body.
 * `model` defaults to `auto` — the CLI picks the active workspace model when
 * not overridden.
 */
export interface CursorVariantBody {
  model?: string
  timeoutMs?: number
}

/** Discriminator for compile-time variant body lookup. */
export interface VariantBodyByEngine {
  'http': HttpVariantBody
  'mcp': McpVariantBody
  'cli': CliVariantBody
  'claude-code': ClaudeCodeVariantBody
  'acp': AcpVariantBody
  'codex': CodexVariantBody
  'cursor': CursorVariantBody
}

export type VariantBody<Engine extends EngineKind = EngineKind> = VariantBodyByEngine[Engine]

/**
 * `ExecutorConfig` is the historical name still referenced across the
 * codebase; from FEAT-014 onward it is an alias for `ExecutorProfile` so
 * existing imports keep working.
 */
export type ExecutorConfig = ExecutorProfile
