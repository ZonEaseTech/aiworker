# PLAN-212 OD-style vertical Soul workspace correction

- **status**: superseded
- **owner**: local
- **createdAt**: 2026-05-10 11:28
- **relatedTask**: REFACTOR-044

## Current State

The latest Web implementation has the right objects but the wrong product
shape: it reads as a new dashboard/catalog instead of the OD-style IA skeleton
the user wanted to preserve. The local run output also produces a thin artifact
body that makes the MVP feel non-functional.

## Proposal

1. Restore the OD-style Worker Studio layout structure:
   left creation rail, center workspace/grid, right artifact/review rail, and
   explicit Settings dialog.
2. Replace remaining work-order/import/design-language concepts with AIWorker
   Soul, capability template, project, artifact, review, connector, MCP, language,
   and appearance language.
3. Keep the shared Soul/template catalog and project/run API introduced by the
   previous MVP, but send execution metadata from Settings when starting runs.
4. Replace the demo local executor with a deterministic structured artifact
   renderer for out-of-box use, while preserving BYOK/CLI metadata boundaries
   and explicit engine test/rescan behavior.
5. Update focused tests and CSS quality checks to guard the corrected IA and
   reject import/work-order/design-copy regressions.

## Implementation Status

Superseded by PLAN-214 after user review clarified that the object model itself
must change from `project` to `project` and that old initialization artifacts must
be removed from the default path.
