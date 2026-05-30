import type { LocalWorkspace } from '@zonease/aiworker-soul-protocol'

import { localJson } from '../../../shared/api/local-client'

export function createWorkspace(workerId: string, input: {
  metadata?: Record<string, unknown>
  name: string
  sourcePointers?: Record<string, unknown>[]
  type?: string
}): Promise<{ workspace: LocalWorkspace }> {
  return localJson('/api/workspace-locators', { method: 'POST', body: JSON.stringify({ workerId, ...input }) })
}
