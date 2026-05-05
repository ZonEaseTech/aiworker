import type { OrchestratorDeadLoopConfig } from '@zonease/aiworker-shared'

/**
 * BUG-063: dead-loop detector.
 *
 * The vague-prompt fix (Soul template "模糊或缺失上下文" guidance) reduces
 * the *frequency* of brute-force tool sequences but cannot guarantee the LLM
 * never enters one — defensive runtime detection still catches the long
 * tail. Every `tool_call` event arriving without an intervening
 * `assistant_message_delta` increments a counter; once the counter exceeds
 * `threshold`, callers `signal()` to abort the run.
 *
 * Defaults: enabled, threshold = 8. Operators can disable via worker config
 * `orchestrator.deadLoop.enabled = false` when the workflow legitimately
 * involves long pure-tool sequences.
 */

export const DEFAULT_DEAD_LOOP_THRESHOLD = 8

export interface DeadLoopDetectorOptions {
  /** Default true. */
  enabled?: boolean
  /** Default `DEFAULT_DEAD_LOOP_THRESHOLD`. */
  threshold?: number
}

export interface DeadLoopDetector {
  /** Increment the tool_call counter. Returns true when the threshold has just been crossed. */
  recordToolCall: () => boolean
  /** Reset the counter (called on every assistant_message_delta). */
  recordTextDelta: () => void
  /** Last counter snapshot, useful for emitting reason payloads. */
  count: () => number
  /** True after `recordToolCall` returns `true` once. */
  triggered: () => boolean
}

export function createDeadLoopDetector(options: DeadLoopDetectorOptions = {}): DeadLoopDetector {
  const enabled = options.enabled !== false
  const threshold = options.threshold === undefined
    ? DEFAULT_DEAD_LOOP_THRESHOLD
    : Math.max(1, Math.floor(options.threshold))
  let count = 0
  let triggered = false
  return {
    recordToolCall() {
      if (!enabled || triggered)
        return false
      count += 1
      if (count >= threshold) {
        triggered = true
        return true
      }
      return false
    },
    recordTextDelta() {
      count = 0
    },
    count() {
      return count
    },
    triggered() {
      return triggered
    },
  }
}

/**
 * Convenience: build a detector from worker config orchestrator section.
 * Treats missing `deadLoop` as defaults; missing `enabled` as `true`.
 */
export function deadLoopDetectorFromConfig(config: OrchestratorDeadLoopConfig | undefined): DeadLoopDetector {
  return createDeadLoopDetector({
    enabled: config?.enabled ?? true,
    threshold: config?.threshold ?? DEFAULT_DEAD_LOOP_THRESHOLD,
  })
}
