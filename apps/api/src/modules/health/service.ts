export interface ServiceHealth {
  status: 'ok' | 'degraded' | 'down'
  latency?: number
  error?: string
}

async function checkService(url: string, timeoutMs = 3000): Promise<ServiceHealth> {
  const start = performance.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    const latency = Math.round(performance.now() - start)
    return { status: res.ok ? 'ok' : 'degraded', latency }
  }
  catch (err) {
    return {
      status: 'down',
      latency: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function checkHermes(): Promise<ServiceHealth> {
  return checkService('http://localhost:8642/health')
}

export async function checkOpenclaw(): Promise<ServiceHealth> {
  return checkService('http://localhost:18789/health')
}

export async function getHealthStatus() {
  const [hermes, openclaw] = await Promise.all([checkHermes(), checkOpenclaw()])
  const overall = hermes.status === 'ok' && openclaw.status === 'ok'
    ? 'ok'
    : hermes.status === 'down' && openclaw.status === 'down'
      ? 'down'
      : 'degraded'

  return {
    status: overall as 'ok' | 'degraded' | 'down',
    services: { hermes, openclaw },
  }
}
