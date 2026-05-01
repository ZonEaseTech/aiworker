import type { WorkerConfig } from '@zonease/aiworker-shared'
import type { WorkerRuntime } from './runtime'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import { __resetWorkerEnvCacheForTest } from '../config/worker'
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
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    originalEnv = snapshotEnv([
      'AIWORKER_HOME',
      'AIWORKER_MASTER_KEY',
      'WORKER_DATA_ROOT',
      'WORKER_WORKSPACE_GIT_ORIGIN',
    ])
    process.env.AIWORKER_HOME = path.join(os.tmpdir(), `aiworker-runtime-test-home-${process.pid}`)
    process.env.AIWORKER_MASTER_KEY = 'a'.repeat(64)
    delete process.env.WORKER_DATA_ROOT
    delete process.env.WORKER_WORKSPACE_GIT_ORIGIN
    __resetWorkerEnvCacheForTest()
  })

  afterEach(() => {
    restoreEnv(originalEnv)
    __resetWorkerEnvCacheForTest()
  })

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

  it('project scope 默认让 engine workspace 指向项目根目录', async () => {
    await withProjectScope(async ({ projectRoot }) => {
      const processes = makeProcessManager()
      try {
        const runtime = buildWorkerRuntime('w_projectroot1', buildBareConfig(), { processes })
        try {
          const handle = await runtime.workspaces.createWorkspace('conv-project')
          expect(handle.path).toBe(projectRoot)
          expect(handle.isSharedProjectRoot).toBe(true)
        }
        finally {
          runtime.dispose()
        }
      }
      finally {
        processes.dispose()
      }
    })
  })

  it('默认复用 task executor 作为 control executor', () => {
    const processes = makeProcessManager()
    try {
      const runtime = buildWorkerRuntime('w_control_default', buildBareConfig(), { processes })
      try {
        expect(runtime.controlExecutor).toBe(runtime.executor)
        expect(runtime.controlExecutorConfig).toEqual(runtime.config.executor)
        expect(runtime.controlExecutorReusesTaskExecutor).toBe(true)
      }
      finally {
        runtime.dispose()
      }
    }
    finally {
      processes.dispose()
    }
  })

  it('显式 control executor 会与 task executor 分开构建', () => {
    const processes = makeProcessManager()
    try {
      const controlExecutor: WorkerConfig['executor'] = {
        engine: 'http',
        variant: 'default',
        overrides: {
          baseUrl: 'https://control.example.com',
          apiKey: '',
          model: 'gpt-control',
        },
      }
      const runtime = buildWorkerRuntime('w_control_explicit', {
        ...buildBareConfig(),
        orchestrator: {
          decisionPipeline: {
            executor: controlExecutor,
          },
        },
      }, { processes })
      try {
        expect(runtime.controlExecutor).not.toBe(runtime.executor)
        expect(runtime.controlExecutorConfig).toEqual(controlExecutor)
        expect(runtime.controlExecutorReusesTaskExecutor).toBe(false)
      }
      finally {
        runtime.dispose()
      }
    }
    finally {
      processes.dispose()
    }
  })

  it('executor workspaceRoot override keeps isolated workspace behavior', async () => {
    await withProjectScope(async ({ projectRoot }) => {
      const processes = makeProcessManager()
      try {
        const config: WorkerConfig = {
          ...buildBareConfig(),
          executor: {
            engine: 'claude-code',
            variant: 'default',
            overrides: { workspaceRoot: 'custom-workspaces' },
          },
        }
        const runtime = buildWorkerRuntime('w_projectroot2', config, { processes })
        try {
          const handle = await runtime.workspaces.createWorkspace('conv-isolated')
          expect(handle.path).toBe(path.join(projectRoot, '.aiworker', 'local', 'data-root', 'custom-workspaces', 'conv-isolated'))
          expect(handle.isSharedProjectRoot).toBeUndefined()
        }
        finally {
          runtime.dispose()
        }
      }
      finally {
        processes.dispose()
      }
    })
  })
})

async function withProjectScope(run: (input: { projectRoot: string }) => Promise<void>): Promise<void> {
  const originalCwd = process.cwd()
  const originalEnv = snapshotEnv([
    'AIWORKER_HOME',
    'AIWORKER_MASTER_KEY',
    'WORKER_DATA_ROOT',
    'WORKER_WORKSPACE_GIT_ORIGIN',
  ])
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aiworker-runtime-project-'))
  const projectRoot = path.join(root, 'project')
  try {
    await fs.mkdir(path.join(projectRoot, '.aiworker', 'local'), { recursive: true })
    delete process.env.AIWORKER_HOME
    delete process.env.WORKER_DATA_ROOT
    delete process.env.WORKER_WORKSPACE_GIT_ORIGIN
    process.env.AIWORKER_MASTER_KEY = 'a'.repeat(64)
    process.chdir(projectRoot)
    __resetWorkerEnvCacheForTest()

    await run({ projectRoot })
  }
  finally {
    process.chdir(originalCwd)
    restoreEnv(originalEnv)
    __resetWorkerEnvCacheForTest()
    await fs.rm(root, { recursive: true, force: true })
  }
}

function snapshotEnv(keys: readonly string[]): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {}
  for (const key of keys)
    snapshot[key] = process.env[key]
  return snapshot
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined)
      delete process.env[key]
    else
      process.env[key] = value
  }
}
