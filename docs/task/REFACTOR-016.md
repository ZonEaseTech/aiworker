# REFACTOR-016 File-first Soul and Brain Pack authoring

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-07 01:54
- **claimedAt**: 2026-05-07 01:54
- **completedAt**: 2026-05-07 02:04
- **plan**: PLAN-149
- **sourceObjective**: Move Project Brain authoring toward an open-design-style
  file pack model: Soul and Brain semantics should be easy to edit as Markdown
  packs, while AIWorker keeps governance, quality gates, admission, audit, and
  executor supervision as hard invariants.
- **relatesTo**: DOC-005, DOC-006, FEAT-054, PLAN-114, PLAN-115,
  docs/architecture.md, tmp/open-design-research

## Context

The current Brain Governance Kernel decision is still correct: Brain hard logic
must only own governance invariants, while domain semantics and next-step
planning belong to LLM / executor context. The authoring surface is the gap.

Built-in Soul data is currently maintained primarily as TypeScript objects and
then projected into `SOUL.md`, `AGENT.md`, `policy.json`, `toolsets.json`, and
`capability-packs.json`. That gives the Kernel strong structure, but it makes
the most important Brain/Soul material harder to edit than it needs to be.

The local open-design research checkout demonstrates the better authoring
shape: capability directories with Markdown entrypoints, small frontmatter,
sidecar references/assets, discovery by scanning/importing, and thin runtime
adapter logic.

## Scope

- Introduce a file-first Soul Pack contract where built-in Souls are authored
  as Markdown packs instead of TypeScript literals.
- Keep `SoulModule` as the structured loader output consumed by registry,
  brief compiler, doctor, CLI, API, and future UI.
- Materialize built-in `SOUL.md` / `AGENT.md` from pack bodies during
  `aiworker init`.
- Preserve Brain Governance Kernel boundaries: admission, redaction, rollback,
  audit, source tagging, and executor supervision stay in hard logic.
- Update focused tests and documentation so future developers stop adding Soul
  semantics to code registries by default.

## Out of Scope

- Fleet or gateway changes.
- Executor-native skill/plugin/MCP ownership changes.
- Legacy compatibility aliases for pre-1.0 Soul authoring internals.
- A full project-local third-party Soul Pack installation manager.

## Acceptance Criteria

1. Built-in Soul semantics are maintained through Markdown pack files with
   YAML frontmatter and body text.
2. `BUILTIN_SOUL_MODULES` is derived from the pack loader output, not from
   hand-written per-Soul TypeScript modules.
3. `aiworker init --soul <id>` materializes pack-authored `SOUL.md` and
   `AGENT.md`.
4. Existing registry, doctor, scope manifest, and brief compiler consumers keep
   using the structured `SoulModule` contract.
5. Focused shared/CLI tests pass and include pack parser coverage.

## Notes

- 2026-05-07 01:54: Task opened after the product direction was clarified:
  backward compatibility is not a constraint before 1.0.0; the priority is a
  fast-editable, maintainable Brain/Soul authoring surface like open-design,
  without losing self-iteration and executor quality supervision.
- 2026-05-07 02:04: Completed under PLAN-149. Built-in Soul authoring now
  lives in Markdown Soul Packs, with `SoulModule` derived by a YAML
  frontmatter loader. `aiworker init` materializes pack-authored `SOUL.md` /
  `AGENT.md`; the brief compiler and runtime context assembly strip
  frontmatter before LLM projection.

## Validation

- `bun run --filter '@zonease/aiworker-shared' test` PASS: 144 pass / 0 fail.
- `bun run --filter '@zonease/aiworker-cli' test` PASS: 178 pass / 0 fail.
- `bun run --filter '@zonease/aiworker-core' test` PASS: 633 pass / 0 fail.
- `bun run typecheck` PASS.
- `bun run --filter '@zonease/aiworker-cli' build:bundle` PASS.
- `bun run lint` PASS.
- `git diff --check` PASS.
