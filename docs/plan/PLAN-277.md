# PLAN-277 HR Role Search Cockpit evidence-first UX

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 12:40
- **approvedAt**: 2026-05-12 12:40
- **completedAt**: 2026-05-12 12:55
- **relatedTask**: REFACTOR-070

## Current State

HR Role Search Cockpit v1 gives AIWorker a specialized Soul workbench, but it
still distributes attention across a hero panel, pipeline card, evidence card,
and task tray. For a real HR operator, that shape does not yet answer the first
question quickly enough: which role search needs attention, what evidence is
missing, and what should the agent help prepare next?

The core product correction is to move from “feature showcase” to “workbench
flow”. HR users should see a command surface that keeps context, evidence,
actions, and proposal generation adjacent.

## Design Decision

Use an evidence-first three-region layout:

```text
Context rail | Evidence workspace | Next actions + proposal composer
```

Context rail:

- role search list;
- source/evidence inventory;
- review guardrails.

Evidence workspace:

- Evidence Matrix as the primary panel;
- role rubric snapshot and roundup packet as secondary panels;
- visible coverage, signal, and risk states without candidate ranking.

Next actions:

- recommended HR agent actions;
- clear artifact target selector;
- proposal context composer;
- disabled state still respects engine readiness and workspace selection.

## Scope

In scope:

- HR cockpit component and dedicated CSS.
- Focused WorkerStudio tests that assert the new HR vocabulary and preserve
  generic fallback Souls.
- PMA docs and changelog update.
- Focused typecheck/lint/test/build, browser UX review, and code-review-graph.

Out of scope:

- API/schema changes.
- New artifact file model.
- New connector implementation.
- Specialized workbench changes for non-HR Souls.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Browser desktop/mobile UX check for HR cockpit.
- Browser fallback check for one non-HR Soul.
- code-review-graph update/review.

## Approval Gate

Approved by operator on 2026-05-12 through “按你的思路出一版让我看看”.

## Progress

- 2026-05-12 12:40: Claimed and started the evidence-first HR cockpit v2 pass.
- 2026-05-12 12:55: Completed the evidence-first HR cockpit pass. Browser UX
  review found that the existing 9218 daemon was stale and that built Worker Web
  font assets were not served by the local daemon; both were addressed by using
  a fresh 9327 daemon preview and adding `/fonts/*` static serving.
