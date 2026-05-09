import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { closeWorkerDb, initWorkerDb, runWorkerMigrations } from '@zonease/aiworker-storage-sqlite/worker'
import { beforeEach, describe, expect, it } from 'bun:test'

import {
  getDecisionPipelineSnapshot,
  recordConversationClassifier,
  recordIntentDecision,
  recordQualityGate,
  resetDecisionPipelineStats,
} from './decision-pipeline-stats'
import {
  buildDefaultIntentDecision,
  buildIntentDecision,
  buildQualityGatePayload,
} from './decisions'

function context() {
  return {
    channel: 'web' as const,
    conversationId: 'conv-1',
    engine: 'http',
    sessionKey: 'web:acct:chat',
  }
}

beforeEach(() => {
  resetDecisionPipelineStats()
})

describe('decision pipeline ring buffer (PLAN-116)', () => {
  it('reports default snapshot when buffers are empty', () => {
    const snap = getDecisionPipelineSnapshot()
    expect(snap.intentClassifier.evaluator).toBe('heuristic')
    expect(snap.intentClassifier.mode).toBe('observe_only')
    expect(snap.intentClassifier.recent.windowSize).toBe(50)
    expect(snap.intentClassifier.recent.samples).toBe(0)
    expect(snap.intentClassifier.recent.fallbackRate).toBe(0)
    expect(snap.intentClassifier.recent.lastFallbackReason).toBeNull()
    expect(snap.capabilityRouter.mode).toBe('observe_only')
    expect(snap.qualityGate.evaluator).toBe('heuristic')
    expect(snap.qualityGate.configuredMode).toBe('observe')
    expect(snap.conversationClassifier.enabled).toBe(false)
    expect(snap.conversationClassifier.recent.fallbackByReason).toEqual({})
  })

  it('reflects config evaluator and threshold on snapshot', () => {
    const snap = getDecisionPipelineSnapshot({
      intentEvaluator: 'llm',
      qualityEvaluator: 'llm',
      qualityMode: 'retry',
      qualityThreshold: 8,
      conversationClassifierEnabled: false,
    })
    expect(snap.intentClassifier.evaluator).toBe('llm')
    expect(snap.qualityGate.evaluator).toBe('llm')
    expect(snap.qualityGate.configuredMode).toBe('retry')
    expect(snap.qualityGate.threshold).toBe(8)
    expect(snap.conversationClassifier.enabled).toBe(false)
  })

  it('counts intent fallback rate and surfaces lastFallbackReason', () => {
    recordIntentDecision(buildDefaultIntentDecision(context()))
    recordIntentDecision(buildIntentDecision(context(), {
      attempt: 2,
      confidence: 0.3,
      evaluator: 'heuristic',
      intent: 'answer',
      parseError: 'unexpected token',
      qualityProfile: 'default',
      reason: 'llm-retry-exhausted: unexpected token',
      requiredContext: ['recent_history'],
      risk: 'low',
      sessionAction: 'continue',
      source: 'intent-fallback',
      templateId: 'intent-classifier-v1',
    }))
    recordIntentDecision(buildIntentDecision(context(), {
      confidence: 0.7,
      evaluator: 'heuristic',
      intent: 'answer',
      qualityProfile: 'default',
      reason: 'heuristic',
      requiredContext: ['recent_history'],
      risk: 'low',
      sessionAction: 'continue',
      source: 'intent-heuristic',
      templateId: 'intent-classifier-v1',
    }))
    const snap = getDecisionPipelineSnapshot()
    expect(snap.intentClassifier.recent.samples).toBe(3)
    expect(snap.intentClassifier.recent.fallbackRate).toBeCloseTo(1 / 3)
    expect(snap.intentClassifier.recent.lastFallbackReason).toContain('llm-retry-exhausted')
  })

  it('counts quality gate llm-retry-exhausted as fallback', () => {
    recordQualityGate(buildQualityGatePayload(context(), {
      action: 'pass',
      dimensions: {},
      evaluator: 'llm',
      finalAnswerLength: 10,
      gateMode: 'observe',
      missing: [],
      reason: 'llm quality gate',
      score: 8,
      status: 'passed',
      suggestions: [],
      threshold: 5,
    }))
    recordQualityGate(buildQualityGatePayload(context(), {
      action: 'pass',
      dimensions: {},
      evaluator: 'heuristic',
      finalAnswerLength: 10,
      gateMode: 'observe',
      missing: [],
      reason: 'llm-retry-exhausted: bad json',
      score: 5,
      status: 'passed',
      suggestions: [],
      threshold: 5,
    }))
    const snap = getDecisionPipelineSnapshot()
    expect(snap.qualityGate.recent.samples).toBe(2)
    expect(snap.qualityGate.recent.fallbackRate).toBeCloseTo(0.5)
    expect(snap.qualityGate.recent.lastFallbackReason).toContain('llm-retry-exhausted')
  })

  it('histograms conversation classifier fallback by reason', () => {
    recordConversationClassifier({ continue: true, reason: 'non-json-classifier-output', source: 'classifier-fallback', evaluator: 'heuristic' })
    recordConversationClassifier({ continue: true, reason: 'non-json-classifier-output', source: 'classifier-fallback', evaluator: 'heuristic' })
    recordConversationClassifier({ continue: true, reason: 'malformed-response', source: 'classifier-fallback', evaluator: 'heuristic' })
    recordConversationClassifier({ continue: false, reason: 'topic-changed', source: 'classifier-llm', evaluator: 'llm' })
    const snap = getDecisionPipelineSnapshot()
    expect(snap.conversationClassifier.recent.samples).toBe(4)
    expect(snap.conversationClassifier.recent.fallbackRate).toBeCloseTo(3 / 4)
    expect(snap.conversationClassifier.recent.fallbackByReason).toEqual({
      'non-json-classifier-output': 2,
      'malformed-response': 1,
    })
  })

  it('caps the buffer at the documented window size', () => {
    for (let i = 0; i < 60; i += 1) {
      recordIntentDecision(buildIntentDecision(context(), {
        confidence: 0.5,
        evaluator: 'heuristic',
        intent: 'answer',
        qualityProfile: 'default',
        reason: 'heuristic',
        requiredContext: ['recent_history'],
        risk: 'low',
        sessionAction: 'continue',
        source: 'intent-heuristic',
        templateId: 'intent-classifier-v1',
      }))
    }
    const snap = getDecisionPipelineSnapshot()
    expect(snap.intentClassifier.recent.samples).toBe(50)
  })

  it('loads persisted CLI-run samples after the process-local buffer resets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-decision-stats-'))
    closeWorkerDb()
    initWorkerDb(join(dir, 'worker.db'))
    runWorkerMigrations()
    try {
      recordIntentDecision(buildIntentDecision(context(), {
        confidence: 0.5,
        evaluator: 'heuristic',
        intent: 'answer',
        qualityProfile: 'default',
        reason: 'heuristic persisted',
        requiredContext: ['recent_history'],
        risk: 'low',
        sessionAction: 'continue',
        source: 'intent-heuristic',
        templateId: 'intent-classifier-v1',
      }))
      resetDecisionPipelineStats()
      const snap = getDecisionPipelineSnapshot()
      expect(snap.intentClassifier.recent.samples).toBe(1)
      expect(snap.intentClassifier.recent.fallbackRate).toBe(0)
    }
    finally {
      closeWorkerDb()
    }
  })
})
