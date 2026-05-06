# PLAN-129 Governance Kernel harness — reject and secret-scan-block coverage

- **status**: completed
- **createdAt**: 2026-05-06 07:55
- **approvedAt**: 2026-05-06 07:55
- **completedAt**: 2026-05-06 08:14
- **relatedTask**: TODO-032

## Context

The Governance Kernel regression harness now has end-to-end positive
admission roundtrip evidence (PLAN-128 / QA-011). Two state transitions are
still uncovered:

- `pending → rejected` via `brain admission reject`.
- `approved → blocked-by-secret-scan` via `brain admission apply --commit`
  with the default `block` policy and a secret-bearing body. This protects
  against regression of BUG-055 (P0 plaintext secret leak).

Service-layer unit tests in
`packages/core/src/worker/brain/admission/service.test.ts` already cover
both paths, but the CLI plumbing is not exercised by the harness, so a
regression in the CLI flag wiring or the JSON output schema would not be
caught.

## Proposal

1. Add a typed sibling fixture pair to `writeFixtureFiles`:
   - `harness-${pairId}-reject` — clean body, distinct topic.
   - `harness-${pairId}-secret` — body with synthetic
     `apiKey=sk-LIVE-fake<value>` that matches the existing secret scan rules.
2. After the PLAN-128 positive roundtrip block in `runPair`, add:
   - Reject block: propose → reject → verify `status='rejected'`,
     `decision='rejected'`, no canonical memory file for the reject topic.
   - Secret-scan block: propose → approve → apply commit → verify
     `outcome.kind='blocked-by-secret-scan'`, status remains `'approved'`, no
     `'applied'` decision row, no canonical memory file for the secret
     topic.
3. Reuse the existing `parseFirstJsonObject`, `sqlite`, and `listMarkdownFiles`
   helpers; do not introduce new dependencies.
4. Re-run the harness in `worker-source-local` mode, record results in
   QA-012. If the run also passes against the published CLI, append a
   sibling section to QA-012.
5. Update the harness redact rules if needed so the synthetic secret never
   leaks into the sanitized report. The current `/sk-\S{8,}/g` redaction
   already handles `sk-LIVE-fake...`, so no change is expected.

## Risks

- Fixture filename collision: existing primary fixture topic is
  `harness-${pairId}`. Sibling topics must use distinct suffixes (`-reject`,
  `-secret`) so the post-apply canonical memory file count assertion stays
  correct.
- `propose` does not currently run secret scan; only `apply` does. The
  secret fixture must therefore be approved before its apply call so the
  `block` outcome is reachable.
- Test for "no canonical memory file" must inspect the specific topic file
  path, not the directory count, because the primary fixture leaves one file
  in `memories/` after apply.

## Scope

- `scripts/governance-kernel-harness.ts`
- `docs/plan/PLAN-129.md`, `docs/task/TODO-032.md`, `docs/task/QA-012.md`
- `docs/plan/index.md`, `docs/task/index.md`

## Alternatives

- Cover only reject, not secret-scan-block. Rejected: secret-scan-block is
  the BUG-055 regression line and is a higher-leverage check than reject.
- Cover all three secret-body policies (block / redact / raw) in the
  harness. Rejected: redact and raw are exercised by service-layer unit
  tests and would inflate harness runtime; only the default `block` outcome
  needs CLI-surface regression coverage.

## Validation

- `bun run lint` for `scripts/governance-kernel-harness.ts`.
- `bun build --target=bun --outfile=tmp/governance-kernel-harness-check.js
  scripts/governance-kernel-harness.ts`.
- `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts
  --mode worker-source-local --matrix compact --debug-root
  /home/ben/projects/debug-aiworker/qa-2026-05-06-governance-rejects
  --timeout-ms 240000 --port-base 19510`.
- Record results in `docs/task/QA-012.md`. Optionally append a
  `cli-release-local` 0.9.1 sibling run.

## Annotations

- 2026-05-06 07:55: Approved under the active Project Brain governance
  objective. The slice does not change product behavior or release-only
  paths.
- 2026-05-06 08:00: First harness run flagged the secret-scan-block
  assertion because it expected exit 0; the product correctly returns exit
  1 alongside `outcome.kind='blocked-by-secret-scan'`. The harness assertion
  was updated to require exit 1 plus the parsed outcome JSON.
- 2026-05-06 08:14: Completed. Source-local compact rerun passed for both
  pairs with the new reject and secret-scan-block checks. Evidence in
  QA-012.
