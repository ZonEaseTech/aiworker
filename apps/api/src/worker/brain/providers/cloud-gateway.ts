import type {
  BrainMemory,
  BrainProvider,
  BrainSkill,
  MemoryFilter,
  ServiceStatus,
  WriteMemoryInput,
} from '@aiworker/shared'

import { McpStreamableHttpClient } from '../../../adapters/mcp'

export interface CloudGatewayProviderOptions {
  url: string
  token: string
  /** Default category or type name used when `writeMemory` is called without one. */
  defaultCategory?: string
  /** Default type_id used when `writeMemory` is called without a category. */
  defaultTypeId?: string
  timeoutMs?: number
}

interface KnowledgeType {
  id: string
  name: string
  description?: string
  default_ttl?: number
  stale_days?: number
  enabled?: boolean
  is_public?: boolean
  created_at?: string
}

interface KnowledgeEntry {
  id: string
  title?: string
  content?: string
  tags?: string | string[]
  type_id?: string
  category?: string
  status?: string
  created_at?: string
  updated_at?: string
  score?: number
  [k: string]: unknown
}

interface KnowledgeQueryResponse {
  entries: KnowledgeEntry[]
  page: number
  per_page: number
  total: number
}

function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags))
    return tags.map(String)
  if (typeof tags === 'string' && tags.length > 0)
    return tags.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

function entryToMemory(entry: KnowledgeEntry): BrainMemory {
  const createdAt = entry.created_at ?? new Date().toISOString()
  const updatedAt = entry.updated_at ?? createdAt
  const { content, id, score, ...rest } = entry
  const memory: BrainMemory = {
    id,
    content: content ?? '',
    metadata: {
      ...rest,
      tags: parseTags(entry.tags),
    },
    createdAt,
    updatedAt,
  }
  if (typeof score === 'number')
    memory.score = score
  return memory
}

function typeToSkill(type: KnowledgeType): BrainSkill {
  return {
    id: type.id,
    name: type.name,
    description: type.description ?? '',
    version: type.default_ttl ? String(type.default_ttl) : '0',
    tags: type.is_public ? ['public'] : [],
  }
}

export class CloudGatewayBrainProvider implements BrainProvider {
  readonly name = 'cloud-gateway'

  private readonly client: McpStreamableHttpClient
  private readonly defaultCategory?: string
  private readonly defaultTypeId?: string

  constructor(options: CloudGatewayProviderOptions) {
    this.client = new McpStreamableHttpClient({
      url: options.url,
      token: options.token,
      clientName: 'aiworker-brain',
      timeoutMs: options.timeoutMs,
    })
    this.defaultCategory = options.defaultCategory
    this.defaultTypeId = options.defaultTypeId
  }

  async health(): Promise<ServiceStatus> {
    const lastChecked = new Date().toISOString()
    try {
      await this.client.ensureSession()
      return { name: this.name, status: 'healthy', lastChecked }
    }
    catch {
      return { name: this.name, status: 'down', lastChecked }
    }
  }

  async listSkills(): Promise<BrainSkill[]> {
    const types = await this.client.callToolJson<KnowledgeType[]>('knowledge_types')
    if (!Array.isArray(types))
      return []
    return types.filter(t => t.enabled !== false).map(typeToSkill)
  }

  async listMemories(filter?: MemoryFilter): Promise<BrainMemory[]> {
    const args: Record<string, unknown> = {
      per_page: Math.min(Math.max(filter?.limit ?? 50, 1), 100),
      page: 1,
    }
    const typeTag = filter?.tags?.find(t => t.startsWith('type:'))
    if (typeTag)
      args.type_id = typeTag.slice('type:'.length)

    const response = await this.client.callToolJson<KnowledgeQueryResponse>('knowledge_query', args)
    let entries = response.entries ?? []

    if (filter?.since)
      entries = entries.filter(e => !e.created_at || e.created_at >= filter.since!)
    if (filter?.until)
      entries = entries.filter(e => !e.created_at || e.created_at <= filter.until!)

    return entries.map(entryToMemory)
  }

  async searchMemories(query: string): Promise<BrainMemory[]> {
    const entries = await this.client.callToolJson<KnowledgeEntry[]>('knowledge_search', {
      query,
      limit: 20,
    })
    if (!Array.isArray(entries))
      return []
    return entries.map(entryToMemory)
  }

  async writeMemory(input: WriteMemoryInput): Promise<BrainMemory> {
    const meta = input.metadata ?? {}
    const args: Record<string, unknown> = { content: input.content }

    const title = typeof meta.title === 'string'
      ? meta.title
      : typeof meta.name === 'string' ? meta.name : undefined
    if (title)
      args.title = title

    const typeId = typeof meta.type_id === 'string' ? meta.type_id : this.defaultTypeId
    const category = typeof meta.category === 'string' ? meta.category : this.defaultCategory
    if (typeId)
      args.type_id = typeId
    else if (category)
      args.category = category

    const tags = input.tags ?? parseTags(meta.tags)
    if (tags.length > 0)
      args.tags = tags.join(',')

    const sourceType = typeof meta.source_type === 'string' ? meta.source_type : 'aiworker'
    args.source_type = sourceType
    if (typeof meta.source_ref === 'string')
      args.source_ref = meta.source_ref
    args.skip_compile = true

    const entry = await this.client.callToolJson<KnowledgeEntry>('knowledge_write', args)
    return entryToMemory(entry)
  }
}
