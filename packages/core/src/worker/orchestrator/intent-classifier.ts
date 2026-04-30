import type { ChatMessage, ExecutorProvider } from '@zonease/aiworker-shared'

import type {
  DecisionContext,
  IntentDecisionPayload,
  QualityProfile,
  RequiredContext,
  SessionAction,
  WorkerIntent,
  WorkerRisk,
} from './decisions'

import { buildIntentDecision } from './decisions'

export type IntentEvaluator = 'heuristic' | 'llm'

export interface IntentClassificationInput {
  envelopeText: string
  priorSummary: string | null
  recentMessages: Array<{ role: string, content: string }>
  sessionAction: SessionAction
  sessionReason: string
}

export function classifyIntentHeuristic(
  context: DecisionContext,
  input: IntentClassificationInput,
): IntentDecisionPayload {
  const text = input.envelopeText.toLowerCase()
  const intent = inferIntent(text)
  const risk = inferRisk(text, intent)
  const requiredContext = inferRequiredContext(text, intent)
  const qualityProfile = inferQualityProfile(text, intent, risk)
  return buildIntentDecision(context, {
    confidence: intent === 'answer' ? 0.55 : 0.7,
    intent,
    qualityProfile,
    reason: `${input.sessionReason}; heuristic intent=${intent}`,
    requiredContext,
    risk,
    sessionAction: input.sessionAction,
    source: 'intent-heuristic',
  })
}

export async function classifyIntentWithExecutor(input: {
  context: DecisionContext
  executor: ExecutorProvider
  model: string | undefined
  signal: AbortSignal
  workspacePath: string | undefined
  classification: IntentClassificationInput
  notifyActivity: () => void
}): Promise<IntentDecisionPayload> {
  let text = ''
  try {
    for await (const event of input.executor.run({
      messages: buildIntentPrompt(input.classification),
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
    return normalizeIntentDecision(input.context, input.classification, JSON.parse(text.trim()))
  }
  catch (err) {
    const fallback = classifyIntentHeuristic(input.context, input.classification)
    return buildIntentDecision(input.context, {
      ...fallback,
      confidence: Math.min(fallback.confidence, 0.4),
      reason: `llm-intent-classifier-error: ${String(err).slice(0, 120)}`,
      source: 'intent-fallback',
    })
  }
}

function buildIntentPrompt(input: IntentClassificationInput): ChatMessage[] {
  const recent = input.recentMessages.slice(-8).map(row => `- ${row.role}: ${row.content.slice(0, 400)}`).join('\n')
  return [
    {
      role: 'system',
      content: [
        'Classify the current AIWorker inbound turn for routing observations.',
        'Return only strict JSON with these fields:',
        '{"intent":"answer|code_work|planning|research|config_admin|memory_update|skill_request|unknown","risk":"low|medium|high","requiredContext":["recent_history|memory_search|skill_load|mcp_tools|workspace"],"qualityProfile":"default|code_review|planning|high_stakes","confidence":0..1,"reason":"short"}',
        'Do not include markdown or any other text.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Session action: ${input.sessionAction}`,
        `Session reason: ${input.sessionReason}`,
        `Prior summary: ${input.priorSummary?.trim() || '(none)'}`,
        'Recent messages:',
        recent || '(none)',
        `Incoming: ${input.envelopeText}`,
      ].join('\n'),
    },
  ]
}

function normalizeIntentDecision(
  context: DecisionContext,
  input: IntentClassificationInput,
  raw: unknown,
): IntentDecisionPayload {
  const data = recordValue(raw)
  if (!data)
    throw new Error('intent classifier returned non-object JSON')
  const intent = oneOf(data.intent, ['answer', 'code_work', 'planning', 'research', 'config_admin', 'memory_update', 'skill_request', 'unknown'] as const) ?? 'unknown'
  const risk = oneOf(data.risk, ['low', 'medium', 'high'] as const) ?? 'low'
  const qualityProfile = oneOf(data.qualityProfile, ['default', 'code_review', 'planning', 'high_stakes'] as const) ?? 'default'
  const requiredContext = normalizeRequiredContext(data.requiredContext)
  const confidence = typeof data.confidence === 'number' && Number.isFinite(data.confidence)
    ? Math.max(0, Math.min(1, data.confidence))
    : 0
  const reason = typeof data.reason === 'string' && data.reason.length > 0
    ? data.reason.slice(0, 240)
    : 'llm intent classifier'
  return buildIntentDecision(context, {
    confidence,
    intent,
    qualityProfile,
    reason,
    requiredContext: requiredContext.length > 0 ? requiredContext : inferRequiredContext(input.envelopeText.toLowerCase(), intent),
    risk,
    sessionAction: input.sessionAction,
    source: 'intent-llm',
  })
}

function inferIntent(text: string): WorkerIntent {
  if (/(remember|记住|记忆|memory)/i.test(text))
    return 'memory_update'
  if (/(skill|技能|能力包|capability)/i.test(text))
    return 'skill_request'
  if (/(config|配置|初始化|init|mcp|soul|\.aiworker)/i.test(text))
    return 'config_admin'
  if (/(review|审查|code review|cr\b)/i.test(text))
    return 'code_work'
  if (/(fix|bug|test|typecheck|lint|commit|代码|修复|实现|测试|提交|开发|重构)/i.test(text))
    return 'code_work'
  if (/(plan|proposal|roadmap|方案|计划|规划|拆解|设计)/i.test(text))
    return 'planning'
  if (/(research|search|lookup|调研|搜索|查找|查一下|资料)/i.test(text))
    return 'research'
  return text.trim().length === 0 ? 'unknown' : 'answer'
}

function inferRisk(text: string, intent: WorkerIntent): WorkerRisk {
  if (/(prod|production|deploy|delete|reset|secret|token|key|生产|部署|删除|重置|密钥|令牌)/i.test(text))
    return 'high'
  if (intent === 'code_work' || intent === 'config_admin')
    return 'medium'
  return 'low'
}

function inferRequiredContext(text: string, intent: WorkerIntent): RequiredContext[] {
  const required = new Set<RequiredContext>(['recent_history'])
  if (intent === 'code_work' || intent === 'config_admin')
    required.add('workspace')
  if (intent === 'research' || intent === 'memory_update' || /memory|记忆/i.test(text))
    required.add('memory_search')
  if (intent === 'skill_request' || intent === 'code_work')
    required.add('skill_load')
  if (intent === 'config_admin' || /mcp/i.test(text))
    required.add('mcp_tools')
  return Array.from(required)
}

function inferQualityProfile(text: string, intent: WorkerIntent, risk: WorkerRisk): QualityProfile {
  if (risk === 'high')
    return 'high_stakes'
  if (/(review|审查|代码评审|code review)/i.test(text))
    return 'code_review'
  if (intent === 'planning')
    return 'planning'
  return 'default'
}

function normalizeRequiredContext(value: unknown): RequiredContext[] {
  if (!Array.isArray(value))
    return []
  const allowed = new Set<RequiredContext>(['recent_history', 'memory_search', 'skill_load', 'mcp_tools', 'workspace'])
  return value.filter((item): item is RequiredContext => typeof item === 'string' && allowed.has(item as RequiredContext))
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T[number] : null
}
