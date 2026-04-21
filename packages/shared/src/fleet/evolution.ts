/** Status of a proposed skill pending operator review. */
export type SkillDraftStatus = 'pending' | 'approved' | 'rejected'

/** Origin of a skill draft — auto-proposed by the evolution generator or manually entered. */
export type SkillDraftSource = 'evolution' | 'manual'

/**
 * Structured record the evolution observer writes whenever something
 * notable happens (tool-call sequence, repeating prompt shape, memory
 * write pattern, ...). Payload shape is `kind`-specific.
 */
export interface EvolutionObservation {
  id: number
  conversationId?: string
  kind: string
  payload: Record<string, unknown>
  noticedAt: string
}

/**
 * A proposed new skill awaiting the operator's review. MVP creates the row;
 * the generator that actually synthesises `bodyMarkdown` + `rationale` lands
 * in FEAT-006.
 */
export interface SkillDraft {
  id: number
  proposedName: string
  source: SkillDraftSource
  bodyMarkdown: string
  rationale: string
  status: SkillDraftStatus
  createdAt: string
  decidedAt?: string
  decidedBy?: string
}
