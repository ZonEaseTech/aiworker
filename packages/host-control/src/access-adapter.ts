import {
  parseWorkerAccessResponseEnvelope,
  type WorkerAccessRequestEnvelope,
  type WorkerAccessResponseEnvelope,
} from '@zonease/aiworker-worker-control-protocol'

export interface WorkerAccessConnection {
  close: () => void
  workerId: string
}

export interface WorkerAccessRegistry {
  get: (workerId: string) => WorkerAccessConnection | undefined
  has: (workerId: string) => boolean
  register: (connection: WorkerAccessConnection) => void
  remove: (workerId: string) => void
}

export function createWorkerAccessRegistry(): WorkerAccessRegistry {
  const connections = new Map<string, WorkerAccessConnection>()
  return {
    get(workerId) {
      return connections.get(workerId)
    },
    has(workerId) {
      return connections.has(workerId)
    },
    register(connection) {
      connections.get(connection.workerId)?.close()
      connections.set(connection.workerId, connection)
    },
    remove(workerId) {
      connections.get(workerId)?.close()
      connections.delete(workerId)
    },
  }
}

export function sanitizeForwardHeaders(source: Headers): Headers {
  const next = new Headers(source)
  next.delete('authorization')
  next.delete('cookie')
  next.delete('proxy-authorization')
  next.delete('set-cookie')
  next.delete('x-aiworker-user-email')
  return next
}

export async function createAccessRequestEnvelope(request: Request): Promise<WorkerAccessRequestEnvelope> {
  const url = new URL(request.url)
  const headers = Object.fromEntries(sanitizeForwardHeaders(request.headers).entries())
  const bodyText = request.method === 'GET' || request.method === 'HEAD'
    ? ''
    : await request.text()

  return {
    type: 'request',
    id: 'req_1',
    method: request.method,
    path: `${url.pathname}${url.search}`,
    headers,
    bodyText,
  }
}

export function parseAccessResponseEnvelope(input: unknown): WorkerAccessResponseEnvelope {
  return parseWorkerAccessResponseEnvelope(input)
}
