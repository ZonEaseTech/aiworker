import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  SseEvent,
} from './types'

import { chatCompletionChunkSchema } from './types'

const DEFAULT_TIMEOUT_MS = 60_000

export class OpenAiHttpError extends Error {
  readonly status: number
  constructor(status: number, statusText: string, body: string) {
    const snippet = body.length > 500 ? `${body.slice(0, 500)}…` : body
    super(`OpenAI HTTP ${status} ${statusText}${snippet ? `: ${snippet}` : ''}`)
    this.name = 'OpenAiHttpError'
    this.status = status
  }
}

export interface CreateChatStreamOptions {
  baseUrl: string
  apiKey: string
  timeoutMs?: number
  body: ChatCompletionRequest
  signal?: AbortSignal
}

/**
 * POSTs a streaming chat completion request and returns a parsed SSE iterable.
 * Throws OpenAiHttpError on non-2xx response. Never includes apiKey in thrown errors.
 */
export async function createChatStream(
  options: CreateChatStreamOptions,
): Promise<AsyncIterable<SseEvent>> {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onParentAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onParentAbort, { once: true })

  let response: Response
  try {
    response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(options.body),
      signal: controller.signal,
    })
  }
  catch (err) {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onParentAbort)
    if (err instanceof DOMException && err.name === 'AbortError')
      throw new Error(`OpenAI request aborted after ${timeoutMs}ms`)
    throw new Error(err instanceof Error ? err.message : 'OpenAI transport error')
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onParentAbort)
    throw new OpenAiHttpError(response.status, response.statusText, text)
  }

  if (!response.body) {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onParentAbort)
    throw new Error('OpenAI response has no body')
  }

  return consumeSse(response.body, () => {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onParentAbort)
  })
}

async function* consumeSse(
  body: ReadableStream<Uint8Array>,
  cleanup: () => void,
): AsyncIterable<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done)
        break

      buffer += decoder.decode(value, { stream: true })

      while (true) {
        const sep = findEventBoundary(buffer)
        if (sep === -1)
          break
        const raw = buffer.slice(0, sep)
        buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '')

        const parsed = parseSseBlock(raw)
        if (!parsed)
          continue

        if (parsed === '[DONE]') {
          yield { type: 'done' }
          return
        }

        let json: unknown
        try {
          json = JSON.parse(parsed)
        }
        catch {
          continue
        }

        const validated = chatCompletionChunkSchema.safeParse(json)
        if (!validated.success)
          continue
        yield { type: 'chunk', chunk: validated.data as ChatCompletionChunk }
      }
    }

    // Drain any final block without trailing blank line
    if (buffer.trim().length > 0) {
      const parsed = parseSseBlock(buffer)
      if (parsed && parsed !== '[DONE]') {
        try {
          const json = JSON.parse(parsed)
          const validated = chatCompletionChunkSchema.safeParse(json)
          if (validated.success)
            yield { type: 'chunk', chunk: validated.data as ChatCompletionChunk }
        }
        catch {
          // ignore
        }
      }
    }
  }
  finally {
    cleanup()
    try {
      reader.releaseLock()
    }
    catch {
      // ignore
    }
  }
}

function findEventBoundary(buf: string): number {
  const lf = buf.indexOf('\n\n')
  const crlf = buf.indexOf('\r\n\r\n')
  if (lf === -1)
    return crlf
  if (crlf === -1)
    return lf
  return Math.min(lf, crlf)
}

/**
 * Extracts the `data:` payload from a raw SSE block. Returns null for non-data
 * events (comments, `event:` lines with no data). Concatenates multi-line data.
 */
function parseSseBlock(block: string): string | null {
  const lines = block.split(/\r?\n/)
  const parts: string[] = []
  for (const line of lines) {
    if (line.startsWith(':'))
      continue
    if (line.startsWith('data:')) {
      const value = line.slice(5).replace(/^ /, '')
      parts.push(value)
    }
  }
  if (parts.length === 0)
    return null
  const joined = parts.join('\n')
  if (joined === '[DONE]')
    return '[DONE]'
  return joined
}
