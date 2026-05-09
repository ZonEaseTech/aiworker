# PLAN-201 Complete OD-style worker default loop

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 19:00
- **approvedAt**: 2026-05-09 19:00
- **completedAt**: 2026-05-09 19:08
- **relatedTask**: REFACTOR-035

## Current State

Local worker 已具备 OD-style 的核心回路：

- `init --pack` 物化 worker pack assets；
- `daemon start/status/logs/check/inspect` 管理本地 worker；
- `run` 走 daemon `/api/worker/runs`；
- Web workbench 展示 runs、artifacts、reviews；
- `review` CLI/API 处理复盘、rerun 和 lesson promotion。

缺口在 CLI 和文档：operator 可以在 Web 看 runs/artifacts，但 CLI 缺少对应 inspection
命令；root help 仍把 Brain/Fleet/Gateway 术语压在默认路径里；`docs/cli.md` 还停留在
REFACTOR-026 的目标态描述。

## Proposal

1. Add daemon-backed CLI inspection commands
   - 新增 `apps/cli/src/commands/worker/workbench.ts`。
   - 通过本地 daemon API 读取 `/api/worker/runs`、`/api/worker/runs/:id`、
     `/api/worker/runs/:id/cancel`、`/api/worker/artifacts`、`/api/worker/artifacts/:id`。
   - 输出保持 JSON，键名为 `runs`、`run`、`artifacts`、`artifact`。

2. Register root/canonical commands
   - root: `runs list/show/cancel`、`artifacts list/show`。
   - canonical: `worker runs list/show/cancel`、`worker artifacts list/show`。
   - 更新 preprocess/registration tests 和 full command index。

3. Refresh onboarding copy
   - Root help 的 “开始/常用查看” 聚焦 local workbench loop。
   - gateway/fleet/env/brain 进入 “更多/secondary admin”。
   - `docs/cli.md` 写当前已落地命令，而不是未来目标树。

## Risks

- **Daemon dependency**: inspection commands 依赖本地 daemon；错误信息必须直接提示先启动
  `aiworker daemon start`。
- **Name collision**: `run` singular 是 submit，`runs` plural 是 inspection。
- **Old surface drift**: 旧 case/brain commands 暂时保留，但不能继续自称默认入口。
- **Release scope creep**: S7 只做 source-level completion，不发布 npm，避免把验证范围拖成 REL。

## Verification

- `bun run --filter '@zonease/aiworker-cli' test -- src/commands/worker/workbench.test.ts src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `bun run lint`
- `git diff --check`
- code-review-graph change review

## Progress

- 2026-05-09 19:00：完成 S7 调查；确认默认路径缺口在 CLI inspection 和 onboarding 文案，不在 worker runtime。
- 2026-05-09 19:08：完成 daemon-backed runs/artifacts CLI inspection、root help
  cleanup、`docs/cli.md` 当前态同步和 source-local help smoke；npm release 另开后续任务。
