# PLAN-196 OD-style worker pack registry

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 17:15
- **approvedAt**: 2026-05-09 17:15
- **completedAt**: 2026-05-09 17:20
- **relatedTask**: REFACTOR-030

## Current State

AIWorker 目前公开给 operator 的领域入口是 `Soul`：

- shared 里有 `SoulModule` / `SoulPack`；
- CLI 有 `aiworker soul list/show`；
- `init --soul` 会写 `.aiworker/SOUL.md`、scope manifest、brain capability drafts 和
  native skill projection seeds。

这批能力仍有价值，但它面向 Project Brain governance。OD-style worker workbench 需要更直接的资产语法：

```text
Worker pack = SKILL.md + DOMAIN.md + work-order templates + artifact kinds
```

## Proposal

1. Shared registry
   - 新增 `packages/shared/src/worker-pack.ts`；
   - 定义 `WorkerPack` / `WorkerPackRegistry`；
   - 内置 developer、hr-recruiting、project-manager、qa-reviewer；
   - 每个 pack 包含：
     - `skillMd`
     - `domainMd`
     - `workOrderTemplates`
     - `artifactKinds`
     - `defaultReviewChecklist`

2. CLI
   - 新增 `apps/cli/src/commands/worker/pack.ts`；
   - root shortcut：
     - `aiworker pack list`
     - `aiworker pack show <id>`
   - canonical tree：
     - `aiworker worker pack list`
     - `aiworker worker pack show <id>`
   - update `help.ts` command index。

3. Tests
   - shared registry shape test；
   - CLI pack list/show test；
   - help command index test if existing snapshots require update。

## Risks

- **双入口混淆**：Soul 仍存在。输出必须明确 worker pack 是 workbench 资产，Soul 是旧治理/brain persona surface。
- **领域硬编码**：pack 只描述工作方法和输出形态，不写硬 workflow engine。
- **初始化时机**：本 slice 不改 `init`，避免破坏当前 bootstrap matrix；后续 slice 再决定 pack materialization。

## Verification

- `bun run --filter '@zonease/aiworker-shared' test -- src/worker-pack.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test -- src/commands/worker/pack.test.ts src/aiworker.test.ts`
- changed package typecheck
- `git diff --check`
- code-review-graph change review

## Progress

- 2026-05-09 17:15：认领 S3A；范围限定为 worker pack registry + CLI list/show，不改 init。
- 2026-05-09 17:20：完成 shared worker pack registry、root/canonical CLI pack list/show、
  bootstrap 多段命令识别修正和 focused tests；CRG `detect-changes` 为 risk 0.40、0
  affected flows。
