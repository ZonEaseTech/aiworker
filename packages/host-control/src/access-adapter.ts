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
      connections.delete(workerId)
    },
  }
}

export function sanitizeForwardHeaders(source: Headers): Headers {
  const next = new Headers(source)
  next.delete('authorization')
  next.delete('cookie')
  next.delete('set-cookie')
  return next
}
