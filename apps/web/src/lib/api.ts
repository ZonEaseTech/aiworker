export interface ApiError {
  status: number
  body: unknown
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const contentType = res.headers.get('content-type') ?? ''
  const parsed = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null)

  if (!res.ok) {
    const err: ApiError = { status: res.status, body: parsed }
    throw err
  }

  return parsed as T
}

export function apiGet<T>(path: string) {
  return request<T>('GET', path)
}

export function apiPost<T>(path: string, body?: unknown) {
  return request<T>('POST', path, body)
}

export function apiPut<T>(path: string, body?: unknown) {
  return request<T>('PUT', path, body)
}

export function apiDelete<T>(path: string) {
  return request<T>('DELETE', path)
}
