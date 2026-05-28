import type { WorkerOverlayResponse, WorkerWorkspaceProjectionResponse } from './types'

import { localJson } from '../../../shared/api/local-client'

export function loadWorkerOverlay(workerId: string): Promise<WorkerOverlayResponse> {
  return localJson<WorkerOverlayResponse>(`/api/local/workers/${workerId}/overlay`)
}

export function projectWorkerWorkspaceOverlay(workerId: string, workspaceId: string, target: 'claude-code' | 'codex' = 'codex'): Promise<WorkerWorkspaceProjectionResponse> {
  return localJson<WorkerWorkspaceProjectionResponse>(`/api/projections/${target}/refresh`, {
    body: JSON.stringify({ workerId, workspaceId }),
    method: 'POST',
  })
}
