# REFACTOR-030 Add OD-style worker pack registry

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-09 17:15
- **claimedAt**: 2026-05-09 17:15
- **completedAt**: 2026-05-09 17:20
- **plan**: PLAN-196
- **relatesTo**: REFACTOR-026, REFACTOR-029, PLAN-192, packages/shared/src/soul, apps/cli/src/commands/worker

## 背景

现有 `Soul` preset 已经有 file-first `SOUL.md` 与 prompt skills，但它仍是
Project Brain / governance 语义。Open Design 的可复制部分是：

- `SKILL.md` 定义可执行的创作/工作方法；
- `DESIGN.md` 定义设计语言/约束系统；
- daemon/web 直接围绕这些资产组织 workbench。

AIWorker 的领域差异应该体现在 `worker pack`：

- developer pack：代码库审查 / patch plan / verification report；
- hr-recruiting pack：候选人筛选 / 面试风险 / evidence summary；
- project-manager pack：PRD / roadmap / delivery risk；
- qa-reviewer pack：回归审查 / 验收矩阵 / defect triage。

S3A 先建立 registry 和 CLI 可见面，不立即改 `init` materialization，避免一次性牵动
旧 Soul 初始化和 native skill projection。

## 目标

1. 在 shared 增加 `WorkerPack` contract 与内置 registry。
2. 每个内置 pack 提供 `skillMd` 与 `domainMd`，采用 OD-style Markdown 资产语法。
3. CLI 增加 `aiworker pack list/show` 与 `aiworker worker pack list/show`。
4. help/commands 索引展示 worker pack，而不是只暴露 Soul preset。
5. 补充 shared registry tests 与 CLI command tests。

## 非目标

- 不删除 `Soul` preset。
- 不让 `init --soul` 改写为 `init --pack`。
- 不投影 pack 到 executor native skill 目录。
- 不改 Worker Web UI pack picker；S5 再接入。

## 验收标准

- 内置 worker pack id 唯一，且至少覆盖 developer / hr-recruiting / project-manager / qa-reviewer。
- 每个 pack 都有非空 `skillMd`、`domainMd`、work order templates 和 artifact kinds。
- CLI list/show 输出 worker pack 的 skill/domain/work-order/artifact 信息。
- unknown pack id 返回 exit 2 并列出可用 id。
- focused tests、typecheck、diff check 和 CRG 审查通过。

## 实现记录

- 新增 shared `WorkerPack` contract、registry 和 4 个内置 pack：developer、
  hr-recruiting、project-manager、qa-reviewer。
- 每个 pack 暴露 OD-style `SKILL.md` / `DOMAIN.md` markdown、work-order templates、
  artifact kinds 和默认 review checklist。
- 新增 `aiworker pack list/show` 与 `aiworker worker pack list/show`。
- 修正 CLI dotenv bootstrap 的多段命令识别，确保 `soul/pack list/show` 不需要 worker state。

## 验证

- `bun run --filter '@zonease/aiworker-shared' test -- src/worker-pack.test.ts`
  passed: 4 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-cli' test -- src/commands/worker/pack.test.ts src/lib/bootstrap.test.ts src/aiworker.test.ts`
  passed: 48 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-shared' typecheck` passed。
- `bun run --filter '@zonease/aiworker-cli' typecheck` passed。
- `git diff --check` passed。
- CRG passed: `detect-changes` risk 0.40, 0 affected flows；静态 test gap 主要来自 CLI
  capture helpers 和 `runPackList()`，已由 pack command tests 与 CLI registration tests 覆盖。
