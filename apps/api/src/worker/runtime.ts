import type { BrainProvider, ExecutorProvider, WorkerConfig } from '@aiworker/shared'
import type { ProcessManager } from './orchestrator/process-manager'

import { workerEnv } from '../config/worker'
import { buildBrain } from './brain/factory'
import { ChannelRegistry } from './channels/registry'
import { WorkerEventBus } from './events/bus'
import { attachEvolutionObserver } from './evolution/observer'
import { startProposerLoop } from './evolution/proposer'
import { resolveVariant } from './executor/default-profiles'
import { buildExecutor } from './executor/factory'
import { WorkspaceManager } from './executor/workspace'
import { ApprovalStore } from './orchestrator/approvals'
import { Orchestrator } from './orchestrator/service'

export interface WorkerRuntime {
  workerId: string
  config: WorkerConfig
  brain: BrainProvider
  executor: ExecutorProvider
  channels: ChannelRegistry
  bus: WorkerEventBus
  orchestrator: Orchestrator
  workspaces: WorkspaceManager
  /**
   * 进程级集中管控（FEAT-015 / PLAN-007 §架构承诺 5）。**跨 hot-reload
   * 持久化**：reload 时不重建，仅通过 `processes.setLimits()` 调容量。
   * `dispose()` 不会清空它（由 bootstrap 退出阶段统一 cancelAll + dispose）。
   */
  processes: ProcessManager
  /** PLAN-014 F2：per-tool 审批挂起 store。reload 时一并重建 + 旧 store dispose。 */
  approvals: ApprovalStore
  dispose: () => void
}

export interface BuildRuntimeDeps {
  /**
   * 跨 reload 持有的 ProcessManager 实例。`bootstrapWorkerApp` 在 init 时
   * new 一次，之后每次 `reloadRuntime` 都把同一个实例传进来，确保活跃进程
   * + 队列不被 reload 清空。
   */
  processes: ProcessManager
}

export function buildWorkerRuntime(workerId: string, config: WorkerConfig, deps: BuildRuntimeDeps): WorkerRuntime {
  const brain = buildBrain(workerId, config)
  const executor = buildExecutor(config.executor)
  const channels = new ChannelRegistry(config.channels)
  const bus = new WorkerEventBus()
  const workspaces = buildWorkspaceManager(config)
  const approvals = new ApprovalStore()
  const orchestrator = new Orchestrator({
    config,
    brain,
    executor,
    bus,
    workerId,
    workspaces,
    processes: deps.processes,
    approvals,
  })

  const unsubObserver = attachEvolutionObserver(bus)
  const stopProposer = config.evolution.enabled ? startProposerLoop() : () => undefined

  return {
    workerId,
    config,
    brain,
    executor,
    channels,
    bus,
    orchestrator,
    workspaces,
    processes: deps.processes,
    approvals,
    dispose() {
      unsubObserver()
      stopProposer()
      // PLAN-014 F2 hot-reload 不变量：旧 runtime 的挂起审批必须立刻 reject，
      // 否则 operator grant 永远不会送到新 runtime 上，promise 泄漏。
      approvals.dispose()
      // 注意：不 dispose processes —— ProcessManager 跨 reload 持久化，
      // 由 bootstrap 退出阶段统一 cancelAll + dispose。
    },
  }
}

function buildWorkspaceManager(config: WorkerConfig): WorkspaceManager {
  // Only the claude-code engine reads `workspaceRoot`; other engines ignore
  // it. Resolve through the variant catalogue so a future variant body that
  // bakes in a workspaceRoot is honoured even without explicit overrides.
  const configuredRoot = (() => {
    if (config.executor.engine !== 'claude-code')
      return undefined
    try {
      const body = resolveVariant(config.executor).body as Record<string, unknown>
      const root = body.workspaceRoot
      return typeof root === 'string' && root.length > 0 ? root : undefined
    }
    catch {
      return undefined
    }
  })()
  return new WorkspaceManager({
    root: workerEnv.WORKER_DATA_ROOT,
    ...(configuredRoot ? { subdir: configuredRoot } : {}),
    ...(workerEnv.WORKER_WORKSPACE_GIT_ORIGIN ? { gitOrigin: workerEnv.WORKER_WORKSPACE_GIT_ORIGIN } : {}),
  })
}
