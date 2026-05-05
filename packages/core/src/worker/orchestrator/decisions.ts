import type { ChannelType } from '@zonease/aiworker-shared'

export const ORCHESTRATOR_DECISION_SCHEMA_VERSION = 2

export type DecisionMode = 'observe_only' | 'enforced'
export type DecisionEvaluator = 'heuristic' | 'llm' | 'none'
export type DecisionSource = 's1-default' | 'capability-registry' | 'intent-heuristic' | 'intent-llm' | 'intent-fallback' | 'quality-gate'

export type SessionAction = 'continue' | 'new_topic' | 'reset_requested' | 'isolated_task'
export type WorkerIntent = 'answer' | 'code_work' | 'planning' | 'research' | 'config_admin' | 'memory_update' | 'skill_request' | 'unknown'
export type WorkerRisk = 'low' | 'medium' | 'high'
export type RequiredContext = 'recent_history' | 'memory_search' | 'skill_load' | 'mcp_tools' | 'workspace'
export type QualityProfile = 'default' | 'code_review' | 'planning' | 'high_stakes'

export interface DecisionContext {
  channel: ChannelType
  conversationId: string
  engine: string
  gatewayConversationId?: string
  model?: string
  sessionKey: string
  taskId?: string
}

export type DecisionBasePayload = Record<string, unknown> & {
  schemaVersion: typeof ORCHESTRATOR_DECISION_SCHEMA_VERSION
  mode: DecisionMode
  source: DecisionSource
  channel: ChannelType
  conversationId: string
  engine: string
  gatewayConversationId?: string
  model?: string
  sessionKey: string
  taskId?: string
}

export type IntentDecisionPayload = DecisionBasePayload & {
  attempt?: number
  confidence: number
  evaluator: DecisionEvaluator
  intent: WorkerIntent
  parseError?: string
  qualityProfile: QualityProfile
  rawOutput?: string
  reason: string
  requiredContext: RequiredContext[]
  risk: WorkerRisk
  sessionAction: SessionAction
  templateId?: string
}

export interface CapabilitySkillDescriptor {
  description: string
  id: string
  name: string
  tags?: string[]
  version: string
}

export type CapabilityDecisionPayload = DecisionBasePayload & {
  availableBuiltinCount?: number
  availableMcpToolCount?: number
  availableSkillCount: number
  availableToolsets?: string[]
  deniedCapabilities: string[]
  reason: string
  selectedBuiltins: string[]
  selectedMcpTools: string[]
  selectedSkills: CapabilitySkillDescriptor[]
}

export interface QualityGateFields {
  action: 'pass' | 'repair' | 'warn' | 'block'
  dimensions: Record<string, unknown>
  evaluator: 'heuristic' | 'llm' | 'none'
  finalAnswerLength: number
  gateMode: 'observe' | 'warn' | 'retry' | 'block'
  missing: string[]
  reason: string
  score: number | null
  status: 'not_evaluated' | 'passed' | 'failed'
  suggestions: string[]
  threshold: number | null
}

export type QualityGatePayload = DecisionBasePayload & QualityGateFields

export function buildDefaultIntentDecision(input: DecisionContext): IntentDecisionPayload {
  return buildIntentDecision(input, {
    confidence: 0,
    evaluator: 'none',
    intent: 'unknown',
    qualityProfile: 'default',
    reason: 'S1 observe-only default; intent classifier is not enabled yet.',
    requiredContext: ['recent_history'],
    risk: 'low',
    sessionAction: 'continue',
    source: 's1-default',
  })
}

