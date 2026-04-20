import type { BrainProvider, ExecutorProvider } from '@aiworker/shared'

import { config } from '../config'
import { HermesProvider } from './brain/hermes'
import { OpenAICompatibleExecutor } from './executor/openai-compatible'

let brainProvider: BrainProvider | null = null
let executorProvider: ExecutorProvider | null = null

export function getBrainProvider(): BrainProvider {
  if (!brainProvider) {
    brainProvider = new HermesProvider({
      apiUrl: config.HERMES_API_URL,
      home: config.HERMES_HOME,
    })
  }
  return brainProvider
}

export function getExecutorProvider(): ExecutorProvider {
  if (!executorProvider) {
    executorProvider = new OpenAICompatibleExecutor({
      baseUrl: config.OPENAI_BASE_URL,
      apiKey: config.OPENAI_API_KEY,
      model: config.OPENAI_MODEL,
      timeoutMs: config.OPENAI_TIMEOUT_MS,
    })
  }
  return executorProvider
}
