import type {
  AgentEvent,
  AgentRunInput,
  ExecutorProvider,
  ExecutorTool,
  ServiceStatus,
} from '@zonease/aiworker-shared'

import { McpStreamableHttpClient } from '../../../adapters/mcp'

export interface McpExecutorOptions {
  url: string
  token: string
  defaultModel?: string
  tools?: string[]
  timeoutMs?: number
}

/**
 * MCP-backed executor: surfaces remote tools via an MCP streamable-http server.
 * In MVP it does not implement full streaming chat — it exposes `listTools` and
 * supports `tools/call` per tool. The orchestrator bridges text generation
 * through a local reducer or a co-located HTTP executor until a richer MCP
 * chat semantic is defined.
 */
export class McpExecutor implements ExecutorProvider {
  readonly name = 'mcp'
  private readonly client: McpStreamableHttpClient

  constructor(options: McpExecutorOptions) {
    this.client = new McpStreamableHttpClient({
      url: options.url,
      token: options.token,
      clientName: 'aiworker-worker',
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    })
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

  async listTools(): Promise<ExecutorTool[]> {
    try {
      const list = await this.client.listTools()
      return list.map(t => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
      }))
    }
    catch {
      return []
    }
  }

  async* run(_input: AgentRunInput): AsyncGenerator<AgentEvent> {
    yield { type: 'error', error: 'McpExecutor.run is not implemented yet — use http executor for chat.' }
    yield { type: 'finish', reason: 'error' }
  }
}
