import type { ChatMessage, ExecutorProvider } from '@zonease/aiworker-shared'

import { z } from 'zod'

export const DEFAULT_BRAIN_ENGINE_REVIEW_BUDGET_MS = 30_000

const reviewActionSchema = z.enum(['pass', 'warn', 'repair', 'rerun', 'hold', 'block'])
const lessonKindSchema = z.enum([
  'repo-fact',
  'architecture-decision',
  'build-release-procedure',
  'recurring-failure-pattern',
  'executor-reliability-note',
  'brain-skill-improvement',
])

const lessonCandidateSchema = z.object({
  kind: lessonKindSchema,
  summary: z.string().trim().min(1).max(320),
  rationale: z.string().trim().min(1).max(600).optional(),
  evidenceRefs: z.array(z.string().trim().min(1).max(240)).max(12).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  risk: z.enum(['low', 'medium', 'high']).default('medium'),
  target: z.string().trim().min(1).max(240).optional(),
  expiresAt: z.string().trim().min(1).max(80).optional(),
  rollback: z.string().trim().min(1).max(600).optional(),
})

const rawReviewSchema = z.object({
  action: reviewActionSchema.default('warn'),
  score: z.number().min(0).max(10).default(0),
  confidence: z.number().min(0).max(1).default(0.5),
  reason: z.string().trim().min(1).max(600),
  evidenceGaps: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
  unsupportedClaims: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
  suggestions: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
  lessonCandidates: z.array(lessonCandidateSchema).max(8).default([]),
})

export type BrainEngineReviewAction = z.infer<typeof reviewActionSchema>
export type BrainEngineLessonCandidate = z.infer<typeof lessonCandidateSchema>

export interface BrainEngineReviewInput {
  taskGoal: string
  finalOutput: string
  executor: ExecutorProvider
  signal: AbortSignal
  authorityMode?: string
  budgetMs?: number
  evidenceRefs?: string[]
  hardInvariantSignals?: string[]
  journalSummary?: string[]
  model?: string
  notifyActivity?: () => void
  scopeRubric?: string
  workspacePath?: string
}

export interface BrainEngineReviewResult {
  schemaVersion: 1
  source: 'brain-engine-review'
  mode: 'observe-only'
  status: 'reviewed' | 'fallback'
  action: BrainEngineReviewAction
  score: number
  confidence: number
  reason: string
  evidenceGaps: string[]
  unsupportedClaims: string[]
  suggestions: string[]
  lessonCandidates: BrainEngineLessonCandidate[]
  error?: string
}

type AttemptResult
  = | { kind: 'ok', review: BrainEngineReviewResult }
    | { kind: 'error', error: string }
    | { kind: 'timeout', elapsedMs: number }

export async function reviewTaskWithBrainEngine(input: BrainEngineReviewInput): Promise<BrainEngineReviewResult> {
  const budgetMs = input.budgetMs ?? DEFAULT_BRAIN_ENGINE_REVIEW_BUDGET_MS
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<AttemptResult>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout', elapsedMs: Date.now() - startedAt }), budgetMs)
  })
  try {
    const attempt = await Promise.race([runReviewer(input), timeout])
    if (attempt.kind === 'ok')
      return attempt.review
    if (attempt.kind === 'timeout')
      return fallbackReview(`brain-engine-review-timeout:${budgetMs}ms (consumed ${attempt.elapsedMs}ms)`)
    return fallbackReview(`brain-engine-review-invalid: ${attempt.error.slice(0, 180)}`)
  }
  finally {
    if (timer !== undefined)
      clearTimeout(timer)
  }
}

async function runReviewer(input: BrainEngineReviewInput): Promise<AttemptResult> {
  let text = ''
  try {
    for await (const event of input.executor.run({
      messages: buildReviewerPrompt(input),
      ...(input.model === undefined ? {} : { model: input.model }),
      signal: input.signal,
      temperature: 0,
      tools: [],
      ...(input.workspacePath === undefined ? {} : { workspacePath: input.workspacePath }),
    })) {
      input.notifyActivity?.()
      if (event.type === 'assistant_message_delta')
        text += event.delta
      else if (event.type === 'error')
        throw new Error(event.error)
    }
    const parsed = rawReviewSchema.parse(JSON.parse(text.trim()) as unknown)
    return {
      kind: 'ok',
      review: {
        schemaVersion: 1,
        source: 'brain-engine-review',
        mode: 'observe-only',
        status: 'reviewed',
        action: parsed.action,
        score: parsed.score,
        confidence: parsed.confidence,
        reason: parsed.reason,
        evidenceGaps: parsed.evidenceGaps,
        unsupportedClaims: parsed.unsupportedClaims,
        suggestions: parsed.suggestions,
        lessonCandidates: parsed.lessonCandidates,
      },
    }
  }
  catch (err) {
    return { kind: 'error', error: err instanceof Error ? err.message : String(err) }
  }
}

function fallbackReview(error: string): BrainEngineReviewResult {
  return {
    schemaVersion: 1,
    source: 'brain-engine-review',
    mode: 'observe-only',
    status: 'fallback',
    action: 'warn',
    score: 0,
    confidence: 0,
    reason: 'Brain Engine review did not produce a valid structured review; keep hard-invariant checks and heuristic gate results authoritative.',
    evidenceGaps: [],
    unsupportedClaims: [],
    suggestions: ['retry review later if a Brain Engine judgment is required'],
    lessonCandidates: [],
    error,
  }
}

function buildReviewerPrompt(input: BrainEngineReviewInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are the AIWorker Brain Engine reviewer.',
        'Review task outcome quality, evidence gaps, unsupported claims, and possible lesson candidates.',
        'Do not execute tools, do not claim to write memory, and do not authorize high-risk actions.',
        'Return only strict JSON with this shape:',
        '{"action":"pass|warn|repair|rerun|hold|block","score":0..10,"confidence":0..1,"reason":"short","evidenceGaps":["..."],"unsupportedClaims":["..."],"suggestions":["..."],"lessonCandidates":[{"kind":"repo-fact|architecture-decision|build-release-procedure|recurring-failure-pattern|executor-reliability-note|brain-skill-improvement","summary":"...","rationale":"...","evidenceRefs":["..."],"confidence":0..1,"risk":"low|medium|high","target":"optional","expiresAt":"optional","rollback":"optional"}]}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Authority mode: ${input.authorityMode ?? 'unknown'}`,
        `Scope rubric: ${input.scopeRubric ?? 'general AIWorker task review'}`,
        '',
        'Hard invariant signals:',
        listOrNone(input.hardInvariantSignals),
        '',
        'Evidence refs:',
        listOrNone(input.evidenceRefs),
        '',
        'Journal summary:',
        listOrNone(input.journalSummary),
        '',
        'Task goal:',
        excerpt(input.taskGoal, 4000),
        '',
        'Executor final output:',
        excerpt(input.finalOutput, 8000),
      ].join('\n'),
    },
  ]
}

function listOrNone(items: string[] | undefined): string {
  if (items === undefined || items.length === 0)
    return '- (none)'
  return items.map(item => `- ${excerpt(item, 500)}`).join('\n')
}

function excerpt(text: string, limit: number): string {
  if (text.length <= limit)
    return text
  return `${text.slice(0, limit - 3)}...`
}
