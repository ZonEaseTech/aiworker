import type { BrainProvider, ExecutorProvider, WorkerConfig } from '@aiworker/shared'

import { buildBrain } from './brain/factory'
import { ChannelRegistry } from './channels/registry'
import { WorkerEventBus } from './events/bus'
import { attachEvolutionObserver } from './evolution/observer'
import { startProposerLoop } from './evolution/proposer'
import { buildExecutor } from './executor/factory'
import { Orchestrator } from './orchestrator/service'

export interface WorkerRuntime {
  workerId: string
  config: WorkerConfig
  brain: BrainProvider
  executor: ExecutorProvider
  channels: ChannelRegistry
  bus: WorkerEventBus
  orchestrator: Orchestrator
  dispose: () => void
}

export function buildWorkerRuntime(workerId: string, config: WorkerConfig): WorkerRuntime {
  const brain = buildBrain(config)
  const executor = buildExecutor(config.executor)
  const channels = new ChannelRegistry(config.channels)
  const bus = new WorkerEventBus()
  const orchestrator = new Orchestrator({ config, brain, executor, bus, workerId })

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
    dispose() {
      unsubObserver()
      stopProposer()
    },
  }
}
