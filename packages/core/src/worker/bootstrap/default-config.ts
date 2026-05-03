import type { WorkerConfig } from '@zonease/aiworker-shared'
import { DEFAULT_EXECUTOR_PROFILE } from '../executor/default-profiles'

export const DEFAULT_FILESYSTEM_BRAIN_SOURCE_ID = 'local-filesystem'

/**
 * Placeholder config written into `worker_config` on first boot. It stays
 * safe for first run: the HTTP executor points at a dead port, while the
 * brain source is local filesystem only and resolves through fs-layout.
 * The dashboard (PLAN-004 2.2+) replaces this as soon as a real config is
 * pushed.
 */
export const DEFAULT_EMPTY_CONFIG: WorkerConfig = {
  brains: [
    {
      id: DEFAULT_FILESYSTEM_BRAIN_SOURCE_ID,
      type: 'filesystem',
      priority: 100,
      readOnly: false,
      config: {},
    },
  ],
  brainWriteTarget: DEFAULT_FILESYSTEM_BRAIN_SOURCE_ID,
  brainRetrieval: 'first-match',
  executor: { ...DEFAULT_EXECUTOR_PROFILE },
  channels: [],
  evolution: {
    enabled: false,
    observationRetentionDays: 7,
  },
}
