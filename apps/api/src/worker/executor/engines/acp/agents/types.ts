/** Agent identifiers recognised by the ACP harness. */
export type AcpAgentId = 'gemini' | 'qwen'

/** Result of the auth-probe cache entry. */
export type AvailabilityStatus = 'LoginDetected' | 'InstallationFound' | 'NotFound'

export interface AvailabilityInfo {
  status: AvailabilityStatus
  checkedAt: string
  /** Human-readable note (where the probe looked, why it failed, ...). */
  detail?: string
}

export interface BuildArgsContext {
  /** Model id override from config, if any. */
  model?: string
  /** Auto-approve mode — FEAT-013 runs agents in yolo mode. */
  yolo: boolean
  /** Caller-supplied extra args, appended last. */
  extraArgs?: string[]
}

/**
 * Data-only declaration of an ACP-speaking CLI agent. The harness consumes
 * these via the registry and spawns `commandName` from PATH, falling back
 * to the `npx` package when absent. Version is env-overridable and must
 * not be hard-coded into the source of the adapter.
 */
export interface AcpAgentDefinition {
  /** Stable identifier used in ExecutorConfig discriminator. */
  readonly id: AcpAgentId
  /** Human label for logs / dashboards. */
  readonly label: string
  /** Preferred binary looked up on PATH (e.g. `gemini` / `qwen-code`). */
  readonly commandName: string
  /** Env var name that overrides the baked-in default CLI version. */
  readonly versionEnvVar: string
  /** Baked-in fallback version when neither config nor env provides one. */
  readonly defaultVersion: string
  /** npm package name used by the `npx` fallback. */
  readonly npxPackage: string
  /** Compose the argv after the resolved binary / npx invocation. */
  buildArgs: (ctx: BuildArgsContext) => string[]
  /**
   * Out-of-band auth probe. The harness caches the result in-memory for
   * 10 minutes; DB persistence is a follow-up concern. Must never throw —
   * return `{ status: 'NotFound', detail: ... }` on any error.
   */
  authProbe?: () => Promise<AvailabilityInfo>
}
