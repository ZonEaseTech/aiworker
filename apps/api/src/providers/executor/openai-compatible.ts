import type {
  ChatFinishReason,
  ChatMessage,
  ChatRunInput,
  ChatStreamChunk,
  ChatUsage,
  ExecutorProvider,
  ExecutorTool,
  ServiceStatus,
  ToolCall,
} from '@aiworker/shared'
import type {
  ChatCompletionRequest,
  OpenAiChatMessage,
  OpenAiToolCallWire,
} from '../../adapters/openai'

import { createChatStream, OpenAiHttpError } from '../../adapters/openai'

export interface OpenAiCompatibleExecutorOptions {
  baseUrl: string
  apiKey?: string
  model: string
  timeoutMs: number
}

interface AccumulatingToolCall {
  id?: string
  name?: string
  args: string[]
}

export class OpenAICompatibleExecutor implements ExecutorProvider {
  readonly name = 'openai-compatible'

  private readonly baseUrl: string
  private readonly apiKey: string | undefined
  private readonly model: string
  private readonly timeoutMs: number

  constructor(options: OpenAiCompatibleExecutorOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.apiKey = options.apiKey
    this.model = options.model
    this.timeoutMs = options.timeoutMs
  }

  async health(): Promise<ServiceStatus> {
    const lastChecked = new Date().toISOString()
    if (!this.apiKey)
      return { name: this.name, status: 'down', lastChecked }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 5_000))

    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (res.ok)
        return { name: this.name, status: 'healthy', lastChecked }
      if (res.status >= 500)
        return { name: this.name, status: 'degraded', lastChecked }
      return { name: this.name, status: 'down', lastChecked }
    }
    catch {
      clearTimeout(timer)
      return { name: this.name, status: 'down', lastChecked }
    }
  }

  async listTools(): Promise<ExecutorTool[]> {
    return []
  }

  runChat(input: ChatRunInput): AsyncIterable<ChatStreamChunk> {
    return this.runChatIterable(input)
  }

  private async* runChatIterable(input: ChatRunInput): AsyncGenerator<ChatStreamChunk> {
    if (!this.apiKey) {
      yield { type: 'error', error: 'OpenAI API key is not configured' }
      return
    }

    const body: ChatCompletionRequest = {
      model: input.model ?? this.model,
      messages: input.messages.map(toOpenAiMessage),
      stream: true,
      stream_options: { include_usage: true },
    }
    if (input.temperature !== undefined)
      body.temperature = input.temperature

    let stream: AsyncIterable<{ type: 'chunk', chunk: import('../../adapters/openai').ChatCompletionChunk } | { type: 'done' }>
    try {
      stream = await createChatStream({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        timeoutMs: this.timeoutMs,
        body,
        signal: input.signal,
      })
    }
    catch (err) {
      yield { type: 'error', error: toSafeErrorMessage(err) }
      return
    }

    const toolCalls = new Map<number, AccumulatingToolCall>()
    let finishReason: ChatFinishReason | null = null
    let usage: ChatUsage | undefined

    try {
      for await (const event of stream) {
        if (event.type === 'done')
          break

        const choice = event.chunk.choices[0]
        if (choice) {
          const delta = choice.delta

          if (typeof delta.content === 'string' && delta.content.length > 0)
            yield { type: 'text', delta: delta.content }

          if (delta.tool_calls) {
            for (const partial of delta.tool_calls)
              accumulateToolCall(toolCalls, partial)
          }

          if (choice.finish_reason)
            finishReason = mapFinishReason(choice.finish_reason)
        }

        if (event.chunk.usage) {
          usage = {
            inputTokens: event.chunk.usage.prompt_tokens,
            outputTokens: event.chunk.usage.completion_tokens,
          }
        }
      }
    }
    catch (err) {
      yield { type: 'error', error: toSafeErrorMessage(err) }
      return
    }

    for (const [, call] of Array.from(toolCalls.entries()).sort(([a], [b]) => a - b)) {
      const assembled = finalizeToolCall(call)
      if (assembled)
        yield { type: 'tool_call', call: assembled }
    }

    yield {
      type: 'finish',
      reason: finishReason ?? 'stop',
      ...(usage ? { usage } : {}),
    }
  }
}

function toOpenAiMessage(msg: ChatMessage): OpenAiChatMessage {
  const base: OpenAiChatMessage = {
    role: msg.role,
    content: msg.content,
  }
  if (msg.name)
    base.name = msg.name
  if (msg.toolCallId)
    base.tool_call_id = msg.toolCallId
  if (msg.toolCalls && msg.toolCalls.length > 0) {
    base.tool_calls = msg.toolCalls.map(call => ({
      id: call.id,
      type: 'function',
      function: {
        name: call.name,
        arguments: JSON.stringify(call.arguments),
      },
    }))
  }
  return base
}

function accumulateToolCall(
  map: Map<number, AccumulatingToolCall>,
  partial: OpenAiToolCallWire,
): void {
  const index = partial.index ?? 0
  const existing = map.get(index) ?? { args: [] }
  if (partial.id)
    existing.id = partial.id
  if (partial.function?.name)
    existing.name = partial.function.name
  if (partial.function?.arguments)
    existing.args.push(partial.function.arguments)
  map.set(index, existing)
}

function finalizeToolCall(acc: AccumulatingToolCall): ToolCall | null {
  if (!acc.id || !acc.name)
    return null
  const raw = acc.args.join('')
  let args: Record<string, unknown> = {}
  if (raw.length > 0) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        args = parsed as Record<string, unknown>
    }
    catch {
      args = { _raw: raw }
    }
  }
  return { id: acc.id, name: acc.name, arguments: args }
}

function mapFinishReason(
  reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call',
): ChatFinishReason {
  switch (reason) {
    case 'tool_calls':
    case 'function_call':
      return 'tool'
    case 'length':
      return 'length'
    case 'content_filter':
      return 'error'
    case 'stop':
    default:
      return 'stop'
  }
}

function toSafeErrorMessage(err: unknown): string {
  if (err instanceof OpenAiHttpError)
    return err.message
  if (err instanceof Error)
    return err.message
  return 'Unknown executor error'
}
