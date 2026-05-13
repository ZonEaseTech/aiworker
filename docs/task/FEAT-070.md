# FEAT-070 Legacy Soul metadata migration and mounted surface hardening

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-13 13:03
- **plan**: PLAN-295
- **relatesTo**: FEAT-066, FEAT-068, FEAT-069, packages/core, packages/storage-sqlite, apps/api, apps/cli, apps/web

## Description

After Host catalog was converged to app-only Soul App projections, harden the
remaining release risks without adding more official Soul Apps yet.

Acceptance criteria:

- Legacy local metadata for built-in `hr` / `qa` workers and capability
  template ids is migrated to `aiworker-hr` / `aiworker-qa` and namespaced
  capability ids.
- Existing worker ids and workspace paths are not renamed by the migration.
- Fresh API startup and explicit official app bootstrap both run the repair path
  after official HR/QA apps are available.
- App import boundary checks are generic for Soul Apps under `apps/*` and are
  wired into the normal lint gate, not only into `app validate`.
- Host/source code cannot import Soul App internals by `apps/*/src` paths.
- A committed browser/UI smoke covers mounted descriptor and sandboxed frame
  surfaces against a real local daemon.
- PM/DevOps/finance/legal/ops official Soul Apps remain out of scope.

## ActiveForm

Hardening the app-only Host migration by repairing old local metadata, making
Soul App import isolation a lint gate, and adding browser-level mounted surface
verification.

## Notes

- 2026-05-13 13:03: Created and claimed after the user selected next steps 1,
  2 and 4, while explicitly deferring creation of more official Soul Apps.
- 2026-05-13 14:02: Completed. Added legacy HR/QA metadata repair, wired it to
  API startup and CLI official bootstrap, added generic Soul App boundary lint,
  added mounted surface browser smoke, and fixed concurrent mounted service
  launch deduplication found by the browser smoke.
