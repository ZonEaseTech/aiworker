import consola from 'consola'

/**
 * Minimal docker-engine client that talks HTTP over a unix socket via Bun.fetch.
 * Only the handful of endpoints the fleet supervisor needs are wrapped here.
 */
export class DockerClient {
  constructor(private readonly socket: string = '/var/run/docker.sock') {}

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `http://localhost${path}`
    const init: RequestInit & { unix?: string } = {
      method,
      unix: this.socket,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    }
    if (body !== undefined)
      init.body = JSON.stringify(body)

    const res = await fetch(url, init as RequestInit)
    const text = await res.text()
    if (!res.ok)
      throw new Error(`Docker API ${method} ${path} failed: ${res.status} ${text}`)
    if (!text)
      return undefined as T
    try {
      return JSON.parse(text) as T
    }
    catch {
      return text as unknown as T
    }
  }

  ping(): Promise<string> {
    return this.request<string>('GET', '/_ping')
  }

  createContainer(name: string, spec: Record<string, unknown>): Promise<{ Id: string, Warnings?: string[] }> {
    return this.request('POST', `/containers/create?name=${encodeURIComponent(name)}`, spec)
  }

  startContainer(id: string): Promise<void> {
    return this.request('POST', `/containers/${id}/start`)
  }

  async stopContainer(id: string, timeout = 10): Promise<void> {
    try {
      await this.request('POST', `/containers/${id}/stop?t=${timeout}`)
    }
    catch (err) {
      if (err instanceof Error && /304/.test(err.message))
        return
      throw err
    }
  }

  removeContainer(id: string, opts?: { force?: boolean, removeVolumes?: boolean }): Promise<void> {
    const params = new URLSearchParams()
    if (opts?.force)
      params.set('force', 'true')
    if (opts?.removeVolumes)
      params.set('v', 'true')
    const qs = params.toString()
    return this.request('DELETE', `/containers/${id}${qs ? `?${qs}` : ''}`)
  }

  inspectContainer(id: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/containers/${id}/json`)
  }

  listContainers(filters?: Record<string, string[]>): Promise<Array<Record<string, unknown>>> {
    const params = new URLSearchParams({ all: 'true' })
    if (filters)
      params.set('filters', JSON.stringify(filters))
    return this.request('GET', `/containers/json?${params.toString()}`)
  }

  async logs(id: string, opts?: { stdout?: boolean, stderr?: boolean, tail?: number }): Promise<string> {
    const params = new URLSearchParams({
      stdout: String(opts?.stdout ?? true),
      stderr: String(opts?.stderr ?? true),
      tail: String(opts?.tail ?? 200),
    })
    const url = `http://localhost/containers/${id}/logs?${params.toString()}`
    const res = await fetch(url, { method: 'GET', unix: this.socket } as RequestInit)
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Docker logs ${id} failed: ${res.status} ${body}`)
    }
    // Multiplexed stream header: 8 bytes per frame. For simplicity we strip those frames.
    const bytes = new Uint8Array(await res.arrayBuffer())
    return demuxDockerLogs(bytes)
  }

  async ensureNetwork(name: string): Promise<void> {
    try {
      await this.request('GET', `/networks/${encodeURIComponent(name)}`)
    }
    catch {
      consola.info(`[supervisor] creating docker network ${name}`)
      await this.request('POST', '/networks/create', { Name: name, Driver: 'bridge' })
    }
  }
}

function demuxDockerLogs(bytes: Uint8Array): string {
  const decoder = new TextDecoder()
  let out = ''
  let i = 0
  while (i < bytes.length) {
    if (i + 8 > bytes.length)
      break
    const len = (bytes[i + 4]! << 24) | (bytes[i + 5]! << 16) | (bytes[i + 6]! << 8) | bytes[i + 7]!
    i += 8
    out += decoder.decode(bytes.slice(i, i + len))
    i += len
  }
  return out
}
