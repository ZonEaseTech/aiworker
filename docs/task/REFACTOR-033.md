# REFACTOR-033 Worker web workbench first screen

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 18:27
- **claimedAt**: 2026-05-09 18:27
- **completedAt**: 2026-05-09 18:42
- **plan**: PLAN-199
- **relatesTo**: REFACTOR-026, PLAN-192, apps/web/src/worker/routes/index.tsx, apps/web/src/worker/features/chat/chat-panel.tsx, apps/web/src/worker/api.ts

## 背景

S1-S4 已经让本地 worker 具备 OD-style daemon/run/artifact/pack 的后端基础：

- `aiworker run` 默认提交到本地 daemon run contract；
- `aiworker init` 可以物化 worker pack 的 `SKILL.md` / `DOMAIN.md`；
- worker REST 已有 `/api/worker/runs` 与 `/api/worker/artifacts`；
- worker daemon 已有 start/status/logs/check/inspect。

但 Worker Admin 第一屏仍是旧 governance-first 概览，入口文案和布局围绕
Brain、Executor、Cron、Approvals、Chat 等内部对象展开。用户进入 web 后仍看不到
“选 pack/template -> 写 work order -> 看 run timeline -> 看 artifact/case review”
这个 Open Design-style 工作回路。

## 目标

1. 将 worker `/` 第一屏改成 local worker workbench。
2. 第一屏包含：
   - worker pack / domain picker；
   - work-order template picker；
   - composer；
   - run timeline；
   - artifact metadata panel；
   - case/review panel。
3. 复用现有 `/api/worker/runs`、`/api/worker/artifacts`、cases 和 conversations API。
4. 旧 Brain / Config / Cron / Approvals 等页面保留为 secondary/admin route，不进入第一屏主路径。
5. 遵守 `DESIGN.md` 和现有 shared UI primitives，不新增任意 hex 或新设计系统。

## 非目标

- 不新增 worker pack REST API。
- 不改 fleet/gateway UI。
- 不改 desktop。
- 不实现 artifact 文件内容预览，只展示 metadata 和可复盘路径。
- 不重做 `/chat` 页面。

## 验收标准

- `/` 渲染 workbench，而不是旧 overview summary card。
- 选择 pack/template 会更新 composer 默认 work order。
- 提交 work order 调用已有 run contract，并刷新 runs/conversations。
- run timeline、artifact panel、case/review panel 有 loading / empty / error 态。
- 聚焦 web tests、typecheck、build 或 worker build、diff check、CRG 审查通过。

## 实现记录

- 新增 `WorkbenchPanel`，将 Worker Admin `/` 改成 OD-style workbench：
  - built-in worker pack picker；
  - work-order template picker；
  - composer；
  - run timeline；
  - artifact metadata panel；
  - case/review panel。
- 新增 `useRuns()` 与 `useWorkerArtifacts()` query hooks；`useSubmitTask()` 成功后同步
  invalidate runs。
- root nav 将首页标记为 `Workbench`，旧 Chat / Cases / Brain / Config / Cron /
  Approvals 等页面保留为 secondary/admin route。
- 新增 workbench component test，并补齐 responsive shell mock。

## 验证

- `bun run --filter '@zonease/aiworker-web' test -- src/worker/features/workbench/workbench-panel.test.tsx src/worker/__tests__/responsive-shell.test.tsx`
  passed: 4 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-web' typecheck` passed。
- `bun run --filter '@zonease/aiworker-web' build:worker` passed；Vite reported the existing
  chunk-size warning.
- `bun run --filter '@zonease/aiworker-web' lint` passed。
- `git diff --check` passed。
- Browser smoke passed with a mocked worker API:
  - desktop 1440px: workbench, artifact path, and case review visible; no horizontal overflow；
  - mobile 390px: workbench and run visible; `scrollWidth === clientWidth`。
- CRG passed: risk 0.40, 0 affected flows；gaps point at the new component/test helpers and are
  covered by the focused web tests plus browser smoke.
