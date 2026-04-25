/**
 * Pure, DB-free n-gram miner used by the evolution proposer. Kept in its own
 * file so it can be unit-tested without spinning up drizzle + sqlite.
 */

export interface MinedPattern {
  toolSequence: string[]
  occurrences: number
  uniqueConversations: number
  confidence: number
  rationale: string
}

export interface MinerOptions {
  nGramMin: number
  nGramMax: number
  minOccurrences: number
  minConversations: number
  windowSize: number
}

export const DEFAULT_MINER_OPTIONS: MinerOptions = {
  nGramMin: 2,
  nGramMax: 4,
  minOccurrences: 3,
  minConversations: 2,
  windowSize: 500,
}

interface Aggregate {
  toolSequence: string[]
  occurrences: number
  conversations: Set<string>
}

export function mineToolPatterns(
  logsByConversation: Map<string, string[]>,
  opts: MinerOptions = DEFAULT_MINER_OPTIONS,
): MinedPattern[] {
  const nMin = Math.max(1, opts.nGramMin)
  const nMax = Math.max(nMin, opts.nGramMax)
  const aggregates = new Map<string, Aggregate>()

  for (const [conversationId, sequence] of logsByConversation) {
    if (!conversationId || sequence.length === 0)
      continue
    for (let n = nMin; n <= nMax; n++) {
      if (sequence.length < n)
        break
      for (let i = 0; i + n <= sequence.length; i++) {
        const gram = sequence.slice(i, i + n)
        const key = keyOf(gram)
        const existing = aggregates.get(key)
        if (existing) {
          existing.occurrences += 1
          existing.conversations.add(conversationId)
        }
        else {
          aggregates.set(key, {
            toolSequence: gram,
            occurrences: 1,
            conversations: new Set([conversationId]),
          })
        }
      }
    }
  }

  const denom = Math.max(1, opts.windowSize)
  const candidates: MinedPattern[] = []
  for (const agg of aggregates.values()) {
    if (agg.occurrences < opts.minOccurrences)
      continue
    if (agg.conversations.size < opts.minConversations)
      continue
    const confidence = clamp01(agg.occurrences / denom)
    candidates.push({
      toolSequence: agg.toolSequence,
      occurrences: agg.occurrences,
      uniqueConversations: agg.conversations.size,
      confidence,
      rationale: buildRationale(agg.toolSequence, agg.occurrences, agg.conversations.size, confidence),
    })
  }

  candidates.sort((a, b) => {
    if (b.occurrences !== a.occurrences)
      return b.occurrences - a.occurrences
    return b.toolSequence.length - a.toolSequence.length
  })

  return dedupeByPrefix(candidates)
}

function dedupeByPrefix(patterns: MinedPattern[]): MinedPattern[] {
  const kept: MinedPattern[] = []
  for (const p of patterns) {
    const shadowedBy = kept.find(k => isStrictPrefix(p.toolSequence, k.toolSequence))
    if (shadowedBy)
      continue
    const idx = kept.findIndex(k => isStrictPrefix(k.toolSequence, p.toolSequence))
    if (idx >= 0)
      kept.splice(idx, 1)
    kept.push(p)
  }
  return kept
}

function isStrictPrefix(shorter: string[], longer: string[]): boolean {
  if (shorter.length >= longer.length)
    return false
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] !== longer[i])
      return false
  }
  return true
}

function buildRationale(seq: string[], occurrences: number, uniqueConversations: number, confidence: number): string {
  const arrow = seq.join(' → ')
  const pct = (confidence * 100).toFixed(1)
  return `Observed tool sequence ${arrow} ${occurrences}× across ${uniqueConversations} conversation(s); window confidence ${pct}%.`
}

function keyOf(gram: string[]): string {
  return gram.join('|')
}

function clamp01(v: number): number {
  if (!Number.isFinite(v))
    return 0
  if (v < 0)
    return 0
  if (v > 1)
    return 1
  return v
}
