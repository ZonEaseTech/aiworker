import type { BrainProvider, BrainSourceConfig, WorkerConfig } from '@aiworker/shared'

import { CloudGatewayBrainProvider } from './providers/cloud-gateway'
import { HermesProvider } from './providers/hermes'
import { MultiBrainProvider } from './providers/multi'

type DecoratedBrain = BrainProvider & { id: string, priority: number, readOnly: boolean }

function buildOne(source: BrainSourceConfig): DecoratedBrain {
  let provider: BrainProvider
  if (source.type === 'hermes') {
    provider = new HermesProvider({ apiUrl: source.config.apiUrl, home: source.config.home })
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

export function buildBrain(config: WorkerConfig): BrainProvider {
  if (config.brains.length === 0)
    throw new Error('buildBrain: worker config has no brains')
  const sources = config.brains.map(buildOne)
  return new MultiBrainProvider({
    sources,
    writeTargetId: config.brainWriteTarget,
    retrieval: config.brainRetrieval,
  })
}
