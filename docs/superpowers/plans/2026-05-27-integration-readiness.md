# Integration Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** Superseded by `2026-05-27-canonical-coverage-ledger.md`; do not recreate `tmp/refactor` from this historical plan.

**Goal:** Prove the current destructive-refactor branch is ready for PR/release handoff, or stop with precise P0/P1 evidence.

**Architecture:** This is a verification-first plan. It does not change product code unless a fresh readiness command or drift classification proves a P0/P1 issue. Canonical authority remains the five docs under `docs/`; this plan and its paired design under `docs/superpowers/` are Superpowers process artifacts, not architecture authorities.

**Tech Stack:** Bun, Playwright/browser tests through existing scripts, ESLint, code-review-graph via `uvx`, git.

---

## File Structure

- Read: `/Users/ben/projects/aiworker/docs/superpowers/specs/2026-05-27-integration-readiness-design.md`
  - The approved Superpowers design for this readiness phase.
- Create: `/Users/ben/projects/aiworker/tmp/refactor/27-integration-readiness-record.md`
  - Final non-authoritative evidence record containing fresh command results, issue classification, and handoff decision.
- Do not modify product code unless Task 4 finds a P0/P1 blocker and the user agrees to continue with a repair pass.

## Task 1: Baseline Before Verification

**Files:**
- Read: `/Users/ben/projects/aiworker/docs/superpowers/specs/2026-05-27-integration-readiness-design.md`
- Create later: `/Users/ben/projects/aiworker/tmp/refactor/27-integration-readiness-record.md`

- [ ] **Step 1: Confirm branch and working tree**

Run:

```bash
git status --short
git branch --show-current
git log --oneline -3
```

Expected:

- `git status --short` is empty before verification starts.
- Branch is `codex/destructive-refactor`.
- Latest commit is the readiness design commit or a later intentional evidence commit.

- [ ] **Step 2: Re-read the approved readiness design**

Run:

```bash
sed -n '1,220p' docs/superpowers/specs/2026-05-27-integration-readiness-design.md
```

Expected:

- The command list includes `bun run test:cli`, `bun run test:browser:freeform`, `bun run test:contracts`, `bun run test:protocol`, `bun run lint`, `bun run crg:update`, `bun run crg:review`, `bun run test`, and `bun run build`.
- The issue classification list includes `turn send`, `/api/local/.../turns`, and historical drizzle `reviews` residue.

## Task 2: Run Minimum Integration Readiness Gates

**Files:**
- No product files modified.
- Create later: `/Users/ben/projects/aiworker/tmp/refactor/27-integration-readiness-record.md`

- [ ] **Step 1: Run CLI golden path gate**

Run:

```bash
bun run test:cli
```

Expected:

- Exit code `0`.
- Output shows CLI tests passed, including `apps/cli/src/freeform-golden-path.test.ts`.
- If it fails, stop and classify the failure before running later gates.

- [ ] **Step 2: Run Freeform browser proof**

Run:

```bash
bun run test:browser:freeform
```

Expected:

- Exit code `0`.
- Output shows the Freeform browser proof completed.
- The browser proof still checks real Host Web locator behavior, mounted micro-app `router-mode="search"`, and bridge refs.

- [ ] **Step 3: Run architecture contract tests**

Run:

```bash
bun run test:contracts
```

Expected:

- Exit code `0`.
- Output shows architecture tests passed.
- Any failure mentioning canonical docs, forbidden package paths, Host/Soul ownership, or Freeform contract is treated as at least P1 until proven otherwise.

- [ ] **Step 4: Run protocol tests**

Run:

```bash
bun run test:protocol
```

Expected:

- Exit code `0`.
- Output shows protocol tests passed.
- Any failure around descriptor v1 shape, mounted routing, native MCP redaction, or session-level invocation is treated as at least P1 until proven otherwise.

- [ ] **Step 5: Run lint and static policy checks**

Run:

```bash
bun run lint
```

Expected:

- Exit code `0`.
- Warnings may remain non-blocking only if there are `0` errors and they do not contradict canonical architecture.
- Record the warning count if the command reports one.

