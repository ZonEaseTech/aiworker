import type { ChannelBinding } from './channel'
import type { BrainSourceConfig, ExecutorConfig } from './config'

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
}

/** Executor summary inside the `WorkerInfo` response. */
export interface WorkerInfoExecutor {
  type: ExecutorConfig['type']
  model?: string
  status: WorkerComponentStatus
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
  channels: WorkerInfoChannel[]
  evolutionEnabled: boolean
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
