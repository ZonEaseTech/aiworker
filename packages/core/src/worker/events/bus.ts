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
      catch {}
    }
  }

  on(listener: Listener<WorkerEvent>): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