- [ ] **Step 6: Refresh code-review-graph**

Run:

```bash
bun run crg:update
```

Expected:

- Exit code `0`.
- If CRG cannot run because of environment/tooling failure, classify it separately and do not claim CRG verification passed.

- [ ] **Step 7: Run code-review-graph review**

Run:

```bash
bun run crg:review
```

Expected:

- Exit code `0`.
- Record any reported risk score and test-gap hints.
- Treat CRG findings as advisory unless they identify a concrete P0/P1 contradiction with the canonical docs.

## Task 3: Run PR/Release-Level Gates

**Files:**
- No product files modified.
- Create later: `/Users/ben/projects/aiworker/tmp/refactor/27-integration-readiness-record.md`

- [ ] **Step 1: Run root test suite**

Run:

```bash
bun run test
```

Expected:

- Exit code `0`.
- Record package-level pass/fail summaries from the output.
- This is the first allowed source for claiming root `bun run test` status in this phase.

- [ ] **Step 2: Run root build**

Run:

```bash
bun run build
```

Expected:

- Exit code `0`.
- Output shows host daemon build, web build, and CLI bundle build completed.
- This is the first allowed source for claiming root `bun run build` status in this phase.

## Task 4: Classify Observed Compatibility And Historical Residue

**Files:**
- Read: `/Users/ben/projects/aiworker/apps/cli/src/aiworker.ts`
- Read: `/Users/ben/projects/aiworker/packages/host-daemon/src/modes/worker.ts`
- Read: `/Users/ben/projects/aiworker/packages/soul-app-runtime/src/index.ts`
- Read: `/Users/ben/projects/aiworker/packages/storage-sqlite/src/worker/schema.ts`
- Read: `/Users/ben/projects/aiworker/packages/storage-sqlite/drizzle/worker/0000_polite_stellaris.sql`
- Read: `/Users/ben/projects/aiworker/packages/storage-sqlite/drizzle/worker/0005_fluffy_jane_foster.sql`
- Create later: `/Users/ben/projects/aiworker/tmp/refactor/27-integration-readiness-record.md`

- [ ] **Step 1: Inspect `turn send` usage**

Run:

```bash
rg -n "turn send|function sendTurnCommand|function invokeSessionCommand|startTurn\\(|startInvocation\\(" apps/cli/src/aiworker.ts apps/cli/src/freeform-golden-path.test.ts tests/browser/freeform-cli-golden-path.spec.ts
```

Expected classification:

- Non-blocking compatibility debt if `turn send` is registered but Freeform proof and preferred follow-up use `session invoke` and `startInvocation`.
- P0/P1 if Freeform readiness proof depends on `turn send` as the main follow-up path.

- [ ] **Step 2: Inspect `/api/local/.../turns` compatibility routes**

Run:

```bash
rg -n "/api/local/.*/turns|/api/sessions/:sessionId/invocations|createSessionMessageResponse|createSessionInvocationResponse" packages/host-daemon/src/modes/worker.ts packages/soul-app-runtime/src/index.ts tests/browser/freeform-cli-golden-path.spec.ts tests/browser/freeform-mounted-workbench.spec.ts
```

Expected classification:

- Non-blocking compatibility debt if local turn routes are shims and canonical broker follow-up remains `POST /api/sessions/:sessionId/invocations`.
- P0/P1 if browser proof or canonical docs rely on `/api/local/.../turns` as the authoritative follow-up contract.

- [ ] **Step 3: Inspect historical drizzle `reviews` residue**

Run:

```bash
rg -n "reviews|profiles|business|confirmation" packages/storage-sqlite/src/worker/schema.ts packages/storage-sqlite/src/worker/index.ts packages/storage-sqlite/drizzle/worker/0000_polite_stellaris.sql packages/storage-sqlite/drizzle/worker/0005_fluffy_jane_foster.sql tests/architecture/forbidden-host-domain-schema.test.ts
```

Expected classification:

