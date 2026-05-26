# PLAN-418 Generic chat view rendering primitives

- **status**: completed
- **owner**: Codex
- **createdAt**: 2026-05-26
- **completedAt**: 2026-05-26
- **relatedTask**: TODO-048
- **superpowersSpec**: docs/superpowers/specs/2026-05-26-chat-view-rendering-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-26-chat-view-rendering.md

## Context

The approved design adds generic `packages/ui` chat/transcript rendering
primitives inspired by Codex Desktop's information hierarchy while keeping the
AIWorker boundary intact.

## Proposal

1. Add generic transcript view-model types.
2. Add assistant markdown rendering with a small supported syntax set.
3. Add command block, streaming placeholder and artifact strip primitives.
4. Add activity grouping and turn composition primitives.
5. Preserve legacy `SessionThread` compatibility.
6. Verify with focused tests, typecheck, UI governance and code-review-graph.

## Verification

- `bun run --filter '@zonease/aiworker-ui' test`
- `bun run --filter '@zonease/aiworker-ui' typecheck`
- `bun run ui:check`
- `bun run crg:update`
- `bun run crg:review`
- `git diff --check`

## Completion Summary

Generic chat/transcript rendering primitives were added under `packages/ui`.
The components render generic view models for turns, activity groups, command
blocks, assistant markdown, streaming placeholders and artifact references
without owning workspace/session/chat product semantics. Legacy `SessionThread`
compatibility remains intact.
