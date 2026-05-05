import type { ChannelBinding } from './channel'
import type { ExecutorConfig } from './executor'

/**
 * Shape of config for a filesystem-backed brain source. `home` is optional;
 * when omitted, the factory defaults to `<resolveBrainHome(workerId)>`
 * under `~/.aiworker/workers/<workerId>/brain/` (see `@zonease/aiworker-fs-layout`).
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
// `ExecutorConfig` from `@zonease/aiworker-shared` keep working without a rename.
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

/** Per-tool action used by `toolPolicy.default` and matched rule entries. */
export type ToolPolicyAction = 'auto' | 'ask' | 'deny'

/**
 * Per-tool approval policy (PLAN-014 F2). Tool name 通过 `rules[]` 顺序匹配，
 * 第一条命中即用；都不命中走 `default`。`pattern` 当前支持字面量精确匹配与
 * `*` 通配符（`*` / `prefix-*` / `*-suffix` / `pre-*-post`）。
 *
 * 缺省 `default='auto'` 不破坏现状；`ask` 触发 `approval.requested` 事件
 * 并挂起执行直到 operator 通过 `approval.grant` 批准/拒绝；`deny` 直接
 * 短路合成一条 `tool {name} blocked by policy` 助手消息，不进入 executor。
 */
export interface ToolPolicy {
  default: ToolPolicyAction
  rules: Array<{ pattern: string, action: ToolPolicyAction }>
}

export interface OrchestratorCompactionMemoryFlushConfig {
  enabled?: boolean
}

export interface OrchestratorCompactionConfig {
  /**
   * Compaction is opt-in. When disabled or omitted, the S2 token-budget and
   * legacy max-history behavior remain unchanged.
   */
  enabled?: boolean
  /**
   * Estimated prompt-token threshold that triggers compaction. Defaults to the
   * active context window minus reserve tokens.
   */
  triggerTokens?: number
  /**
   * Maximum transcript rows included in the summarizer prompt. Older and newer
   * edges are preserved when truncation is required.
   */
  maxSummaryMessages?: number
  memoryFlush?: OrchestratorCompactionMemoryFlushConfig
}

export type IntentClassifierEvaluator = 'heuristic' | 'llm'
export type QualityGateEvaluator = 'heuristic' | 'llm'
export type QualityGateMode = 'observe' | 'warn' | 'retry' | 'block'

export interface OrchestratorQualityGateConfig {
  evaluator?: QualityGateEvaluator
  mode?: QualityGateMode
  threshold?: number
  /**
   * TODO-013: hard wall-clock budget per LLM gate call (milliseconds). When
   * the budget is exhausted, the gate falls back to the heuristic evaluator
   * with reason `llm-budget-exhausted:Nms`. Default 30_000 ms.
   */
  budgetMs?: number
}

export interface OrchestratorDecisionPipelineConfig {
  /**
   * Optional control-plane executor for suppressed decision calls. When omitted,
   * the orchestrator reuses `WorkerConfig.executor` for backward compatibility.
   */
  executor?: ExecutorConfig
  intentClassifier?: {
    /**
     * `heuristic` is deterministic and cheap. `llm` runs a suppressed executor
     * strict-JSON classifier before the main turn and falls back to heuristic.
     */
    evaluator?: IntentClassifierEvaluator
  }
  qualityGate?: OrchestratorQualityGateConfig
}

/**
 * Orchestrator runtime tuning.
 *
 * `maxHistoryMessages` remains the backward-compatible fallback when token
 * budgeting is not enabled. Setting any token budget field enables S2 context
 * assembly: the system prompt is always included first, then recent history is
 * selected newest-backward until the configured token budget is filled.
 */
/**
 * BUG-063: dead-loop detector. When the executor stream emits >`threshold`
 * `tool_call` events without any intervening `assistant_message_delta`,
 * abort the run and emit `orchestrator.aborted` with reason
 * `dead-loop-suspected:tool_call=N,no_text_delta`.
 *
 * Defaults: `{ enabled: true, threshold: 8 }`. Operators can disable in
 * worker config when the workflow legitimately involves long pure-tool
 * sequences.
 */
export interface OrchestratorDeadLoopConfig {
  enabled?: boolean
  threshold?: number
}

export interface OrchestratorConfig {
  contextWindowTokens?: number
  reserveTokens?: number
  keepRecentTokens?: number
  maxHistoryMessages?: number
  compaction?: OrchestratorCompactionConfig
  decisionPipeline?: OrchestratorDecisionPipelineConfig
  deadLoop?: OrchestratorDeadLoopConfig
}

export const DEFAULT_MAX_HISTORY_MESSAGES = 20

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
  /** Per-tool approval policy（PLAN-014 F2）。缺省视同 `{ default: 'auto', rules: [] }`。 */
  toolPolicy?: ToolPolicy
  /** Orchestrator 运行时调参（REFACTOR-006 P2）；缺省走 `DEFAULT_MAX_HISTORY_MESSAGES`。 */
  orchestrator?: OrchestratorConfig
}
