import type { LocalFile, LocalWorkspace } from '@zonease/aiworker-soul-protocol'

import { localJson, localText } from '../../../shared/api/local-client'

export function createWorkspace(workerId: string, input: {
  metadata?: Record<string, unknown>
  name: string
  sourcePointers?: Record<string, unknown>[]
  type?: string
}): Promise<{ workspace: LocalWorkspace }> {
  return localJson('/api/workspace-locators', { method: 'POST', body: JSON.stringify({ workerId, ...input }) })
}

export function readFile(workspaceId: string, path: string): Promise<string> {
  return localText(`/api/local/workspaces/${workspaceId}/files/raw/${path}`)
}

export function writeFile(workspaceId: string, path: string, content: string): Promise<{ file: LocalFile }> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  return localJson(`/api/local/workspaces/${workspaceId}/files/raw/${encodedPath}`, {
    body: content,
    method: 'PUT',
  })
}
