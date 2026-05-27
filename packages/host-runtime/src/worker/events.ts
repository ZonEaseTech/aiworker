export type LocalWorkerEventKind = 'session' | 'event'

export interface LocalWorkerEvent {
  kind: LocalWorkerEventKind
  workspaceId: string
  sessionId?: string
  invocationId?: string
  payload: Record<string, unknown>
  at: string
}

export type LocalWorkerEventHandler = (event: LocalWorkerEvent) => void

export class LocalWorkerEventBus {
  readonly #handlers = new Set<LocalWorkerEventHandler>()

  subscribe(handler: LocalWorkerEventHandler): () => void {
    this.#handlers.add(handler)
    return () => this.#handlers.delete(handler)
  }

  emit(event: LocalWorkerEvent): void {
    for (const handler of [...this.#handlers])
      handler(event)
  }
}
