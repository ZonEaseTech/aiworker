# HR Profile Ledger And Native Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `aiworker-hr` a profile-first vertical Soul App whose primary object is a People Profile workspace, whose canonical accepted profile lives in `README.md`, whose proposed artifact changes can be promoted through human review, and whose Soul App-native skills are projected into the engine workspace.

**Architecture:** Keep Host generic and protocol-bound. The Host runtime prepares workspace layout, local git revision plumbing, and app-owned native skill projections from static Soul App source directories. The HR Soul App owns the People Profile vocabulary, skill content, profile UI, artifact/review semantics, and user-facing wording.

**Tech Stack:** Bun, TypeScript, bun:test, Vitest, Hono local daemon API, React 19 Worker Web, local git CLI, existing PMA docs, existing Soul App manifest/runtime boundary.

---

## File Structure

- Add `packages/core/src/worker/native-skills.ts`: static discovery and projection from `apps/<app-id>/skills/*/SKILL.md` into workspace `.agents/skills` and `.claude/skills`.
- Add `packages/core/src/worker/profile-ledger.ts`: workspace README/bootstrap, `.gitignore`, git init/commit/tag helpers, review record rendering, and artifact-to-profile promotion.
- Modify `packages/core/src/worker/runtime.ts`: initialize/repair profile workspace layout, project native skills, and expose `promoteProfileRevision(...)`.
- Modify `packages/core/src/host/runtime.ts`: pass enabled Soul App source root into worker runtimes.
- Modify `packages/core/src/worker/runtime.test.ts`: TDD coverage for README ledger creation, git behavior, skill projection, prompt context, and profile promotion.
- Modify `apps/api/src/modes/worker.ts` and tests: add local profile read and profile revision promotion endpoints.
- Modify `apps/web/src/features/local-workspace/api/*`, `apps/web/src/worker/worker-studio.tsx`, and `apps/web/src/worker/souls/types.ts`: load current profile README and expose profile revision promotion to specialized workbenches.
- Modify `apps/web/src/worker/souls/hr/people-workbench/*`: make Current Profile Summary the center, keep Candidate / Employee / Alumni as the first-level profile list, and demote artifacts to Proposed Changes.
- Add `apps/aiworker-hr/skills/*/SKILL.md`: HR-native domain skills for candidate profile, profile update proposal, evidence screening, interview brief, and hiring risk review.
- Modify HR app prompts/copy/manifest only where needed to keep domain terminology coherent.
- Add/modify PMA docs `docs/task/FEAT-085.md`, `docs/plan/PLAN-323.md`, and `docs/changelog.md`.

## Task 1: PMA Tracking And Baseline

