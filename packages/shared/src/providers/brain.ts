import type { ServiceStatus } from '../types'

/** Skill exposed by a brain provider (knowledge/memory side). */
export interface BrainSkill {
  id: string
  name: string
  description: string
  version: string
  /** Freeform tags used for search and grouping. */
  tags?: string[]
}

/** A single memory record retrieved from a brain provider. */
export interface BrainMemory {
  id: string
  content: string
  /** Arbitrary structured attributes (source, author, references, ...). */
  metadata: Record<string, unknown>
  /** ISO 8601 creation timestamp. */
  createdAt: string
  /** ISO 8601 timestamp of the last modification. */
  updatedAt: string
  /** Similarity score assigned by the provider during search queries. */
  score?: number
}

/** Filter used when listing memories in bulk. */
export interface MemoryFilter {
  tags?: string[]
  /** Return memories created at or after this ISO 8601 timestamp. */
  since?: string
  /** Return memories created at or before this ISO 8601 timestamp. */
  until?: string
  /** Maximum number of memories to return. */
  limit?: number
  /** Opaque cursor for paginated listings. */
  cursor?: string
}

/** Payload accepted when persisting a new memory. */
export interface WriteMemoryInput {
  content: string
  metadata?: Record<string, unknown>
  tags?: string[]
}

/** Event emitted by the brain provider when its state changes. */
export interface BrainWatchEvent {
  type: 'memory:created' | 'memory:updated' | 'memory:deleted' | 'skill:changed'
  /** Event-specific payload; shape depends on `type`. */
  payload: Record<string, unknown>
  /** ISO 8601 timestamp of when the event was produced. */
  timestamp: string
}

/** Abstract brain provider supplying skills and memory to the orchestrator. */
export interface BrainProvider {
  /** Stable provider identifier, e.g. `hermes`. */
  readonly name: string
  health: () => Promise<ServiceStatus>
  listSkills: () => Promise<BrainSkill[]>
  listMemories: (filter?: MemoryFilter) => Promise<BrainMemory[]>
  searchMemories: (query: string) => Promise<BrainMemory[]>
  writeMemory: (input: WriteMemoryInput) => Promise<BrainMemory>
  /** Subscribe to brain state changes; returns an unsubscribe function. */
  watch?: (handler: (event: BrainWatchEvent) => void) => () => void
}
