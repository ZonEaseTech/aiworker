export type ProfilePromotionMarkdownSource = 'artifact' | 'explicit' | 'fenced-draft'

export interface ProfilePromotionIssue {
  code: 'empty_profile_markdown' | 'missing_fenced_draft' | 'proposal_state_language'
  message: string
  phrase?: string
}

export type ProfilePromotionPreparationResult
  = | {
    ok: true
    profileMarkdown: string
    source: ProfilePromotionMarkdownSource
  }
  | {
    issues: ProfilePromotionIssue[]
    ok: false
  }

const PROFILE_README_FENCE_RE = /^```(?:markdown\s+)?aiworker-profile-readme\s*$/i

const PROPOSAL_STATE_PHRASES = [
  'No approved profile revision yet',
  'pending human review',
  'pending review',
  'promotion requested',
]

export function extractProfileReadmeDraft(content: string): string | null {
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const opener = lines[index]?.trim() ?? ''
    if (!PROFILE_README_FENCE_RE.test(opener))
      continue

    const closeIndex = lines.findIndex((line, candidateIndex) => candidateIndex > index && line.trim() === '```')
    if (closeIndex > index)
      return normalizeProfileMarkdown(lines.slice(index + 1, closeIndex).join('\n')) || null
  }
  return null
}

export function prepareProfileMarkdownForPromotion(input: {
  artifactMarkdown?: string
  profileMarkdown?: string
  requireFencedDraft?: boolean
}): ProfilePromotionPreparationResult {
  if (typeof input.profileMarkdown === 'string') {
    const profileMarkdown = normalizeProfileMarkdown(input.profileMarkdown)
    const issues = validatePromotableProfileMarkdown(profileMarkdown)
    return issues.length > 0 ? { issues, ok: false } : { ok: true, profileMarkdown, source: 'explicit' }
  }

  const artifactMarkdown = input.artifactMarkdown ?? ''
  const fencedDraft = extractProfileReadmeDraft(artifactMarkdown)
  if (fencedDraft) {
    const issues = validatePromotableProfileMarkdown(fencedDraft)
    return issues.length > 0 ? { issues, ok: false } : { ok: true, profileMarkdown: fencedDraft, source: 'fenced-draft' }
  }

  if (input.requireFencedDraft) {
    return {
      issues: [{
        code: 'missing_fenced_draft',
        message: 'Profile promotion requires an aiworker-profile-readme fenced draft or an explicit reviewed profile markdown file.',
      }],
      ok: false,
    }
  }

  const profileMarkdown = normalizeProfileMarkdown(artifactMarkdown)
  const issues = validatePromotableProfileMarkdown(profileMarkdown)
  return issues.length > 0 ? { issues, ok: false } : { ok: true, profileMarkdown, source: 'artifact' }
}

export function validatePromotableProfileMarkdown(markdown: string): ProfilePromotionIssue[] {
  const normalized = normalizeProfileMarkdown(markdown)
  const issues: ProfilePromotionIssue[] = []
  if (!normalized) {
    issues.push({
      code: 'empty_profile_markdown',
      message: 'Profile promotion requires non-empty accepted profile markdown.',
    })
  }

  const lower = normalized.toLowerCase()
  for (const phrase of PROPOSAL_STATE_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      issues.push({
        code: 'proposal_state_language',
        message: `Accepted profile markdown must not contain proposal-state language: ${phrase}`,
        phrase,
      })
    }
  }
  return issues
}

export function formatProfilePromotionIssues(issues: ProfilePromotionIssue[]): string {
  return issues.map(issue => issue.message).join(' ')
}

function normalizeProfileMarkdown(markdown: string): string {
  return markdown.trim().replace(/\r\n/g, '\n')
}
