# FEAT-032 复活并重构 Worker + Fleet Web UI（epic）

- **status**: in_progress
- **priority**: P1
- **owner**: bkd-orchestrator
- **createdAt**: 2026-04-27 18:30

## 描述

将当前 dormant 状态的 `apps/web` 复活，按 pma-web 标准重构为「物理独立的双视角 SPA」：fleet 视角由 gateway 托管、worker 视角由每个 worker 的 apps/api 自托管，两边永不交叉调用，与 fleet.db / worker.db 数据域边界对齐。

承载方案：PLAN-022（master），按 5 个 phase 拆出 FEAT-033/034/035 + REFACTOR-009/010 + 配套子 task。

最终效果：

1. 操作员浏览器访问 `http://gateway:9218/admin/` 看到 fleet UI（workers 列表 + enrollment OTP 审批 + audit + presence）。
2. 操作员浏览器访问 `http://worker:9217/admin/`（loopback 或公网叠 basic-auth）看到当前 worker self-serve UI（config / secrets / cron / approval / chat）。
3. ESLint `no-restricted-imports` 强制源码层 fleet/worker 不交叉。
4. CLI（已发布 npm package）默认捎带 dist，`aiworker gateway start` / `aiworker worker start` 默认开 `--serve-web`。

## 进行时描述

复活并重构 Worker/Fleet Web UI epic

## 依赖

- **blocked by**:（无；与 FEAT-031 worker 项目级演进解耦，可并行）
- **blocks**: FEAT-033 / FEAT-034 / FEAT-035 / REFACTOR-009 / REFACTOR-010

## 笔记

- 调研锚点：现 `apps/web` 已用 pma-web 标准 stack；gateway-proto `methods.ts` 已暴露 `workers.* / enroll.* / config.* / cron.* / approval.* / chat.send / token.rotate / logs.tail / system.presence`；worker apps/api 已有 `/api/worker/{management,orchestrator,channels,evolution,events}` REST 表面。
- 不变量遵守：fleet.db / worker.db 物理隔离 → fleet UI 仅打 gateway WS、worker UI 仅打 worker REST + bearer-auth。BUG-007 同款 loopback bypass + 公网 basic-auth fail-closed 保护。
- 现有 components 可复用：`workers-list / register-wizard / create-wizard / config-editor / secrets-panel / test-panel / activity-panel / worker-shell`，按视角拆分搬迁，不重写。
- BKD 分发：每个 Phase 一条 worktree issue，串联 follow-up，避免单 session 做满。

## BKD 编排状态（2026-04-27 18:45 起）

Coordinator: BKD issue `xft5fyjw` (#109)。Project: `lded7ogt`。

| Phase | Task | BKD issue id | 当前状态 | Worktree | 依赖 |
|-------|------|--------------|----------|----------|------|
| 1 | FEAT-033 | `z27fqf6l` | working | yes | 无（已起跑）|
| 2 | FEAT-034 | `oq32jpkm` | todo | yes | FEAT-033 |
| 3 | FEAT-035 | `g0ftmbux` | todo | yes | FEAT-033（与 Phase 2 并行）|
| 4 | REFACTOR-009 | `k29nki52` | todo | yes | FEAT-034 + FEAT-035 |
| 5 | REFACTOR-010 | `xz0bikkl` | todo | yes | REFACTOR-009（且需 master 二次确认）|

### Coordinator dispatch 规则（subtask 报告后续 turn 执行）

1. **FEAT-033 (`z27fqf6l`) 报告 completed 后**：
   - merge worktree branch `bkd/z27fqf6l` 到 main，跑 build + test 验证
   - PATCH `oq32jpkm` (FEAT-034) statusId='working'
   - PATCH `g0ftmbux` (FEAT-035) statusId='working'
   - 两条并行起跑

2. **FEAT-034 (`oq32jpkm`) + FEAT-035 (`g0ftmbux`) 都报告 completed 后**：
   - 顺序 merge `bkd/oq32jpkm`（fleet 视角）→ `bkd/g0ftmbux`（worker 视角，可能与 fleet 在 src/shared/ 有 conflict，按 references/merge-strategy.md 处理）→ main
   - 跑 build + test
   - PATCH `k29nki52` (REFACTOR-009) statusId='working'

3. **REFACTOR-009 (`k29nki52`) 报告 completed 后**：
   - merge `bkd/k29nki52` → main
   - **暂停**，向 master 询问 Phase 5 实际范围。如 master 决定不做，关闭 `xz0bikkl` 为 done（targetStatus），FEAT-032 epic 完成；如做，PATCH `xz0bikkl` (REFACTOR-010) statusId='working' + 在 follow-up 里把范围明确化。

4. **REFACTOR-010 (`xz0bikkl`) 报告 completed（或跳过）后**：
   - merge worktree（如有）
   - docs/task/FEAT-032.md status → completed
   - docs/plan/PLAN-022.md status → completed
   - PATCH coordinator `xft5fyjw` statusId='review'，等 master 在 BKD 里 done

### 关键不变量（dispatch 时守住）

- 永远先 check capacity（`/processes/capacity`），availableSlots > 0 才启动新 subtask。
- 任何 worktree merge 必须先跑 `bun run build` + `bun run typecheck` + `bun run lint` + `bun run test`，pass 才推 main。
- 不要 sleep 等 subtask；BKD follow-up 自动唤醒 coordinator。
