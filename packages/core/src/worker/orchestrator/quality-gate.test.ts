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

function sequencedExecutor(responses: string[]): { provider: ExecutorProvider, callCount: () => number } {
  let calls = 0
  const provider: ExecutorProvider = {
    name: 'sequenced-quality',
    health: async () => ({ name: 'sequenced-quality', status: 'healthy', lastChecked: 'x' }),
    listTools: async () => [],
    run: (_input: AgentRunInput) => {
      const response = responses[calls] ?? responses.at(-1) ?? ''
      calls += 1
      return (async function* () {
        yield { type: 'assistant_message_delta' as const, delta: response }
      })()
    },
  }
  return { provider, callCount: () => calls }
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

  it('retries once with a stricter prompt when LLM emits prose', async () => {
    const { provider, callCount } = sequencedExecutor([
      'The answer looks fine to me.',
      JSON.stringify({
        score: 7,
        threshold: 5,
        dimensions: { completeness: 7 },
        missing: [],
        suggestions: [],
        action: 'pass',
        reason: 'recovered',
      }),
    ])
    const gate = await evaluateQualityGate({
      assistantText: 'detailed answer',
      capabilityDecision,
      context: context(),
      evaluator: 'llm',
      executor: provider,
      intentDecision,
      mode: 'observe',
      model: undefined,
      notifyActivity: () => {},
      requestText: 'question',
      signal: new AbortController().signal,
      threshold: undefined,
      workspacePath: undefined,
    })
    expect(callCount()).toBe(2)
    expect(gate.evaluator).toBe('llm')
    expect(gate.score).toBe(7)
    expect(gate.action).toBe('pass')
  })

  it('falls back to heuristic with llm-retry-exhausted when both attempts fail', async () => {
    const { provider, callCount } = sequencedExecutor(['not json', 'still prose'])
    const gate = await evaluateQualityGate({
      assistantText: 'detailed answer',
      capabilityDecision,
      context: context(),
      evaluator: 'llm',
      executor: provider,
      intentDecision,
      mode: 'observe',
      model: undefined,
      notifyActivity: () => {},
      requestText: 'question',
      signal: new AbortController().signal,
      threshold: undefined,
      workspacePath: undefined,
    })
    expect(callCount()).toBe(2)
    expect(gate.evaluator).toBe('heuristic')
    expect(gate.reason).toContain('llm-retry-exhausted')
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
