import type { AgentRunInput, ExecutorProvider } from '@zonease/aiworker-shared'

import { describe, expect, it } from 'bun:test'
import { classifyIntentHeuristic, classifyIntentWithExecutor } from './intent-classifier'

function context() {
  return {
    channel: 'web' as const,
    conversationId: 'conv-1',
    engine: 'http',
    sessionKey: 'web:acct:chat',
  }
}

function classification(text: string) {
  return {
    envelopeText: text,
    priorSummary: null,
    recentMessages: [],
    sessionAction: 'continue' as const,
    sessionReason: 'same-topic',
  }
}

function jsonExecutor(response: string): ExecutorProvider {
  return {
    name: 'json',
    health: async () => ({ name: 'json', status: 'healthy', lastChecked: 'x' }),
    listTools: async () => [],
    run: (_input: AgentRunInput) => (async function* () {
      yield { type: 'assistant_message_delta' as const, delta: response }
    })(),
  }
}

function sequencedExecutor(responses: string[]): { provider: ExecutorProvider, callCount: () => number } {
  let calls = 0
  const provider: ExecutorProvider = {
    name: 'sequenced',
    health: async () => ({ name: 'sequenced', status: 'healthy', lastChecked: 'x' }),
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

describe('intent classifier', () => {
  it('classifies code work with workspace and skill context', () => {
    const decision = classifyIntentHeuristic(context(), classification('请修复这个 bug，跑测试并提交'))
    expect(decision.intent).toBe('code_work')
    expect(decision.risk).toBe('medium')
    expect(decision.requiredContext).toContain('workspace')
    expect(decision.requiredContext).toContain('skill_load')
    expect(decision.qualityProfile).toBe('default')
    expect(decision.source).toBe('intent-heuristic')
  })

  it('classifies high-risk config/admin turns', () => {
    const decision = classifyIntentHeuristic(context(), classification('部署到生产，并检查 secret token 配置'))
    expect(decision.intent).toBe('config_admin')
    expect(decision.risk).toBe('high')
    expect(decision.qualityProfile).toBe('high_stakes')
    expect(decision.requiredContext).toContain('workspace')
  })

  it('accepts strict JSON from the LLM evaluator', async () => {
    const decision = await classifyIntentWithExecutor({
      classification: classification('search latest docs'),
      context: context(),
      executor: jsonExecutor(JSON.stringify({
        intent: 'research',
        risk: 'low',
        requiredContext: ['recent_history', 'memory_search'],
        qualityProfile: 'default',
        confidence: 0.82,
        reason: 'research request',
      })),
      model: undefined,
      notifyActivity: () => {},
      signal: new AbortController().signal,
      workspacePath: undefined,
    })
    expect(decision.intent).toBe('research')
    expect(decision.confidence).toBe(0.82)
    expect(decision.source).toBe('intent-llm')
  })

  it('retries once with a stricter prompt before falling back', async () => {
    const { provider, callCount } = sequencedExecutor([
      'React 19 introduces useTransition...', // first attempt prose
      JSON.stringify({
        intent: 'research',
        risk: 'low',
        requiredContext: ['recent_history', 'memory_search'],
        qualityProfile: 'default',
        confidence: 0.7,
        reason: 'recovered',
      }),
    ])
    const decision = await classifyIntentWithExecutor({
      classification: classification('React 19 useTransition 行为'),
      context: context(),
      executor: provider,
      model: undefined,
      notifyActivity: () => {},
      signal: new AbortController().signal,
      workspacePath: undefined,
    })
    expect(callCount()).toBe(2)
    expect(decision.source).toBe('intent-llm')
    expect(decision.intent).toBe('research')
  })

  it('falls back to heuristic with llm-retry-exhausted reason when both attempts fail', async () => {
    const { provider, callCount } = sequencedExecutor(['not json', 'still not json'])
    const decision = await classifyIntentWithExecutor({
      classification: classification('制定一个方案'),
      context: context(),
      executor: provider,
      model: undefined,
      notifyActivity: () => {},
      signal: new AbortController().signal,
      workspacePath: undefined,
    })
    expect(callCount()).toBe(2)
    expect(decision.intent).toBe('planning')
    expect(decision.source).toBe('intent-fallback')
    expect(decision.confidence).toBeLessThanOrEqual(0.4)
    expect(decision.reason).toContain('llm-retry-exhausted')
  })
})
