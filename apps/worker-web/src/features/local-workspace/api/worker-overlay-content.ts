import { localJsonStrict } from '../../../shared/api/local-client'
import { archiveWorkerConfigValue } from './worker-config'

export interface WorkerOverlayContentResponse {
  checksum: string
  content: string
  editable: boolean
  source: 'baseline' | 'overlay'
  sourceRef: string
}

export interface PutWorkerOverlayContentBody {
  content: string
  target?: string
}

export function getOverlayContent(workerId: string, configKey: string, target?: string): Promise<WorkerOverlayContentResponse> {
  const query = target ? `?target=${encodeURIComponent(target)}` : ''
  return localJsonStrict<WorkerOverlayContentResponse>(`${workerConfigContentPath(workerId, configKey)}${query}`)
}

export function putOverlayContent(workerId: string, configKey: string, body: PutWorkerOverlayContentBody): Promise<WorkerOverlayContentResponse> {
  return localJsonStrict<WorkerOverlayContentResponse>(workerConfigContentPath(workerId, configKey), {
    body: JSON.stringify(body),
    method: 'PUT',
  })
}

/**
 * Reset an editable overlay back to the Soul baseline by archiving the worker
 * overlay config envelope. The next projection drops the overlay file reference,
 * so the workspace falls back to the descriptor baseline content.
 */
export function resetOverlayContent(workerId: string, configKey: string): Promise<unknown> {
  return archiveWorkerConfigValue(workerId, configKey)
}

function workerConfigContentPath(workerId: string, configKey: string): string {
  return `/api/workers/${encodeURIComponent(workerId)}/config/${encodeURIComponent(configKey)}/content`
}