export function buildIntentDecision(input: DecisionContext, decision: {
  attempt?: number
  confidence: number
  evaluator: DecisionEvaluator
  intent: WorkerIntent
  parseError?: string
  qualityProfile: QualityProfile
  rawOutput?: string
  reason: string
  requiredContext: RequiredContext[]
  risk: WorkerRisk
  sessionAction: SessionAction
  source: DecisionSource
  templateId?: string
}): IntentDecisionPayload {
  return {
    ...decisionBase(input, decision.source, 'observe_only'),
    ...(decision.attempt === undefined ? {} : { attempt: decision.attempt }),
    confidence: decision.confidence,
    evaluator: decision.evaluator,
    intent: decision.intent,
    ...(decision.parseError === undefined ? {} : { parseError: decision.parseError }),
    qualityProfile: decision.qualityProfile,
    ...(decision.rawOutput === undefined ? {} : { rawOutput: decision.rawOutput }),
    reason: decision.reason,
    requiredContext: decision.requiredContext,
    risk: decision.risk,
    sessionAction: decision.sessionAction,
    ...(decision.templateId === undefined ? {} : { templateId: decision.templateId }),
  }
}

export function buildPromptCapabilityDecision(input: DecisionContext & {
  availableBuiltinCount?: number
  availableMcpToolCount?: number
  availableSkillCount: number
  availableToolsets?: string[]
  deniedCapabilities: string[]
  reason: string
  selectedBuiltins: string[]
  selectedMcpTools: string[]
  selectedSkills: CapabilitySkillDescriptor[]
  source?: DecisionSource
}): CapabilityDecisionPayload {
  return {
    ...decisionBase(input, input.source ?? 'capability-registry', 'observe_only'),
    ...(input.availableBuiltinCount === undefined ? {} : { availableBuiltinCount: input.availableBuiltinCount }),
    ...(input.availableMcpToolCount === undefined ? {} : { availableMcpToolCount: input.availableMcpToolCount }),
    availableSkillCount: input.availableSkillCount,
    ...(input.availableToolsets === undefined ? {} : { availableToolsets: input.availableToolsets }),
    deniedCapabilities: input.deniedCapabilities,
    reason: input.reason,
    selectedBuiltins: input.selectedBuiltins,
    selectedMcpTools: input.selectedMcpTools,
    selectedSkills: input.selectedSkills,
  }
}

export function buildDefaultQualityGate(input: DecisionContext & {
  assistantText: string
}): QualityGatePayload {
  return buildQualityGatePayload(input, {
    action: 'pass',
    dimensions: {},
    evaluator: 'none',
    finalAnswerLength: input.assistantText.length,
    gateMode: 'observe',
    missing: [],
    reason: 'S1 observe-only default; quality gate is not evaluating or blocking delivery yet.',
    score: null,
    status: 'not_evaluated',
    suggestions: [],
    threshold: null,
  })
}

export function buildQualityGatePayload(
  input: DecisionContext,
  gate: QualityGateFields,
  options: { mode?: DecisionMode } = {},
): QualityGatePayload {
  return {
    ...decisionBase(input, 'quality-gate', options.mode ?? 'observe_only'),
    ...gate,
  }
}

/**
 * Compute the truthful top-level `mode` for a quality_gate event.
 *
 * `mode='enforced'` if and only if the configured gate mode would actually
 * mutate downstream behavior (retry/block) AND the gate produced an action
 * that triggers that path. Anything else is `observe_only`. This keeps the
 * top-level mode honest even though `gateMode` and `action` already exist
 * as inner fields.
 */
export function resolveQualityGateMode(
  configuredMode: 'observe' | 'warn' | 'retry' | 'block' | undefined,
  action: QualityGateFields['action'],
): DecisionMode {
  if (configuredMode === 'retry' && action === 'repair')
    return 'enforced'
  if (configuredMode === 'block' && action === 'block')
    return 'enforced'
  return 'observe_only'
}

function decisionBase(
  input: DecisionContext,
  source: DecisionSource = 's1-default',
  mode: DecisionMode = 'observe_only',
): DecisionBasePayload {
  return {
    schemaVersion: ORCHESTRATOR_DECISION_SCHEMA_VERSION,
    mode,
    source,
    channel: input.channel,
    conversationId: input.conversationId,
    engine: input.engine,
    ...(input.gatewayConversationId === undefined ? {} : { gatewayConversationId: input.gatewayConversationId }),
    ...(input.model === undefined ? {} : { model: input.model }),
    sessionKey: input.sessionKey,
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
  }
}
