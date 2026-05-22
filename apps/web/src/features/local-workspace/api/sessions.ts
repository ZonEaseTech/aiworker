import type {
  LocalFile,
  LocalSession,
  LocalSessionEvent,
  LocalTurn,
} from '@zonease/aiworker-shared'

import { localJson, parseSseFrame } from '../../../shared/api/local-client'

export interface SessionTurnInput {
  capabilityTemplateId: string
  context?: string
  input: string
  metadata?: Record<string, unknown>
  title: string
}

export interface SessionMessageInput {
  input: string
  metadata?: Record<string, unknown>
}

export interface SessionTurnResult {
  session: LocalSession
  turn: LocalTurn
  files: LocalFile[]
  events: LocalSessionEvent[]
}

export interface SessionStreamHandlers {
  onEvent?: (event: LocalSessionEvent) => void
  onSession?: (session: LocalSession) => void
  onTurn?: (turn: LocalTurn) => void
}

export function createSessionTurn(workspaceId: string, input: SessionTurnInput, workerId?: string): Promise<SessionTurnResult> {
  const path = workerId
    ? `/api/local/workers/${workerId}/workspaces/${workspaceId}/sessions`
    : `/api/local/workspaces/${workspaceId}/sessions`
  return localJson(path, { method: 'POST', body: JSON.stringify(input) })
}

export async function createSessionTurnStream(
  workspaceId: string,
  input: SessionTurnInput,
  workerId?: string,
  handlers: SessionStreamHandlers = {},
): Promise<SessionTurnResult> {
  const path = workerId
    ? `/api/local/workers/${workerId}/workspaces/${workspaceId}/sessions/stream`
    : `/api/local/workspaces/${workspaceId}/sessions/stream`
  const res = await fetch(path, {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!res.ok)
    throw new Error(`Local API ${res.status}: ${path}`)
  if (!res.body)
    return createSessionTurn(workspaceId, input, workerId)

  return await readSessionTurnStream(res.body, {
    onEvent: handlers.onEvent,
    onSession: handlers.onSession,
    onTurn: handlers.onTurn,
  })
}

export function continueSessionTurn(sessionId: string, input: SessionMessageInput, workerId?: string): Promise<SessionTurnResult> {
  const path = workerId
    ? `/api/local/workers/${workerId}/sessions/${sessionId}/messages`
    : `/api/local/sessions/${sessionId}/turns`
  return localJson(path, { method: 'POST', body: JSON.stringify(input) })
}

export async function continueSessionTurnStream(
  sessionId: string,
  input: SessionMessageInput,
  workerId?: string,
  handlers: Omit<SessionStreamHandlers, 'onSession'> = {},
): Promise<SessionTurnResult> {
  const path = workerId
    ? `/api/local/workers/${workerId}/sessions/${sessionId}/messages/stream`
    : `/api/local/sessions/${sessionId}/turns/stream`
  const res = await fetch(path, {
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!res.ok)
    throw new Error(`Local API ${res.status}: ${path}`)
  if (!res.body)
    return continueSessionTurn(sessionId, input, workerId)

  return await readSessionTurnStream(res.body, handlers)
}

async function readSessionTurnStream(
  body: ReadableStream<Uint8Array>,
  handlers: SessionStreamHandlers = {},
): Promise<SessionTurnResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: SessionTurnResult | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
    let index = buffer.indexOf('\n\n')
    while (index !== -1) {
      const frame = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      const parsed = parseSseFrame(frame)
      if (parsed?.event === 'turn') {
        handlers.onTurn?.(parsed.data as LocalTurn)
      }
      else if (parsed?.event === 'session') {
        handlers.onSession?.(parsed.data as LocalSession)
      }
      else if (parsed?.event === 'session_event') {
        handlers.onEvent?.(parsed.data as LocalSessionEvent)
      }
      else if (parsed?.event === 'result') {
        result = parsed.data as SessionTurnResult
      }
      else if (parsed?.event === 'error') {
        const data = parsed.data as { message?: string }
        throw new Error(data.message ?? 'Session stream failed.')
      }
      index = buffer.indexOf('\n\n')
    }
  }

  if (!result)
    throw new Error('Session stream completed without a result.')
  return result
}
