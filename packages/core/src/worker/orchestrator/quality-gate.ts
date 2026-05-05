import type { ChatMessage, ExecutorProvider, OrchestratorQualityGateConfig } from '@zonease/aiworker-shared'

import type { CapabilityDecisionPayload, DecisionContext, IntentDecisionPayload, QualityGatePayload } from './decisions'

import { buildQualityGatePayload } from './decisions'

export interface QualityGateInput {
  assistantText: string
  capabilityDecision: CapabilityDecisionPayload
  context: DecisionContext
  evaluator: OrchestratorQualityGateConfig['evaluator']
  executor: ExecutorProvider
  intentDecision: IntentDecisionPayload
  mode: OrchestratorQualityGateConfig['mode']
  model: string | undefined
  notifyActivity: () => void
  requestText: string
  signal: AbortSignal
  threshold: number | undefined
  workspacePath: string | undefined
  /**
   * TODO-013: hard wall-clock budget for the LLM call path (milliseconds).
   * Falls back to the heuristic evaluator on overrun. Default 30_000 ms.
   */
  budgetMs?: number
}

/** TODO-013 default LLM gate budget. */
export const DEFAULT_QUALITY_GATE_BUDGET_MS = 30_000

export async function evaluateQualityGate(input: QualityGateInput): Promise<QualityGatePayload> {
  const evaluator = input.evaluator ?? 'heuristic'
  if (evaluator === 'llm') {
    const budgetMs = input.budgetMs ?? DEFAULT_QUALITY_GATE_BUDGET_MS
    const startedAt = Date.now()
    const remaining = () => Math.max(0, budgetMs - (Date.now() - startedAt))

    // BUG-057: same retry pattern as the intent classifier — the LLM may
    // emit prose on the first try, so retry once with a stricter re-prompt
    // before falling back to the heuristic gate.
    // TODO-013: race each attempt against the per-call budget. On timeout
    // the heuristic fallback fires with reason `llm-budget-exhausted:Nms`.
    const firstAttempt = await runQualityGateLlmBudgeted(input, buildGatePrompt(input), remaining())
    if (firstAttempt.kind === 'ok')
      return firstAttempt.payload
    if (firstAttempt.kind === 'timeout')
      return budgetExhaustedFallback(input, budgetMs, firstAttempt.elapsedMs)

    const stricter = [
      ...buildGatePrompt(input),
      {
        role: 'user' as const,
        content: [
          'Previous output was not valid JSON. Output the JSON object only,',
          'no markdown, no surrounding prose, no code fence.',
        ].join('\n'),
      },
    ]
    const secondAttempt = await runQualityGateLlmBudgeted(input, stricter, remaining())
    if (secondAttempt.kind === 'ok')
      return secondAttempt.payload
    if (secondAttempt.kind === 'timeout')
      return budgetExhaustedFallback(input, budgetMs, secondAttempt.elapsedMs)

    const fallback = evaluateHeuristic({ ...input, evaluator: 'heuristic' })
    const lastError = secondAttempt.error ?? firstAttempt.error ?? 'unknown error'
    return buildQualityGatePayload(input.context, {
      action: fallback.action,
      dimensions: fallback.dimensions,
      evaluator: 'heuristic',
      finalAnswerLength: fallback.finalAnswerLength,
      missing: fallback.missing,
      gateMode: fallback.gateMode,
      reason: `llm-retry-exhausted: ${lastError.slice(0, 120)}`,
      score: fallback.score,
      status: fallback.status,
      suggestions: fallback.suggestions,
      threshold: fallback.threshold,
    })
  }
  return evaluateHeuristic({ ...input, evaluator: 'heuristic' })
}

function budgetExhaustedFallback(input: QualityGateInput, budgetMs: number, elapsedMs: number): QualityGatePayload {
  const fallback = evaluateHeuristic({ ...input, evaluator: 'heuristic' })
  return buildQualityGatePayload(input.context, {
    action: fallback.action,
    dimensions: fallback.dimensions,
    evaluator: 'heuristic',
    finalAnswerLength: fallback.finalAnswerLength,
    missing: fallback.missing,
    gateMode: fallback.gateMode,
    reason: `llm-budget-exhausted:${budgetMs}ms (consumed ${elapsedMs}ms)`,
    score: fallback.score,
    status: fallback.status,
    suggestions: fallback.suggestions,
    threshold: fallback.threshold,
  })
}

async function runQualityGateLlmBudgeted(
  input: QualityGateInput,
  messages: ChatMessage[],
  budgetMs: number,
): Promise<QualityGateLlmAttemptResult | { kind: 'timeout', elapsedMs: number }> {
  if (budgetMs <= 0)
    return { kind: 'timeout', elapsedMs: 0 }
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<{ kind: 'timeout', elapsedMs: number }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout', elapsedMs: Date.now() - startedAt }), budgetMs)
  })
  try {
    const result = await Promise.race([runQualityGateLlm(input, messages), timeoutPromise])
    return result
  }
  finally {
    if (timer !== undefined)
      clearTimeout(timer)
  }
}

