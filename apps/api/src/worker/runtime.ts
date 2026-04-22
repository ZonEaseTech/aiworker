import type { BrainProvider, ExecutorProvider, WorkerConfig } from '@aiworker/shared'

import { workerEnv } from '../config/worker'
import { buildBrain } from './brain/factory'
import { ChannelRegistry } from './channels/registry'
import { WorkerEventBus } from './events/bus'
import { attachEvolutionObserver } from './evolution/observer'
import { startProposerLoop } from './evolution/proposer'
import { resolveVariant } from './executor/default-profiles'
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
