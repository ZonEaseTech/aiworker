import type { LocalWorker } from '@zonease/aiworker-shared'

import { localJson } from '../../../shared/api/local-client'

export function createWorker(input: {
  id?: string
  metadata?: Record<string, unknown>
  name: string
  soulId: string
}): Promise<{ worker: LocalWorker }> {
  return localJson('/api/local/workers', { method: 'POST', body: JSON.stringify(input) })
}
