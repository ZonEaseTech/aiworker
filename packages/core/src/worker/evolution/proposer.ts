import type { WorkerDatabase } from '@zonease/aiworker-storage-sqlite/worker'
import type { MinedPattern } from './pattern-miner'

import { createHash } from 'node:crypto'
import process from 'node:process'

import { evolutionObservations, executionLogs, getWorkerDb, skillBindings, skillDrafts } from '@zonease/aiworker-storage-sqlite/worker'

import consola from 'consola'
import { asc, desc, inArray } from 'drizzle-orm'
import { DEFAULT_MINER_OPTIONS, mineToolPatterns } from './pattern-miner'

export interface ProposerOptions {
  windowSize: number
  maxDraftsPerRun: number
  intervalMs: number
}

/** Marker embedded in `skill_drafts.bodyMarkdown` so later runs can recover `allowedTools` without a schema change. */
interface EvolutionMeta {
  allowedTools: string[]
  confidence: number
  kind?: 'tool_sequence' | 'quality_gate'
  sequenceKey: string
}

interface QualityGatePattern {
  action: string
  confidence: number
  missing: string[]
  occurrences: number
  rationale: string
  sequenceKey: string
  suggestions: string[]
  uniqueConversations: number
}

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000
const DEFAULT_WINDOW_SIZE = 500
const DEFAULT_MAX_DRAFTS = 5

export function resolveProposerOptions(overrides?: Partial<ProposerOptions>): ProposerOptions {
  return {
    windowSize: overrides?.windowSize ?? readEnvNumber('EVOLUTION_PROPOSER_WINDOW', DEFAULT_WINDOW_SIZE),
    maxDraftsPerRun: overrides?.maxDraftsPerRun ?? readEnvNumber('EVOLUTION_PROPOSER_MAX_DRAFTS_PER_RUN', DEFAULT_MAX_DRAFTS),
    intervalMs: overrides?.intervalMs ?? readEnvNumber('EVOLUTION_PROPOSER_INTERVAL_MS', DEFAULT_INTERVAL_MS),
  }
}

