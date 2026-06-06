import {
  parseWorkerAccessFrame,
  parseWorkerCheckInResponse,
  type WorkerAccessHello,
  type WorkerAccessRequestEnvelope,
  type WorkerAccessResponseEnvelope,
  type WorkerCheckInRequest,
  type WorkerCheckInResponse,
} from '@zonease/aiworker-worker-control-protocol'

export type CheckInFetch = (url: URL, init: RequestInit) => Promise<Response>
export type WorkerAccessLocalFetch = (request: Request) => Promise<Response>
export type WorkerAccessWebSocket = Pick<WebSocket, 'send'> & {
  close?: () => void
  onmessage: ((event: { data: string }) => Promise<void> | void) | null
  onopen?: (() => void) | null
  readyState?: number
}

export interface WorkerAccessTunnelHandle {
  close: () => void
}

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

export interface HandleAccessRequestEnvelopeInput {
  envelope: WorkerAccessRequestEnvelope
  localFetch: WorkerAccessLocalFetch
}

export interface ConnectWorkerAccessTunnelInput {
  access: WorkerCheckInResponse['access']
  assignment: WorkerCheckInResponse['assignment']
  createWebSocket?: (url: URL) => WorkerAccessWebSocket
  env: Record<string, string | undefined>
  localFetch: WorkerAccessLocalFetch
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

export function buildAccessHello(input: WorkerAccessHello): WorkerAccessHello {
  return {
    assignmentId: input.assignmentId,
    token: input.token,
    workerId: input.workerId,
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

export async function maybeProvisionCheckIn(input: MaybeProvisionCheckInInput): Promise<WorkerCheckInResponse | null> {
  if (input.activeResolution.kind !== 'single' || !('worker' in input.activeResolution))
    return null
  const host = input.env.AIWORKER_HOST_URL
  const provisionToken = input.env.AIWORKER_PROVISION_TOKEN
  if (!host || !provisionToken)
    return null
  return await (input.checkIn ?? checkInToHost)({
    host,
    id: input.activeResolution.worker.appId,
    provisionToken,
    version: input.runtimeVersion,
    workerId: input.activeResolution.worker.id,
    workbenchUrl: '/',
  })
}

export async function connectWorkerAccessTunnel(input: ConnectWorkerAccessTunnelInput): Promise<WorkerAccessTunnelHandle | null> {
  const host = input.env.AIWORKER_HOST_URL
  if (!host || input.access.mode !== 'worker_access')
    return null

  const url = new URL('/api/provision/access', host)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = input.createWebSocket?.(url) ?? new WebSocket(url) as WorkerAccessWebSocket
  socket.onmessage = async (event) => {
    const frame = parseWorkerAccessFrame(JSON.parse(String(event.data)))
    if (frame.type === 'request') {
      try {
        const response = await handleAccessRequestEnvelope({
          envelope: frame,
          localFetch: input.localFetch,
        })
        socket.send(JSON.stringify(response))
      }
      catch {
        socket.send(JSON.stringify({
          type: 'response',
          id: frame.id,
          status: 502,
          headers: {},
          bodyText: '',
        }))
      }
      return
    }

    if (frame.type === 'ping')
      socket.send(JSON.stringify({ type: 'pong', id: frame.id }))
  }

  const sendHello = () => {
    socket.send(JSON.stringify({
      type: 'hello',
      assignmentId: input.assignment.assignmentId,
      token: input.access.token,
      workerId: input.assignment.workerId,
    }))
  }
  if (typeof socket.readyState === 'number' && socket.readyState !== 1)
    socket.onopen = sendHello
  else
    sendHello()

  return {
    close() {
      socket.close?.()
    },
  }
}

export async function handleAccessRequestEnvelope(
  input: HandleAccessRequestEnvelopeInput,
): Promise<WorkerAccessResponseEnvelope> {
  const url = resolveLocalAccessPath('http://aiworker.local', input.envelope.path)
  const init: RequestInit = {
    headers: input.envelope.headers,
    method: input.envelope.method,
  }
  if (input.envelope.method !== 'GET' && input.envelope.method !== 'HEAD')
    init.body = input.envelope.bodyText

  const response = await input.localFetch(new Request(url, init))
  return {
    type: 'response',
    id: input.envelope.id,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    bodyText: await response.text(),
  }
}

function resolveLocalAccessPath(localBaseUrl: string, path: string): URL {
  if (!path.startsWith('/') || path.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(path))
    throw new Error('invalid worker access path')

  const localBase = new URL(localBaseUrl)
  const url = new URL(path, localBase)
  if (url.origin !== localBase.origin)
    throw new Error('invalid worker access path')

  return url
}
