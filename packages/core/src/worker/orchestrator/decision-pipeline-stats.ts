import type {
  ConversationClassifierRecent,
  ConversationDecision,
  DecisionPipelineRecent,
  WorkerInfoDecisionPipelineSummary,
} from '@zonease/aiworker-shared'

import type { IntentDecisionPayload, QualityGatePayload } from './decisions'

/**
 * PLAN-116 in-memory decision pipeline observability.
 *
 * Worker runtime keeps the most recent N (default 50) intent / quality /
 * conversation classifier outcomes per process. Snapshots are surfaced
 * through `aiworker brain status`, `/api/worker/info`, and
 * `/api/worker/brain/summary` so operators can see at a glance whether the
 * decision layer is on heuristic vs LLM, observe-only vs enforced, and what
 * the recent fallback breakdown looks like — without scraping event logs.
 *
 * This is **observability**, not audit. Buffers reset on worker restart and
 * are intentionally not persisted to `worker.db`.
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
  intentBuffer.push({
    source: payload.source,
    reason: payload.reason,
    at: new Date().toISOString(),
  })
}

/** Record a single `orchestrator.quality_gate` outcome. */
export function recordQualityGate(payload: QualityGatePayload): void {
  // Quality gate "fallback" semantics: when the configured evaluator was llm
  // but the actually-used evaluator ended up heuristic (retry exhausted /
  // budget exhausted).
  const fallback = payload.reason.startsWith('llm-retry-exhausted')
    || payload.reason.startsWith('llm-budget-exhausted')
  qualityBuffer.push({
    evaluator: payload.evaluator,
    reason: payload.reason,
    at: new Date().toISOString(),
    fallback,
  })
}

/** Record a single `conversation.classifier` outcome. */
export function recordConversationClassifier(decision: ConversationDecision): void {
  conversationBuffer.push({
    source: decision.source,
    reason: decision.reason,
    at: new Date().toISOString(),
    fallback: decision.source === 'classifier-fallback',
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
  const enabled = config.conversationClassifierEnabled ?? true

  const intentSamples = intentBuffer.toArray()
  const intentFallback = intentSamples.filter(s => s.source === 'intent-fallback')
  const qualitySamples = qualityBuffer.toArray()
  const qualityFallback = qualitySamples.filter(s => s.fallback)
  const conversationSamples = conversationBuffer.toArray()
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

/** Test helper. */
export const __ringWindowSize = WINDOW_SIZE
