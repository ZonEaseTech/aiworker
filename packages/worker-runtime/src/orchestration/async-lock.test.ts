import { describe, expect, it } from 'bun:test'

import { AsyncLock } from './async-lock'

describe('AsyncLock', () => {
  it('serializes concurrent critical sections (no interleaving)', async () => {
    const lock = new AsyncLock()
    const trace: string[] = []
    async function critical(tag: string) {
      return lock.run(async () => {
        trace.push(`${tag}:enter`)
        await Promise.resolve() // yield → 若无锁会让出给另一个
        trace.push(`${tag}:exit`)
      })
    }
    await Promise.all([critical('a'), critical('b')])
    // 串行化 ⇒ 一个完整 enter/exit 后另一个才开始
    expect(trace).toEqual(['a:enter', 'a:exit', 'b:enter', 'b:exit'])
  })

  it('releases the lock even if the critical section throws', async () => {
    const lock = new AsyncLock()
    await expect(lock.run(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    const ok = await lock.run(async () => 'recovered')
    expect(ok).toBe('recovered')
  })
})
