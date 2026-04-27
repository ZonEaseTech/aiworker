import consola from 'consola'

type Listener<T> = (event: T) => void

export interface WorkerEvent {
  type: string
  payload: Record<string, unknown>
  at: string
}

export class WorkerEventBus {
  private readonly listeners = new Set<Listener<WorkerEvent>>()

  emit(type: string, payload: Record<string, unknown>) {
    const event: WorkerEvent = { type, payload, at: new Date().toISOString() }
    for (const l of this.listeners) {
      try {
        l(event)
      }
      catch (err) {
        // 监听器异常绝不影响其他监听器（observer / proposer 之间互相独立），
        // 但静默吞会让 evolution / cron 等异步链路的 bug 永远不可见——log 出来。
        consola.warn(`[bus] listener for ${event.type} threw:`, err)
      }
    }
  }

  on(listener: Listener<WorkerEvent>): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
