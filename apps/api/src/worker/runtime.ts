import type { BrainProvider, ExecutorProvider, WorkerConfig } from '@aiworker/shared'

import { workerEnv } from '../config/worker'
import { buildBrain } from './brain/factory'
import { ChannelRegistry } from './channels/registry'
import { WorkerEventBus } from './events/bus'
import { attachEvolutionObserver } from './evolution/observer'
import { startProposerLoop } from './evolution/proposer'
import { buildExecutor } from './executor/factory'
import { WorkspaceManager } from './executor/workspace'
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
  dispose: () => void
}

export function buildWorkerRuntime(workerId: string, config: WorkerConfig): WorkerRuntime {
  const brain = buildBrain(config)
  const executor = buildExecutor(config.executor)
  const channels = new ChannelRegistry(config.channels)
  const bus = new WorkerEventBus()
  const workspaces = buildWorkspaceManager(config)
  const orchestrator = new Orchestrator({ config, brain, executor, bus, workerId, workspaces })

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
    dispose() {
      unsubObserver()
      stopProposer()
    },
  }
}

function buildWorkspaceManager(config: WorkerConfig): WorkspaceManager {
  const configuredRoot = config.executor.type === 'claude-code' && typeof config.executor.workspaceRoot === 'string'
    ? config.executor.workspaceRoot
    : undefined
  return new WorkspaceManager({
    root: workerEnv.WORKER_DATA_ROOT,
    ...(configuredRoot ? { subdir: configuredRoot } : {}),
    ...(workerEnv.WORKER_WORKSPACE_GIT_ORIGIN ? { gitOrigin: workerEnv.WORKER_WORKSPACE_GIT_ORIGIN } : {}),
  })
}
