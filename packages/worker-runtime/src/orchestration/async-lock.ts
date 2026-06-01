/**
 * 进程内 async 互斥锁(Promise 链)。串行化临界区。
 * 用于 orchestrator 的 create-worker check+insert 临界区。注意:今天该临界区
 * (active 检查 → upsertWorker)是**同步**的,JS run-to-completion 已保证原子,
 * 故 C1 当下由"守卫 + 同步插入"强制;此锁是**前向保险**——一旦日后有人在
 * check 与 insert 之间引入 await,锁仍保证原子。daemon-per-worker 下每个 daemon
 * 是其 DB 唯一写者,故进程内串行化足够,无需存储 schema 全局索引(见 spec §4 C1)。
 */
export class AsyncLock {
  private tail: Promise<void> = Promise.resolve()

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail
    let release: () => void = () => {}
    this.tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await prev
    try {
      return await fn()
    }
    finally {
      release()
    }
  }
}
