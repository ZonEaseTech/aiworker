# REFACTOR-035 Complete OD-style worker default loop

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 19:00
- **claimedAt**: 2026-05-09 19:00
- **completedAt**: 2026-05-09 19:08
- **plan**: PLAN-201
- **relatesTo**: REFACTOR-026, PLAN-192, apps/cli/src/aiworker.ts, apps/cli/src/help.ts, docs/cli.md, apps/web/src/worker/features/workbench/workbench-panel.tsx

## 背景

S1-S6 已经把 local worker 的主要能力补齐：run contract、artifact metadata、
worker pack、daemon lifecycle、web workbench 和 review promotion。但默认路径仍有三类
残留：

- CLI 没有 product-facing `runs` / `artifacts` inspection 命令；
- root help 仍把 gateway/fleet/env/Brain 诊断放进 onboarding；
- docs/CLI 还在描述 REFACTOR-026 的目标态，而不是当前已落地的 OD-style loop。

## 目标

1. 新增 root/canonical CLI inspection commands：
   - `aiworker runs list/show/cancel`
   - `aiworker worker runs list/show/cancel`
   - `aiworker artifacts list/show`
   - `aiworker worker artifacts list/show`
2. Root help 默认路径改成：
   - `init --pack`
   - `daemon start`
   - `run`
   - `runs list/show`
   - `artifacts list/show`
   - `review list/show/promote`
3. `docs/cli.md` 从目标态改成当前可用的 local worker loop，并明确 Brain/Fleet/Gateway 是 secondary/admin surface。
4. 做 source-local focused smoke 覆盖 new CLI shape，不发布 npm 版本。

## 非目标

- 不删除旧 case/brain/fleet/gateway command。
- 不实现 artifact preview/open。
- 不改变 worker.db schema 或 API contract。
- 不发布 npm package；release 另开 REL 任务。

## 验收标准

- 新 runs/artifacts CLI commands 输出 daemon API 的 product-facing JSON。
- root help 首屏不再把 gateway/fleet/env/Brain 作为 onboarding 必经路径。
- docs/cli.md 与当前实现一致。
- focused CLI tests、typecheck、lint、build:bundle、diff check、CRG 审查通过。

## 结果

- 新增 daemon-backed `runs list/show/cancel` 和 `artifacts list/show` root/canonical
  CLI commands。
- Root help 首屏已改成 init -> daemon -> run -> runs/artifacts -> review/promote。
- `docs/cli.md` 更新为当前可用 local worker loop，并把 Brain/Fleet/Gateway 明确为
  secondary/admin surface。
- 未进入 npm release；发布验证后续由独立 REL task 承接。
