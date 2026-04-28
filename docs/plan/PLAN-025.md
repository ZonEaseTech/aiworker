# PLAN-025 Release readiness hardening for 0.4.0

- **status**: completed
- **createdAt**: 2026-04-28 10:02
- **approvedAt**: 2026-04-28 10:02
- **completedAt**: 2026-04-28 10:08
- **relatedTask**: BUG-023

## Current State

The review of changes since `v0.3.0` found that most quality gates pass, but
the release cannot be cut yet:

- npm `latest` is already `@zonease/aiworker-cli@0.3.0`, while the package
  still declares `0.3.0`.
- `aiworker init` in brand-new project scope can write secrets with a freshly
  minted key even when the operator explicitly supplied `AIWORKER_MASTER_KEY`;
  the next command then uses the explicit env key and cannot decrypt the row.
- Compiled GitHub Release binaries do not include sibling runtime assets.
- Root build and CLI build both write `apps/web/dist` when run together.

## Proposal

1. Bump the CLI package to `0.4.0` and document the release-prep fix.
2. Preserve explicit master/shared secret env values during project init.
3. Update the CLI smoke to run inside an isolated temporary git project.
4. Split CLI build into `build` and `build:bundle`; make root build sequence
   Web before CLI bundle to avoid concurrent `apps/web/dist` writes.
5. Make publish manifest copying strict and clean: copy only
   `apps/web/dist/{fleet,worker}` into `apps/cli/dist/web/{fleet,worker}`.
6. Package GitHub Release compiled binaries as tarballs containing the binary,
   `web/`, `drizzle/`, and `README.md`.

## Risks

- Changing release artifacts from raw binaries to tarballs affects operator
  download habits, but raw binaries are incomplete for current runtime
  behavior.
- Making Web bundle copying strict can fail local builds when Web output is
  missing. This is intentional for release readiness because the CLI now serves
  Web admin bundles by default.

## Scope

In scope:

- CLI init/bootstrap release regression.
- CLI and root build scripts.
- Publish manifest copying behavior.
- GitHub release asset packaging.
- Task/changelog release documentation.

Out of scope:

- UI feature changes.
- Additional Web route or API behavior changes.
- Publishing the release or creating the git tag.

## Implementation

- Bumped `@zonease/aiworker-cli` to `0.4.0`.
- Preserved explicit master/shared secrets during brand-new project init.
- Added a real CLI subprocess regression for explicit-key init followed by
  `run --dry-run`.
- Moved `smoke:aiworker-run` into an isolated temporary git project.
- Split the CLI build into `build` and `build:bundle`, then made root build
  sequence API, Web, and CLI bundle output.
- Made publish manifest Web copying strict and stale-safe.
- Changed GitHub Release compiled binary artifacts to tarballs containing the
  binary, `web/`, `drizzle/`, and `README.md`.

## Verification

- `bun run --filter '@zonease/aiworker-cli' test` -> 39 pass / 0 fail.
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run` -> pass.
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet` -> pass.
- `bun run build` -> pass.
- `bun run check` -> pass.
- `bun run test` -> pass.
- `bun run --filter '@zonease/aiworker-web' check:shared-cycles` -> pass.
- `bun run --filter '@zonease/aiworker-web' size:report` -> pass; fleet gzip
  +10.4%, worker gzip +10.0% against baseline.
- `git diff --check` -> pass.
- `cd apps/cli/dist && bun publish --dry-run --access public` packed 23 files
  for `0.4.0` and stopped at missing authentication, as expected locally.
- npm registry check confirmed `0.4.0` is unclaimed and `latest` is still
  `0.3.0`.
