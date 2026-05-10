# PLAN-206 Worker Web product-detail correction

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 02:05
- **completedAt**: 2026-05-10 09:11
- **relatedTask**: REFACTOR-040

## Current State

Implemented and usable now:

- local workspace metadata and `worker.db` schema for workspace, brief, run,
  run event, file, artifact, review, lesson, and settings;
- local daemon API under `/api/local/*`;
- CLI loop for init, daemon lifecycle, brief/run/artifact/review/lesson/settings
  and executor-oriented commands;
- core runtime loop that turns a brief or prompt into a run, files/artifacts,
  review, and lesson candidates;
- Web bundle is worker-only and creates a local brief/run from the home screen;
- Web home has an Open Design-style left creation panel, center cards, right
  companion rail, search, and settings dialog component.

Still pending or weak:

- Web copy is still too literal: Open Design brand, design/prototype nouns,
  Nexu copy, Claude Design import, and copied companion text remain;
- Web copied desktop app chrome into the browser, including macOS traffic-light
  controls;
- settings dialog opens by default instead of being a user action;
- settings UI is still mostly static and not backed by `/api/local/settings`;
- Worker pack selection, domain systems, templates, run streaming, artifact
  preview, review, and lesson promotion are not yet represented as clear first
  screen workflows;
- Fleet/gateway remains intentionally out of scope for the local worker reboot.

## Proposal

This slice fixes the two user-visible mistakes and the most obvious stale copy:

1. Remove browser-inappropriate macOS window controls from the entry side.
2. Make settings closed by default and add an explicit settings trigger in the
   Web header.
3. Translate home/settings copy from Open Design/design-tool vocabulary into
   AIWorker work order, worker pack, workspace, run, artifact, and executor
   vocabulary.
4. Update tests and selector guardrails to reject the removed chrome and stale
   copy.

Broader work remains for later slices: live run stream, artifact preview,
review/lesson workflows, real worker pack picker, and persisted settings.

## Implementation Status

| Batch | Status | Scope | Evidence |
| --- | --- | --- | --- |
| D1 product detail correction | completed | Worker Web component/CSS/tests | Removed desktop chrome, made settings default-closed, replaced literal OD copy with AIWorker work-order copy, replaced copied avatar/logo assets |
| D2 PMA and verification | completed | task/plan/changelog, Web gates, browser, CRG | Recorded inventory, tests, browser proof, and review result |

## Verification Plan

```sh
bun run --filter '@zonease/aiworker-web' test
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' lint
bun run --filter '@zonease/aiworker-web' build
git diff --check
bun run crg:update
bun run crg:review
```

Browser proof must open `http://127.0.0.1:5173/worker/` and confirm the home
appears without a default settings modal or macOS traffic-light controls.

## Verification Result

Completed:

- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- `bun run crg:update && bun run crg:review`
- Browser review of `http://127.0.0.1:5173/worker/` confirmed no default
  settings dialog, no macOS traffic-light controls, AIWorker work-order copy on
  the home screen, no copied avatar image, and settings opening only through the
  explicit settings button.

CRG reported 0 affected flows, 3 test gaps, and risk score 0.40.
