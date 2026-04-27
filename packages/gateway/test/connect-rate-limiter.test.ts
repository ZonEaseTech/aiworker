import { describe, expect, test } from 'bun:test'
import { ConnectRateLimiter } from '../src/registry/connect-rate-limiter'

function makeClock(start = 1_000_000) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => { t += ms },
  }
}

describe('ConnectRateLimiter', () => {
  test('阈值前不 block，达阈值返回 blockedNow=true', () => {
    const clock = makeClock()
    const rl = new ConnectRateLimiter({ threshold: 5, windowMs: 60_000, blockMs: 600_000, now: clock.now })
    for (let i = 1; i <= 4; i++) {
      const r = rl.recordFailure('1.2.3.4')
      expect(r.blockedNow).toBe(false)
      expect(r.fails).toBe(i)
      expect(r.blockUntil).toBe(0)
    }
    const fifth = rl.recordFailure('1.2.3.4')
    expect(fifth.blockedNow).toBe(true)
    expect(fifth.fails).toBe(5)
    expect(fifth.blockUntil).toBe(clock.now() + 600_000)
    expect(rl.isBlocked('1.2.3.4')).toEqual({
      blocked: true,
      retryAfterMs: 600_000,
      blockUntil: clock.now() + 600_000,
    })
  })

  test('block 内再 recordFailure 不叠加 blockUntil，blockedNow=false', () => {
    const clock = makeClock()
    const rl = new ConnectRateLimiter({ threshold: 3, windowMs: 60_000, blockMs: 600_000, now: clock.now })
    rl.recordFailure('9.9.9.9')
    rl.recordFailure('9.9.9.9')
    const blocked = rl.recordFailure('9.9.9.9')
    expect(blocked.blockedNow).toBe(true)
    const blockUntil = blocked.blockUntil

    clock.advance(1000)
    const again = rl.recordFailure('9.9.9.9')
    expect(again.blockedNow).toBe(false)
    expect(again.blockUntil).toBe(blockUntil)
  })

  test('窗口外失败重置 firstFailAt，不会跨窗口累加触发 block', () => {
    const clock = makeClock()
    const rl = new ConnectRateLimiter({ threshold: 5, windowMs: 60_000, blockMs: 600_000, now: clock.now })
    for (let i = 0; i < 4; i++)
      rl.recordFailure('5.5.5.5')
    clock.advance(60_001) // 跨窗口
    const r = rl.recordFailure('5.5.5.5')
    expect(r.blockedNow).toBe(false)
    expect(r.fails).toBe(1)
  })

  test('block 解除后再失败：因为 entry 还在 → 但计数也应重置（非永远累加）', () => {
    const clock = makeClock()
    const rl = new ConnectRateLimiter({ threshold: 3, windowMs: 60_000, blockMs: 600_000, now: clock.now })
    rl.recordFailure('1.1.1.1')
    rl.recordFailure('1.1.1.1')
    rl.recordFailure('1.1.1.1') // 进入 block
    expect(rl.isBlocked('1.1.1.1').blocked).toBe(true)
    clock.advance(600_001) // block 结束
    expect(rl.isBlocked('1.1.1.1').blocked).toBe(false)
    const after = rl.recordFailure('1.1.1.1')
    // block 结束 + 窗口外 → 计数重置为 1，不会因历史累加再次立即 block
    expect(after.fails).toBe(1)
    expect(after.blockedNow).toBe(false)
  })

  test('recordSuccess 清掉计数', () => {
    const clock = makeClock()
    const rl = new ConnectRateLimiter({ threshold: 3, windowMs: 60_000, blockMs: 600_000, now: clock.now })
    rl.recordFailure('2.2.2.2')
    rl.recordFailure('2.2.2.2')
    rl.recordSuccess('2.2.2.2')
    const r = rl.recordFailure('2.2.2.2')
    expect(r.fails).toBe(1)
    expect(r.blockedNow).toBe(false)
  })

  test('undefined / 空 IP 视为不可识别，不入计数', () => {
    const rl = new ConnectRateLimiter()
    expect(rl.recordFailure(undefined)).toEqual({ blockedNow: false, fails: 0, blockUntil: 0 })
    expect(rl.isBlocked(undefined)).toEqual({ blocked: false, retryAfterMs: 0, blockUntil: 0 })
    rl.recordSuccess(undefined) // 不抛
    expect(rl.size()).toBe(0)
  })

  test('isBlocked 在 block 解除后立即返回 false', () => {
    const clock = makeClock()
    const rl = new ConnectRateLimiter({ threshold: 2, blockMs: 1000, now: clock.now })
    rl.recordFailure('3.3.3.3')
    rl.recordFailure('3.3.3.3')
    expect(rl.isBlocked('3.3.3.3').blocked).toBe(true)
    clock.advance(1001)
    expect(rl.isBlocked('3.3.3.3').blocked).toBe(false)
  })

  test('prune 清掉过期且 block 已结束的 entry', () => {
    const clock = makeClock()
    const rl = new ConnectRateLimiter({ threshold: 2, windowMs: 60_000, blockMs: 1000, now: clock.now })
    rl.recordFailure('a.a.a.a') // 1 次 → 不 block
    rl.recordFailure('b.b.b.b') // 第 1 次
    rl.recordFailure('b.b.b.b') // 第 2 次 → block
    expect(rl.size()).toBe(2)

    clock.advance(60_001 + 1001) // 跨过窗口 + block
    const removed = rl.prune()
    expect(removed).toBe(2)
    expect(rl.size()).toBe(0)
  })

  test('多 IP 计数互不干扰', () => {
    const rl = new ConnectRateLimiter({ threshold: 3 })
    rl.recordFailure('a.a.a.a')
    rl.recordFailure('a.a.a.a')
    const r = rl.recordFailure('b.b.b.b')
    expect(r.fails).toBe(1)
    expect(r.blockedNow).toBe(false)
    expect(rl.isBlocked('a.a.a.a').blocked).toBe(false)
    expect(rl.isBlocked('b.b.b.b').blocked).toBe(false)
  })
})
