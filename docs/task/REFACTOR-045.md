# REFACTOR-045 Soul project semantics and init artifact purge

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 11:26
- **claimedAt**: 2026-05-10 11:26
- **plan**: PLAN-214
- **relatesTo**: apps/web, apps/api, apps/cli, packages/core, packages/shared, packages/storage-sqlite, packages/fs-layout

## Background

User review rejected the remaining `project` language and stale initialization
shape. AIWorker should follow the OD-style information architecture where the
primary work object is a project under a selected Soul and capability template,
not a legacy Worker Project surface. Default initialization must also stop
materializing historical Project Brain internals such as `.aiworker/local`,
`scope.json`, `brain-capabilities.json`, and `executor-capabilities.json`.

## Goal

Destructively converge the local vertical Soul MVP on:

- Soul catalog;
- capability templates;
- Soul projects;
- runs;
- artifacts;
- review and memory admission surfaces;
- Settings as explicit-open workspace configuration.

Remove default project terminology and stale initialization artifacts from the
current product path rather than preserving unpublished compatibility aliases.

## Acceptance Criteria

- Web, API, CLI, shared schemas, storage tables, runtime metadata, and tests use
  `project` for the primary work object.
- `/api/local/projects` replaces the local project endpoint; run creation carries
  `projectId`, `selectedSoulId`, and `selectedSkillId`.
- The Web first screen no longer contains visible `project`, `work order`, import,
  Open Design/Nexu, or design-generation language.
- Default project initialization no longer writes `.aiworker/local`,
  `scope.json`, `brain-capabilities.json`, or `executor-capabilities.json`.
- README, GOALS, architecture, PMA docs, and changelog describe the corrected
  Soul / template / project / run / artifact path.
- Focused gates, browser preview, and code-review-graph review are recorded.

## Evidence

- Replaced the default work object with `project` across Web, API, CLI, shared
  schemas, core runtime, storage schema/migration metadata, tests, README,
  GOALS, and architecture docs.
- Replaced local project endpoints with `/api/local/projects`; runs now carry
  `projectId`, `selectedSoulId`, and `selectedSkillId`.
- Removed the unpublished `createNoopExecutor` compatibility export and renamed
  the built-in runner source to `workspace-template`.
- `aiworker init` now materializes product-facing Soul workspace scaffolding:
  `.aiworker/SOUL.md`, `DOMAIN.md`, `TEMPLATES.md`, `PROJECTS.md`,
  `MEMORY.md`, `projects/`, `artifacts/`, and `memories/`; tests assert it no
  longer writes `.aiworker/local`, `scope.json`, `brain-capabilities.json`, or
  `executor-capabilities.json`.
- Browser validation at `http://127.0.0.1:5178/worker/` created HR, PM, QA, and
  DevOps projects/runs/artifacts and confirmed page text has no `case` or import
  entry.
