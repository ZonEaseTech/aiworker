import type { BrainProvider, ExecutorProvider, WorkerConfig } from '@zonease/aiworker-shared'
import type { ProcessManager } from './orchestrator/process-manager'

import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import { workerEnv } from '../config/worker'
import { buildBrain } from './brain/factory'
import { resetLarkTokenCache } from './channels/adapters/lark'
import { ChannelRegistry } from './channels/registry'
import { CronService } from './cron/service'
import { WorkerEventBus } from './events/bus'
import { attachEvolutionObserver } from './evolution/observer'
import { startProposerLoop } from './evolution/proposer'
import { resolveVariant } from './executor/default-profiles'
import { buildExecutor } from './executor/factory'
import { WorkspaceManager } from './executor/workspace'
import { ApprovalStore } from './orchestrator/approvals'
import { resolveControlExecutor } from './orchestrator/control-executor'
import { Orchestrator } from './orchestrator/service'

export interface WorkerRuntime {
  workerId: string
  config: WorkerConfig
  brain: BrainProvider
  executor: ExecutorProvider
  controlExecutor?: ExecutorProvider
  controlExecutorConfig?: WorkerConfig['executor']
  controlExecutorReusesTaskExecutor?: boolean
  channels: ChannelRegistry
  bus: WorkerEventBus
  orchestrator: Orchestrator
  /**
   * Cron 调度服务。tick loop 在 build 时启动，dispose 时停止；持有自己的
   * `setInterval` handle，绝不进 orchestrator hot path（fire 时只合成 envelope
   * 喂 `orchestrator.ingest`）。
   */
  cron: CronService
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
  const controlExecutor = resolveControlExecutor({ config, taskExecutor: executor })
  const channels = new ChannelRegistry(config.channels)
  const bus = new WorkerEventBus()
  const workspaces = buildWorkspaceManager(config)
  const approvals = new ApprovalStore()
  const orchestrator = new Orchestrator({
    config,
    brain,
    executor,
    controlExecutor: controlExecutor.executor,
    controlExecutorConfig: controlExecutor.config,
    controlExecutorReusesTaskExecutor: controlExecutor.reusesTaskExecutor,
    bus,
    workerId,
    workspaces,
    processes: deps.processes,
    approvals,
  })

  const unsubObserver = attachEvolutionObserver(bus)
  const stopProposer = config.evolution.enabled ? startProposerLoop() : () => undefined

  const cron = new CronService({
    workerId,
    // 懒取 orchestrator 引用——hot-reload 时 cron 已在 dispose 阶段被 stop，
    // 这里取的就是 build 时 new 出来的同一个 orchestrator，保持稳定。
    getOrchestrator: () => orchestrator,
  })
  cron.start()

  return {
    workerId,
    config,
    brain,
    executor,
    controlExecutor: controlExecutor.executor,
    controlExecutorConfig: controlExecutor.config,
    controlExecutorReusesTaskExecutor: controlExecutor.reusesTaskExecutor,
    channels,
    bus,
    orchestrator,
    cron,
    workspaces,
    processes: deps.processes,
    approvals,
    dispose() {
      unsubObserver()
      stopProposer()
      // PLAN-014 F2 hot-reload 不变量：旧 runtime 的挂起审批必须立刻 reject，
      // 否则 operator grant 永远不会送到新 runtime 上，promise 泄漏。
      approvals.dispose()
      cron.stop()
      // lark adapter 的 tenant_access_token 缓存是模块级 Map（adapter 是单例
      // 对象不是工厂）。reload 时若 appId/appSecret 换掉，旧 token 可能在
      // expiresAt 之前继续被复用。dispose 阶段强清一次，下一次 send 重新拉。
      resetLarkTokenCache()
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
  const gitOrigin = workerEnv.WORKER_WORKSPACE_GIT_ORIGIN
  const scope = resolveAiworkerScope()
  const projectRoot = scope.scope === 'project' && scope.projectRoot && !gitOrigin && !configuredRoot
    ? scope.projectRoot
    : undefined

  return new WorkspaceManager({
    root: workerEnv.WORKER_DATA_ROOT,
    ...(configuredRoot ? { subdir: configuredRoot } : {}),
    ...(gitOrigin ? { gitOrigin } : {}),
    ...(projectRoot ? { projectRoot } : {}),
  })
}
