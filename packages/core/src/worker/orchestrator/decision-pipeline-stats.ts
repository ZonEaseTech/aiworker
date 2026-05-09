import type {
  ConversationClassifierRecent,
  ConversationDecision,
  DecisionPipelineRecent,
  WorkerInfoDecisionPipelineSummary,
} from '@zonease/aiworker-shared'

import type { IntentDecisionPayload, QualityGatePayload } from './decisions'

import { decisionPipelineSamples, getWorkerDb } from '@zonease/aiworker-storage-sqlite/worker'
import { desc, eq } from 'drizzle-orm'

/**
 * PLAN-116 in-memory decision pipeline observability.
 *
 * Worker runtime keeps the most recent N (default 50) intent / quality /
 * conversation classifier outcomes. Samples are written to worker.db on a
 * best-effort basis so one-shot `aiworker run` invocations are visible to a
 * later `aiworker brain status` process. The process-local ring buffers remain
 * as fallback when the database is not initialized or an older unmigrated
 * worker.db lacks the metrics table.
 *
 * This is **observability**, not audit.
 */

const WINDOW_SIZE = 50

interface IntentSample {
  source: IntentDecisionPayload['source']
  reason: string
  at: string
}

interface QualitySample {
  evaluator: QualityGatePayload['evaluator']
  reason: string
  at: string
  fallback: boolean
}

interface ConversationSample {
  source: ConversationDecision['source']
  reason: string
  at: string
  fallback: boolean
}

type DecisionStage = 'intent_classifier' | 'quality_gate' | 'conversation_classifier'

interface PersistedSample {
  source: string
  evaluator: string
  reason: string
  at: string
  fallback: boolean
}

class RingBuffer<T> {
  private items: T[] = []
  constructor(private readonly max: number) {}
  push(item: T): void {
    this.items.push(item)
    if (this.items.length > this.max)
      this.items.shift()
  }

  toArray(): T[] {
    return this.items.slice()
  }

  size(): number {
    return this.items.length
  }

  clear(): void {
    this.items = []
  }
}

const intentBuffer = new RingBuffer<IntentSample>(WINDOW_SIZE)
const qualityBuffer = new RingBuffer<QualitySample>(WINDOW_SIZE)
const conversationBuffer = new RingBuffer<ConversationSample>(WINDOW_SIZE)

/** Reset all buffers. Used by tests and by worker reload paths. */
export function resetDecisionPipelineStats(): void {
  intentBuffer.clear()
  qualityBuffer.clear()
  conversationBuffer.clear()
}

/** Record a single `orchestrator.intent_decision` outcome. */
export function recordIntentDecision(payload: IntentDecisionPayload): void {
  const sample = {
    source: payload.source,
    reason: payload.reason,
    at: new Date().toISOString(),
  }
  intentBuffer.push(sample)
  persistDecisionSample({
    ...sample,
    evaluator: payload.evaluator ?? 'heuristic',
    fallback: payload.source === 'intent-fallback',
    stage: 'intent_classifier',
  })
}

/** Record a single `orchestrator.quality_gate` outcome. */
export function recordQualityGate(payload: QualityGatePayload): void {
  // Quality gate "fallback" semantics: when the configured evaluator was llm
  // but the actually-used evaluator ended up heuristic (retry exhausted /
  // budget exhausted).
  const fallback = payload.reason.startsWith('llm-retry-exhausted')
    || payload.reason.startsWith('llm-budget-exhausted')
  const sample = {
    evaluator: payload.evaluator,
    reason: payload.reason,
    at: new Date().toISOString(),
    fallback,
  }
  qualityBuffer.push(sample)
  persistDecisionSample({
    ...sample,
    source: payload.evaluator,
    stage: 'quality_gate',
  })
}

/** Record a single `conversation.classifier` outcome. */
export function recordConversationClassifier(decision: ConversationDecision): void {
  const sample = {
    source: decision.source,
    reason: decision.reason,
    at: new Date().toISOString(),
    fallback: decision.source === 'classifier-fallback',
  }
  conversationBuffer.push(sample)
  persistDecisionSample({
    ...sample,
    evaluator: decision.evaluator,
    stage: 'conversation_classifier',
  })
}

interface DecisionPipelineConfigInput {
  intentEvaluator?: 'heuristic' | 'llm'
  qualityEvaluator?: 'heuristic' | 'llm'
  qualityMode?: 'observe' | 'warn' | 'retry' | 'block'
  qualityThreshold?: number
  conversationClassifierEnabled?: boolean
}