export async function runProposerOnce(overrides?: Partial<ProposerOptions>): Promise<{ drafts: number }> {
  const opts = resolveProposerOptions(overrides)
  const db = getWorkerDb()

  const observations = db
    .select({ conversationId: evolutionObservations.conversationId })
    .from(evolutionObservations)
    .orderBy(desc(evolutionObservations.noticedAt))
    .limit(opts.windowSize)
    .all()

  const conversationIds = Array.from(
    new Set(
      observations
        .map(o => o.conversationId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  )

  if (conversationIds.length === 0) {
    consola.info('[evolution/proposer] no conversations in window; skipping')
    return { drafts: 0 }
  }

  const logs = db
    .select({
      conversationId: executionLogs.conversationId,
      toolName: executionLogs.toolName,
    })
    .from(executionLogs)
    .where(inArray(executionLogs.conversationId, conversationIds))
    .orderBy(asc(executionLogs.conversationId), asc(executionLogs.id))
    .all()

  const logsByConversation = new Map<string, string[]>()
  for (const row of logs) {
    if (!row.conversationId)
      continue
    const list = logsByConversation.get(row.conversationId)
    if (list)
      list.push(row.toolName)
    else
      logsByConversation.set(row.conversationId, [row.toolName])
  }

  const patterns = mineToolPatterns(logsByConversation, {
    ...DEFAULT_MINER_OPTIONS,
    windowSize: opts.windowSize,
  })

  const existing = collectExistingSequences(db)
  let written = 0
  for (const pattern of patterns) {
    if (written >= opts.maxDraftsPerRun)
      break
    const key = pattern.toolSequence.join('|')
    if (existing.has(key))
      continue
    const draft = buildDraft(pattern)
    db.insert(skillDrafts).values(draft).run()
    existing.add(key)
    written += 1
    consola.info(`[evolution/proposer] wrote draft ${draft.proposedName} (occurrences=${pattern.occurrences}, convs=${pattern.uniqueConversations})`)
  }

  const qualityPatterns = mineQualityGatePatterns(db, opts.windowSize)
  for (const pattern of qualityPatterns) {
    if (written >= opts.maxDraftsPerRun)
      break
    if (existing.has(pattern.sequenceKey))
      continue
    const draft = buildQualityGateDraft(pattern)
    db.insert(skillDrafts).values(draft).run()
    existing.add(pattern.sequenceKey)
    written += 1
    consola.info(`[evolution/proposer] wrote quality draft ${draft.proposedName} (occurrences=${pattern.occurrences}, convs=${pattern.uniqueConversations})`)
  }

  consola.info(`[evolution/proposer] ${written}/${patterns.length + qualityPatterns.length} candidate(s) written; window=${opts.windowSize}, conversations=${conversationIds.length}`)
  return { drafts: written }
}

export function startProposerLoop(intervalMs?: number): () => void {
  const resolved = intervalMs ?? readEnvNumber('EVOLUTION_PROPOSER_INTERVAL_MS', DEFAULT_INTERVAL_MS)
  const handle = setInterval(() => {
    void runProposerOnce().catch(err => consola.warn(`[evolution/proposer] loop run failed: ${String(err)}`))
  }, resolved)
  return () => clearInterval(handle)
}

export function parseEvolutionMeta(body: string): EvolutionMeta | null {
  const match = body.match(/<!--\s*evolution-meta:\s*(\{[\s\S]*?\})\s*-->/)
  if (!match?.[1])
    return null
  try {
    const parsed = JSON.parse(match[1]) as Partial<EvolutionMeta>
    if (!Array.isArray(parsed.allowedTools) || !parsed.allowedTools.every(t => typeof t === 'string'))
      return null
      return {
        allowedTools: parsed.allowedTools,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        kind: parsed.kind === 'quality_gate' ? 'quality_gate' : 'tool_sequence',
        sequenceKey: typeof parsed.sequenceKey === 'string' ? parsed.sequenceKey : parsed.allowedTools.join('|'),
      }
  }
  catch {
    return null
  }
}

function collectExistingSequences(db: WorkerDatabase): Set<string> {
  const existing = new Set<string>()

  const drafts = db.select({ bodyMarkdown: skillDrafts.bodyMarkdown }).from(skillDrafts).all()
  for (const d of drafts) {
    const meta = parseEvolutionMeta(d.bodyMarkdown)
    if (meta)
      existing.add(meta.sequenceKey)
  }

  const bindings = db.select({ config: skillBindings.config }).from(skillBindings).all()
  for (const b of bindings) {
    const cfg = b.config
    if (!cfg || typeof cfg !== 'object')
      continue
    const allowedTools = (cfg as Record<string, unknown>).allowedTools
    if (Array.isArray(allowedTools) && allowedTools.every(t => typeof t === 'string'))
      existing.add(allowedTools.join('|'))
  }

  return existing
}

function buildDraft(pattern: MinedPattern) {
  const sequenceKey = pattern.toolSequence.join('|')
  const hash = createHash('sha256').update(sequenceKey).digest('hex').slice(0, 6)
  const first = slug(pattern.toolSequence[0] ?? 'tool')
  const last = slug(pattern.toolSequence[pattern.toolSequence.length - 1] ?? 'tool')
  const name = `auto-${first}-${last}-${hash}`
  const arrow = pattern.toolSequence.join(' → ')
  const toolsBullet = pattern.toolSequence.map(t => `\`${t}\``).join(', ')
  const meta: EvolutionMeta = {
    allowedTools: pattern.toolSequence,
    confidence: pattern.confidence,
    kind: 'tool_sequence',
    sequenceKey,
  }
  const trigger = `When the agent runs \`${arrow}\` (seen ${pattern.occurrences}× across ${pattern.uniqueConversations} conversation(s))`
  const bodyMarkdown = [
    `<!-- evolution-meta: ${JSON.stringify(meta)} -->`,
    '',
    `# ${name}`,
    '',
    '## Trigger',
    '',
    trigger,
    '',
    '## Allowed tools',
    '',
    toolsBullet,
    '',
    '## Prompt template',
    '',
    '```',
    `You are extending the skill \`${name}\`. Invoke the following tools in order: ${toolsBullet}.`,
    '```',
    '',
  ].join('\n')
  return {
    proposedName: name,
    source: 'evolution' as const,
    bodyMarkdown,
    rationale: pattern.rationale,
    status: 'pending' as const,
  }
}

function mineQualityGatePatterns(db: WorkerDatabase, windowSize: number): QualityGatePattern[] {
  const rows = db
    .select({
      conversationId: evolutionObservations.conversationId,
      payload: evolutionObservations.payload,
    })
    .from(evolutionObservations)
    .where(inArray(evolutionObservations.kind, ['orchestrator.quality_gate']))
    .orderBy(desc(evolutionObservations.noticedAt))
    .limit(windowSize)
    .all()

  const groups = new Map<string, {
    action: string
    conversations: Set<string>
    missing: string[]
    occurrences: number
    suggestions: string[]
  }>()
  for (const row of rows) {
    const payload = row.payload
    const status = typeof payload.status === 'string' ? payload.status : ''
    const action = typeof payload.action === 'string' ? payload.action : ''
    if (status !== 'failed' || action === 'pass')
      continue
    const missing = stringArray(payload.missing).slice(0, 5)
    const suggestions = stringArray(payload.suggestions).slice(0, 5)
    const signature = [...missing, ...suggestions].join('|').toLowerCase()
    if (signature.length === 0)
      continue
    const key = `quality:${createHash('sha256').update(signature).digest('hex').slice(0, 10)}`
    const existing = groups.get(key)
    if (existing) {
      existing.occurrences += 1
      if (row.conversationId)
        existing.conversations.add(row.conversationId)
      continue
    }
    groups.set(key, {
      action,
      conversations: new Set(row.conversationId ? [row.conversationId] : []),
      missing,
      occurrences: 1,
      suggestions,
    })
  }

  return Array.from(groups.entries())
    .filter(([, group]) => group.occurrences >= 2)
    .map(([sequenceKey, group]) => ({
      action: group.action,
      confidence: Math.min(0.95, 0.5 + group.occurrences * 0.1),
      missing: group.missing,
      occurrences: group.occurrences,
      rationale: `${group.occurrences}× similar quality gate failure(s) across ${group.conversations.size} conversation(s)`,
      sequenceKey,
      suggestions: group.suggestions,
      uniqueConversations: group.conversations.size,
    }))
    .sort((a, b) => b.occurrences - a.occurrences || b.uniqueConversations - a.uniqueConversations)
}

function buildQualityGateDraft(pattern: QualityGatePattern) {
  const hash = pattern.sequenceKey.replace(/^quality:/, '').slice(0, 6)
  const name = `auto-quality-${hash}`
  const meta: EvolutionMeta = {
    allowedTools: [],
    confidence: pattern.confidence,
    kind: 'quality_gate',
    sequenceKey: pattern.sequenceKey,
  }
  const bodyMarkdown = [
    `<!-- evolution-meta: ${JSON.stringify(meta)} -->`,
    '',
    `# ${name}`,
    '',
    '## Trigger',
    '',
    `When quality gate failures repeat (${pattern.occurrences}× across ${pattern.uniqueConversations} conversation(s)).`,
    '',
    '## Missing signals',
    '',
    ...pattern.missing.map(item => `- ${item}`),
    '',
    '## Improvement guidance',
    '',
    ...pattern.suggestions.map(item => `- ${item}`),
    '',
    '## Prompt template',
    '',
    '```',
    'Before finalizing similar answers, address the missing signals above and verify the answer against the user request.',
    '```',
    '',
  ].join('\n')
  return {
    proposedName: name,
    source: 'evolution' as const,
    bodyMarkdown,
    rationale: pattern.rationale,
    status: 'pending' as const,
  }
}

function slug(tool: string): string {
  return tool.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tool'
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

function readEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw === undefined || raw === '')
    return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
