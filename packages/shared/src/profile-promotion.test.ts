import { describe, expect, it } from 'bun:test'

import {
  extractProfileReadmeDraft,
  formatProfilePromotionIssues,
  prepareProfileMarkdownForPromotion,
  validatePromotableProfileMarkdown,
} from './profile-promotion'

describe('profile promotion markdown helpers', () => {
  it('extracts aiworker-profile-readme fenced drafts from proposal artifacts', () => {
    const draft = extractProfileReadmeDraft([
      '# Proposal',
      '',
      '```aiworker-profile-readme',
      '# Accepted Ada Profile',
      '',
      'Reviewed profile summary.',
      '```',
      '',
      '## Review Decision',
      'Approve.',
    ].join('\n'))

    expect(draft).toBe('# Accepted Ada Profile\n\nReviewed profile summary.')
  })

  it('prepares the fenced draft when artifact markdown contains proposal notes', () => {
    const result = prepareProfileMarkdownForPromotion({
      artifactMarkdown: [
        '# Profile Update Proposal',
        '',
        'Review decision requested outside the accepted profile.',
        '',
        '```markdown aiworker-profile-readme',
        '# Accepted Ada Profile',
        '',
        '## Review State',
        '',
        'Accepted baseline profile established from available evidence.',
        '```',
      ].join('\n'),
      requireFencedDraft: true,
    })

    expect(result).toEqual({
      ok: true,
      profileMarkdown: '# Accepted Ada Profile\n\n## Review State\n\nAccepted baseline profile established from available evidence.',
      source: 'fenced-draft',
    })
  })

  it('requires a fenced draft when configured for artifact promotion', () => {
    const result = prepareProfileMarkdownForPromotion({
      artifactMarkdown: '# Profile Update Proposal\n\nNo fence here.',
      requireFencedDraft: true,
    })

    expect(result).toMatchObject({
      issues: [{ code: 'missing_fenced_draft' }],
      ok: false,
    })
  })

  it('allows explicit reviewed profile markdown without a fenced draft', () => {
    const result = prepareProfileMarkdownForPromotion({
      artifactMarkdown: '# Proposal without fence',
      profileMarkdown: '# Accepted Ada Profile\n\nReviewed profile summary.',
      requireFencedDraft: true,
    })

    expect(result).toEqual({
      ok: true,
      profileMarkdown: '# Accepted Ada Profile\n\nReviewed profile summary.',
      source: 'explicit',
    })
  })

  it('rejects proposal-state language inside accepted README drafts', () => {
    const issues = validatePromotableProfileMarkdown([
      '# Accepted Ada Profile',
      '',
      '## Review State',
      '',
      'Promotion requested and pending human review.',
    ].join('\n'))

    expect(issues.map(issue => issue.code)).toEqual(['proposal_state_language', 'proposal_state_language'])
    expect(formatProfilePromotionIssues(issues)).toContain('pending human review')
  })

  it('rejects review-ready proposal wording copied into accepted README drafts', () => {
    const result = prepareProfileMarkdownForPromotion({
      artifactMarkdown: [
        '# Profile Update Proposal',
        '',
        '```aiworker-profile-readme',
        '# Ada Lovelace Product Lead',
        '',
        '> Accepted People Profile for this HR workspace. Agent outputs remain proposals until review.',
        '',
        '## Review State',
        '',
        'Accepted profile revision ready for HR review.',
        '```',
      ].join('\n'),
      requireFencedDraft: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map(issue => issue.phrase)).toEqual(expect.arrayContaining([
        'Agent outputs remain proposals until review',
        'ready for HR review',
      ]))
      expect(formatProfilePromotionIssues(result.issues)).toContain('ready for HR review')
    }
  })
})
