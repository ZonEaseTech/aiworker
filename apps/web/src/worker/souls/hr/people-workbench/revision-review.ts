import { formatProfilePromotionIssues, prepareProfileMarkdownForPromotion } from '@zonease/aiworker-shared'
import { getHrProfileSection, parseHrProfileReadme } from './profile-readme'

export type ProfileRevisionReviewStatus = 'blocked' | 'empty' | 'error' | 'loading' | 'ready'

export interface ProfileRevisionReviewState {
  currentSummary: string
  issues: string[]
  proposedMarkdown: string
  proposedSummary: string
  status: ProfileRevisionReviewStatus
}

export function buildProfileRevisionReview(input: {
  artifactContent: string
  artifactError?: null | string
  artifactLoading: boolean
  currentProfileContent: string
  currentProfileError?: null | string
  currentProfileLoading: boolean
  hasArtifact: boolean
}): ProfileRevisionReviewState {
  if (!input.hasArtifact)
    return emptyReview('empty')

  if (input.artifactLoading || input.currentProfileLoading)
    return emptyReview('loading')

  const previewErrors = [input.artifactError, input.currentProfileError].filter((issue): issue is string => Boolean(issue))
  if (previewErrors.length > 0) {
    return {
      ...emptyReview('error'),
      issues: previewErrors,
    }
  }

  const prepared = prepareProfileMarkdownForPromotion({
    artifactMarkdown: input.artifactContent,
    requireFencedDraft: true,
  })

  if (!prepared.ok) {
    return {
      ...emptyReview('blocked'),
      currentSummary: summarizeProfileMarkdown(input.currentProfileContent),
      issues: [formatProfilePromotionIssues(prepared.issues)],
    }
  }

  return {
    currentSummary: summarizeProfileMarkdown(input.currentProfileContent),
    issues: [],
    proposedMarkdown: prepared.profileMarkdown,
    proposedSummary: summarizeProfileMarkdown(prepared.profileMarkdown),
    status: 'ready',
  }
}

function emptyReview(status: ProfileRevisionReviewStatus): ProfileRevisionReviewState {
  return {
    currentSummary: '',
    issues: [],
    proposedMarkdown: '',
    proposedSummary: '',
    status,
  }
}

function summarizeProfileMarkdown(markdown: string): string {
  const normalized = markdown.trim().replace(/\r\n/g, '\n')
  if (!normalized)
    return ''

  const readme = parseHrProfileReadme(normalized)
  return getHrProfileSection(readme, 'currentProfileSummary')?.body || readme.intro || normalized
}
