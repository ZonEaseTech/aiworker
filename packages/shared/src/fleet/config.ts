import type { ChannelBinding } from './channel'

/** Shape of config for a Hermes-backed brain source. */
export interface HermesBrainSourceConfig {
  apiUrl: string
  home: string
}

/** Shape of config for a cloud-gateway (MCP streamable-http) brain source. */
export interface CloudGatewayBrainSourceConfig {
  url: string
  token: string
  defaultCategory?: string
  defaultTypeId?: string
}

/** A single brain mount on a worker. Workers may have many. */
export type BrainSourceConfig
  = | { id: string, type: 'hermes', priority: number, readOnly: boolean, config: HermesBrainSourceConfig }
    | { id: string, type: 'cloud-gateway', priority: number, readOnly: boolean, config: CloudGatewayBrainSourceConfig }

/** How the multi-brain layer merges results across sources. */
export type BrainRetrievalMode = 'merge-by-priority' | 'first-match'

/** Executor variants the fleet supports. */
export type ExecutorConfig
  = | { type: 'http', baseUrl: string, apiKey: string, model: string, timeoutMs: number }
    | { type: 'mcp', url: string, token: string, defaultModel?: string, tools?: string[], timeoutMs?: number }
    | {
      type: 'cli'
      command: string
      args: string[]
      cwd?: string
      env?: Record<string, string>
      timeoutMs?: number
      /** When true, each invocation is wrapped in a one-shot docker sandbox. Reserved for FEAT-002. */
      sandbox?: boolean
    }
    | {
      /**
       * Claude Code agentic CLI executor. FEAT-012 ships the minimal shape;
       * the full three-tier (engine × variant × override) config lands in
       * FEAT-014 — do not expand this discriminator prematurely.
       */
      type: 'claude-code'
      /** Optional model id pass-through (e.g. `sonnet`, `opus`). */
      model?: string
      /** Pinned `@anthropic-ai/claude-code` version for `npx` fallback. */
      cliVersion?: string
      /** Additional CLI args appended after the required flags. */
      extraArgs?: string[]
      /** Additional env vars merged into the spawned process env. */
      env?: Record<string, string>
      /**
       * Subdir name (relative to `WORKER_DATA_ROOT`) for per-conversation
       * workspaces. Defaults to `workspaces`. Any value that would resolve
       * outside `WORKER_DATA_ROOT` is rejected by the path-escape guard.
       */
      workspaceRoot?: string
      /** Per-turn hard timeout; defaults to 120s if unset. */
      timeoutMs?: number
    }

/** Evolution (L3) settings. MVP wires the observer and approval UI only. */
export interface EvolutionConfig {
  enabled: boolean
  /** Rows in `evolution_observations` older than this are pruned. */
  observationRetentionDays: number
}

/**
 * Complete per-worker configuration. Materialized from dashboard forms and
 * persisted in `fleet.db.worker_configs`; secret fields referenced inside
 * (`token`, `apiKey`, channel credentials) are stored encrypted in
 * `fleet.db.worker_secrets` and substituted at container spawn time.
 */
export interface WorkerConfig {
  brains: BrainSourceConfig[]
  /** `id` of the brain source that receives `writeMemory` calls. */
  brainWriteTarget: string
  brainRetrieval: BrainRetrievalMode
  executor: ExecutorConfig
  channels: ChannelBinding[]
  evolution: EvolutionConfig
}
