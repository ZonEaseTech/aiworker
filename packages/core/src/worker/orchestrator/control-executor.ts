import type { ExecutorConfig, ExecutorProvider, WorkerConfig } from '@zonease/aiworker-shared'

import { buildExecutor } from '../executor/factory'

export interface ResolvedControlExecutor {
  executor: ExecutorProvider
  config: ExecutorConfig
  reusesTaskExecutor: boolean
}

/**
 * Resolve the executor used by suppressed orchestrator control calls.
 *
 * Omitted `orchestrator.decisionPipeline.executor` keeps the FEAT-038 MVP
 * behavior by reusing the task executor instance. An explicit control executor
 * is built independently so model, timeout, and fallback settings can diverge.
 */
export function resolveControlExecutor(input: {
  config: WorkerConfig
  taskExecutor: ExecutorProvider
}): ResolvedControlExecutor {
  const controlConfig = input.config.orchestrator?.decisionPipeline?.executor
  if (!controlConfig) {
    return {
      executor: input.taskExecutor,
      config: input.config.executor,
      reusesTaskExecutor: true,
    }
  }

  return {
    executor: buildExecutor(controlConfig),
    config: controlConfig,
    reusesTaskExecutor: false,
  }
}
