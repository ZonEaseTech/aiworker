type Job = () => Promise<void>

/** Single-lane FIFO queue. One job at a time; next job starts when current resolves. */
export class AsyncQueue {
  private chain: Promise<void> = Promise.resolve()

  enqueue(job: Job): Promise<void> {
    const next = this.chain.then(() => job())
    this.chain = next.catch(() => undefined)
    return next
  }
}
