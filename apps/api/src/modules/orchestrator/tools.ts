import type { BrainProvider, ExecutorTool } from '@aiworker/shared'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const MAX_SEARCH_RESULTS = 5
const MAX_READ_BYTES = 64 * 1024

export const orchestratorToolDefinitions: ExecutorTool[] = [
  {
    name: 'search_memory',
    description: 'Search the brain provider\'s memory store for entries matching a natural-language query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Free-text search query.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'write_memory',
    description: 'Persist a new memory to the brain provider.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Body of the memory to save.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags to attach to the memory.',
        },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_file',
    description: 'Read a UTF-8 text file from inside HERMES_HOME. Output is capped at 64KB.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path relative to HERMES_HOME, or an absolute path that resolves inside HERMES_HOME.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
]

export interface ToolContext {
  brain: BrainProvider
  hermesHome: string
}

export interface ToolExecutionResult {
  content: string
  data: Record<string, unknown>
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  switch (name) {
    case 'search_memory':
      return searchMemoryTool(args, ctx)
    case 'write_memory':
      return writeMemoryTool(args, ctx)
    case 'read_file':
      return readFileTool(args, ctx)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

async function searchMemoryTool(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  const query = typeof args.query === 'string' ? args.query : ''
  if (!query.trim())
    throw new Error('search_memory requires a non-empty "query" string')

  const memories = await ctx.brain.searchMemories(query)
  const trimmed = memories.slice(0, MAX_SEARCH_RESULTS).map(m => ({
    id: m.id,
    content: m.content,
    score: m.score,
  }))
  const data = { results: trimmed }
  return { content: JSON.stringify(data), data }
}

async function writeMemoryTool(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  const content = typeof args.content === 'string' ? args.content : ''
  if (!content.trim())
    throw new Error('write_memory requires a non-empty "content" string')

  const tags = Array.isArray(args.tags)
    ? args.tags.filter((t): t is string => typeof t === 'string')
    : undefined

  const memory = await ctx.brain.writeMemory({ content, tags })
  const title = typeof memory.metadata?.name === 'string' ? memory.metadata.name : undefined
  const data: Record<string, unknown> = { id: memory.id }
  if (title)
    data.title = title
  return { content: JSON.stringify(data), data }
}

async function readFileTool(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolExecutionResult> {
  const requested = typeof args.path === 'string' ? args.path : ''
  if (!requested)
    throw new Error('read_file requires a "path" string')

  const home = path.resolve(ctx.hermesHome)
  const absolute = path.resolve(home, requested)
  const homeWithSep = home.endsWith(path.sep) ? home : home + path.sep

  if (absolute !== home && !absolute.startsWith(homeWithSep))
    throw new Error(`read_file: path escapes HERMES_HOME (${requested})`)

  const info = await stat(absolute)
  if (!info.isFile())
    throw new Error(`read_file: not a regular file (${requested})`)

  const raw = await readFile(absolute)
  const truncated = raw.byteLength > MAX_READ_BYTES
  const sliced = truncated ? raw.subarray(0, MAX_READ_BYTES) : raw
  const content = sliced.toString('utf8')
  const data = { content, truncated }
  return { content: JSON.stringify(data), data }
}

export { MAX_READ_BYTES, MAX_SEARCH_RESULTS }
