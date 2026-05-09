# PLAN-183 Case File contract and product boundary

- **status**: completed
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
- 2026-05-09 06:32：完成首版 Case File public contract。类型已从 core 导出，
  REST/CLI/Web/Fleet 可复用同一投影对象；Case File 明确保持为 Brain Journal 派生
  evidence，不成为第二套 task log 或 executor harness。
