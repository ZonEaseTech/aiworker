import type { ConfigResponse } from './types'

import { config } from '../../config'

export function getServiceConfig(): ConfigResponse {
  return {
    brain: {
      apiUrl: config.HERMES_API_URL,
      homePath: config.HERMES_HOME,
    },
    executor: {
      baseUrl: config.OPENAI_BASE_URL,
      model: config.OPENAI_MODEL,
      apiKeySet: Boolean(config.OPENAI_API_KEY && config.OPENAI_API_KEY.length > 0),
    },
  }
}
