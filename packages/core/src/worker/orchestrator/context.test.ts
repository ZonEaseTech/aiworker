import type { ChatMessage } from '@zonease/aiworker-shared'

import { describe, expect, it } from 'bun:test'
import {
  assembleTokenBudgetContext,
  estimateChatMessageTokens,
  estimateTextTokens,
  resolveContextBudget,
  resolveExecutorModel,
} from './context'

describe('orchestrator context budget assembly', () => {
  it('estimates tokens deterministically with conservative non-ASCII handling', () => {
    expect(estimateTextTokens('')).toBe(0)
    expect(estimateTextTokens('abc')).toBe(1)
    expect(estimateTextTokens('abcd')).toBe(2)
    expect(estimateTextTokens('你好')).toBe(2)
    expect(estimateChatMessageTokens({ role: 'user', content: 'abc' })).toBe(7)
  })

  it('selects newest history within budget and returns chronological messages', () => {
    const systemMessage: ChatMessage = { role: 'system', content: 'sys' }
    const historyNewestFirst: ChatMessage[] = [
      { role: 'user', content: 'msg-4' },
      { role: 'assistant', content: 'msg-3' },
      { role: 'user', content: 'msg-2' },
      { role: 'assistant', content: 'msg-1' },
    ]

    const assembled = assembleTokenBudgetContext({
      systemMessage,
      historyNewestFirst,
      budget: {
        contextWindowTokens: 40,
        reserveTokens: 8,
        keepRecentTokens: 16,
      },
    })

    expect(assembled.messages.map(message => message.content)).toEqual(['sys', 'msg-3', 'msg-4'])
  })

  it('uses custom config to shrink or expand the effective history budget', () => {
    const executor = { engine: 'http', variant: 'default' } as const
    const small = resolveContextBudget({
      contextWindowTokens: 80,
      reserveTokens: 30,
      keepRecentTokens: 20,
    }, executor)
    const large = resolveContextBudget({
      contextWindowTokens: 160,
      reserveTokens: 30,
      keepRecentTokens: 100,
    }, executor)

    expect(small?.keepRecentTokens).toBe(20)
    expect(large?.keepRecentTokens).toBe(100)
  })

  it('resolves model and catalog context hints from executor variants', () => {
    const executor = { engine: 'codex', variant: 'default' } as const
    const budget = resolveContextBudget({ reserveTokens: 1_000 }, executor)

    expect(resolveExecutorModel(executor)).toBe('gpt-5.5')
    expect(budget?.contextWindowTokens).toBe(128_000)
  })

  it('returns null budget when no token budget field is configured', () => {
    const executor = { engine: 'http', variant: 'default' } as const
    expect(resolveContextBudget(undefined, executor)).toBeNull()
    expect(resolveContextBudget({ maxHistoryMessages: 5 }, executor)).toBeNull()
  })

  it('enables token budgeting when compaction is configured', () => {
    const executor = { engine: 'http', variant: 'default' } as const
    const budget = resolveContextBudget({ compaction: { enabled: true, triggerTokens: 4_000 } }, executor)

    expect(budget?.contextWindowTokens).toBe(128_000)
    expect(budget?.reserveTokens).toBe(1_024)
  })
})
