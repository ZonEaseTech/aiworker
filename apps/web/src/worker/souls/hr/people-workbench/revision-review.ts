import type { ProfilePromotionPreparationResult } from '@zonease/aiworker-shared'
import type { HrProfileSectionId } from './profile-readme'
import { formatProfilePromotionIssues, prepareProfileMarkdownForPromotion } from '@zonease/aiworker-shared'
import { getHrProfileSection, HR_PROFILE_SECTION_ORDER, parseHrProfileReadme } from './profile-readme'

export type ProfileRevisionReviewStatus = 'blocked' | 'empty' | 'error' | 'loading' | 'ready'
export type ProfileRevisionSectionChangeId = HrProfileSectionId | 'profileReadmeDocument'
export type ProfileRevisionSectionChangeStatus = 'added' | 'changed'

export interface ProfileRevisionSectionChange {
  currentMarkdown: string
  id: ProfileRevisionSectionChangeId
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

  const prepared = prepareHrProfileMarkdownForPromotion(input.artifactContent)

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

function prepareHrProfileMarkdownForPromotion(artifactMarkdown: string): ProfilePromotionPreparationResult {
  const fencedDraft = prepareProfileMarkdownForPromotion({
    artifactMarkdown,
    requireFencedDraft: true,
  })
  if (fencedDraft.ok)
    return fencedDraft

  const synthesized = synthesizeAcceptedProfileReadme(artifactMarkdown)
  if (!synthesized)
    return fencedDraft

  const explicit = prepareProfileMarkdownForPromotion({ profileMarkdown: synthesized })
  if (explicit.ok)
    return explicit

  let normalized = synthesized
  for (const issue of explicit.issues) {
    if (issue.code !== 'proposal_state_language' || !issue.phrase)
      continue
    normalized = replacePhrase(normalized, issue.phrase, replacementForProposalPhrase(issue.phrase))
  }

  const retried = prepareProfileMarkdownForPromotion({ profileMarkdown: normalized })
  return retried.ok ? retried : explicit
}

interface ParsedArtifactSection {
  body: string
  heading: string
}

function synthesizeAcceptedProfileReadme(artifactMarkdown: string): string | null {
  const parsed = parseArtifactMarkdown(artifactMarkdown)
  if (!parsed.title || !isHrProfileArtifact(parsed))
    return null

  const targetName = inferProfileTargetName(parsed.title)
  const currentSummary = sanitizeAcceptedProfileBlock(
    sectionBody(parsed.sections, ['Current Profile Summary', 'Current Profile Snapshot', 'Profile Summary'])
    || stripArtifactMetadata(parsed.intro),
  ) || 'No substantive HR profile evidence has been accepted beyond the current workspace and session context.'
  const confirmedFacts = sanitizeAcceptedProfileBlock(sectionBody(parsed.sections, ['Confirmed Facts']))
    || 'No confirmed HR facts have been accepted yet.'
  const roleContext = sanitizeAcceptedProfileBlock(sectionBody(parsed.sections, ['Role Context And Responsibilities', 'Role-Relevant Evidence', 'Role Relevant Evidence']))
    || 'No accepted role context or responsibilities are available yet.'
  const evidenceStatus = sanitizeAcceptedProfileBlock(sectionBody(parsed.sections, ['Evidence Status', 'Evidence Matrix', 'Role-Relevant Evidence', 'Role Relevant Evidence']))
    || 'No accepted evidence descriptors are available yet.'
  const risksAndGaps = sanitizeAcceptedProfileBlock(joinBlocks([
    sectionBody(parsed.sections, ['Missing Or Conflicting Evidence', 'Missing Evidence']),
    sectionBody(parsed.sections, ['Hiring Risks And Compliance Notes', 'Risks And Gaps']),
  ])) || 'No accepted risk or gap summary is available yet.'
  const nextActions = sanitizeAcceptedProfileBlock(sectionBody(parsed.sections, ['Human Reviewer Next Actions', 'Next HR Actions']))
    || 'Add source-backed HR evidence before making substantive profile decisions.'

  return [
    `# ${targetName} People Profile`,
    '',
    'Accepted HR profile README generated from a reviewed person-profile artifact.',
    '',
    '## Current Profile Summary',
    '',
    currentSummary,
    '',
    '## Identity And Basics',
    '',
    `- Profile target: ${targetName}`,
    '- Lifecycle: Unknown until accepted HR evidence states otherwise.',
    '- Profile confidence: Limited to accepted source-backed evidence.',
    '',
    '## Role Context And Responsibilities',
    '',
    roleContext,
    '',
    '## Capabilities And Stack',
    '',
    'No accepted capabilities or stack details are available yet.',
    '',
    '## Confirmed Facts',
    '',
    confirmedFacts,
    '',
    '## Evidence Status',
    '',
    evidenceStatus,
    '',
    '## Risks And Gaps',
    '',
    risksAndGaps,
    '',
    '## Next HR Actions',
    '',
    nextActions,
    '',
    '## Review State',
    '',
    `Accepted from reviewed artifact "${sanitizeInlineText(parsed.title)}".`,
    '',
    '## Accepted External Sections',
    '',
    acceptedExternalSectionList(parsed.sections),
  ].join('\n')
}

function parseArtifactMarkdown(markdown: string): { intro: string, sections: ParsedArtifactSection[], title: string | null } {
  const normalized = markdown.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  let title: string | null = null
  const headings: Array<{ heading: string, lineIndex: number }> = []

  lines.forEach((line, lineIndex) => {
    if (title === null && line.startsWith('# ') && !line.startsWith('## '))
      title = line.slice(2).trim() || null
    if (line.startsWith('## '))
      headings.push({ heading: line.slice(3).trim(), lineIndex })
  })

  const firstHeadingLine = headings[0]?.lineIndex ?? lines.length
  const intro = lines.slice(0, firstHeadingLine).join('\n').trim()
  const sections = headings.map((match, index) => {
    const bodyStartLine = match.lineIndex + 1
    const bodyEndLine = headings[index + 1]?.lineIndex ?? lines.length
    return {
      body: lines.slice(bodyStartLine, bodyEndLine).join('\n').trim(),
      heading: match.heading,
    }
  })

  return { intro, sections, title }
}

function isHrProfileArtifact(parsed: { sections: ParsedArtifactSection[], title: string | null }): boolean {
  const title = parsed.title?.toLowerCase() ?? ''
  if (title.includes('person profile'))
    return true
  const headings = parsed.sections.map(section => normalizeHeading(section.heading))
  return parsed.sections.some(section => normalizeHeading(section.heading) === 'confirmed facts')
    && headings.some(heading => heading === 'current profile summary' || heading === 'current profile snapshot' || heading === 'profile summary')
    && headings.some(heading => heading.includes('evidence'))
}

function inferProfileTargetName(title: string): string {
  const afterColon = title.split(':').slice(1).join(':').trim()
  const target = afterColon || title
    .replace(/\bperson profile\b/gi, '')
    .replace(/\bsnapshot\b/gi, '')
    .replace(/\bproposal\b/gi, '')
    .trim()
  return sanitizeInlineText(target || 'People Profile')
}

function sectionBody(sections: ParsedArtifactSection[], headings: string[]): string {
  const normalizedHeadings = new Set(headings.map(normalizeHeading))
  return sections.find(section => normalizedHeadings.has(normalizeHeading(section.heading)))?.body ?? ''
}

function acceptedExternalSectionList(sections: ParsedArtifactSection[]): string {
  const accepted = sections
    .filter(section => !HR_PROFILE_SECTION_ORDER.some(definition => normalizeHeading(definition.title) === normalizeHeading(section.heading)))
    .map(section => `- ${sanitizeInlineText(section.heading)}: accepted from reviewed artifact section.`)
  return accepted.length > 0 ? accepted.join('\n') : '- None.'
}

function stripArtifactMetadata(markdown: string): string {
  return markdown
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !/^Generated:/i.test(trimmed)
        && !/^Soul worker:/i.test(trimmed)
        && !/^Soul id:/i.test(trimmed)
        && !/^Capability(?: template)?:/i.test(trimmed)
        && !/^Output kind:/i.test(trimmed)
        && !/^Proposal status:/i.test(trimmed)
    })
    .join('\n')
    .trim()
}

