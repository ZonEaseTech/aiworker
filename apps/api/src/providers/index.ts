import type { BrainProvider } from '@aiworker/shared'

import { config } from '../config'
import { HermesProvider } from './brain/hermes'

let brainProvider: BrainProvider | null = null

export function getBrainProvider(): BrainProvider {
  if (!brainProvider) {
    brainProvider = new HermesProvider({
      apiUrl: config.HERMES_API_URL,
      home: config.HERMES_HOME,
    })
  }
  return brainProvider
}

// getExecutorProvider() will be added in subtask 1.3 (OpenClaw)
