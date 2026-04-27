import type { WorkerConfig } from '@zonease/aiworker-shared'
import { DEFAULT_EXECUTOR_PROFILE } from '../executor/default-profiles'

/**
 * Placeholder config written into `worker_config` on first boot. Every field
 * is intentionally inert: the HTTP executor points at a dead port and the
 * brain array is empty, so the worker starts up without talking to any
 * external service. The dashboard (PLAN-004 2.2+) replaces this as soon as a
 * real config is pushed.
 */
export const DEFAULT_EMPTY_CONFIG: WorkerConfig = {
  brains: [],
  brainWriteTarget: '',
  brainRetrieval: 'first-match',
  executor: { ...DEFAULT_EXECUTOR_PROFILE },
  channels: [],
  evolution: {
    enabled: false,
    observationRetentionDays: 7,
  },
}