/**
 * Snapshot the in-memory ring buffers and combine with current configured
 * evaluator / mode so consumers see one coherent payload.
 */
export function getDecisionPipelineSnapshot(
  config: DecisionPipelineConfigInput = {},
): WorkerInfoDecisionPipelineSummary {
  const intentEvaluator = config.intentEvaluator ?? 'heuristic'
  const qualityEvaluator = config.qualityEvaluator ?? 'heuristic'
  const qualityMode = config.qualityMode ?? 'observe'
  const enabled = config.conversationClassifierEnabled ?? false

  const persisted = loadPersistedSamples()
  const intentSamples = persisted?.intent ?? intentBuffer.toArray()
  const intentFallback = intentSamples.filter(s => s.source === 'intent-fallback')
  const qualitySamples = persisted?.quality ?? qualityBuffer.toArray()
  const qualityFallback = qualitySamples.filter(s => s.fallback)
  const conversationSamples = persisted?.conversation ?? conversationBuffer.toArray()
  const conversationFallback = conversationSamples.filter(s => s.fallback)

  return {
    intentClassifier: {
      evaluator: intentEvaluator,
      // Intent decisions never gate downstream behavior in PLAN-116.
      mode: 'observe_only',
      recent: buildRecent(intentSamples.length, intentFallback.map(s => ({ at: s.at, reason: s.reason }))),
    },
    capabilityRouter: {
      source: 'capability-registry',
      mode: 'observe_only',
      note: 'capability registry advisory; selections are recorded but not enforced',
    },
    qualityGate: {
      evaluator: qualityEvaluator,
      configuredMode: qualityMode,
      ...(config.qualityThreshold === undefined ? {} : { threshold: config.qualityThreshold }),
      recent: buildRecent(qualitySamples.length, qualityFallback.map(s => ({ at: s.at, reason: s.reason }))),
    },
    conversationClassifier: {
      enabled,
      recent: buildConversationRecent(conversationSamples.length, conversationFallback.map(s => ({ at: s.at, reason: s.reason }))),
    },
  }
}

function buildRecent(samples: number, fallbacks: Array<{ at: string, reason: string }>): DecisionPipelineRecent {
  const last = fallbacks.length === 0 ? null : fallbacks[fallbacks.length - 1]
  return {
    windowSize: WINDOW_SIZE,
    samples,
    fallbackRate: samples === 0 ? 0 : fallbacks.length / samples,
    lastFallbackReason: last?.reason ?? null,
    lastFallbackAt: last?.at ?? null,
  }
}

function buildConversationRecent(samples: number, fallbacks: Array<{ at: string, reason: string }>): ConversationClassifierRecent {
  const base = buildRecent(samples, fallbacks)
  const fallbackByReason: Record<string, number> = {}
  for (const fb of fallbacks)
    fallbackByReason[fb.reason] = (fallbackByReason[fb.reason] ?? 0) + 1
  return { ...base, fallbackByReason }
}

function persistDecisionSample(sample: PersistedSample & { evaluator: string, stage: DecisionStage }): void {
  try {
    getWorkerDb().insert(decisionPipelineSamples).values({
      stage: sample.stage,
      source: sample.source.slice(0, 120),
      evaluator: sample.evaluator.slice(0, 120),
      reason: sample.reason.slice(0, 1000),
      fallback: sample.fallback,
      createdAt: sample.at,
    }).run()
  }
  catch {
    // Older worker.db files or unit tests may not have storage initialized.
    // The in-memory buffer above still keeps the current process observable.
  }
}

function loadPersistedSamples(): { intent: PersistedSample[], quality: PersistedSample[], conversation: PersistedSample[] } | null {
  try {
    return {
      intent: selectPersistedStage('intent_classifier'),
      quality: selectPersistedStage('quality_gate'),
      conversation: selectPersistedStage('conversation_classifier'),
    }
  }
  catch {
    return null
  }
}

function selectPersistedStage(stage: DecisionStage): PersistedSample[] {
  return getWorkerDb()
    .select({
      source: decisionPipelineSamples.source,
      evaluator: decisionPipelineSamples.evaluator,
      reason: decisionPipelineSamples.reason,
      at: decisionPipelineSamples.createdAt,
      fallback: decisionPipelineSamples.fallback,
    })
    .from(decisionPipelineSamples)
    .where(eq(decisionPipelineSamples.stage, stage))
    .orderBy(desc(decisionPipelineSamples.createdAt))
    .limit(WINDOW_SIZE)
    .all()
    .reverse()
}

/** Test helper. */
export const __ringWindowSize = WINDOW_SIZE
