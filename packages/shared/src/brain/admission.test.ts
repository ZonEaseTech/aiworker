import type { BrainAdmissionProposal } from './admission'

import { describe, expect, it } from 'bun:test'

import {
  brainAdmissionMemoryAddPayloadSchema,
  brainAdmissionProposalInputSchema,
  brainAdmissionProposalSchema,
  isMaterializedProposalKind,
  redactBrainAdmissionProposal,
  redactSecretLikeValues,
} from './admission'

const NOW = '2026-05-04T16:10:00.000Z'

function proposal(overrides: Partial<BrainAdmissionProposal> = {}): BrainAdmissionProposal {
  return {
    confidence: 0.8,
    createdAt: NOW,
    evidence: [
      { at: NOW, kind: 'observation', ref: 'evolution-2026-05-04' },
    ],
    id: 'prop-2026-05-04-001',
    kind: 'memory-add',
    risk: 'low',
    rollback: 'Delete the new line from MEMORY.md before next reload.',
    soulId: 'developer',
    status: 'pending',
    summary: 'User repeatedly asks for explicit dry-run before destructive shell commands',
    target: '.aiworker/MEMORY.md',
    updatedAt: NOW,
    ...overrides,
  }
}

describe('brain admission proposal schema', () => {
  it('parses a minimal pending proposal', () => {
    expect(brainAdmissionProposalSchema.safeParse(proposal()).success).toBe(true)
  })

  it('rejects malformed kind / soulId / id', () => {
    expect(brainAdmissionProposalSchema.safeParse(proposal({ kind: 'Memory Add' })).success).toBe(false)
    expect(brainAdmissionProposalSchema.safeParse(proposal({ soulId: 'Developer' })).success).toBe(false)
    expect(brainAdmissionProposalSchema.safeParse(proposal({ id: 'BAD ID' })).success).toBe(false)
  })

  it('rejects out-of-range confidence', () => {
    expect(brainAdmissionProposalSchema.safeParse(proposal({ confidence: -0.1 })).success).toBe(false)
    expect(brainAdmissionProposalSchema.safeParse(proposal({ confidence: 1.1 })).success).toBe(false)
  })

  it('rejects unknown risk / status', () => {
    expect(brainAdmissionProposalSchema.safeParse({ ...proposal(), risk: 'critical' }).success).toBe(false)
    expect(brainAdmissionProposalSchema.safeParse({ ...proposal(), status: 'cancelled' }).success).toBe(false)
  })

  it('rejects empty rollback / summary', () => {
    expect(brainAdmissionProposalSchema.safeParse(proposal({ rollback: '' })).success).toBe(false)
    expect(brainAdmissionProposalSchema.safeParse(proposal({ summary: '' })).success).toBe(false)
  })
})

describe('brainAdmissionProposalInputSchema defaults', () => {
  it('defaults risk to high when not provided', () => {
    const result = brainAdmissionProposalInputSchema.safeParse({
      confidence: 0.5,
      id: 'p',
      kind: 'memory-add',
      rollback: 'manual revert',
      soulId: 'developer',
      summary: 'add a memory',
      target: '.aiworker/MEMORY.md',
    })
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.risk).toBe('high')
  })

  it('preserves explicit low / medium risk', () => {
    const result = brainAdmissionProposalInputSchema.safeParse({
      confidence: 0.5,
      id: 'p',
      kind: 'memory-add',
      risk: 'low',
      rollback: 'manual revert',
      soulId: 'developer',
      summary: 'add a memory',
      target: '.aiworker/MEMORY.md',
    })
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data.risk).toBe('low')
  })
})

describe('brainAdmissionMemoryAddPayloadSchema', () => {
  it('accepts a body-only payload (no topic)', () => {
    expect(brainAdmissionMemoryAddPayloadSchema.safeParse({ body: 'note line' }).success).toBe(true)
  })

  it('accepts topic + indexEntry combo', () => {
    expect(brainAdmissionMemoryAddPayloadSchema.safeParse({
      body: '## title\nsome content',
      indexEntry: '- [Title](dry-run-policy.md) — operator must approve destructive shell',
      topic: 'dry-run-policy',
    }).success).toBe(true)
  })

  it('rejects topic with whitespace', () => {
    expect(brainAdmissionMemoryAddPayloadSchema.safeParse({
      body: 'note',
      topic: 'has space',
    }).success).toBe(false)
  })

  it('rejects oversize body', () => {
    expect(brainAdmissionMemoryAddPayloadSchema.safeParse({
      body: 'x'.repeat(20_001),
    }).success).toBe(false)
  })
})

describe('isMaterializedProposalKind', () => {
  it.each([
    ['memory-add', true],
    ['brain-skill-add', false],
    ['policy-update', false],
    ['unknown', false],
  ] as const)('reports %s as materialized=%s', (kind, expected) => {
    expect(isMaterializedProposalKind(kind)).toBe(expected)
  })
})

describe('redactSecretLikeValues', () => {
  it('replaces values whose key matches secret-like patterns', () => {
    const value = redactSecretLikeValues({
      apiKey: 'sk-live-1234567890',
      api_key: 'k-1',
      authorization: 'Bearer abc',
      auth: 'Basic abc',
      name: 'public',
      nested: {
        password: 'p',
        ok: 'kept',
        token: 't',
      },
    })
    expect(value).toEqual({
      apiKey: '<redacted>',
      api_key: '<redacted>',
      authorization: '<redacted>',
      auth: '<redacted>',
      name: 'public',
      nested: {
        password: '<redacted>',
        ok: 'kept',
        token: '<redacted>',
      },
    })
  })

  it('walks arrays', () => {
    const value = redactSecretLikeValues([{ token: 'a' }, { name: 'ok' }])
    expect(value).toEqual([{ token: '<redacted>' }, { name: 'ok' }])
  })
})

describe('redactBrainAdmissionProposal', () => {
  it('redacts secret-like values inside evidence + payload, keeps summary / rollback / target', () => {
    const original = proposal({
      evidence: [
        { at: NOW, kind: 'tool-call', summary: 'public summary', notes: 'long context', ref: 'tool-1' },
      ],
      payload: {
        body: 'memory body',
        connection: { token: 'super-secret', user: 'alice' },
      },
      rollback: 'rollback text references token in human prose, kept verbatim',
      summary: 'summary text references API_KEY in human prose, kept verbatim',
    })

    const redacted = redactBrainAdmissionProposal(original)
    expect(redacted.summary).toBe(original.summary)
    expect(redacted.rollback).toBe(original.rollback)
    expect(redacted.target).toBe(original.target)
    expect(redacted.evidence[0]?.summary).toBe('public summary')
    expect(redacted.evidence[0]?.notes).toBe('long context')
    expect(redacted.payload).toEqual({
      body: 'memory body',
      connection: { token: '<redacted>', user: 'alice' },
    })
  })

  it('passes through proposals without payload', () => {
    const original = proposal()
    const redacted = redactBrainAdmissionProposal(original)
    expect(redacted.payload).toBeUndefined()
  })
})
