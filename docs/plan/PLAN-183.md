# PLAN-183 Case File contract and product boundary

- **status**: implementing
- **owner**: local
- **createdAt**: 2026-05-09 05:55
- **task**: FEAT-057

## Context

FEAT-056 delivered the raw proof-loop primitives. The next slice must define the
operator-facing vocabulary before implementation expands:

- Work Order maps to existing `agent_tasks` and worker scope.
- Case File is a projection from Brain Journal, not a second mutable record.
- Review Decision is the default operator verdict, derived from Gate verdict and
  Brain Engine review.
- Lessons Queue is the product-facing layer over Brain Inbox / admission proposals.

The key boundary is that Case File is product evidence, not an eval platform and
not an executor capability source of truth.

## Proposal

Document and implement the first contract as typed core objects:

1. `BrainCaseFile`
2. `BrainCaseReviewDecision`
3. `BrainCaseEvidenceSummary`
4. `BrainCaseRiskSummary`
5. `BrainCaseLessonsSummary`

The contract should be stable enough for REST, CLI, Web, and Fleet summary
projections, while remaining derived from the existing worker-owned DB state.

## Scope

- Add contract types in core.
- Keep raw Journal API intact.
- Add focused tests that prove Case File is a higher-level projection than raw
  Journal.
- Update architecture/status docs only where product naming changes meaning.

## Risks

- Over-modeling too early would create another framework surface.
- Under-modeling would make Web and CLI duplicate projection logic.
- The contract must keep observe-only and enforced signals separate.

## Verification

- Focused core tests for Review Decision mapping.
- Typecheck for exported public types.

## Notes

- 2026-05-09 05:55：Plan opened as the first implementation slice for FEAT-057.
