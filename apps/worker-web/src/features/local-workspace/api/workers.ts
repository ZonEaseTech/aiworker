import type { LocalWorker } from '@zonease/aiworker-soul-descriptor'

import { localJson } from '../../../shared/api/local-client'

export function createWorker(input: {
  id?: string
  metadata?: Record<string, unknown>
  name: string
  appId: string
}): Promise<{ worker: LocalWorker }> {
  return localJson('/api/workers', { method: 'POST', body: JSON.stringify(input) })
}

export function archiveWorker(workerId: string): Promise<{ worker: LocalWorker }> {
  return localJson(`/api/workers/${encodeURIComponent(workerId)}/archive`, { method: 'POST' })
}
