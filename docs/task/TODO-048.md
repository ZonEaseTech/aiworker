# TODO-048 Build generic chat view rendering primitives

- **status**: in-progress
- **priority**: P2
- **owner**: Codex
- **createdAt**: 2026-05-26
- **relatesTo**: packages/ui

## Context

The current shared `SessionThread` is a linear message list. Chat-like product
surfaces need reusable, friendly transcript primitives for turns, activity
groups, command blocks, markdown, streaming placeholders and artifact
references.

## Boundary

This task belongs to `packages/ui` reusable primitives. It must not describe
workspace, session, chat or transcript as Host-owned product surfaces. Consumers
provide generic view models; the shared components only render them.

## Acceptance

- Generic chat/transcript renderer primitives exist under `packages/ui`.
- The renderer supports activity grouping, command blocks, assistant markdown,
  streaming placeholders and artifact strips.
- Legacy `SessionThread` compatibility remains intact.
- Focused UI tests, typecheck, UI governance and code-review-graph pass.
