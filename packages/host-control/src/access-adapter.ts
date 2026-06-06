import { randomBytes } from 'node:crypto'

import {
  parseWorkerAccessResponseEnvelope,
  type WorkerAccessRequestEnvelope,
  type WorkerAccessResponseEnvelope,
} from '@zonease/aiworker-worker-control-protocol'

export interface WorkerAccessConnection {
  assignmentId: string
  close: () => void
  sendRequest: (envelope: WorkerAccessRequestEnvelope) => Promise<WorkerAccessResponseEnvelope>
  workerId: string
}

export interface WorkerAccessRegistry {
  get: (workerId: string) => WorkerAccessConnection | undefined
  has: (workerId: string) => boolean
  register: (connection: WorkerAccessConnection) => void
  remove: (workerId: string) => void
  sendRequest: (workerId: string, envelope: WorkerAccessRequestEnvelope) => Promise<WorkerAccessResponseEnvelope | null>
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
    async sendRequest(workerId, envelope) {
      return connections.get(workerId)?.sendRequest(envelope) ?? null
    },
  }
}

export function mapWorkerAccessPath(hostPathWithSearch: string, workerId: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(hostPathWithSearch) || hostPathWithSearch.startsWith('//'))
    throw new Error('invalid worker access path')
  const url = new URL(hostPathWithSearch, 'https://host.invalid')
  const prefix = `/workers/${encodeURIComponent(workerId)}`
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`))
    throw new Error('worker path mismatch')
  const localPath = url.pathname.slice(prefix.length) || '/'
  if (/%2f|%5c/i.test(localPath))
    throw new Error('invalid worker access path')
  if (!localPath.startsWith('/') || localPath.startsWith('//') || localPath.includes('/../') || localPath.endsWith('/..'))
    throw new Error('invalid worker access path')
  return `${localPath}${url.search}`
}

export function sanitizeForwardHeaders(source: Headers): Headers {
  const next = new Headers(source)
  next.delete('authorization')
  next.delete('cookie')
  next.delete('proxy-authorization')
  next.delete('set-cookie')
  next.delete('x-aiworker-user-email')
  next.delete('x-forwarded-user')
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
    id: createAccessRequestId(),
    method: request.method,
    path: `${url.pathname}${url.search}`,
    headers,
    bodyText,
  }
}

function createAccessRequestId(): string {
  return `req_${randomBytes(16).toString('base64url')}`
}

export function parseAccessResponseEnvelope(input: unknown): WorkerAccessResponseEnvelope {
  return parseWorkerAccessResponseEnvelope(input)
}
