import type { HrProfileSectionId } from './profile-readme'
import { formatProfilePromotionIssues, prepareProfileMarkdownForPromotion } from '@zonease/aiworker-shared'
import { getHrProfileSection, HR_PROFILE_SECTION_ORDER, parseHrProfileReadme } from './profile-readme'

export type ProfileRevisionReviewStatus = 'blocked' | 'empty' | 'error' | 'loading' | 'ready'
export type ProfileRevisionSectionChangeStatus = 'added' | 'changed'

export interface ProfileRevisionSectionChange {
  currentMarkdown: string
  id: HrProfileSectionId
  proposedMarkdown: string
  status: ProfileRevisionSectionChangeStatus
  title: string
}

export interface ProfileRevisionReviewState {
  blockerCount: number
  changedSectionCount: number
  changedSections: ProfileRevisionSectionChange[]
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
    const issues = [formatProfilePromotionIssues(prepared.issues)]
    return {
      ...emptyReview('blocked'),
      blockerCount: issues.length,
      currentSummary: summarizeProfileMarkdown(input.currentProfileContent),
      issues,
    }
  }

  const changedSections = buildProfileRevisionSectionChanges({
    currentProfileContent: input.currentProfileContent,
    proposedProfileContent: prepared.profileMarkdown,
  })

  return {
    blockerCount: 0,
    changedSectionCount: changedSections.length,
    changedSections,
    currentSummary: summarizeProfileMarkdown(input.currentProfileContent),
    issues: [],
    proposedMarkdown: prepared.profileMarkdown,
    proposedSummary: summarizeProfileMarkdown(prepared.profileMarkdown),
    status: 'ready',
  }
}

function emptyReview(status: ProfileRevisionReviewStatus): ProfileRevisionReviewState {
  return {
    blockerCount: 0,
    changedSectionCount: 0,
    changedSections: [],
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

function buildProfileRevisionSectionChanges(input: {
  currentProfileContent: string
  proposedProfileContent: string
}): ProfileRevisionSectionChange[] {
  const currentReadme = parseHrProfileReadme(input.currentProfileContent)
  const proposedReadme = parseHrProfileReadme(input.proposedProfileContent)

  return HR_PROFILE_SECTION_ORDER.flatMap((section) => {
    const currentMarkdown = getHrProfileSection(currentReadme, section.id)?.body ?? ''
    const proposedMarkdown = getHrProfileSection(proposedReadme, section.id)?.body ?? ''

    if (normalizeSectionMarkdown(currentMarkdown) === normalizeSectionMarkdown(proposedMarkdown))
      return []

    return [{
      currentMarkdown,
      id: section.id,
      proposedMarkdown,
      status: normalizeSectionMarkdown(currentMarkdown) ? 'changed' : 'added',
      title: section.title,
    }]
  })
}

function normalizeSectionMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim()
}
