import type { BrainSourceConfig } from '@zonease/aiworker-shared'

import { resolveBrainHome } from '@zonease/aiworker-fs-layout'

export interface BrainSourceDiagnostic {
  id: string
  type: BrainSourceConfig['type']
  priority: number
  readOnly: boolean
  writeTarget: boolean
  home?: string
  url?: string
}

export function describeBrainSource(
  workerId: string,
  source: BrainSourceConfig,
  writeTargetId: string,
): BrainSourceDiagnostic {
  const base = {
    id: source.id,
    type: source.type,
    priority: source.priority,
    readOnly: source.readOnly,
    writeTarget: source.id === writeTargetId,
  }

  if (source.type === 'filesystem') {
    return {
      ...base,
      home: source.config.home ?? resolveBrainHome(workerId),
    }
  }

  return {
    ...base,
    url: source.config.url,
  }
}
