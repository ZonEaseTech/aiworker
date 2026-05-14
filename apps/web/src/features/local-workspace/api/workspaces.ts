import type { LocalWorkspace } from '@zonease/aiworker-shared'

import { localJson, localText } from '../../../shared/api/local-client'

export function createWorkspace(workerId: string, input: {
  metadata?: Record<string, unknown>
  name: string
  sourcePointers?: Record<string, unknown>[]
  type?: string
}): Promise<{ workspace: LocalWorkspace }> {
  return localJson(`/api/local/workers/${workerId}/workspaces`, { method: 'POST', body: JSON.stringify(input) })
}

export function readFile(workspaceId: string, path: string): Promise<string> {
  return localText(`/api/local/workspaces/${workspaceId}/files/raw/${path}`)
}
