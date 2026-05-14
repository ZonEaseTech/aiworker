# PLAN-321 Soul App Web Storage discipline

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 17:32
- **relatedTask**: FEAT-084

## Decision

Implement the approved trusted first-party browser storage discipline from
`docs/superpowers/specs/2026-05-14-soul-app-web-storage-discipline-design.md`.

Current same-realm Soul App code is first-party official code. The goal is to
prevent accidental browser storage collisions through SDK scoping and
self-checks, while clearly documenting that this is not a third-party security
sandbox.

## Investigation

- Host broker storage already scopes durable app data through
  `/api/local/apps/:appId/broker/storage/*`.
- Shared manifest validation already requires `storage.namespace` to equal the
  Soul App id.
- Current official HR/QA source has no raw `localStorage` or `sessionStorage`
  usage.
- CLI `app validate` already scans Soul App production `src/` for Host-private
  imports and can report additional source-level issues.
- Root `bun run lint` already invokes `scripts/check-soul-app-boundaries.ts`,
  making it the smallest place to protect official app source.

## Implementation Slices

1. Add SDK scoped Web Storage helper and tests.
2. Extend CLI Soul App validation with raw Web Storage issue reporting.
3. Extend root official Soul App boundary self-check.
4. Document trusted first-party storage discipline and future third-party gate.
5. Run focused/root gates, code-review-graph, PMA closeout and final commit.

## Verification Plan

- `bun run --filter '@zonease/aiworker-soul-app-sdk' test src/index.test.ts`
- `bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun scripts/check-soul-app-boundaries.ts`
- `bun run docs:check`
- `bun run check`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Failure Handling

- If SDK helper tests fail, keep implementation local to SDK until behavior is
  stable before wiring docs and validation.
- If CLI validation output shape breaks existing tests, keep existing fields and
  add `webStorageIssues` as an additive report field.
- If root lint finds existing Host Web storage usage, do not broaden the scan to
  Host code in this slice; classify Host usage separately and keep this slice
  focused on Soul App production source.

## Result

Completed on 2026-05-14.

- SDK helper landed in `@zonease/aiworker-soul-app-sdk` with typed read/write,
  remove, key and scope-clearing operations.
- CLI validation now reports additive `webStorageIssues` and fails app
  validation when production `src/` files use raw browser Web Storage APIs.
- Root `scripts/check-soul-app-boundaries.ts` protects official HR/QA app
  production source through the existing root lint path.
- Architecture, Soul App developer docs and SDK README now describe browser
  storage as trusted first-party discipline and reserve stronger isolation for
  future third-party Soul Apps.
- Verification passed with focused SDK/CLI/self-check gates, root `check`,
  root `test`, root `build`, diff check and code-review-graph.
- code-review-graph exited 0 with static test-gap hints for CLI helper
  functions; the behavior is covered by `aiworker app validate` regression
  tests and root boundary self-check execution.
