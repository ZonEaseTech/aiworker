# REFACTOR-001 Refactor AIWorker into a self-hosted Agent Runtime

- **status**: in_progress
- **priority**: P1
- **owner**: coordinator
- **createdAt**: 2026-04-20 17:40

## Description

Reposition AIWorker from a passive middleware glue (Hermes ↔ OpenClaw) to a self-hosted Agent Runtime with pluggable Brain and Executor layers.

Driver: both Hermes and OpenClaw have been banned by Claude officially, so the "glue" value proposition collapses. Direction confirmed with user:

- Keep the Brain / Executor split (knowledge as brain + iteration, execution handled by "OpenClaw" as a conceptual layer).
- `BrainProvider` interface in `packages/shared`; first implementation `HermesProvider` (second implementation will be user's replacement, out of scope here).
- Keep the "OpenClaw" naming as the executor concept; swap the underlying engine to an OpenAI-compatible endpoint.
- Refactor in place — preserve skeleton, abstract the seams; do not rewrite from scratch.

Acceptance criteria:

- `packages/shared` exports `BrainProvider`, `ExecutorProvider`, orchestrator task types.
- `HermesProvider` implements `BrainProvider` against existing `adapters/hermes/*`.
- `OpenAICompatibleExecutor` implements `ExecutorProvider` via chat completions + tool calling against an OpenAI-compatible endpoint configured by env.
- All backend modules (`health` / `skills` / `memory` / `execution` / `config`) consume Provider interfaces, not adapters directly.
- A new `orchestrator` module drives the brain → executor → brain feedback loop.
- Web pages keep the current routes but surface new semantics (brain/executor status, orchestrator task view).
- `bun run check` clean; existing tests still pass (or are updated to match the new interface).

## ActiveForm

Refactoring AIWorker into a self-hosted Agent Runtime

## Dependencies

- **blocked by**: (none)
- **blocks**: (none)

## Notes

Related plan: PLAN-002. Previous product (FEAT-001 / PLAN-001) completed the monorepo scaffold + six-module backend + six-page frontend; that skeleton is the starting point for this refactor.
