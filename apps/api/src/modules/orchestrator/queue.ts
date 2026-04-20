/**
 * A minimal in-process FIFO queue. Only one task runs at a time — each enqueued
 * thunk is awaited before the next starts. No retries, no persistence; the DB
 * is the durable source of truth for task state.
 */

type Thunk<T> = () => Promise<T>

interface QueueItem {
  run: () => Promise<void>
}

export class AsyncQueue {
  private readonly pending: QueueItem[] = []
  private running = false

  enqueue<T>(fn: Thunk<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        run: async () => {
          try {
            resolve(await fn())
          }
          catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        },
      })
      void this.drain()
    })
  }

  get size(): number {
    return this.pending.length + (this.running ? 1 : 0)
  }

  get isIdle(): boolean {
    return !this.running && this.pending.length === 0
  }

  private async drain(): Promise<void> {
    if (this.running)
      return
    this.running = true
    try {
      while (this.pending.length > 0) {
        const next = this.pending.shift()!
        await next.run()
      }
    }
    finally {
      this.running = false
    }
  }
}
