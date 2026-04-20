export interface BrainConfig {
  apiUrl: string
  homePath: string
}

export interface ExecutorConfig {
  baseUrl: string
  model: string
  apiKeySet: boolean
}

export interface ConfigResponse {
  brain: BrainConfig
  executor: ExecutorConfig
}
