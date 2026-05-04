import { describe, expect, it } from 'bun:test'

import {
  brainBriefRequestSchema,
  brainBriefSchema,
  DEFAULT_BRAIN_BRIEF_TOKEN_BUDGET,
  estimateBrainBriefTokens,
} from './brief'

describe('BrainBriefRequest schema', () => {
  it('accepts a minimal request with only task', () => {
    expect(brainBriefRequestSchema.safeParse({ task: 'fix login bug' }).success).toBe(true)
  })

  it('accepts a fully-specified request', () => {
    const result = brainBriefRequestSchema.safeParse({
      artifactRefs: ['candidate-c-001', 'src-bus'],
      executor: 'codex',
      risk: 'medium',
      scopeId: 'backend-hire-q3',
      soulId: 'hr-recruiting',
      task: 'screen candidate c-001',
      tokenBudget: 6000,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty task', () => {
    expect(brainBriefRequestSchema.safeParse({ task: '' }).success).toBe(false)
  })

  it('rejects out-of-range token budgets', () => {
    expect(brainBriefRequestSchema.safeParse({ task: 'x', tokenBudget: 50 }).success).toBe(false)
    expect(brainBriefRequestSchema.safeParse({ task: 'x', tokenBudget: 60_000 }).success).toBe(false)
  })

  it('rejects malformed risk values', () => {
    expect(brainBriefRequestSchema.safeParse({ task: 'x', risk: 'critical' }).success).toBe(false)
  })
})

describe('BrainBrief schema', () => {
  it('accepts a brief with sections + dropped + warnings', () => {
    const result = brainBriefSchema.safeParse({
      compiledAt: '2026-05-04T17:00:00.000Z',
      droppedSections: [{ estimatedTokens: 200, id: 'rollup', reason: 'token budget exceeded' }],
      sections: [{
        body: 'Worker dev persona',
        id: 'agent',
        protected: false,
        source: 'agent-doc',
        tokens: 200,
      }, {
        body: 'High-risk approval required',
        id: 'risk-policy',
        protected: true,
        source: 'risk-policy',
        tokens: 100,
      }],
      soulId: 'developer',
      task: 'fix login bug',
      tokensBudget: 4000,
      tokensUsed: 300,
      warnings: [],
    })
    expect(result.success).toBe(true)
  })

  it('rejects malformed section ids', () => {
    expect(brainBriefSchema.safeParse({
      compiledAt: '2026-05-04T17:00:00.000Z',
      droppedSections: [],
      sections: [{
        body: 'b',
        id: 'AGENT_DOC',
        protected: false,
        source: 'agent-doc',
        tokens: 1,
      }],
      soulId: 'developer',
      task: 'x',
      tokensBudget: 100,
      tokensUsed: 1,
      warnings: [],
    }).success).toBe(false)
  })
})

describe('estimateBrainBriefTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateBrainBriefTokens('')).toBe(0)
  })

  it('estimates ~1 token per 4 characters with a min of 1', () => {
    expect(estimateBrainBriefTokens('a')).toBe(1)
    expect(estimateBrainBriefTokens('1234')).toBe(1)
    expect(estimateBrainBriefTokens('12345')).toBe(2)
    expect(estimateBrainBriefTokens('a'.repeat(400))).toBe(100)
  })

  it('exposes a stable default budget that is conservative for chat windows', () => {
    expect(DEFAULT_BRAIN_BRIEF_TOKEN_BUDGET).toBeGreaterThanOrEqual(2000)
    expect(DEFAULT_BRAIN_BRIEF_TOKEN_BUDGET).toBeLessThanOrEqual(8000)
  })
})