- Non-blocking historical residue if active schema files do not create `reviews` or other Soul domain tables and current architecture tests reject domain schema ownership.
- P0/P1 if active schema creation still owns review/profile/business domain tables.

- [ ] **Step 4: Check canonical docs do not point to old authority**

Run:

```bash
find docs -maxdepth 3 -type f | sort
rg -n "docs/plan|docs/task|docs/changelog.md|docs/soul-app-developer.md|docs/cli.md|docs/deployment.md|docs/executor-engines.md" AGENTS.md docs tests package.json
```

Expected:

- `find docs` returns the five canonical docs plus only the new Superpowers spec/plan artifacts created for current work.
- `rg` matches only guardrail tests or explanatory non-authority text, not restored old authority paths.

## Task 5: Write Readiness Record And Decide Handoff

**Files:**
- Create: `/Users/ben/projects/aiworker/tmp/refactor/27-integration-readiness-record.md`

- [ ] **Step 1: Draft the readiness record**

Use `apply_patch` to create `/Users/ben/projects/aiworker/tmp/refactor/27-integration-readiness-record.md`. The record must include these sections and must use the actual observed command results, branch, HEAD, issue classifications, and decision from Tasks 1-4:

```markdown
# Integration Readiness Record

Date: 2026-05-27 Asia/Shanghai
Branch: `codex/destructive-refactor`
HEAD: current short commit hash and commit subject from `git log --oneline -1`

## Authority

This file is non-authoritative evidence. Canonical authority remains:

- `docs/architecture.md`
- `docs/protocol.md`
- `docs/runtime.md`
- `docs/soul-authoring.md`
- `docs/testing.md`

## Fresh Verification

- `bun run test:cli`: observed exit code and pass/fail summary
- `bun run test:browser:freeform`: observed exit code and pass/fail summary
- `bun run test:contracts`: observed exit code and pass/fail summary
- `bun run test:protocol`: observed exit code and pass/fail summary
- `bun run lint`: observed exit code, error count, and warning count when reported
- `bun run crg:update`: observed exit code and summary
- `bun run crg:review`: observed exit code, risk score, and advisory notes when reported
- `bun run test`: observed exit code and package-level pass/fail summary
- `bun run build`: observed exit code and build target summary

## Observed Issue Classification

- `turn send`: severity classification with evidence from Task 4 Step 1
- `/api/local/.../turns`: severity classification with evidence from Task 4 Step 2
- historical drizzle `reviews`: severity classification with evidence from Task 4 Step 3

## Remaining Non-Blocking Debt

- QA/HR descriptor-producing sample migration remains outside Freeform v1 blocker scope.
- Existing lint warnings remain non-blocking only if fresh lint exits 0.
- Push, PR, merge, and release remain undone until explicitly performed.

## Decision

One of: `Ready for PR/release handoff` or `Blocked`
```

Do not save the record with generic wording that substitutes previous-session results or speculation for fresh output.

- [ ] **Step 2: Self-check the record**

Run:

```bash
rg -n "T[B]D|T[O]DO|F[I]XME|passed[[:space:]]+earlier|seems[[:space:]]+fine|should[[:space:]]+pass" tmp/refactor/27-integration-readiness-record.md
git diff --check
git status --short
```

Expected:

- `rg` returns no matches.
- `git diff --check` exits `0`.
- `git status --short` shows only intentional readiness evidence if it is tracked; ignored `tmp/` evidence may require `git status --short --ignored tmp/refactor/27-integration-readiness-record.md` to inspect.

- [ ] **Step 3: Commit the readiness record if it is part of the handoff evidence**

Run:

```bash
git add -f tmp/refactor/27-integration-readiness-record.md
git commit -m "docs: 记录 integration readiness 结果"
```

Expected:

- Commit succeeds.
- `git status --short` is empty after commit.

- [ ] **Step 4: Report final handoff status**

Report:

- branch and HEAD;
- fresh command results;
- issue classifications;
- whether PR/release handoff is ready or blocked;
- explicit note that push, PR, merge, and release have not been performed unless they were requested and completed.
