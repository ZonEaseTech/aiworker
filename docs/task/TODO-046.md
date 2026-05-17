# TODO-046 Add a headless reviewed profile promotion command

- **status**: completed
- **priority**: P2
- **owner**: codex
- **createdAt**: 2026-05-17
- **claimedAt**: 2026-05-17
- **completedAt**: 2026-05-17
- **plan**: PLAN-347
- **relatesTo**: apps/cli/src/aiworker.ts, packages/core/src/worker/runtime.ts, apps/web/src/worker/worker-studio.tsx

## Background

The QA-036 regression campaign promoted a corrected HR
`profile-update-proposal` through `LocalWorkerRuntime.promoteProfileRevision`.
That proved the product promotion path, but the headless debug flow required a
one-off runtime script because the CLI exposes artifact/review inspection but
does not expose a reviewed profile promotion command.

## Optimization

Add a CLI command for headless product promotion, for example:

```bash
aiworker profile promote --worker <id> --workspace <id> --artifact <id> --verdict pass
```

The command should extract the `aiworker-profile-readme` fenced draft, reject
proposal-shaped drafts, create the review record, update `README.md`, and
return the profile path, review path, and git commit result.

## Acceptance Criteria

- The command refuses artifacts without a clean `aiworker-profile-readme`
  fenced block unless an explicit reviewed `--profile-markdown` input is
  provided.
- The command rejects pending-review or promotion-request language inside the
  accepted README draft.
- Focused CLI coverage proves pass/warn promotions and rejected drafts.

## Implementation Plan

- Covered by `PLAN-347`.

## Result

Implemented `aiworker profile promote` for reviewed profile promotion:

- default artifact promotion requires a clean `aiworker-profile-readme` fenced
  README draft;
- `--profile-markdown <path>` supports explicit reviewed profile markdown while
  still running accepted-profile validation;
- CLI/runtime/API/Web all reuse the same shared promotion helper;
- runtime rejects missing-fence artifact promotion and proposal-state accepted
  drafts before writing `README.md`;
- API returns `PROFILE_REVISION_REJECTED` for product validation failures.

## Verification

- `bun run --filter '@zonease/aiworker-shared' test src/profile-promotion.test.ts`
- `bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- Isolated deterministic debug rounds:
  `tmp/hr-profile-promote-debug-20260517151429`
- Real Codex two-turn HR profile debug:
  `tmp/hr-profile-promote-real-20260517151507`
