export interface HermesSkill {
  name: string
  description: string
  version: string
  capabilities: string[]
  filePath: string
  hash: string
}

export interface HermesMemory {
  id: string
  title: string
  content: string
  metadata: Record<string, unknown>
  filePath: string
  hash: string
  createdAt?: string
  updatedAt?: string
}

export type WatchEventType = 'add' | 'modify' | 'delete'

export interface WatchEvent {
  type: WatchEventType
  path: string
  kind: 'skill' | 'memory'
  timestamp: number
}

export interface HermesModel {
  id: string
  object: string
  owned_by: string
}

export interface HermesModelsResponse {
  object: string
  data: HermesModel[]
}

export interface HermesChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface HermesChatRequest {
  model: string
  messages: HermesChatMessage[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
}

export interface HermesChatChoice {
  index: number
  message: HermesChatMessage
  finish_reason: string
}

export interface HermesChatResponse {
  id: string
  object: string
  created: number
  model: string
  choices: HermesChatChoice[]
}

export interface HermesHealthStatus {
  ok: boolean
  latency: number
  error?: string
}

export interface HermesClientOptions {
  baseUrl: string
  timeoutMs?: number
}
