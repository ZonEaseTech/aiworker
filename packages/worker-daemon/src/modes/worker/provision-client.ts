import {
  parseWorkerCheckInResponse,
  type WorkerCheckInRequest,
  type WorkerCheckInResponse,
} from '@zonease/aiworker-worker-control-protocol'

export type CheckInFetch = (url: URL, init: RequestInit) => Promise<Response>

export interface BuildCheckInInput {
  id: string
  provisionToken: string
  version: string
  workerId: string
  workbenchUrl: string
}

export interface CheckInInput extends BuildCheckInInput {
  fetch?: CheckInFetch
  host: string
}

export function buildCheckInBody(input: BuildCheckInInput): WorkerCheckInRequest {
  return {
    provisionToken: input.provisionToken,
    worker: {
      health: { ready: true },
      id: input.id,
      version: input.version,
      workerId: input.workerId,
      workbenchUrl: input.workbenchUrl,
    },
  }
}

export async function checkInToHost(input: CheckInInput): Promise<WorkerCheckInResponse> {
  const doFetch = input.fetch ?? fetch
  const res = await doFetch(new URL('/api/provision/check-in', input.host), {
    body: JSON.stringify(buildCheckInBody(input)),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!res.ok)
    throw new Error(`Worker check-in failed: ${res.status}`)
  return parseWorkerCheckInResponse(await res.json())
}
