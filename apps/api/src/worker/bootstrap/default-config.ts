import type { WorkerConfig } from '@aiworker/shared'

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
  executor: {
    type: 'http',
    baseUrl: 'http://localhost:9999',
    apiKey: '',
    model: 'stub',
    timeoutMs: 30_000,
  },
  channels: [],
  evolution: {
    enabled: false,
    observationRetentionDays: 7,
  },
}
