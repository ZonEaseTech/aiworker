import type { WorkerConfig } from '@zonease/aiworker-shared'
import type { WorkerRuntime } from './runtime'
import { describe, expect, it, mock } from 'bun:test'

import { DEFAULT_EMPTY_CONFIG } from './bootstrap'
import { ProcessManager } from './orchestrator/process-manager'
import { buildWorkerRuntime } from './runtime'

/**
 * PLAN-015 §S1 hot-reload 回归测——硬护栏。
 *
 * 跨包搬迁后，apps/api 路由层依旧通过 `() => state.runtime` 闭包懒取 runtime。
 * 本测试在 packages/core 内验证两条最容易被改坏的不变量：
 *
 * 1. **闭包懒取**：`state.runtime` 被原子替换后，闭包必须返回新 runtime。
 *    （任何 eager-capture，比如 `const r = state.runtime; () => r`，会让本测试红。）
 * 2. **dispose 严格幂等且全卸**：旧 runtime 的 cron / approvals / observer
 *    必须各自被卸恰好一次；新 runtime 不受影响。
 *
 * 不需要 Hono——直接在 runtime 层验证；apps/api 的 routes.test.ts 已经覆盖了
 * Hono 入口的 PUT /config → reloadRuntime 端到端流程。
 */

function buildBareConfig(): WorkerConfig {
  return { ...DEFAULT_EMPTY_CONFIG, evolution: { enabled: false, observationRetentionDays: 7 } }
}

function makeProcessManager(): ProcessManager {
  return new ProcessManager({
    maxConcurrentTotal: 1,
    perEngineLimits: {},
    stallTimeoutMs: 60_000,
    killTimeoutMs: 5_000,
    autoCleanupDelayMs: 60_000,
    gcIntervalMs: 0,
  })
}

describe('PLAN-015 hot-reload 不变量', () => {
  it('闭包 () => state.runtime 在 swap 后返回新实例', () => {
    const processes = makeProcessManager()
    try {
      const a = buildWorkerRuntime('w_test1', buildBareConfig(), { processes })
      const state: { runtime: WorkerRuntime } = { runtime: a }
      const getRuntime = () => state.runtime
      expect(getRuntime()).toBe(a)

      const b = buildWorkerRuntime('w_test1', buildBareConfig(), { processes })
      state.runtime = b
      expect(getRuntime()).toBe(b)
      expect(getRuntime()).not.toBe(a)
    }
    finally {
      processes.dispose()
    }
  })

  it('reload 后旧 runtime 的 dispose 卸 cron / approvals 恰好一次；新 runtime 不受影响', () => {
    const processes = makeProcessManager()
    try {
      const previous = buildWorkerRuntime('w_test2', buildBareConfig(), { processes })
      const cronStop = mock(previous.cron.stop.bind(previous.cron))
      previous.cron.stop = cronStop
      const approvalsDispose = mock(previous.approvals.dispose.bind(previous.approvals))
      previous.approvals.dispose = approvalsDispose

      const next = buildWorkerRuntime('w_test2', buildBareConfig(), { processes })
      const nextApprovalsDispose = mock(next.approvals.dispose.bind(next.approvals))
      next.approvals.dispose = nextApprovalsDispose

      previous.dispose()

      expect(cronStop).toHaveBeenCalledTimes(1)
      expect(approvalsDispose).toHaveBeenCalledTimes(1)
      expect(nextApprovalsDispose).not.toHaveBeenCalled()

      next.dispose()
      expect(nextApprovalsDispose).toHaveBeenCalledTimes(1)
    }
    finally {
      processes.dispose()
    }
  })

  it('dispose 后挂起的 approval 立刻 deny——避免 reload 后 operator grant 喂错 store', async () => {
    const processes = makeProcessManager()
    try {
      const runtime = buildWorkerRuntime('w_test3', buildBareConfig(), { processes })
      const pending = runtime.approvals.wait({
        taskId: 't',
        toolCallId: 'c',
        toolName: 'fs.write',
        params: {},
        timeoutMs: 10_000,
      })
      runtime.dispose()
      await expect(pending).resolves.toBe('deny')
    }
    finally {
      processes.dispose()
    }
  })
})
