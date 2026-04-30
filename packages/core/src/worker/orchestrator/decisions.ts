import type { BrainSkill, ChannelType } from '@zonease/aiworker-shared'

export const ORCHESTRATOR_DECISION_SCHEMA_VERSION = 1

export type DecisionMode = 'observe_only'
export type DecisionSource = 's1-default'

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
  confidence: number
  intent: WorkerIntent
  qualityProfile: QualityProfile
  reason: string
  requiredContext: RequiredContext[]
  risk: WorkerRisk
  sessionAction: SessionAction
}

export interface CapabilitySkillDescriptor {
  description: string
  id: string
  name: string
  tags?: string[]
  version: string
}

export type CapabilityDecisionPayload = DecisionBasePayload & {
  availableSkillCount: number
  deniedCapabilities: string[]
  reason: string
  selectedBuiltins: string[]
  selectedMcpTools: string[]
  selectedSkills: CapabilitySkillDescriptor[]
}

export type QualityGatePayload = DecisionBasePayload & {
  action: 'pass'
  dimensions: Record<string, number | null>
  finalAnswerLength: number
  missing: string[]
  reason: string
  score: null
  status: 'not_evaluated'
  suggestions: string[]
  threshold: null
}

export function buildDefaultIntentDecision(input: DecisionContext): IntentDecisionPayload {
  return {
    ...decisionBase(input),
    confidence: 0,
    intent: 'unknown',
    qualityProfile: 'default',
    reason: 'S1 observe-only default; intent classifier is not enabled yet.',
    requiredContext: ['recent_history'],
    risk: 'low',
    sessionAction: 'continue',
  }
}

export function buildPromptCapabilityDecision(input: DecisionContext & {
  availableSkills: BrainSkill[]
  promptSkillLimit: number
}): CapabilityDecisionPayload {
  return {
    ...decisionBase(input),
    availableSkillCount: input.availableSkills.length,
    deniedCapabilities: [],
    reason: 'S1 mirrors current system-prompt skill exposure; capability registry is not enabled yet.',
    selectedBuiltins: [],
    selectedMcpTools: [],
    selectedSkills: input.availableSkills.slice(0, input.promptSkillLimit).map(skill => ({
      description: skill.description,
      id: skill.id,
      name: skill.name,
      ...(skill.tags === undefined ? {} : { tags: skill.tags }),
      version: skill.version,
    })),
  }
}

export function buildDefaultQualityGate(input: DecisionContext & {
  assistantText: string
}): QualityGatePayload {
  return {
    ...decisionBase(input),
    action: 'pass',
    dimensions: {},
    finalAnswerLength: input.assistantText.length,
    missing: [],
    reason: 'S1 observe-only default; quality gate is not evaluating or blocking delivery yet.',
    score: null,
    status: 'not_evaluated',
    suggestions: [],
    threshold: null,
  }
}

function decisionBase(input: DecisionContext): DecisionBasePayload {
  return {
    schemaVersion: ORCHESTRATOR_DECISION_SCHEMA_VERSION,
    mode: 'observe_only',
    source: 's1-default',
    channel: input.channel,
    conversationId: input.conversationId,
    engine: input.engine,
    ...(input.gatewayConversationId === undefined ? {} : { gatewayConversationId: input.gatewayConversationId }),
    ...(input.model === undefined ? {} : { model: input.model }),
    sessionKey: input.sessionKey,
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
  }
}
