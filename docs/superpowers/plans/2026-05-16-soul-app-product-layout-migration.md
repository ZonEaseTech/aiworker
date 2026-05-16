# Soul App Product Layout Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 2 of Soul App authoring layout v2 by moving HR and QA product-owned assets into `product/` and updating all active references.

**Architecture:** This phase is a source layout migration, not a runtime behavior rewrite. `product/` owns domain prompts, artifact schemas, review policies, profile/SOUL files and Web product surfaces. Host adapter code stays in `src/` until Phase 3.

**Tech Stack:** TypeScript, Bun tests, JSON manifests, Markdown product assets.

---

## Task 1: Product Path Contract Tests

**Files:**
- Modify: `packages/shared/src/soul-app/manifest.test.ts`

- [ ] Add assertions that HR and QA reference manifests use:
  - `./product/workflows/.../prompt.md`
  - `./product/workflows/.../review.md`
  - `./product/artifacts/schemas/*.schema.json`
  - `./product/reviews/*.md`
  - `./product/profiles/*/SOUL.md`
  - `./product/web/...`
- [ ] Run `bun test packages/shared/src/soul-app/manifest.test.ts` and verify RED.

## Task 2: Move Official Product Assets

**Files:**
- Move HR and QA `capabilities/`, `schemas/`, `review/`, `packs/`, and `src/ui/` product files.

- [ ] Move workflow prompts and rubrics to `product/workflows/<id>/`.
- [ ] Move schemas to `product/artifacts/schemas/`.
- [ ] Move artifact review policies to `product/reviews/`.
- [ ] Move SOUL pack files to `product/profiles/<id>/SOUL.md`.
- [ ] Move UI contribution files to:
  - `product/web/artifact-previews/`
  - `product/web/panels/`
  - `product/web/routes/`
  - `product/web/widgets/`

## Task 3: Update References

**Files:**
- Modify: `apps/aiworker-hr/soul-app.manifest.json`
- Modify: `apps/aiworker-qa/soul-app.manifest.json`
- Modify: `packages/shared/src/soul-app/fixtures.ts`
- Modify: `packages/shared/src/soul-app/manifest.test.ts`
- Modify: `docs/soul-app-developer.md`

- [ ] Update all manifest refs to the new `product/` paths.
- [ ] Update shared fixtures to match official manifests.
- [ ] Update active authoring docs so they no longer teach `capabilities/`,
  `review/`, `schemas/`, `packs/` and `src/ui/` as the default app layout.
- [ ] Run `rg -n "capabilities/|review/|schemas/|packs/|src/ui" apps/aiworker-hr apps/aiworker-qa packages/shared/src/soul-app docs/soul-app-developer.md` and verify remaining hits are historical, negative examples, or host-adapter paths.

## Task 4: Verification And PMA Closeout

**Files:**
- Modify: `docs/task/FEAT-089.md`
- Modify: `docs/plan/PLAN-332.md`
- Modify: `docs/changelog.md`

- [ ] Run:
  - `bun test packages/shared/src/soul-app/manifest.test.ts`
  - `bun run --filter '@zonease/aiworker-shared' typecheck`
  - `bun run --filter '@zonease/aiworker-hr' test`
  - `bun run --filter '@zonease/aiworker-hr' validate`
  - `bun run --filter '@zonease/aiworker-qa' test`
  - `bun run --filter '@zonease/aiworker-qa' validate`
  - `bun run lint`
  - `git diff --check`
  - `bun run crg:update`
  - `bun run crg:review`
- [ ] Mark FEAT-089 and PLAN-332 completed and update the changelog.

## Execution Notes

- Preserve `src/protocol`, `src/host-mounted.ts`, `src/standalone.ts`, `src/api.ts`
  and `src/index.ts` for Phase 3.
- This is a breaking pre-1.0.0 layout migration; do not add legacy aliases.
