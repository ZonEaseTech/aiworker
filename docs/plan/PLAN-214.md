# PLAN-214 Soul project semantics and init artifact purge

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 11:26
- **relatedTask**: REFACTOR-045

## Current State

The partially corrected MVP still uses `project` as the default work object across
Web/API/core/storage/CLI/docs. It also leaves default initialization semantics
from the old Project Brain era visible through `.aiworker/local`,
`scope.json`, `brain-capabilities.json`, and `executor-capabilities.json`.
Those choices make the product feel like a legacy developer worker dressed as a
vertical Soul workspace.

## Proposal

1. Replace the local product object from `project` to `project` across shared
   schemas, storage, runtime, API, Web client/UI, CLI commands, and focused
   tests.
2. Rename storage tables/columns and run metadata from `projects/projectId` to
   `projects/projectId`; break unpublished compatibility instead of adding
   aliases.
3. Keep the OD-style layout skeleton, but ensure visible copy and flows say
   Soul, capability template, project, run, artifact, review, and memory.
4. Strip default project initialization down to product-facing Soul workspace
   scaffolding; stop writing legacy local/scope/Brain capability/executor
   overlay JSON files by default.
5. Update README, GOALS, architecture, PMA docs, changelog, and quality checks
   to guard the corrected language and initialization contract.

## Implementation Status

Completed. The cross-layer product object is now Soul `project`, the default
initializer no longer carries the old local/scope/capability JSON artifacts, and
the OD-style Worker Web IA uses Soul / capability template / project / run /
artifact language.
