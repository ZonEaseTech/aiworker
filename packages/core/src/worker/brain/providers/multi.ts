import type {
  BrainMemory,
  BrainProvider,
  BrainSkill,
  BrainWatchEvent,
  MemoryFilter,
  ServiceStatus,
  WriteMemoryInput,
} from '@aiworker/shared'

interface MultiBrainOptions {
  sources: Array<BrainProvider & { id: string, priority: number, readOnly: boolean }>
  writeTargetId: string
  retrieval: 'merge-by-priority' | 'first-match'
}

/**
 * Aggregates multiple `BrainProvider` sources under the single `BrainProvider`
 * contract the orchestrator knows about. Writes route to the designated
 * `writeTargetId` source; reads merge or first-match per config.
 */
export class MultiBrainProvider implements BrainProvider {
  readonly name = 'multi'
  private readonly sources: MultiBrainOptions['sources']
  private readonly writeTargetId: string
  private readonly retrieval: MultiBrainOptions['retrieval']

  constructor(opts: MultiBrainOptions) {
    this.sources = [...opts.sources].sort((a, b) => b.priority - a.priority)
    this.writeTargetId = opts.writeTargetId
    this.retrieval = opts.retrieval
  }

  async health(): Promise<ServiceStatus> {
    const results = await Promise.all(this.sources.map(s => s.health().catch(() => ({ name: s.id, status: 'down' as const, lastChecked: new Date().toISOString() }))))
    const anyDown = results.some(r => r.status === 'down')
    return {
      name: this.name,
      status: anyDown ? 'degraded' : 'healthy',
      lastChecked: new Date().toISOString(),
    }
  }

  async listSkills(): Promise<BrainSkill[]> {
    const all = await Promise.all(this.sources.map(s => s.listSkills().catch(() => [])))
    return all.flat()
  }

  async listMemories(filter?: MemoryFilter): Promise<BrainMemory[]> {
    if (this.retrieval === 'first-match') {
      for (const src of this.sources) {
        const found = await src.listMemories(filter).catch(() => [])
        if (found.length > 0)
          return found
      }
      return []
    }
    const all = await Promise.all(this.sources.map(s => s.listMemories(filter).catch(() => [])))
    return all.flat()
  }

  async searchMemories(query: string): Promise<BrainMemory[]> {
    if (this.retrieval === 'first-match') {
      for (const src of this.sources) {
        const found = await src.searchMemories(query).catch(() => [])
        if (found.length > 0)
          return found
      }
      return []
    }
    const all = await Promise.all(this.sources.map(s => s.searchMemories(query).catch(() => [])))
    return all.flat()
  }

  async writeMemory(input: WriteMemoryInput): Promise<BrainMemory> {
    const target = this.sources.find(s => s.id === this.writeTargetId && !s.readOnly)
      ?? this.sources.find(s => !s.readOnly)
    if (!target)
      throw new Error('MultiBrainProvider: no writable brain source configured')
    return target.writeMemory(input)
  }

  watch(handler: (event: BrainWatchEvent) => void): () => void {
    const unsubs = this.sources.map(s => s.watch ? s.watch(handler) : () => undefined)
    return () => unsubs.forEach(u => u())
  }
}
