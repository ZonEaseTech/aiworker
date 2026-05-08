import type { AgentRunInput, ExecutorProvider } from '@zonease/aiworker-shared'

import { describe, expect, it } from 'bun:test'
import { reviewTaskWithBrainEngine } from './service'

function executor(response: string, inputs: AgentRunInput[] = []): ExecutorProvider {
  return {
    name: 'brain-engine-reviewer',
    health: async () => ({ name: 'brain-engine-reviewer', status: 'healthy', lastChecked: 'x' }),
    listTools: async () => [],
    run: (input: AgentRunInput) => {
      inputs.push(input)
      return (async function* () {
        yield { type: 'assistant_message_delta' as const, delta: response }
      })()
    },
  }
}

describe('Brain Engine reviewer contract (PLAN-176)', () => {
  it('parses a structured review and sends a no-tools bounded prompt', async () => {
    const inputs: AgentRunInput[] = []
    const review = await reviewTaskWithBrainEngine({
      authorityMode: 'unmanaged_ambient',
      evidenceRefs: ['brain_journal_events:1'],
      executor: executor(JSON.stringify({
        action: 'repair',
        score: 4,
        confidence: 0.82,
        reason: 'missing verification evidence',
        evidenceGaps: ['no test command output'],
        unsupportedClaims: ['claimed release readiness without build proof'],
        suggestions: ['rerun focused tests'],
        lessonCandidates: [
          {
            kind: 'build-release-procedure',
            summary: 'Release readiness requires check, test, build, and diff gates.',
            evidenceRefs: ['brain_journal_events:1'],
            confidence: 0.74,
            risk: 'medium',
            target: 'memories/release',
            rollback: 'remove the memory entry if release policy changes',
          },
        ],
      }), inputs),
      finalOutput: 'done',
      hardInvariantSignals: ['ambient executor authority'],
      journalSummary: ['quality gate warned'],
      scopeRubric: 'developer repo worker',
      signal: new AbortController().signal,
      taskGoal: 'validate release readiness',
      workspacePath: '/tmp/workspace',
    })

    expect(review).toMatchObject({
      action: 'repair',
      confidence: 0.82,
      source: 'brain-engine-review',
      status: 'reviewed',
    })
    expect(review.lessonCandidates).toHaveLength(1)
    expect(inputs).toHaveLength(1)
    expect(inputs[0]?.tools).toEqual([])
    expect(inputs[0]?.messages.some(message => message.content.includes('Do not execute tools'))).toBe(true)
    expect(inputs[0]?.messages.some(message => message.content.includes('developer repo worker'))).toBe(true)
  })

  it('returns a truthful fallback for invalid JSON or schema drift', async () => {
    const review = await reviewTaskWithBrainEngine({
      executor: executor(JSON.stringify({ score: 9 })),
      finalOutput: 'answer',
      signal: new AbortController().signal,
      taskGoal: 'review task',
    })

    expect(review.status).toBe('fallback')
    expect(review.action).toBe('warn')
    expect(review.reason).toContain('did not produce a valid structured review')
    expect(review.error).toContain('brain-engine-review-invalid')
  })

  it('returns a fallback when the reviewer exceeds its wall-clock budget', async () => {
    const slowExecutor: ExecutorProvider = {
      name: 'slow-reviewer',
      health: async () => ({ name: 'slow-reviewer', status: 'healthy', lastChecked: 'x' }),
      listTools: async () => [],
      run: (_input: AgentRunInput) => (async function* () {
        await new Promise(resolve => setTimeout(resolve, 200))
        yield { type: 'assistant_message_delta' as const, delta: '{}' }
      })(),
    }
    const review = await reviewTaskWithBrainEngine({
      budgetMs: 30,
      executor: slowExecutor,
      finalOutput: 'answer',
      signal: new AbortController().signal,
      taskGoal: 'review task',
    })

    expect(review.status).toBe('fallback')
    expect(review.error).toContain('brain-engine-review-timeout:30ms')
  })
})
