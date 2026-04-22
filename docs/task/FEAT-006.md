# FEAT-006 Evolution generator (Hermes-style skill self-learning)

- **status**: completed
- **priority**: P2
- **owner**: bkd-worktree (PLAN-006)
- **createdAt**: 2026-04-21 07:30
- **claimedAt**: 2026-04-21 18:55
- **completedAt**: 2026-04-22 04:07
- **plan**: PLAN-006

## Description

Implement the intelligence half of the L3 Evolution layer. REFACTOR-002 / PLAN-003 lands the observer, the skill draft schema, and the approval UI; the actual pattern-miner → skill-draft generator is deferred here.

Scope:

- Background scheduler in each worker that periodically (or event-driven) examines `evolution_observations` + recent `conversations` + `execution_logs`
- Pattern detection: recurring tool-call sequences, recurring prompt shapes, recurring memory write patterns
- Skill draft synthesis: produce a proposed skill (name + trigger description + allowed tools + prompt template) as a `skill_drafts` row with `status='pending'`
- Cost controls: rate-limit generator runs per worker; cap observation window
- Quality heuristics: de-duplicate against existing bindings, confidence score, rationale text

## ActiveForm

Planning Evolution generator (deferred)

## Dependencies

- **blocked by**: REFACTOR-002
- **blocks**: (none)

## Notes

MVP ships the observer, the `skill_drafts` table, the approval dashboard page, and a no-op proposer that logs "would analyse N observations here". Plug the real generator into `apps/api/src/worker/evolution/proposer.ts` when picked up.

Hermes philosophy: the worker *teaches itself*. The generator is what makes the claim real.
