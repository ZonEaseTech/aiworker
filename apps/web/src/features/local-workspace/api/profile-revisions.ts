import type { LocalReview, LocalReviewVerdict } from '@zonease/aiworker-shared'

import { localJson, localText } from '../../../shared/api/local-client'

export interface LocalProfileRevision {
  git: {
    hash?: string
    message?: string
    status: 'created' | 'failed' | 'skipped' | 'unavailable'
  }
  profilePath: string
  review: LocalReview
  reviewPath: string
  tag: {
    hash?: string
    message?: string
    status: 'created' | 'failed' | 'skipped' | 'unavailable'
  } | null
}

export function readProfile(workspaceId: string): Promise<string> {
  return localText(`/api/local/workspaces/${workspaceId}/profile`)
}

export function promoteProfileRevision(workspaceId: string, input: {
  artifactId: string
  findingsJson?: Record<string, unknown>[]
  profileMarkdown?: string
  risksJson?: Record<string, unknown>[]
  tagName?: string | null
  verdict?: Extract<LocalReviewVerdict, 'pass' | 'warn'>
}): Promise<{ profileRevision: LocalProfileRevision }> {
  return localJson(`/api/local/workspaces/${workspaceId}/profile-revisions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
