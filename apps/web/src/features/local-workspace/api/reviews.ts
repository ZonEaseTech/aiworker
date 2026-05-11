import type { LocalReview, LocalReviewVerdict } from '@zonease/aiworker-shared'

import { localJson } from '../../../shared/api/local-client'

export function createReview(input: {
  artifactId?: string | null
  findingsJson?: Record<string, unknown>[]
  risksJson?: Record<string, unknown>[]
  sessionId?: string | null
  turnId?: string | null
  verdict?: LocalReviewVerdict
  workspaceId: string
}): Promise<{ review: LocalReview }> {
  return localJson('/api/local/reviews', { method: 'POST', body: JSON.stringify(input) })
}
