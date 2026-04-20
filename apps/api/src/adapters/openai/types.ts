import { z } from 'zod'

export interface OpenAiClientOptions {
  baseUrl: string
  apiKey: string
  timeoutMs?: number
}

export interface OpenAiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: OpenAiToolCallWire[]
}

export interface OpenAiToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export interface ChatCompletionRequest {
  model: string
  messages: OpenAiChatMessage[]
  tools?: OpenAiToolDefinition[]
  tool_choice?: 'auto' | 'none' | 'required'
  temperature?: number
  stream: true
  stream_options?: { include_usage?: boolean }
}

export interface OpenAiToolCallWire {
  index?: number
  id?: string
  type?: 'function'
  function?: {
    name?: string
    arguments?: string
  }
}

export interface Delta {
  role?: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: OpenAiToolCallWire[]
}

export interface Usage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface ChatCompletionChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: Array<{
    index: number
    delta: Delta
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null
  }>
  usage?: Usage | null
}

const toolCallWireSchema = z.object({
  index: z.number().optional(),
  id: z.string().optional(),
  type: z.literal('function').optional(),
  function: z.object({
    name: z.string().optional(),
    arguments: z.string().optional(),
  }).optional(),
})

const deltaSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']).optional(),
  content: z.string().nullable().optional(),
  tool_calls: z.array(toolCallWireSchema).optional(),
})

const usageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
})

export const chatCompletionChunkSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion.chunk'),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number(),
    delta: deltaSchema,
    finish_reason: z.enum(['stop', 'length', 'tool_calls', 'content_filter', 'function_call']).nullable(),
  })),
  usage: usageSchema.nullish(),
})

export type SseEvent
  = | { type: 'chunk', chunk: ChatCompletionChunk }
    | { type: 'done' }
