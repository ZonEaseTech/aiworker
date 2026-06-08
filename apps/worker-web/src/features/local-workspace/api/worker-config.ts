import type { WorkerConfigMutationResponse, WorkerConfigResponse, WorkerConfigSaveBody } from './types'

import { localJson } from '../../../shared/api/local-client'

export function loadWorkerConfig(workerId: string): Promise<WorkerConfigResponse> {
  return localJson<WorkerConfigResponse>(`/api/workers/${encodeURIComponent(workerId)}/config`)
}

export function saveWorkerConfigValue(workerId: string, configKey: string, body: WorkerConfigSaveBody): Promise<WorkerConfigMutationResponse> {
  return localJson<WorkerConfigMutationResponse>(workerConfigValuePath(workerId, configKey), {
    body: JSON.stringify(body),
    method: 'PUT',
  })
}

export function archiveWorkerConfigValue(workerId: string, configKey: string): Promise<WorkerConfigMutationResponse> {
  return localJson<WorkerConfigMutationResponse>(`${workerConfigValuePath(workerId, configKey)}/archive`, {
    method: 'POST',
  })
}

function workerConfigValuePath(workerId: string, configKey: string): string {
  return `/api/workers/${encodeURIComponent(workerId)}/config/${encodeURIComponent(configKey)}`
}
