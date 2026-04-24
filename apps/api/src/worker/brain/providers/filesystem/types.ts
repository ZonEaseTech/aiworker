export interface FilesystemSkill {
  name: string
  description: string
  version: string
  capabilities: string[]
  filePath: string
  hash: string
}

export interface FilesystemMemory {
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
