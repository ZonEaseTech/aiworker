import type { LocalWorker } from '@zonease/aiworker-soul-protocol'

import { localJson } from '../../../shared/api/local-client'

export function createWorker(input: {
  id?: string
  metadata?: Record<string, unknown>
  name: string
  soulId: string
}): Promise<{ worker: LocalWorker }> {
  return localJson('/api/workers', { method: 'POST', body: JSON.stringify(input) })
}
