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

export interface ProvisionActiveWorker {
  appId: string
  id: string
}

export type ProvisionActiveResolution =
  | { kind: 'single', worker: ProvisionActiveWorker }
  | { kind: string }

export interface MaybeProvisionCheckInInput {
  activeResolution: ProvisionActiveResolution
  checkIn?: (input: CheckInInput) => Promise<WorkerCheckInResponse>
  env: Record<string, string | undefined>
  runtimeVersion: string
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

export async function maybeProvisionCheckIn(input: MaybeProvisionCheckInInput): Promise<void> {
  if (input.activeResolution.kind !== 'single' || !('worker' in input.activeResolution))
    return
  const host = input.env.AIWORKER_HOST_URL
  const provisionToken = input.env.AIWORKER_PROVISION_TOKEN
  if (!host || !provisionToken)
    return
  await (input.checkIn ?? checkInToHost)({
    host,
    id: input.activeResolution.worker.appId,
    provisionToken,
    version: input.runtimeVersion,
    workerId: input.activeResolution.worker.id,
    workbenchUrl: '/',
  })
}
