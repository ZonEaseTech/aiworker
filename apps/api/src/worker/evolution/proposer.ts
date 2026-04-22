import type { WorkerDatabase } from '../../db/worker'
import type { MinedPattern } from './pattern-miner'

import { createHash } from 'node:crypto'
import process from 'node:process'

import consola from 'consola'
import { asc, desc, inArray } from 'drizzle-orm'

import { getWorkerDb } from '../../db/worker'
import { evolutionObservations, executionLogs, skillBindings, skillDrafts } from '../../db/worker/schema'
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
  sequenceKey: string
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

  consola.info(`[evolution/proposer] ${written}/${patterns.length} candidate(s) written; window=${opts.windowSize}, conversations=${conversationIds.length}`)
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
      existing.add(meta.allowedTools.join('|'))
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

function slug(tool: string): string {
  return tool.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tool'
}

function readEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw === undefined || raw === '')
    return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
