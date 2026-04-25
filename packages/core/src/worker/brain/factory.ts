import type { BrainProvider, BrainSourceConfig, WorkerConfig } from '@aiworker/shared'

import { resolveBrainHome } from '@aiworker/fs-layout'

import { CloudGatewayBrainProvider } from './providers/cloud-gateway'
import { FilesystemBrainProvider } from './providers/filesystem'
import { MultiBrainProvider } from './providers/multi'

type DecoratedBrain = BrainProvider & { id: string, priority: number, readOnly: boolean }

function buildOne(workerId: string, source: BrainSourceConfig): DecoratedBrain {
  let provider: BrainProvider
  if (source.type === 'filesystem') {
    const home = source.config.home ?? resolveBrainHome(workerId)
    provider = new FilesystemBrainProvider({ home })
  }
  else {
    provider = new CloudGatewayBrainProvider({
      url: source.config.url,
      token: source.config.token,
      ...(source.config.defaultCategory === undefined ? {} : { defaultCategory: source.config.defaultCategory }),
      ...(source.config.defaultTypeId === undefined ? {} : { defaultTypeId: source.config.defaultTypeId }),
    })
  }
  return Object.assign(provider, { id: source.id, priority: source.priority, readOnly: source.readOnly })
}

export function buildBrain(workerId: string, config: WorkerConfig): BrainProvider {
  const sources = config.brains.map(source => buildOne(workerId, source))
  return new MultiBrainProvider({
    sources,
    writeTargetId: config.brainWriteTarget,
    retrieval: config.brainRetrieval,
  })
}
