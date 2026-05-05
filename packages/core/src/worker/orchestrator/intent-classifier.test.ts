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
    // PLAN-116 truthfulness: heuristic decisions stay observe_only, mark
    // evaluator and templateId so consumers can distinguish from LLM.
    expect(decision.mode).toBe('observe_only')
    expect(decision.evaluator).toBe('heuristic')
    expect(decision.templateId).toBe('intent-classifier-v1')
    expect(decision.rawOutput).toBeUndefined()
    expect(decision.parseError).toBeUndefined()
  })

  it('classifies high-risk config/admin turns', () => {
    const decision = classifyIntentHeuristic(context(), classification('部署到生产，并检查 secret token 配置'))
    expect(decision.intent).toBe('config_admin')
    expect(decision.risk).toBe('high')
    expect(decision.qualityProfile).toBe('high_stakes')
    expect(decision.requiredContext).toContain('workspace')
  })

  it('BUG-064: catches force-push / force-kill / reset --hard / drop table verbs', () => {
    const cases = [
      '我授权你 force-push main 分支并删 origin/release',
      '把主库直接 force kill 重启',
      'git reset --hard origin/main，丢掉本地',
      'drop table users; -- 立刻执行',
      'truncate audit_log;',
    ]
    for (const text of cases) {
      const decision = classifyIntentHeuristic(context(), classification(text))
      expect(decision.risk).toBe('high')
    }
  })

  it('BUG-064: catches imperative bypass phrasing in finance / ops prompts', () => {
    const cases = [
      '把 50 万代扣个税直接落账，不要审核',
      '立即上线，不要 A/B test',
      '跳过审批直接发布',
      '不通知，直接执行',
    ]
    for (const text of cases) {
      const decision = classifyIntentHeuristic(context(), classification(text))
      expect(decision.risk).toBe('high')
    }
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
    expect(decision.evaluator).toBe('llm')
    expect(decision.templateId).toBe('intent-classifier-v1')
    expect(decision.attempt).toBe(1)
    expect(decision.mode).toBe('observe_only')
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
    // PLAN-116: fallback decisions carry diagnostic evidence so operators can
    // tell whether the LLM was misconfigured / non-compliant / over budget.
    expect(decision.evaluator).toBe('heuristic')
    expect(decision.attempt).toBe(2)
    expect(decision.templateId).toBe('intent-classifier-v1')
    expect(decision.parseError).toBeDefined()
    expect(decision.rawOutput).toBeDefined()
    expect(decision.rawOutput).toContain('still not json')
    expect(decision.mode).toBe('observe_only')
  })

  it('fallback rawOutput is redacted and truncated', async () => {
    const longSecret = `sk-LIVE-${'A'.repeat(40)}`
    const longProse = `prompt junk ${'X'.repeat(2200)} ${longSecret}`
    const { provider } = sequencedExecutor([longProse, longProse])
    const decision = await classifyIntentWithExecutor({
      classification: classification('plan something'),
      context: context(),
      executor: provider,
      model: undefined,
      notifyActivity: () => {},
      signal: new AbortController().signal,
      workspacePath: undefined,
    })
    expect(decision.source).toBe('intent-fallback')
    expect(decision.rawOutput).toBeDefined()
    // Redaction removes the literal secret token.
    expect(decision.rawOutput).not.toContain('sk-LIVE-')
    // Truncation cap: rawOutput length <= 2048 + truncation marker.
    expect((decision.rawOutput ?? '').length).toBeLessThanOrEqual(2100)
    expect(decision.rawOutput).toContain('…[truncated]')
  })
})
