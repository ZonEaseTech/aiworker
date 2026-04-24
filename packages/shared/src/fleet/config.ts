import type { ChannelBinding } from './channel'
import type { ExecutorConfig } from './executor'

/**
 * Shape of config for a filesystem-backed brain source. `home` is optional;
 * when omitted, the factory defaults to `<resolveBrainHome(workerId)>`
 * under `~/.aiworker/workers/<workerId>/brain/` (see `@aiworker/fs-layout`).
 * Supplying an explicit path is only useful for pointing at a shared
 * knowledge base outside the worker's own home.
 */
export interface FilesystemBrainSourceConfig {
  home?: string
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
  = | { id: string, type: 'filesystem', priority: number, readOnly: boolean, config: FilesystemBrainSourceConfig }
    | { id: string, type: 'cloud-gateway', priority: number, readOnly: boolean, config: CloudGatewayBrainSourceConfig }

/** How the multi-brain layer merges results across sources. */
export type BrainRetrievalMode = 'merge-by-priority' | 'first-match'

// Re-export executor shapes from the dedicated module so existing imports of
// `ExecutorConfig` from `@aiworker/shared` keep working without a rename.
export type {
  AcpAgentId,
  AcpVariantBody,
  ClaudeCodeVariantBody,
  CliVariantBody,
  CmdOverrides,
  EngineKind,
  ExecutorConfig,
  ExecutorProfile,
  HttpVariantBody,
  McpVariantBody,
  PermissionPolicy,
  VariantBody,
  VariantBodyByEngine,
  VariantOverrides,
} from './executor'

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
