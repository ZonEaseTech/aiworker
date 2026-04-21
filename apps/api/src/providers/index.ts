import type { BrainProvider, ExecutorProvider } from '@aiworker/shared'

import { config } from '../config'
import { CloudGatewayBrainProvider } from './brain/cloud-gateway'
import { HermesProvider } from './brain/hermes'
import { OpenAICompatibleExecutor } from './executor/openai-compatible'

let brainProvider: BrainProvider | null = null
let executorProvider: ExecutorProvider | null = null

function createBrainProvider(): BrainProvider {
  if (config.BRAIN_PROVIDER === 'cloud-gateway') {
    if (!config.CLOUD_GATEWAY_MCP_URL || !config.CLOUD_GATEWAY_MCP_TOKEN) {
      throw new Error('BRAIN_PROVIDER=cloud-gateway requires CLOUD_GATEWAY_MCP_URL and CLOUD_GATEWAY_MCP_TOKEN')
    }
    return new CloudGatewayBrainProvider({
      url: config.CLOUD_GATEWAY_MCP_URL,
      token: config.CLOUD_GATEWAY_MCP_TOKEN,
      defaultCategory: config.CLOUD_GATEWAY_DEFAULT_CATEGORY,
      defaultTypeId: config.CLOUD_GATEWAY_DEFAULT_TYPE_ID,
    })
  }
  return new HermesProvider({
    apiUrl: config.HERMES_API_URL,
    home: config.HERMES_HOME,
  })
}

export function getBrainProvider(): BrainProvider {
  if (!brainProvider)
    brainProvider = createBrainProvider()
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
