import type { AgentRunInput, ExecutorProvider } from '@zonease/aiworker-shared'

import { describe, expect, it } from 'bun:test'

import { classifyContinuation } from './router'

function executor(response: string): ExecutorProvider {
  return {
    name: 'router-test',
    health: async () => ({ name: 'router-test', status: 'healthy', lastChecked: 'x' }),
    listTools: async () => [],
    run: (_input: AgentRunInput) => (async function* () {
      yield { type: 'assistant_message_delta' as const, delta: response }
    })(),
  }
}

function failingExecutor(): ExecutorProvider {
  return {
    name: 'router-fail',
    health: async () => ({ name: 'router-fail', status: 'down', lastChecked: 'x' }),
    listTools: async () => [],
    run: (_input: AgentRunInput) => (async function* () {
      yield { type: 'error' as const, error: 'executor exploded' }
    })(),
  }
}

describe('classifyContinuation truthfulness (PLAN-116)', () => {
  it('annotates source/evaluator/templateId on the happy path', async () => {
    const decision = await classifyContinuation(
      executor(JSON.stringify({ continue: true, reason: 'topic-continues' })),
      'gpt-test',
      null,
      [],
      'hi again',
      undefined,
      'http',
    )
    expect(decision.continue).toBe(true)
    expect(decision.reason).toBe('topic-continues')
    expect(decision.source).toBe('classifier-llm')
    expect(decision.evaluator).toBe('llm')
    expect(decision.engine).toBe('http')
    expect(decision.model).toBe('gpt-test')
    expect(decision.templateId).toBe('conversation-classifier-v1')
    expect(decision.attempt).toBe(1)
    // Diagnostic fields stay absent on the happy path to keep events small.
    expect(decision.rawOutput).toBeUndefined()
    expect(decision.parseError).toBeUndefined()
  })

  it('reports non-json-classifier-output with raw output and parse error', async () => {
    const decision = await classifyContinuation(
      executor('Sure, the topic is the same.'),
      'gpt-test',
      null,
      [],
      'follow-up',
      undefined,
      'http',
    )
    expect(decision.continue).toBe(true)
    expect(decision.reason).toBe('non-json-classifier-output')
    expect(decision.source).toBe('classifier-fallback')
    expect(decision.evaluator).toBe('heuristic')
    expect(decision.rawOutput).toContain('Sure, the topic is the same.')
    expect(decision.parseError).toBeDefined()
    expect(decision.parseError?.length ?? 0).toBeGreaterThan(0)
  })

  it('reports malformed-response when JSON lacks `continue` boolean', async () => {
    const decision = await classifyContinuation(
      executor(JSON.stringify({ reason: 'no continue field' })),
      undefined,
      null,
      [],
      'follow-up',
    )
    expect(decision.continue).toBe(true)
    expect(decision.reason).toBe('malformed-response')
    expect(decision.source).toBe('classifier-fallback')
    expect(decision.evaluator).toBe('heuristic')
    expect(decision.rawOutput).toBeDefined()
    expect(decision.parseError).toContain('continue')
  })

  it('reports classifier-error-default-continue on executor errors', async () => {
    const decision = await classifyContinuation(
      failingExecutor(),
      undefined,
      null,
      [],
      'msg',
    )
    expect(decision.continue).toBe(true)
    expect(decision.reason).toBe('classifier-error-default-continue')
    expect(decision.source).toBe('classifier-fallback')
    expect(decision.evaluator).toBe('none')
    expect(decision.parseError).toContain('executor exploded')
  })

  it('redacts and truncates rawOutput on fallback', async () => {
    const longSecret = `sk-LIVE-${'X'.repeat(40)}`
    const longProse = `prose ${'A'.repeat(2200)} ${longSecret}`
    const decision = await classifyContinuation(
      executor(longProse),
      undefined,
      null,
      [],
      'msg',
    )
    expect(decision.source).toBe('classifier-fallback')
    expect(decision.rawOutput).toBeDefined()
    expect(decision.rawOutput).not.toContain('sk-LIVE-')
    expect(decision.rawOutput).toContain('…[truncated]')
    expect((decision.rawOutput ?? '').length).toBeLessThanOrEqual(2100)
  })
})
