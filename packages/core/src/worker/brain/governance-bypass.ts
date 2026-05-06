import type { WorkerInfoBrainSummary } from '@zonease/aiworker-shared'

export interface BrainGovernanceBypassWarning {
  at: string
  claimExcerpt?: string
  conversationId: string
  engine: string
  reason: string
  sessionKey: string
}

const MAX_WARNINGS = 20
const warnings: BrainGovernanceBypassWarning[] = []

export function recordBrainGovernanceBypassWarning(warning: BrainGovernanceBypassWarning): void {
  warnings.push(warning)
  if (warnings.length > MAX_WARNINGS)
    warnings.splice(0, warnings.length - MAX_WARNINGS)
}

export function resetBrainGovernanceBypassWarnings(): void {
  warnings.length = 0
}

export function getBrainGovernanceBypassSnapshot(): WorkerInfoBrainSummary['admissions']['bypassRisk'] {
  const last = warnings.at(-1)
  if (!last) {
    return {
      recentCount: 0,
      status: 'none',
    }
  }
  return {
    lastDetectedAt: last.at,
    ...(last.claimExcerpt === undefined ? {} : { claimExcerpt: last.claimExcerpt }),
    reason: last.reason,
    recentCount: warnings.length,
    status: 'suspected',
  }
}
