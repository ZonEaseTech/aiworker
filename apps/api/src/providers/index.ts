import type { ExecutorProvider } from '@aiworker/shared'

import { config } from '../config'
import { OpenAICompatibleExecutor } from './executor/openai-compatible'

let executorInstance: ExecutorProvider | null = null

export function getExecutorProvider(): ExecutorProvider {
  if (executorInstance)
    return executorInstance
  executorInstance = new OpenAICompatibleExecutor({
    baseUrl: config.OPENAI_BASE_URL,
    apiKey: config.OPENAI_API_KEY,
    model: config.OPENAI_MODEL,
    timeoutMs: config.OPENAI_TIMEOUT_MS,
  })
  return executorInstance
}
