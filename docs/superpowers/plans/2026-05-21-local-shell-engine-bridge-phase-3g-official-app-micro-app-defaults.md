# Local Shell Engine Bridge Phase 3G Official App Micro-App Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. HR and QA app tasks are independent; shared fixtures, docs and final verification are owned by the controller.

**Goal:** Remove old workbench protocol defaults from official HR and QA Soul Apps.

**Architecture:** Host keeps start, shell, locate, mount and bridge. Official Soul Apps own domain UI/API through micro-app HTML and app-owned mounted API paths.

**Tech Stack:** Bun, TypeScript, official Soul App manifests, mounted service tests, shared manifest fixtures.

---

## Task 1: HR Official App

**Owner:** HR subagent

**Files:**
- Modify: `apps/aiworker-hr/soul-app.manifest.json`
- Modify: `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`
- Modify: `apps/aiworker-hr/host-adapter/index.test.ts`

- [x] **Step 1: Remove HR default workbench descriptors**

Remove `ui.workbench`, remove host-descriptor panel defaults and update mount
permission naming to HR micro-app surfaces.

- [x] **Step 2: Replace HR mounted protocol handlers**

Remove `/surfaces/*`, `/protocol/actions`, `/protocol/search` and
`/protocol/capabilities`. Add app-owned paths:

- `GET /api/capabilities`
- `POST /api/people-profiles`
- `GET /api/people-profiles/search`

- [x] **Step 3: Update HR tests**

Assert old protocol/host-descriptor paths are absent or 404 and the new
app-owned API paths work with mount context.

## Task 2: QA Official App

**Owner:** QA subagent

**Files:**
- Modify: `apps/aiworker-qa/soul-app.manifest.json`
- Modify: `apps/aiworker-qa/host-adapter/mounted/host-mounted.ts`
- Modify: `apps/aiworker-qa/host-adapter/index.test.ts`

- [x] **Step 1: Remove QA default workbench descriptors**

Remove `ui.workbench`, remove host-descriptor panel/route defaults and update
the QA route to a micro-app surface.

- [x] **Step 2: Replace QA mounted protocol handlers**

Remove `/surfaces/*`, `/protocol/actions`, `/protocol/search` and
`/protocol/capabilities`. Add app-owned paths:

- `GET /api/capabilities`
- `POST /api/release-gates`
- `GET /api/release-gates/search`

- [x] **Step 3: Update QA tests**

Assert old protocol/host-descriptor paths are absent or 404 and the new
app-owned API paths work with mount context.

## Task 3: Shared References And Closeout

**Owner:** controller

**Files:**
- Modify: `packages/shared/src/soul-app/fixtures.ts`
- Modify: `packages/shared/src/soul-app/manifest.test.ts`
- Modify: affected API/Web tests if fixture assumptions changed
- Modify: `docs/changelog.md`
- Modify: PMA task and plan files

- [x] **Step 1: Sync shared official fixtures**

Mirror HR/QA manifest changes and keep compatibility schema tests separate from
official defaults.

- [x] **Step 2: Run verification**

Run the focused app, shared, API/Web, validate/smoke, docs, whitespace and CRG
checks listed in REFACTOR-089.

- [x] **Step 3: Record and commit**

Mark REFACTOR-089/PLAN-397 complete and commit:

```bash
git commit -m "refactor: 收束官方 Soul App micro-app 默认边界"
```