function sanitizeAcceptedProfileBlock(markdown: string): string {
  return stripArtifactMetadata(markdown)
    .replace(/\bprofile-bound snapshot proposal\b/gi, 'accepted profile snapshot')
    .replace(/\bsnapshot proposal\b/gi, 'profile snapshot')
    .replace(/\bproposal-shaped\b/gi, 'profile-record-shaped')
    .replace(/\bproposals\b/gi, 'profile records')
    .replace(/\bproposal\b/gi, 'profile record')
    .replace(/\bproposed\b/gi, 'profile')
    .replace(/\bNo approved profile revision yet\b/gi, 'No substantive profile evidence is available yet')
    .replace(/\bno approved profile revision(?: exists| has been promoted yet)?\b/gi, 'no substantive profile evidence is available')
    .replace(/\bAgent outputs remain proposals until review\b/gi, 'Accepted profile content is recorded after review')
    .replace(/\bSession outputs remain proposals until review\b/gi, 'Accepted profile content is recorded after review')
    .replace(/\bHuman review required before any accepted profile promotion\b/gi, 'Accepted after human review')
    .replace(/\bThis artifact does not update `README\.md`\./gi, 'This README records the accepted profile state after human review.')
    .trim()
}

function sanitizeInlineText(value: string): string {
  return sanitizeAcceptedProfileBlock(value).replace(/\s+/g, ' ').trim()
}

