import type { WorkerOverlayResponse, WorkerOverlaySaveBody, WorkerWorkspaceProjectionResponse } from './types'

import { localJson } from '../../../shared/api/local-client'

export function loadWorkerOverlay(workerId: string): Promise<WorkerOverlayResponse> {
  return localJson<WorkerOverlayResponse>(`/api/local/workers/${workerId}/overlay`)
}

export function saveWorkerOverlay(workerId: string, body: WorkerOverlaySaveBody): Promise<WorkerOverlayResponse> {
  return localJson<WorkerOverlayResponse>(`/api/local/workers/${workerId}/overlay`, {
    body: JSON.stringify(body),
    method: 'PUT',
  })
}

export function projectWorkerWorkspaceOverlay(workerId: string, workspaceId: string): Promise<WorkerWorkspaceProjectionResponse> {
  return localJson<WorkerWorkspaceProjectionResponse>(`/api/local/workers/${workerId}/workspaces/${workspaceId}/projection`, {
    method: 'POST',
  })
}
