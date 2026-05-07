# REFACTOR-019 Worker product lifecycle and Brain-Executor conformance audit

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-07 10:44
- **claimedAt**: 2026-05-07 10:44
- **completedAt**: 2026-05-07 10:47
- **plan**: PLAN-152
- **sourceObjective**: Persist the current worker product model from `init`
  through `up` / `serve`, document the Brain-to-executor runtime loop, and
  audit whether the code actually implements that architecture.
- **relatesTo**: REFACTOR-016, REFACTOR-018, PLAN-149, PLAN-151,
  docs/architecture.md, docs/governance-node-status.md

## Context

The lightweight Brain direction has converged around file-first Project Brain
assets plus a thin external executor adapter. The next risk is developer drift:
future work can easily treat Brain as a hidden domain workflow engine, or claim
Brain skill behavior that the runtime only advertises as metadata.

Two operator-facing descriptions need to become architecture source of truth:

1. The product lifecycle from `aiworker init` to `aiworker up` / `serve`.
2. How Brain assembles context, gates quality/admission, and calls the
   bring-your-own executor.

## Scope

- Add architecture sections for worker lifecycle and Brain-to-executor runtime
  flow.
- Reverse-check code paths for `init`, `up`, `serve`, runtime bootstrap,
  filesystem Brain, context projection, executor adapter, quality gate, and
  admission.
- Record current conformance and explicit residual gaps.
- Update PMA and changelog records.
- Correct source comments when they contradict the current audited behavior.

## Out of Scope

- No runtime behavior changes.
- No Web UI work.
- No executor-native skill/plugin/MCP projection changes.
- No attempt to materialize `brain-skill-add` or implement full skill body
  loading in this slice.
- No runtime behavior changes.

## Acceptance Criteria

1. `docs/architecture.md` contains the lifecycle and Brain-Executor topology
   as architecture-level source of truth.
2. The same document names the exact code-backed conformance status, including
   partial/not-yet-implemented parts.
3. `docs/governance-node-status.md` reflects the residual risks instead of
   implying stronger behavior than the code supports.
4. PMA indexes and changelog are updated.
5. `git diff --check` passes for this documentation slice.

## Notes

- 2026-05-07 10:44: Task opened after code inspection started. Existing dirty
  Web/UI changes and Brain Skill Pack changes are treated as unrelated
  worktree context; this slice only edits architecture/PMA/changelog docs plus
  one source comment that contradicted audited admission behavior.
- 2026-05-07 10:47: Completed. Architecture now documents the worker lifecycle,
  Brain-to-executor loop, and implementation conformance audit; governance
  status now lists skill-body loading and non-memory materialization as
  residual risks instead of implied completed behavior.

## Validation

- `git diff --check` PASS.
- `bun run --filter '@zonease/aiworker-shared' test src/brain/admission.test.ts`
  PASS: 21 pass / 0 fail.