function joinBlocks(blocks: string[]): string {
  return blocks.filter(block => block.trim()).join('\n\n')
}

function normalizeHeading(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ')
}

function replacePhrase(markdown: string, phrase: string, replacement: string): string {
  return markdown.replace(new RegExp(escapeRegExp(phrase), 'gi'), replacement)
}

function replacementForProposalPhrase(phrase: string): string {
  const normalized = phrase.toLowerCase()
  if (normalized.includes('no approved profile revision'))
    return 'no substantive profile evidence is available'
  if (normalized.includes('review'))
    return 'accepted after human review'
  return 'accepted profile state'
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
  const proposedKnownSectionCount = HR_PROFILE_SECTION_ORDER
    .filter(section => Boolean(getHrProfileSection(proposedReadme, section.id)))
    .length

  if (proposedKnownSectionCount === 0)
    return buildProfileRevisionDocumentChange(input)

  const sectionChanges = HR_PROFILE_SECTION_ORDER.flatMap((section) => {
    const currentMarkdown = getHrProfileSection(currentReadme, section.id)?.body ?? ''
    const proposedMarkdown = getHrProfileSection(proposedReadme, section.id)?.body ?? ''

    if (normalizeSectionMarkdown(currentMarkdown) === normalizeSectionMarkdown(proposedMarkdown))
      return []

    const status: ProfileRevisionSectionChangeStatus = normalizeSectionMarkdown(currentMarkdown) ? 'changed' : 'added'

    return [{
      currentMarkdown,
      id: section.id,
      proposedMarkdown,
      status,
      title: section.title,
    }]
  })

  if (sectionChanges.length > 0)
    return sectionChanges

  return buildProfileRevisionDocumentChange(input)
}

function buildProfileRevisionDocumentChange(input: {
  currentProfileContent: string
  proposedProfileContent: string
}): ProfileRevisionSectionChange[] {
  const currentMarkdown = normalizeSectionMarkdown(input.currentProfileContent)
  const proposedMarkdown = normalizeSectionMarkdown(input.proposedProfileContent)

  if (currentMarkdown === proposedMarkdown)
    return []

  return [{
    currentMarkdown,
    id: 'profileReadmeDocument',
    proposedMarkdown,
    status: currentMarkdown ? 'changed' : 'added',
    title: 'Profile README',
  }]
}

function normalizeSectionMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim()
}
