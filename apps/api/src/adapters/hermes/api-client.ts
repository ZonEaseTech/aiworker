import type {
  HermesChatRequest,
  HermesChatResponse,
  HermesClientOptions,
  HermesHealthStatus,
  HermesModelsResponse,
} from './types'

const DEFAULT_TIMEOUT_MS = 10_000

export class HermesApiClient {
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(options: HermesClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  private async request<T>(path: string, init?: RequestInit): Promise<{ ok: true, data: T } | { ok: false, error: string }> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return { ok: false, error: `HTTP ${res.status}: ${body || res.statusText}` }
      }

      const data = await res.json() as T
      return { ok: true, data }
    }
    catch (err) {
      clearTimeout(timeout)
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { ok: false, error: `Request timed out after ${this.timeoutMs}ms` }
      }
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  async health(): Promise<HermesHealthStatus> {
    const start = performance.now()
    const result = await this.request<Record<string, unknown>>('/health')
    const latency = Math.round(performance.now() - start)

    if (result.ok) {
      return { ok: true, latency }
    }
    return { ok: false, latency, error: result.error }
  }

  async listModels(): Promise<{ ok: true, data: HermesModelsResponse } | { ok: false, error: string }> {
    return this.request<HermesModelsResponse>('/v1/models')
  }

  async chat(req: HermesChatRequest): Promise<{ ok: true, data: HermesChatResponse } | { ok: false, error: string }> {
    return this.request<HermesChatResponse>('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  }
}
