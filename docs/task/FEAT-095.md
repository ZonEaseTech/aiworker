# FEAT-095 HR Profile Revision Review Workbench

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-17
- **claimedAt**: 2026-05-17
- **completedAt**: 2026-05-17
- **plan**: PLAN-348
- **relatesTo**: apps/web/src/worker/souls/hr/people-workbench, apps/web/src/worker/__tests__/worker-studio.test.tsx

## Background

The HR workbench is now profile-first, and `aiworker profile promote` plus the
runtime/API path can safely promote only clean `aiworker-profile-readme` drafts.
The Web proposed-change area still behaves like a generic artifact preview with
one approve button. Reviewers cannot clearly see which Markdown will become the
accepted profile, why a draft is blocked, or how the proposed profile compares
with the current `README.md`.

## Goal

Upgrade the HR Web proposed-change section into a profile revision review
workbench that makes promotable README drafts, blocked drafts, and current vs
proposed profile differences visible before approval.

## Acceptance Criteria

- The proposed-change section shows a promotability status for the selected
  artifact.
- Valid artifacts show the extracted accepted README draft as the primary
  proposed profile preview.
- Invalid artifacts explain why approval is disabled.
- Current and proposed profile summaries are visible in a compact comparison.
- Web still sends only the accepted profile Markdown to the profile-revision
  API when approval succeeds.
- Focused model and Worker Web tests cover valid and invalid review states.

## Implementation Plan

- Covered by `PLAN-348`.

## Result

- Added a Product-owned HR Web revision-review model around shared profile
  promotion validation.
- Proposed changes now show ready/blocked status, current vs accepted-draft
  profile summary comparison, and the extracted accepted README draft.
- Approval is disabled for artifacts without a promotable
  `aiworker-profile-readme` draft.
- The collapsed tools rail now opens the requested section instead of merely
  expanding the panel.
- Fixed a medium-desktop flex shrink bug where the proposed-change action could
  overlap the guardrails section.

## Verification

- `bun run --filter '@zonease/aiworker-web' test src/worker/souls/hr/people-workbench/model.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run lint`
- `git diff --check`
- Browser debug with mocked local API for ready approval, blocked approval, and
  mobile stacked comparison states.
