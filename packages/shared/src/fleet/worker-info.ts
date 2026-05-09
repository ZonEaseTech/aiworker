import type { ChannelBinding } from './channel'
import type { BrainSourceConfig } from './config'
import type { EngineKind } from './executor'

/**
 * Health verdict the manager (or any caller of `/api/worker/info`) sees for
 * an individual brain or executor component. `unknown` is returned before the
 * worker has had a chance to probe the upstream. See PLAN-004
 * §Worker management API.
 */
export type WorkerComponentStatus = 'healthy' | 'degraded' | 'down' | 'unknown'

/** One brain-source row inside the `WorkerInfo` response. */
export interface WorkerInfoBrain {
  id: string
  type: BrainSourceConfig['type']
  status: WorkerComponentStatus
  /** Configured merge priority; larger values are read first. */
  priority?: number
  /** True when this source cannot receive worker memory writes. */
  readOnly?: boolean
  /** True when this source is `WorkerConfig.brainWriteTarget`. */
  writeTarget?: boolean
  /** Effective filesystem brain home; omitted for non-filesystem sources. */
  home?: string
  /** Cloud brain endpoint; secret tokens are never surfaced here. */
  url?: string
}

/**
 * Executor summary inside the `WorkerInfo` response. `type` carries the
 * engine kind (FEAT-014); the field name stays `type` for response-schema
 * stability with manager / dashboard clients.
 */
export interface WorkerInfoExecutor {
  type: EngineKind
  model?: string
  status: WorkerComponentStatus
}

/** Control-plane executor diagnostics surfaced by `GET /api/worker/info`. */
export interface WorkerInfoControlExecutor extends WorkerInfoExecutor {
  /** True when suppressed control calls reuse `WorkerConfig.executor`. */
  reusesTaskExecutor: boolean
}

/**
 * Brain admission / artifact / scope aggregate surfaced through `/info` for
 * fleet operators (PLAN-103). Counts only — fleet.db never replicates the
 * proposal / artifact payloads; operators drill down via worker REST.
 */
export interface WorkerInfoBrainSummary {
  /** Snapshot of `<project>/.aiworker/scope.json` parse status. */
  scopeManifest: {
    status: 'ok' | 'missing' | 'malformed' | 'not-applicable'
    kind?: string
    primarySoul?: string
    privacy?: 'private' | 'team' | 'public'
    approval?: 'manual-approval' | 'auto-low-risk'
    error?: string
  }
  artifacts: {
    total: number
    /** `byStatus.active`, `byStatus.archived`, `byStatus.removed`. */
    byStatus: Record<string, number>
  }
  admissions: {
    /** Aggregated by `BrainAdmissionStatus`; missing keys mean 0. */
    byStatus: Record<string, number>
    /** ISO timestamp of the most recent proposal `updatedAt`, if any. */
    lastUpdatedAt?: string
    /**
     * Observe-only governance warning. Set when a recent assistant reply
     * claimed durable Brain admission / memory success but no AIWorker
     * admission row was created in that turn.
     */
    bypassRisk: {
      status: 'none' | 'suspected'
      recentCount: number
      claimExcerpt?: string
      lastDetectedAt?: string
      reason?: string
    }
  }
  /**
   * Decision pipeline truthfulness snapshot (PLAN-116 / BUG-066 / BUG-067).
   * Reports the configured evaluator + top-level mode for each decision step,
   * plus a worker.db-backed recent-window summary of classifier outcomes.
   * This is observability, not audit; older unmigrated workers may fall back to
   * process-local memory until migrations run.
   */
  decisionPipeline: WorkerInfoDecisionPipelineSummary
}

/** PLAN-116 decision pipeline truthfulness summary. */
export interface WorkerInfoDecisionPipelineSummary {
  intentClassifier: {
    evaluator: 'heuristic' | 'llm'
    mode: 'observe_only' | 'enforced'
    recent: DecisionPipelineRecent
  }
  capabilityRouter: {
    source: 'capability-registry'
    mode: 'observe_only' | 'enforced'
    note: string
  }
  qualityGate: {
    evaluator: 'heuristic' | 'llm'
    configuredMode: 'observe' | 'warn' | 'retry' | 'block'
    threshold?: number
    recent: DecisionPipelineRecent
  }
  conversationClassifier: {
    /** True when an explicit control-plane executor is configured. */
    enabled: boolean
    recent: ConversationClassifierRecent
  }
}

/** Ring-buffer summary for a single decision step. */
export interface DecisionPipelineRecent {
  /** Maximum samples the buffer can hold (currently 50). */
  windowSize: number
  /** Number of samples currently retained. */
  samples: number
  /** Fraction in `[0,1]`: samples whose `source` indicates fallback. */
  fallbackRate: number
  /** Most recent fallback `reason` (string), or `null` if none. */
  lastFallbackReason: string | null
  /** Most recent fallback ISO timestamp, or `null` if none. */
  lastFallbackAt: string | null
}

/** Conversation classifier ring-buffer summary (PLAN-116). */
export interface ConversationClassifierRecent extends DecisionPipelineRecent {
  /**
   * Histogram of `decision.reason` strings observed in the buffer (e.g.
   * `non-json-classifier-output`, `malformed-response`,
   * `classifier-error-default-continue`).
   */
  fallbackByReason: Record<string, number>
}

/** One channel binding row inside the `WorkerInfo` response. */
export interface WorkerInfoChannel {
  channel: ChannelBinding['channel']
  enabled: boolean
  /** Externally reachable webhook URL the operator pastes into the platform. */
  webhookUrl?: string
}

/**
 * Response body of `GET /api/worker/info` — the worker's self-description
 * that the manager polls to populate `lastSeenAt` / `lastSeenState` /
 * `lastConfigVersion` and to surface "what is this worker doing right now".
 * See PLAN-004 §Worker management API.
 */
export interface WorkerInfo {
  workerId: string
  runtimeVersion: string
  configVersion: number
  brains: WorkerInfoBrain[]
  executor: WorkerInfoExecutor
  controlExecutor?: WorkerInfoControlExecutor
  channels: WorkerInfoChannel[]
  evolutionEnabled: boolean
  /**
   * Aggregate brain state (PLAN-103). Always present; counts default to 0
   * when worker.db has no admissions / artifacts and project scope has no
   * scope manifest. Fleet UI consumes this directly without re-reading
   * worker.db.
   */
  brainSummary: WorkerInfoBrainSummary
  /** ISO-8601 timestamp the current worker process started. */
  startedAt: string
  /**
   * Operator-supplied externally reachable base URL (env
   * `AIWORKER_ADVERTISED_BASE_URL`) — manager UI uses this to render the
   * webhook URLs an operator pastes into LINE / Telegram / etc. See PLAN-004
   * risk #8.
   */
  advertisedBaseUrl?: string
}
