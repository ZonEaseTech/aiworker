# PLAN-128 Governance Kernel harness — admission roundtrip evidence

- **status**: completed
- **createdAt**: 2026-05-06 07:30
- **approvedAt**: 2026-05-06 07:30
- **completedAt**: 2026-05-06 07:45
- **relatedTask**: TODO-031

## Context

The Governance Kernel regression harness from PLAN-127 currently asserts the
**negative** Project Brain invariant only:

- `pending` admission proposals must not produce canonical memory writes.
- LLM-claimed admission writes must surface a `bypass_suspected` warning when
  the AIWorker DB shows no admission delta.

Both compact pairs in QA-009 (CLI 0.9.1) and QA-010 (source) pass on those
checks.

The harness does not yet exercise the **positive** invariant: that the
materializer pipeline, given an `approved` proposal and `--commit`, actually
writes the canonical memory file, appends a `MEMORY.md` index entry, flips the
proposal row to `applied`, and records a `decision='applied'` row in
`brain_admission_decisions`. That is the load-bearing claim "durable Brain
mutation goes through AIWorker admission" — without source-backed regression
evidence we cannot detect a regression in the materializer.

The harness already creates one direct-path fixture proposal per pair, so the
roundtrip can be added with minimal new fixtures.

## Proposal

1. Extend `scripts/governance-kernel-harness.ts` per pair:
   - Run `brain admission approve <id> --decided-by harness --reason
     "harness-roundtrip"`.
   - Run `brain admission apply <id> --commit --decided-by harness`.
   - Run `brain brief --task "Recall harness preference"` to capture the
     projection evidence.
2. Add new `HarnessCheck` rows for:
   - `${pairId} admission approve`: proposal status `approved` and a decision
     row with `decision='approved'`.
   - `${pairId} admission apply commit`: command exit `0`, parsed outcome
     `kind='applied'`, canonical memory file at the expected path, MEMORY.md
     index entry present, proposal status `applied`, decision row
     `decision='applied'`.
   - `${pairId} brain brief reflects applied memory`: the brief JSON contains
     the topic identifier or a substring of the applied body.
3. Update the existing canonical memory boundary check semantics:
   - Capture memory file count at two points: before apply (must be 0) and
     after apply (must be exactly 1, the fixture under
     `memories/<pairId>-harness.md`).
4. Keep all checks source-backed via DB queries, filesystem inspection, and
   parsed CLI JSON. No assertions based on assistant self-report.
5. Re-run the harness in `worker-source-local` mode and record the result in
   `QA-011`.
6. If the `cli-release-local` mode is also exercised against the same CLI
   version, append a second result block to `QA-011` rather than creating a
   new published version.

## Risks

- The materializer may behave differently when `payload.body` happens to match
  the secret-scan patterns. The harness fixture must keep using a clean body
  to avoid `blocked-by-secret-scan` outcomes; that path stays covered by unit
  tests in `service.test.ts`.
- The compiler reads MEMORY.md index when projecting the brief. If the brief
  cache is per-process, a stale projection could mask the apply effect; the
  harness already invokes the CLI as a fresh process per command, so this is
  expected to be safe but must be confirmed in the run log.
- Updating the negative-boundary check from "memory files = 0 always" to
  "files = 0 before apply, files = 1 after apply" must not weaken the
  assertion that LLM-claimed apply does not bypass admission. Keep the
  pre-apply assertion intact and add the post-apply assertion as a separate
  check.

## Scope

- `scripts/governance-kernel-harness.ts`
- `docs/plan/PLAN-128.md`, `docs/task/TODO-031.md`, `docs/task/QA-011.md`
- `docs/plan/index.md`, `docs/task/index.md`
- `CHANGELOG.md` if the harness change ships as part of a release; otherwise
  this slice stays an internal regression-coverage improvement.

## Alternatives

- Leave the positive roundtrip as a unit-test-only invariant. Rejected: unit
  tests in `service.test.ts` already cover the materializer; the regression
  surface that breaks in practice is the CLI plumbing (flag wiring, JSON
  schema drift, brain-brief integration). The harness must exercise the
  end-to-end CLI surface to catch those regressions.
- Add a separate "roundtrip" sub-mode to the harness. Rejected: the existing
  compact mode already runs the proposal step; adding the approve / apply /
  projection checks inline keeps the report contiguous and avoids drift.

## Validation

- `bun run lint` for `scripts/governance-kernel-harness.ts`.
- `bun build --target=bun --outfile=tmp/governance-kernel-harness-check.js
  scripts/governance-kernel-harness.ts` to confirm bundling.
- `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts
  --mode worker-source-local --matrix compact --debug-root
  /home/ben/projects/debug-aiworker/qa-2026-05-06-governance-roundtrip
  --timeout-ms 240000 --port-base 19490`.
- Record results in `docs/task/QA-011.md`.

## Annotations

- 2026-05-06 07:30: Approved under the active Project Brain governance
  objective. The slice does not change product behavior, default modes, or
  release-only paths, so no separate user approval pause is required per the
  goal contract.
- 2026-05-06 07:45: Completed. Harness extended; source-local compact run
  passed with the new seven roundtrip checks per pair (developer-codex and
  general-assistant-claude-code), proving the positive admission invariant
  end-to-end. Evidence in QA-011.
