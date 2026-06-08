import { apiUrl } from './base-path'

export async function localJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok)
    throw new Error(`Local API ${res.status}: ${path}`)
  return await res.json() as T
}

/**
 * A daemon error response surfaced as a thrown {@link LocalApiError}. The local
 * daemon returns `{ error: { code, message } }` on rejection (e.g. literal-secret
 * 422). Unlike {@link localJson}, this preserves the daemon's `code`/`message`
 * so callers can show the daemon's own rejection text inline instead of an opaque
 * status code.
 */
export class LocalApiError extends Error {
  readonly code: string | null
  readonly status: number
  constructor(message: string, options: { code: string | null, status: number }) {
    super(message)
    this.name = 'LocalApiError'
    this.code = options.code
    this.status = options.status
  }
}

export async function localJsonStrict<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: { code?: unknown, message?: unknown } } | null
    const code = typeof body?.error?.code === 'string' ? body.error.code : null
    const message = typeof body?.error?.message === 'string' ? body.error.message : `Local API ${res.status}: ${path}`
    throw new LocalApiError(message, { code, status: res.status })
  }
  return await res.json() as T
}

export async function localText(path: string): Promise<string> {
  const res = await fetch(apiUrl(path))
  if (!res.ok)
    throw new Error(`Local file ${res.status}: ${path}`)
  return await res.text()
}

export function parseSseFrame(frame: string): { data: unknown, event: string } | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const rawLine of frame.split('\n')) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(':'))
      continue
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    }
    else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (dataLines.length === 0)
    return null
  return { data: JSON.parse(dataLines.join('\n')), event }
}
