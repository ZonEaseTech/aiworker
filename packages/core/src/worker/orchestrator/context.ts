import type { ChatMessage, ExecutorConfig, OrchestratorConfig } from '@zonease/aiworker-shared'

import { resolveVariant } from '../executor/default-profiles'

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 8_192
export const DEFAULT_CONTEXT_RESERVE_TOKENS = 1_024
export const DEFAULT_TOKEN_BUDGET_HISTORY_SCAN_MESSAGES = 2_000

const MESSAGE_OVERHEAD_TOKENS = 6

export interface ContextBudget {
  contextWindowTokens: number
  reserveTokens: number
  keepRecentTokens: number
  maxHistoryMessages?: number
}

export interface AssembledContext {
  messages: ChatMessage[]
  contextTokens: number
  historyTokens: number
}

export function estimateTextTokens(text: string): number {
  if (text.length === 0)
    return 0

  let ascii = 0
  let nonAscii = 0
  for (const char of text) {
    if (char.charCodeAt(0) <= 0x7F)
      ascii += 1
    else
      nonAscii += 1
  }

  // A small deterministic estimate: ASCII text is counted at roughly three
  // characters per token, while non-ASCII text is counted one character per
  // token to avoid under-budgeting CJK-heavy conversations.
  return Math.max(1, Math.ceil(ascii / 3) + nonAscii)
}

export function estimateChatMessageTokens(message: ChatMessage): number {
  return MESSAGE_OVERHEAD_TOKENS + estimateTextTokens(message.content)
}

export function estimateChatMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateChatMessageTokens(message), 0)
}

export function tokenBudgetEnabled(config: OrchestratorConfig | undefined): boolean {
  return config?.contextWindowTokens !== undefined
    || config?.reserveTokens !== undefined
    || config?.keepRecentTokens !== undefined
    || config?.compaction?.enabled === true
    || config?.compaction?.triggerTokens !== undefined
}

export function resolveContextBudget(
  orchestrator: OrchestratorConfig | undefined,
  executor: ExecutorConfig,
): ContextBudget | null {
  if (!tokenBudgetEnabled(orchestrator))
    return null

  const contextWindowTokens = orchestrator?.contextWindowTokens
    ?? resolveExecutorContextWindowTokens(executor)
    ?? DEFAULT_CONTEXT_WINDOW_TOKENS
  const reserveTokens = clampReserveTokens(
    orchestrator?.reserveTokens ?? defaultReserveTokens(contextWindowTokens),
    contextWindowTokens,
  )
  const keepRecentTokens = Math.max(
    0,
    Math.min(
      orchestrator?.keepRecentTokens ?? contextWindowTokens - reserveTokens,
      contextWindowTokens - reserveTokens,
    ),
  )

  return {
    contextWindowTokens,
    reserveTokens,
    keepRecentTokens,
    ...(orchestrator?.maxHistoryMessages === undefined ? {} : { maxHistoryMessages: orchestrator.maxHistoryMessages }),
  }
}

export function assembleTokenBudgetContext(input: {
  systemMessage: ChatMessage
  historyNewestFirst: ChatMessage[]
  budget: ContextBudget
}): AssembledContext {
  const systemTokens = estimateChatMessageTokens(input.systemMessage)
  const historyBudget = Math.max(
    0,
    Math.min(
      input.budget.keepRecentTokens,
      input.budget.contextWindowTokens - input.budget.reserveTokens - systemTokens,
    ),
  )

  const selectedNewestFirst: ChatMessage[] = []
  let historyTokens = 0

  for (const message of input.historyNewestFirst) {
    const messageTokens = estimateChatMessageTokens(message)
    const canFit = historyTokens + messageTokens <= historyBudget
    if (!canFit) {
      // Preserve the latest turn even when a single inbound message is larger
      // than the configured recent-history budget. Overflow retry and content
      // truncation are deliberately deferred to later session stages.
      if (selectedNewestFirst.length === 0) {
        selectedNewestFirst.push(message)
        historyTokens += messageTokens
      }
      break
    }

    selectedNewestFirst.push(message)
    historyTokens += messageTokens
  }

  const messages = [
    input.systemMessage,
    ...selectedNewestFirst.reverse(),
  ]
  return {
    messages,
    contextTokens: systemTokens + historyTokens,
    historyTokens,
  }
}

export function resolveExecutorModel(config: ExecutorConfig): string | undefined {
  try {
    const resolved = resolveVariant(config)
    if (resolved.modelId !== undefined && resolved.modelId.length > 0)
      return resolved.modelId
    const body = resolved.body as Record<string, unknown>
    if (typeof body.model === 'string' && body.model.length > 0)
      return body.model
    if (typeof body.defaultModel === 'string' && body.defaultModel.length > 0)
      return body.defaultModel
    return undefined
  }
  catch {
    return undefined
  }
}

function resolveExecutorContextWindowTokens(config: ExecutorConfig): number | null {
  try {
    const resolved = resolveVariant(config)
    const body = resolved.body as Record<string, unknown>
    const explicit = positiveInteger(body.contextWindowTokens)
    if (explicit !== null)
      return explicit

    const model = resolveExecutorModel(config)
    return model === undefined ? null : inferModelContextWindowTokens(model)
  }
  catch {
    return null
  }
}

function inferModelContextWindowTokens(model: string): number | null {
  const lower = model.toLowerCase()
  if (lower.includes('gemini-2.5'))
    return 1_000_000
  if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('opus'))
    return 200_000
  if (lower.includes('gpt-5') || lower.includes('gpt-4.1') || lower.includes('gpt-4o'))
    return 128_000
  if (lower.includes('deepseek'))
    return 64_000
  if (lower.includes('qwen'))
    return 32_000
  return null
}

function defaultReserveTokens(contextWindowTokens: number): number {
  return Math.min(DEFAULT_CONTEXT_RESERVE_TOKENS, Math.floor(contextWindowTokens / 4))
}

function clampReserveTokens(reserveTokens: number, contextWindowTokens: number): number {
  return Math.max(0, Math.min(reserveTokens, Math.max(0, contextWindowTokens - 1)))
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}
