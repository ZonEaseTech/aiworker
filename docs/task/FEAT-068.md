# FEAT-068 Mounted Surface Protocol and release gate hardening

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-13 12:00
- **plan**: PLAN-293
- **relatesTo**: FEAT-066, FEAT-067, packages/shared, apps/api, apps/cli, apps/web, apps/aiworker-hr, apps/aiworker-qa

## Description

Implement the mounted UI surface protocol without making iframe the only
rendering path. Host must support safe descriptor-rendered surfaces and
sandboxed frame surfaces, while keeping Soul Apps independently deployable and
keeping Host source imports out of `apps/aiworker-*/src/*`.

Acceptance criteria:

- Manifest UI contributions can declare `host-descriptor` or
  `sandboxed-frame` mounted surfaces.
- `trusted-module` is represented as a future renderer but rejected by current
  validation.
- CLI validation verifies artifact schema SHA-256 values against actual files.
- Host healthchecks manifest-declared mounted `baseUrl` services before proxying
  requests.
- Host injects a signed scoped mount context into mounted API and surface
  requests.
- Host Web renders at least one HR and one QA descriptor surface and exposes a
  sandboxed frame surface without executing app JS in the Host runtime.
- HR/QA `app validate` and `app smoke` pass, alongside focused and root gates.

## ActiveForm

Making mounted Soul App UI renderer-aware, product-visible, and guarded by
release-grade zero-trust checks.

## Notes

- 2026-05-13 12:16: Completed. Manifest UI contributions can now declare
  mounted `surface` metadata for `host-descriptor` and `sandboxed-frame`
  renderers, with `trusted-module` reserved and rejected by validation. CLI
  validation checks artifact schema hashes against files. Host healthchecks
  declared mounted services, injects signed scoped mount context headers, and
  proxies declared descriptor/frame surfaces. HR/QA expose real descriptor and
  frame surfaces, and Worker Web renders descriptor fields/actions plus a
  sandboxed iframe surface in the Soul Apps rail.
