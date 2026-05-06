import { describe, expect, it } from 'bun:test'

import { createDeadLoopDetector, deadLoopDetectorFromConfig, DEFAULT_DEAD_LOOP_THRESHOLD } from './dead-loop'

describe('dead-loop detector (BUG-063)', () => {
  it('triggers after threshold consecutive tool calls without text delta', () => {
    const detector = createDeadLoopDetector({ threshold: 3 })
    expect(detector.recordToolCall()).toBe(false)
    expect(detector.recordToolCall()).toBe(false)
    expect(detector.recordToolCall()).toBe(true)
    expect(detector.triggered()).toBe(true)
    expect(detector.count()).toBe(3)
  })

  it('resets the counter on text delta', () => {
    const detector = createDeadLoopDetector({ threshold: 3 })
    detector.recordToolCall()
    detector.recordToolCall()
    detector.recordTextDelta()
    expect(detector.count()).toBe(0)
    expect(detector.recordToolCall()).toBe(false)
    expect(detector.recordToolCall()).toBe(false)
    expect(detector.recordToolCall()).toBe(true)
  })

  it('resets the counter on tool progress', () => {
    const detector = createDeadLoopDetector({ threshold: 3 })
    detector.recordToolCall()
    detector.recordToolCall()
    detector.recordToolProgress()
    expect(detector.count()).toBe(0)
    expect(detector.recordToolCall()).toBe(false)
    expect(detector.recordToolCall()).toBe(false)
    expect(detector.recordToolCall()).toBe(true)
  })

  it('respects enabled=false', () => {
    const detector = createDeadLoopDetector({ enabled: false, threshold: 1 })
    expect(detector.recordToolCall()).toBe(false)
    expect(detector.recordToolCall()).toBe(false)
    expect(detector.triggered()).toBe(false)
  })

  it('only triggers once even after additional tool calls', () => {
    const detector = createDeadLoopDetector({ threshold: 2 })
    detector.recordToolCall()
    expect(detector.recordToolCall()).toBe(true)
    expect(detector.recordToolCall()).toBe(false)
    expect(detector.recordToolCall()).toBe(false)
    expect(detector.triggered()).toBe(true)
  })

  it('falls back to defaults when no options are passed', () => {
    const detector = deadLoopDetectorFromConfig(undefined)
    for (let i = 0; i < DEFAULT_DEAD_LOOP_THRESHOLD - 1; i += 1)
      expect(detector.recordToolCall()).toBe(false)
    expect(detector.recordToolCall()).toBe(true)
  })

  it('honours explicit threshold from config', () => {
    const detector = deadLoopDetectorFromConfig({ enabled: true, threshold: 2 })
    expect(detector.recordToolCall()).toBe(false)
    expect(detector.recordToolCall()).toBe(true)
  })
})
