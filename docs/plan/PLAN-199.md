# PLAN-199 Worker web workbench first screen

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 18:27
- **approvedAt**: 2026-05-09 18:27
- **completedAt**: 2026-05-09 18:42
- **relatedTask**: REFACTOR-033

## Current State

Worker web 已有路由和数据层：

- `apps/web/src/worker/routes/index.tsx` 是旧 overview；
- `apps/web/src/worker/features/chat/chat-panel.tsx` 已通过 `submitTask` /
  `continueConversation` 调用 `/api/worker/runs`；
- `apps/web/src/worker/api.ts` 已有 `listRuns()`、`listWorkerArtifacts()`、
  `listCases()`、`submitTask()`；
- `apps/web/src/worker/lib/hooks.ts` 尚未暴露 runs / worker artifact query hooks；
- built-in worker packs 已从 `@zonease/aiworker-shared` 导出。

缺口是第一屏没有把这些拼成 Open Design-style workbench。

## Proposal

1. Add workbench feature module
   - 新增 `apps/web/src/worker/features/workbench/workbench-panel.tsx`。
   - 直接消费 built-in worker packs，做本地 pack/template picker。
   - Composer 使用选中 template 的 prompt，可被 operator 修改。

2. Add thin query hooks
   - `useRuns()` -> `listRuns()`。
   - `useWorkerArtifacts()` -> `listWorkerArtifacts()`。
   - `useSubmitTask()` 成功时同时 invalidate runs。

3. Replace index route
   - `/` 只 compose `WorkbenchPanel`。
   - root nav 将首页标记为 `Workbench`，旧页面仍保留。

4. Add focused tests
   - Component test 验证 pack/template picker、composer submit、runs/artifacts/cases rendering。
   - Existing shell responsive tests 补齐新 API mocks。

## Risks

- **No pack REST source yet**: this slice 使用内置 pack metadata；后续如果需要读取 project
  materialized pack，再补 REST API。
- **Artifacts are metadata only**: S5 不读取文件内容，避免在 web 端引入路径/权限边界问题。
- **Workbench may duplicate chat composer**: 这是刻意的 first-screen run composer；`/chat`
  仍用于 conversation timeline。
- **UI density**: 第一屏信息量大，必须在移动端退化为单列，避免旧 admin 的横向溢出。

## Verification

- `bun run --filter '@zonease/aiworker-web' test -- src/worker/features/workbench/workbench-panel.test.tsx src/worker/__tests__/responsive-shell.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' build:worker`
- `git diff --check`
- code-review-graph change review

## Progress

- 2026-05-09 18:27：完成 worker web 现状调查；确认最小实现是替换 `/` 为
  workbench feature，不改 route tree、不新增后端 API。
- 2026-05-09 18:42：完成 Worker Admin `/` workbench、runs/artifacts hooks、root nav
  更新、focused tests、worker build、lint、browser smoke 与 CRG 审查。
