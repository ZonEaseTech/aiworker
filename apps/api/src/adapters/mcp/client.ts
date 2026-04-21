import consola from 'consola'

export interface McpClientOptions {
  url: string
  token?: string
  clientName?: string
  clientVersion?: string
  timeoutMs?: number
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  id: number | string
  result?: T
  error?: { code: number, message: string, data?: unknown }
}

export interface McpToolCallResult {
  content: Array<{ type: 'text', text: string } | { type: string, [k: string]: unknown }>
  isError?: boolean
}

const DEFAULT_TIMEOUT = 30_000

/**
 * Minimal MCP streamable-HTTP client: initialize + tools/call, with
 * lazy session and single reconnect on `mcp-session-id` expiry.
 */
export class McpStreamableHttpClient {
  private readonly url: string
  private readonly token: string | undefined
  private readonly clientName: string
  private readonly clientVersion: string
  private readonly timeoutMs: number

  private sessionId: string | null = null
  private idCounter = 0
  private initPromise: Promise<void> | null = null

  constructor(options: McpClientOptions) {
    this.url = options.url
    this.token = options.token
    this.clientName = options.clientName ?? 'aiworker'
    this.clientVersion = options.clientVersion ?? '0.1.0'
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT
  }

  private nextId(): number {
    this.idCounter += 1
    return this.idCounter
  }

  private headers(includeSession: boolean): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    }
    if (this.token)
      h.Authorization = `Bearer ${this.token}`
    if (includeSession && this.sessionId)
      h['mcp-session-id'] = this.sessionId
    return h
  }

  private async postJson<T>(
    body: JsonRpcRequest,
    includeSession: boolean,
  ): Promise<{ response: Response, parsed: JsonRpcResponse<T> | null }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.headers(includeSession),
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timer)

      const text = await response.text()
      let parsed: JsonRpcResponse<T> | null = null
      if (text.length > 0) {
        try {
          parsed = JSON.parse(text) as JsonRpcResponse<T>
        }
        catch {
          parsed = null
        }
      }
      return { response, parsed }
    }
    catch (err) {
      clearTimeout(timer)
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  private async initialize(): Promise<void> {
    const initReq: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: this.clientName, version: this.clientVersion },
      },
    }

    const { response, parsed } = await this.postJson(initReq, false)
    if (!response.ok)
      throw new Error(`MCP initialize failed: HTTP ${response.status}`)
    if (parsed?.error)
      throw new Error(`MCP initialize error: ${parsed.error.message}`)

    const sid = response.headers.get('mcp-session-id')
    if (!sid)
      throw new Error('MCP initialize response missing mcp-session-id header')
    this.sessionId = sid

    await this.postJson({ jsonrpc: '2.0', method: 'notifications/initialized' }, true)
  }

  async ensureSession(): Promise<void> {
    if (this.sessionId)
      return
    if (!this.initPromise) {
      this.initPromise = this.initialize().catch((err) => {
        this.initPromise = null
        throw err
      })
    }
    await this.initPromise
    this.initPromise = null
  }

  /** Invoke a JSON-RPC method and return its `result`, with a single reconnect on session loss. */
  private async invoke<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    await this.ensureSession()
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method,
      params,
    }

    let { response, parsed } = await this.postJson<T>(req, true)

    if (response.status === 404 || (parsed?.error && /session/i.test(parsed.error.message))) {
      this.sessionId = null
      await this.ensureSession()
      const retry = await this.postJson<T>({ ...req, id: this.nextId() }, true)
      response = retry.response
      parsed = retry.parsed
    }

    if (!response.ok) {
      throw new Error(`MCP ${method} failed: HTTP ${response.status}`)
    }
    if (!parsed) {
      throw new Error(`MCP ${method} returned non-JSON body`)
    }
    if (parsed.error) {
      throw new Error(`MCP ${method} error: ${parsed.error.message}`)
    }
    if (parsed.result === undefined) {
      throw new Error(`MCP ${method} response missing 'result'`)
    }
    return parsed.result as T
  }

  async listTools(): Promise<Array<{ name: string, description?: string, inputSchema?: Record<string, unknown> }>> {
    const result = await this.invoke<{ tools: Array<{ name: string, description?: string, inputSchema?: Record<string, unknown> }> }>('tools/list')
    return result.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolCallResult> {
    return this.invoke<McpToolCallResult>('tools/call', { name, arguments: args })
  }

  /**
   * Most cloud-gateway tools return `content: [{type:'text', text:'<JSON>'}]`.
   * This helper parses the first text entry as JSON when possible.
   */
  async callToolJson<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const result = await this.callTool(name, args)
    const first = result.content.find(c => c.type === 'text') as { type: 'text', text: string } | undefined
    if (!first)
      throw new Error(`MCP tool '${name}' returned no text content`)
    try {
      return JSON.parse(first.text) as T
    }
    catch {
      consola.warn(`[mcp] tool '${name}' text is not JSON, returning raw string`)
      return first.text as unknown as T
    }
  }
}
