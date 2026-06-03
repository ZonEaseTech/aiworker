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

  // 清空所有订阅:运行体 dispose 时调用,确保关库后再无订阅者把 DB 读排进微任务队列
  // (例如还活着的 SSE live-tail 订阅在 closeWorkerDb 之后被 emit 触发)。
  clear(): void {
    this.#handlers.clear()
  }
}