export function buildRepairPrompt(input: {
  assistantText: string
  gate: QualityGatePayload
  requestText: string
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'Repair the assistant answer so it satisfies the quality gate.',
        'Return only the improved answer. Do not mention the gate or scoring.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Original user request:',
        input.requestText,
        '',
        'Previous answer:',
        input.assistantText,
        '',
        'Quality gate missing items:',
        input.gate.missing.length > 0 ? input.gate.missing.map(item => `- ${item}`).join('\n') : '(none)',
        '',
        'Suggestions:',
        input.gate.suggestions.length > 0 ? input.gate.suggestions.map(item => `- ${item}`).join('\n') : '(none)',
      ].join('\n'),
    },
  ]
}

function evaluateHeuristic(input: QualityGateInput): QualityGatePayload {
  const threshold = input.threshold ?? defaultThreshold(input.intentDecision.qualityProfile)
  const trimmed = input.assistantText.trim()
  const missing: string[] = []
  const suggestions: string[] = []
  let score = 8
  if (trimmed.length === 0) {
    score = 0
    missing.push('assistant answer is empty')
    suggestions.push('produce a concrete answer to the user request')
  }
  else if (trimmed.length < 12) {
    score = 4
    missing.push('assistant answer is too short to verify completeness')
    suggestions.push('expand the answer with the key result and next step')
  }
  if (input.intentDecision.risk === 'high' && trimmed.length < 80) {
    score = Math.min(score, 6)
    missing.push('high-risk answer lacks enough detail')
    suggestions.push('include concrete verification, risk, and approval boundaries')
  }
  return buildQualityGatePayload(input.context, {
    action: actionFor(score, threshold, input.mode ?? 'observe'),
    dimensions: {
      completeness: score,
      evidence: input.intentDecision.risk === 'high' ? Math.min(score, 6) : score,
      format: trimmed.length > 0 ? 8 : 0,
      relevance: trimmed.length > 0 ? 8 : 0,
      safety: input.intentDecision.risk === 'high' ? Math.min(score, 6) : 8,
    },
    evaluator: 'heuristic',
    finalAnswerLength: input.assistantText.length,
    missing,
    gateMode: input.mode ?? 'observe',
    reason: score >= threshold ? 'heuristic quality gate passed' : 'heuristic quality gate found gaps',
    score,
    status: score >= threshold ? 'passed' : 'failed',
    suggestions,
    threshold,
  })
}

type QualityGateLlmAttemptResult
  = | { kind: 'ok', payload: QualityGatePayload }
    | { kind: 'error', error: string }

async function runQualityGateLlm(
  input: QualityGateInput,
  messages: ChatMessage[],
): Promise<QualityGateLlmAttemptResult> {
  let text = ''
  try {
    for await (const event of input.executor.run({
      messages,
      ...(input.model ? { model: input.model } : {}),
      ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
      signal: input.signal,
      temperature: 0,
    })) {
      input.notifyActivity()
      if (event.type === 'assistant_message_delta')
        text += event.delta
      else if (event.type === 'error')
        throw new Error(event.error)
    }
    const parsed = JSON.parse(text.trim()) as unknown
    const data = recordValue(parsed)
    if (!data)
      throw new Error('quality gate returned non-object JSON')
    const threshold = numeric(data.threshold) ?? input.threshold ?? defaultThreshold(input.intentDecision.qualityProfile)
    const score = Math.max(0, Math.min(10, numeric(data.score) ?? 0))
    return {
      kind: 'ok',
      payload: buildQualityGatePayload(input.context, {
        action: oneOf(data.action, ['pass', 'repair', 'warn', 'block'] as const) ?? actionFor(score, threshold, input.mode ?? 'observe'),
        dimensions: recordValue(data.dimensions) ?? {},
        evaluator: 'llm',
        finalAnswerLength: input.assistantText.length,
        missing: stringArray(data.missing),
        gateMode: input.mode ?? 'observe',
        reason: typeof data.reason === 'string' ? data.reason.slice(0, 240) : 'llm quality gate',
        score,
        status: score >= threshold ? 'passed' : 'failed',
        suggestions: stringArray(data.suggestions),
        threshold,
      }),
    }
  }
  catch (err) {
    return { kind: 'error', error: String(err) }
  }
}

function buildGatePrompt(input: QualityGateInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'Review an AIWorker assistant answer.',
        'Return only strict JSON:',
        '{"score":0..10,"threshold":number,"dimensions":{"relevance":0..10,"completeness":0..10,"evidence":0..10,"safety":0..10,"format":0..10},"missing":["..."],"suggestions":["..."],"action":"pass|repair|warn|block","reason":"short"}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Quality profile: ${input.intentDecision.qualityProfile}`,
        `Risk: ${input.intentDecision.risk}`,
        `Mode: ${input.mode ?? 'observe'}`,
        `Threshold: ${input.threshold ?? defaultThreshold(input.intentDecision.qualityProfile)}`,
        '',
        'User request:',
        input.requestText,
        '',
        'Assistant answer:',
        input.assistantText,
      ].join('\n'),
    },
  ]
}

function defaultThreshold(profile: string): number {
  if (profile === 'high_stakes')
    return 8
  if (profile === 'code_review' || profile === 'planning')
    return 7
  return 5
}

function actionFor(score: number, threshold: number, mode: NonNullable<OrchestratorQualityGateConfig['mode']>): QualityGatePayload['action'] {
  if (score >= threshold)
    return 'pass'
  if (mode === 'block')
    return 'block'
  if (mode === 'retry')
    return 'repair'
  if (mode === 'warn')
    return 'warn'
  return 'warn'
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T[number] : null
}
