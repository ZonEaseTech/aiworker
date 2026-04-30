import type { AgentRunInput, ExecutorProvider } from '@zonease/aiworker-shared'

import { describe, expect, it } from 'bun:test'
import { buildIntentDecision, buildPromptCapabilityDecision } from './decisions'
import { evaluateQualityGate } from './quality-gate'

function context() {
  return {
    channel: 'web' as const,
    conversationId: 'conv-1',
    engine: 'http',
    sessionKey: 'web:acct:chat',
  }
}

function executor(response: string): ExecutorProvider {
  return {
    name: 'quality',
    health: async () => ({ name: 'quality', status: 'healthy', lastChecked: 'x' }),
    listTools: async () => [],
    run: (_input: AgentRunInput) => (async function* () {
      yield { type: 'assistant_message_delta' as const, delta: response }
    })(),
  }
}

const intentDecision = buildIntentDecision(context(), {
  confidence: 0.8,
  intent: 'answer',
  qualityProfile: 'default',
  reason: 'test',
  requiredContext: ['recent_history'],
  risk: 'low',
  sessionAction: 'continue',
  source: 'intent-heuristic',
})

const capabilityDecision = buildPromptCapabilityDecision({
  ...context(),
  availableSkillCount: 0,
  deniedCapabilities: [],
  reason: 'test',
  selectedBuiltins: [],
  selectedMcpTools: [],
  selectedSkills: [],
})

describe('quality gate', () => {
  it('passes a concrete heuristic answer', async () => {
    const gate = await evaluateQualityGate({
      assistantText: 'Here is a concrete answer with enough detail.',
      capabilityDecision,
      context: context(),
      evaluator: 'heuristic',
      executor: executor('{}'),
      intentDecision,
      mode: 'observe',
      model: undefined,
      notifyActivity: () => {},
      requestText: 'question',
      signal: new AbortController().signal,
      threshold: undefined,
      workspacePath: undefined,
    })
    expect(gate.status).toBe('passed')
    expect(gate.action).toBe('pass')
    expect(gate.score).toBeGreaterThanOrEqual(5)
  })

  it('recommends repair in retry mode for too-short answers', async () => {
    const gate = await evaluateQualityGate({
      assistantText: 'ok',
      capabilityDecision,
      context: context(),
      evaluator: 'heuristic',
      executor: executor('{}'),
      intentDecision,
      mode: 'retry',
      model: undefined,
      notifyActivity: () => {},
      requestText: 'question',
      signal: new AbortController().signal,
      threshold: 7,
      workspacePath: undefined,
    })
    expect(gate.status).toBe('failed')
    expect(gate.action).toBe('repair')
    expect(gate.missing.length).toBeGreaterThan(0)
  })

  it('accepts strict JSON from the LLM evaluator', async () => {
    const gate = await evaluateQualityGate({
      assistantText: 'draft',
      capabilityDecision,
      context: context(),
      evaluator: 'llm',
      executor: executor(JSON.stringify({
        score: 3,
        threshold: 8,
        dimensions: { completeness: 3 },
        missing: ['detail'],
        suggestions: ['expand'],
        action: 'block',
        reason: 'too weak',
      })),
      intentDecision,
      mode: 'block',
      model: undefined,
      notifyActivity: () => {},
      requestText: 'question',
      signal: new AbortController().signal,
      threshold: undefined,
      workspacePath: undefined,
    })
    expect(gate.evaluator).toBe('llm')
    expect(gate.action).toBe('block')
    expect(gate.missing).toEqual(['detail'])
  })
})