**Files:**
- Add: `docs/task/FEAT-085.md`
- Add: `docs/plan/PLAN-323.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Record investigation and scope**

Create PMA docs for `FEAT-085 / PLAN-323` with the approved decisions from `docs/superpowers/specs/2026-05-15-hr-profile-ledger-native-skills-design.md`.

- [x] **Step 2: Record baseline verification**

Document the already-run baseline:

```bash
bun test --timeout=30000 packages/core/src/worker/runtime.test.ts
bun test --timeout=15000 apps/api/src/modes/worker.local.test.ts
bunx vitest run --testTimeout=15000 apps/web/src/worker/souls/hr/people-workbench/model.test.ts
```

Expected baseline: all three pass before implementation.

## Task 2: Native Skill Projection

**Files:**
- Modify: `packages/core/src/worker/runtime.test.ts`
- Add: `packages/core/src/worker/native-skills.ts`
- Modify: `packages/core/src/worker/runtime.ts`
- Modify: `packages/core/src/host/runtime.ts`
- Add: `apps/aiworker-hr/skills/candidate-profile/SKILL.md`
- Add: `apps/aiworker-hr/skills/profile-update-proposal/SKILL.md`
- Add: `apps/aiworker-hr/skills/evidence-screening/SKILL.md`
- Add: `apps/aiworker-hr/skills/interview-brief/SKILL.md`
- Add: `apps/aiworker-hr/skills/hiring-risk-review/SKILL.md`

- [x] **Step 1: Write failing projection tests**

Add runtime tests that create a fake Soul App source root with `skills/candidate-profile/SKILL.md`, create a workspace, and assert:

- `.agents/skills/aiworker-hr-candidate-profile/SKILL.md` exists.
- `.claude/skills/aiworker-hr-candidate-profile/SKILL.md` exists.
- `.aiworker/native-skill-projections.json` records app id, skill id, source, target paths, and sha256.
- A Soul App without `skills/` still creates a usable workspace and records no projected skills.

- [x] **Step 2: Run RED**

Run:

```bash
bun test --timeout=30000 packages/core/src/worker/runtime.test.ts
```

Expected: fail because projection does not exist.

- [x] **Step 3: Implement projection**

Discover only static files under `sourceRoot/skills/*/SKILL.md`; do not execute app code. Write app-owned projections to both engine-native targets and metadata under `.aiworker/native-skill-projections.json`. Projection must be idempotent and must not delete user-authored non-`aiworker-*` skills.

- [x] **Step 4: Wire source root**

When Host creates a `LocalWorkerRuntime`, resolve the enabled `HostedSoulApp` for `worker.soulId`. For manifest-path installs, pass `dirname(sourceRef)` as `nativeSkillSource.sourceRoot`. Inline manifests have no static source root and should no-op.

- [x] **Step 5: Add HR-native skills**

Add concise domain skills under `apps/aiworker-hr/skills/` using HR terminology: candidate profile, profile update proposal, evidence screening, interview brief, and hiring risk review. Keep secrets out of skill files.

- [x] **Step 6: Run GREEN**

Run:

```bash
bun test --timeout=30000 packages/core/src/worker/runtime.test.ts
bun run --filter '@zonease/aiworker-hr' validate
```

Expected: pass.

## Task 3: Profile Workspace Ledger

**Files:**
- Modify: `packages/core/src/worker/runtime.test.ts`
- Add: `packages/core/src/worker/profile-ledger.ts`
- Modify: `packages/core/src/worker/runtime.ts`

- [x] **Step 1: Write failing ledger tests**

Add runtime tests that create a workspace and assert:

- `README.md` exists and is the canonical profile placeholder.
- `artifacts/`, `reviews/`, `evidence/descriptors/`, `evidence/raw/`, and `.aiworker/sessions/` exist.
- `.gitignore` ignores `.aiworker/sessions/`, `.aiworker/native-skill-projections.json`, `.agents/skills/aiworker-*`, `.claude/skills/aiworker-*`, and `evidence/raw/`.
- The workspace is a git repository with an initial commit when local `git` is available.

- [x] **Step 2: Run RED**

Run:

```bash
bun test --timeout=30000 packages/core/src/worker/runtime.test.ts
```

Expected: fail on README/gitignore/git assertions.

- [x] **Step 3: Implement ledger bootstrap**

Create workspace layout through `LocalWorkspaceFiles`; never overwrite an existing `README.md`. Initialize git locally, set repo-local AIWorker user identity, add safe initial files, and commit only if there are staged changes. If git is unavailable, leave files usable and expose an unavailable status in metadata/results.

- [x] **Step 4: Strengthen invocation context**

Update invocation prompts/session context so engines starting at `workspaceRoot` are told:

- `README.md` is the accepted profile.
- `artifacts/<sessionId>/` contains proposed changes.
- Native skills may be available under `.agents/skills` and `.claude/skills`.

- [x] **Step 5: Run GREEN**

Run:

```bash
bun test --timeout=30000 packages/core/src/worker/runtime.test.ts
```

Expected: pass.

## Task 4: Profile Revision Promotion API

**Files:**
- Modify: `packages/core/src/worker/runtime.test.ts`
- Modify: `packages/core/src/worker/profile-ledger.ts`
- Modify: `packages/core/src/worker/runtime.ts`
- Modify: `apps/api/src/modes/worker.local.test.ts`
- Modify: `apps/api/src/modes/worker.ts`
- Modify: `apps/web/src/features/local-workspace/api/workspaces.ts`
- Add or modify: `apps/web/src/features/local-workspace/api/profile-revisions.ts`
- Modify: `apps/web/src/features/local-workspace/api/index.ts`

- [x] **Step 1: Write failing promotion tests**

Add core/runtime and API tests that run a session producing an artifact, then approve it as a profile revision. Assert:

- `README.md` is updated from the promoted artifact/profile markdown.
- `reviews/<reviewId>.md` is written.
- A `pass` review row is created and linked to the artifact.
- Git history receives a commit containing `README.md`, the artifact, and the review record.
- `GET /api/local/workspaces/:workspaceId/profile` returns current README content.
- `POST /api/local/workspaces/:workspaceId/profile-revisions` promotes only `pass` or `warn` verdicts; `needs_review`/`fail` do not update README through this endpoint.

- [x] **Step 2: Run RED**

Run:

```bash
bun test --timeout=30000 packages/core/src/worker/runtime.test.ts
bun test --timeout=15000 apps/api/src/modes/worker.local.test.ts
```

Expected: fail because endpoints and promotion runtime are missing.

- [x] **Step 3: Implement promotion runtime**

Add `promoteProfileRevision(...)` on `LocalWorkerRuntime`. Default `profileMarkdown` to the artifact file content, write a review markdown record, create the review row, update `README.md`, and commit the profile revision when git is available. Return a structured result with review, profile path, git status/hash, and optional tag status.

- [x] **Step 4: Implement local daemon endpoints**

Add:

```text
GET  /api/local/workspaces/:workspaceId/profile
POST /api/local/workspaces/:workspaceId/profile-revisions
```

Keep the route generic: Host promotes a workspace profile revision, but does not interpret HR profile fields.

- [x] **Step 5: Add web API helpers**

Add typed fetch helpers for reading the profile and promoting a profile revision.

- [x] **Step 6: Run GREEN**

Run:

```bash
bun test --timeout=30000 packages/core/src/worker/runtime.test.ts
bun test --timeout=15000 apps/api/src/modes/worker.local.test.ts
```

Expected: pass.

## Task 5: HR Profile-First Workbench

**Files:**
- Modify: `apps/web/src/worker/souls/types.ts`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/types.ts`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/model.ts`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/model.test.ts`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/copy.ts`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/index.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-details.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-tools-panel.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/components/profile-list.tsx`
- Modify: `apps/web/src/worker/souls/hr/people-workbench/styles.css`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [x] **Step 1: Write failing model/UI tests**

Add tests that assert:

- The HR workbench labels the first-level list as Candidate / Employee / Alumni profile groups, not a generic role search/candidate artifact board.
- Current Profile Summary is sourced from `README.md` profile preview state when available.
- Proposed artifact changes remain separate from the accepted profile.
- The approve profile revision action calls the new API and refreshes data.

- [x] **Step 2: Run RED**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/worker/souls/hr/people-workbench/model.test.ts
bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx
```

Expected: fail on new expectations.

- [x] **Step 3: Implement profile preview state**

In Worker Studio, load `README.md` for the selected workspace via the new profile API. Pass `profilePreview`, `profileRevisionSubmitting`, and `onPromoteProfileRevision` into `SoulWorkbenchContext`.

- [x] **Step 4: Recenter HR UI**

Move Current Profile Summary to the visual center of the HR workbench. Keep the first-level left list as Candidate / Employee / Alumni, with each item representing one profile workspace. Rename artifact surfaces to Proposed Change / Artifact Proposal where user-facing copy currently over-emphasizes generic artifacts.

- [x] **Step 5: Add approve action**

Add an explicit HR action such as `Approve Profile Revision`. It promotes the selected proposed change into `README.md` through the profile revision API and shows loading/error/empty states.

- [x] **Step 6: Run GREEN**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- src/worker/souls/hr/people-workbench/model.test.ts
bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' build
```

Expected: pass.

## Task 6: Docs, Smoke, And Closeout

**Files:**
- Modify: `docs/task/FEAT-085.md`
- Modify: `docs/plan/PLAN-323.md`
- Modify: `docs/changelog.md`

- [x] **Step 1: Run focused gates**

Run:

```bash
bun test --timeout=30000 packages/core/src/worker/runtime.test.ts
bun test --timeout=15000 apps/api/src/modes/worker.local.test.ts
bunx vitest run --testTimeout=15000 apps/web/src/worker/souls/hr/people-workbench/model.test.ts
bunx vitest run --testTimeout=15000 apps/web/src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-hr' validate
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-web' build
```

- [x] **Step 2: Run broader gates**

Run at least:

```bash
bun run check
git diff --check
```

If time permits within the autonomous run, also run:

```bash
bun run test
bun run build
```

- [x] **Step 3: Browser smoke**

Start the local dev flow or local daemon, open Worker Web in the in-app browser, and verify:

- HR worker can create a people profile workspace.
- The workspace contains a readable Current Profile Summary.
- Candidate / Employee / Alumni first-level groups render.
- The approve profile revision action is visible and does not overlap controls.

- [x] **Step 4: code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Address actionable findings.

- [x] **Step 5: PMA closeout and commit**

Update PMA docs and changelog with verification evidence. Commit with a Chinese Conventional Commit message.
