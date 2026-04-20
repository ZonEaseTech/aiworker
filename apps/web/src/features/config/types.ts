export interface AIWorkerConfig {
  PORT: number
  NODE_ENV: string
  HERMES_API_URL: string
  HERMES_HOME: string
  OPENCLAW_WS_URL: string
  OPENCLAW_HOME: string
}

export interface ConfigResponse {
  config: Record<string, unknown>
}

export interface ConfigUpdateResponse {
  success: boolean
  backupPath?: string
}
