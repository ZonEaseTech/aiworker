# FEAT-085 HR Profile Ledger and Native Skills

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-15 02:23
- **plan**: PLAN-323
- **relatesTo**: apps/aiworker-hr, apps/web, apps/api, packages/core, packages/shared, docs/superpowers/specs/2026-05-15-hr-profile-ledger-native-skills-design.md

## Context

The HR Soul App must become profile-first. The user-facing unit is not a single
session artifact; it is a People Profile whose accepted state changes over time.
For this app, one profile item maps to one workspace, and the workspace
`README.md` is the canonical accepted profile.

The approved product and architecture decisions are recorded in
`docs/superpowers/specs/2026-05-15-hr-profile-ledger-native-skills-design.md`
and the execution plan is
`docs/superpowers/plans/2026-05-15-hr-profile-ledger-native-skills.md`.

## Goals

- Initialize profile workspaces with `README.md`, evidence/review/artifact
  folders, local git ledger plumbing, and safe ignore rules.
- Project Soul App-native skills from `apps/<app-id>/skills/*/SKILL.md` into
  engine-native workspace locations without executing app code.
- Add a generic local profile revision API that promotes a reviewed artifact
  into the workspace `README.md`.
- Add HR-native skills for profile, evidence, interview, and risk review work.
- Recenter the HR Worker Web workbench around Current Profile Summary, with
  Candidate / Employee / Alumni as first-level profile lists.
- Keep Host generic: it prepares and promotes workspace profile files but does
  not infer HR profile fields or review meaning.

## Non-Goals

- No remote hosted review system.
- No custom replacement for git history.
- No Host-side HR profile synthesis.
- No third-party Soul App sandbox.
- No secret or raw connector evidence committed to profile history by default.

## Acceptance Criteria

- New HR workspaces contain `README.md`, `artifacts/`, `reviews/`,
  `evidence/descriptors/`, `evidence/raw/`, `.aiworker/sessions/`, and
  profile-safe `.gitignore` entries.
- When local `git` is available, new workspaces initialize as git repositories
  with an initial profile commit.
- Enabled source-backed Soul Apps project native skills into
  `.agents/skills/<app-id>-<skill-id>/SKILL.md` and
  `.claude/skills/<app-id>-<skill-id>/SKILL.md`.
- `POST /api/local/workspaces/:workspaceId/profile-revisions` promotes only
  `pass` / `warn` revisions into `README.md`.
- `GET /api/local/workspaces/:workspaceId/profile` returns current accepted
  profile markdown.
- HR Worker Web shows Current Profile Summary as the visual center and keeps
  artifact output as Proposed Change / Artifact Proposal.
- Candidate / Employee / Alumni are first-level profile groups; each list item
  is one profile workspace.
- Focused gates, Web build, HR validation, diff check, and code-review-graph
  pass or have documented residuals.

## Verification

- `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`
- `bun test --timeout=15000 apps/api/src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/souls/hr/people-workbench/model.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run check`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## ActiveForm

- 2026-05-15 02:23: Opened from the approved HR profile ledger / native skills
  design. Baseline focused gates passed before implementation:
  `packages/core/src/worker/runtime.test.ts`, `apps/api/src/modes/worker.local.test.ts`,
  and `apps/web/src/worker/souls/hr/people-workbench/model.test.ts`.
- 2026-05-15 02:39: Implemented native skill projection, git-backed profile
  workspace bootstrap, profile revision promotion API, HR native skills, and
  the profile-first HR Worker Web loop. Web RED/GREEN evidence captured with
  focused HR model and Worker Studio tests.
- 2026-05-15 02:45: Completed focused gates, root `bun run check`,
  root `bun run test`, root `bun run build`, `git diff --check`,
  Playwright desktop/mobile smoke, and code-review-graph review. Browser smoke
  verified first-run HR worker creation, People Profile workspace creation,
  `README.md` current profile rendering, Candidate / Employee / Alumni groups,
  mobile header wrapping, local git initialization, and 5 native HR skill
  projections.
