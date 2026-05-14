export async function localJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
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

export async function localText(path: string): Promise<string> {
  const res = await fetch(path)
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
