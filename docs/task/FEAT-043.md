# FEAT-043 优化 init 后引导与 Soul 能力测试流程

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-01 12:34
- **claimedAt**: 2026-05-01 12:39
- **completedAt**: 2026-05-01 12:47
- **plan**: PLAN-053

## 描述

`aiworker init` 已经能选择 Soul 并生成项目级 `.aiworker/`，但完成后仍缺少清晰的下一步引导。刚上手的用户不知道应该先检查哪些文件、如何跑一次本地验证、何时启动 `serve`，以及如何把 worker 接入 gateway。

同时，当前每个内置 Soul 的能力只散落在 `apps/cli/src/commands/init.ts` 的 preset 数据里。用户无法直接查看每个 Soul 具备哪些职责、默认 capability packs、toolsets 和风险策略，也没有一条完整测试流程证明所有 Soul preset 都能初始化并生成一致的能力草案。

验收标准：

1. `aiworker init` 成功后输出短小、可执行的 next steps，包含 `scope`、检查 `.aiworker/SOUL.md`、本地 dry-run、实际 `run`、`serve` / gateway 接入提示。
2. 内置 Soul preset 从 `init.ts` 中抽出为可复用 registry，避免 init、帮助信息、测试矩阵各自维护一份列表。
3. 新增 CLI 能力查看入口，例如 `aiworker soul list` 和 `aiworker soul show <id>`，能展示每个 Soul 的职责、边界、packs、toolsets、风险策略和当前草案状态。
4. 为所有内置 Soul 增加聚焦测试：逐个 `aiworker init --soul <preset> --dry-run` 和实际 init，校验生成的 `SOUL.md`、`AGENT.md`、`policy.json`、`toolsets.json`、`capability-packs.json` 都包含对应 preset 能力。
5. 文档补充 init 后推荐验证路径，避免用户只看到 worker id / token 后停住。

## 进行时描述

正在优化 `aiworker init` 后的首次使用路径，并补齐 Soul 能力可见性与测试矩阵。

## 依赖

- **blocked by**: PLAN-053 审批
- **relates to**: FEAT-039, PLAN-041, BUG-040, FEAT-041
- **blocks**: Soul 模板后续治理、capability pack validation、首次使用体验

## 笔记

- 2026-05-01 12:34：用户反馈两点体验缺口：`init` 后新手不知道下一步；每个 Soul 需要完整测试流程，至少能知道当前各 Soul 具备哪些能力。调查确认 FEAT-039/PLAN-041 已完成 S1 与 S2R，当前缺口不在 Soul 选择本身，而在 post-init onboarding 和 Soul capability surface/test matrix。
- 2026-05-01 12:39：用户批准 PLAN-053，开始实现。
- 2026-05-01 12:47：完成实现。`init` 成功后输出 next steps；新增 `aiworker soul list/show`；Soul preset registry 抽为共享模块；所有内置 preset 都覆盖 dry-run 与实际 init 能力草案测试；`docs/cli.md` 已补初始化后验证路径。
