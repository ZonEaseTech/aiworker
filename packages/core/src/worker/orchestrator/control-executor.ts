import type { ExecutorConfig, ExecutorProvider, WorkerConfig } from '@zonease/aiworker-shared'

import { buildExecutor } from '../executor/factory'

export interface ResolvedControlExecutor {
  executor?: ExecutorProvider
  config?: ExecutorConfig
  reusesTaskExecutor: boolean
}

/**
 * Resolve the executor used by suppressed orchestrator control calls.
 *
 * Omitted `orchestrator.decisionPipeline.executor` means there is no LLM
 * control-plane executor. Control steps then use deterministic/fallback paths
 * instead of borrowing the task executor and accidentally interfering with its
 * native session, permission, sandbox, or tool loop.
 */
export function resolveControlExecutor(input: {
  config: WorkerConfig
  taskExecutor: ExecutorProvider
}): ResolvedControlExecutor {
  const controlConfig = input.config.orchestrator?.decisionPipeline?.executor
  if (!controlConfig) {
    return {
      reusesTaskExecutor: false,
    }
  }

  return {
    executor: buildExecutor(controlConfig),
    config: controlConfig,
    reusesTaskExecutor: false,
  }
}
