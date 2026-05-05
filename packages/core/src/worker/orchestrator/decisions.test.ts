import { describe, expect, it } from 'bun:test'

import {
  buildDefaultIntentDecision,
  buildDefaultQualityGate,
  buildIntentDecision,
  buildPromptCapabilityDecision,
  buildQualityGatePayload,
  ORCHESTRATOR_DECISION_SCHEMA_VERSION,
  resolveQualityGateMode,
} from './decisions'

function context() {
  return {
    channel: 'web' as const,
    conversationId: 'conv-1',
    engine: 'http',
    sessionKey: 'web:acct:chat',
  }
}

describe('decisions truthfulness contract (PLAN-116)', () => {
  it('schema version bumped to 2 for the truthfulness payload extension', () => {
    expect(ORCHESTRATOR_DECISION_SCHEMA_VERSION).toBe(2)
  })

  it('default intent decision is observe_only with evaluator=none', () => {
    const decision = buildDefaultIntentDecision(context())
    expect(decision.mode).toBe('observe_only')
    expect(decision.source).toBe('s1-default')
    expect(decision.evaluator).toBe('none')
  })

  it('built intent decision carries evaluator and templateId from the caller', () => {
    const decision = buildIntentDecision(context(), {
      attempt: 1,
      confidence: 0.7,
      evaluator: 'llm',
      intent: 'answer',
      qualityProfile: 'default',
      reason: 'r',
      requiredContext: ['recent_history'],
      risk: 'low',
      sessionAction: 'continue',
      source: 'intent-llm',
      templateId: 'intent-classifier-v1',
    })
    expect(decision.mode).toBe('observe_only')
    expect(decision.evaluator).toBe('llm')
    expect(decision.templateId).toBe('intent-classifier-v1')
    expect(decision.attempt).toBe(1)
  })

  it('capability decision is observe_only and tagged advisory', () => {
    const decision = buildPromptCapabilityDecision({
      ...context(),
      availableSkillCount: 0,
      deniedCapabilities: [],
      reason: 'advisory',
      selectedBuiltins: [],
      selectedMcpTools: [],
      selectedSkills: [],
    })
    expect(decision.mode).toBe('observe_only')
    expect(decision.source).toBe('capability-registry')
  })

  it('default quality gate stays observe_only', () => {
    const gate = buildDefaultQualityGate({ ...context(), assistantText: '' })
    expect(gate.mode).toBe('observe_only')
    expect(gate.evaluator).toBe('none')
  })

  it('buildQualityGatePayload accepts an explicit mode override', () => {
    const gate = buildQualityGatePayload(
      context(),
      {
        action: 'repair',
        dimensions: {},
        evaluator: 'heuristic',
        finalAnswerLength: 1,
        gateMode: 'retry',
        missing: [],
        reason: 'low score',
        score: 2,
        status: 'failed',
        suggestions: [],
        threshold: 5,
      },
      { mode: 'enforced' },
    )
    expect(gate.mode).toBe('enforced')
  })

  describe('resolveQualityGateMode truth table', () => {
    const allActions = ['pass', 'repair', 'warn', 'block'] as const
    const allConfigured = ['observe', 'warn', 'retry', 'block'] as const

    it('returns enforced only when configured retry + action repair', () => {
      for (const cfg of allConfigured) {
        for (const action of allActions) {
          const expected = (cfg === 'retry' && action === 'repair')
            || (cfg === 'block' && action === 'block')
            ? 'enforced'
            : 'observe_only'
          expect({ cfg, action, mode: resolveQualityGateMode(cfg, action) }).toEqual({ cfg, action, mode: expected })
        }
      }
    })

    it('treats undefined configured mode as observe_only', () => {
      for (const action of allActions)
        expect(resolveQualityGateMode(undefined, action)).toBe('observe_only')
    })
  })
})
