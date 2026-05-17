# TODO-046 Add a headless reviewed profile promotion command

- **status**: pending
- **priority**: P2
- **owner**: unassigned
- **createdAt**: 2026-05-17
- **plan**: PLAN-346
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
