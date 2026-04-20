import type { ServiceStatus } from '@aiworker/shared'
import { getBrainProvider, getExecutorProvider } from '../../providers'

export interface ServiceHealth {
  status: 'ok' | 'degraded' | 'down'
  name?: string
  lastChecked?: string
  error?: string
}

function fromProviderStatus(status: ServiceStatus): ServiceHealth {
  return {
    status: status.status === 'healthy' ? 'ok' : status.status,
    name: status.name,
    lastChecked: status.lastChecked,
  }
}

async function safeCheck(check: () => Promise<ServiceStatus>): Promise<ServiceHealth> {
  try {
    return fromProviderStatus(await check())
  }
  catch (err) {
    return {
      status: 'down',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function checkBrain(): Promise<ServiceHealth> {
  return safeCheck(() => getBrainProvider().health())
}

export async function checkExecutor(): Promise<ServiceHealth> {
  return safeCheck(() => getExecutorProvider().health())
}

function combineStatus(a: ServiceHealth, b: ServiceHealth): 'ok' | 'degraded' | 'down' {
  if (a.status === 'ok' && b.status === 'ok')
    return 'ok'
  if (a.status === 'down' && b.status === 'down')
    return 'down'
  return 'degraded'
}

export async function getHealthStatus() {
  const [brain, executor] = await Promise.all([checkBrain(), checkExecutor()])
  return {
    status: combineStatus(brain, executor),
    services: { brain, executor },
  }
}
