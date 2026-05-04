# FEAT-048 Product positioning pivot to Project Brain and Worker/Fleet aggregation

- **status**: completed
- **priority**: P1
- **owner**: local
- **createdAt**: 2026-05-04 11:22
- **claimedAt**: 2026-05-04 11:22
- **completedAt**: 2026-05-04 11:22
- **plans**: PLAN-083, PLAN-084

## 描述

AIWorker 的产品定位从“自托管 Agent Runtime，深度经营 Brain + Executor 两层”
收敛为更轻量的 **Project Brain + Worker/Fleet aggregation runtime**。

AIWorker 自己拥有并差异化的部分是 project brain、worker identity/state、
gateway control plane、fleet routing、audit、admin surface 与 worker 聚合体验。
Codex、Claude Code、Hermes、OpenClaw、Cursor 等 executor 是外部成熟 agent
runtime；AIWorker 通过薄 adapter 调用它们，但不和它们竞争 MCP、skill、
plugin、sandbox、approval、native session 或 user-level config 生态。

## ActiveForm

记录并落地产品定位转向：Project Brain 绑定项目，executor 是 bring-your-own
外部运行时；AIWorker 不默认承诺 executor isolation，也不把 project overlay
误表述为 executor effective capability source of truth。

## 依赖

- **blocked by**: none
- **blocks**: FEAT-049, FEAT-050, FEAT-051, FEAT-052
- **relates to**: FEAT-044, FEAT-046, FEAT-047, PLAN-055, PLAN-073, PLAN-077

## 验收标准

1. AGENTS.md 明确 AIWorker 的卖点是 Project Brain 与 Worker/Fleet 聚合，不是 executor 平台。
2. 架构文档用图和边界说明表达 AIWorker-owned 与 executor-owned 的职责分界。
3. README 与 CLI 文档不再暗示 project executor capability 是完整能力全集或隔离边界。
4. PMA task/plan 拆出后续 FEAT 与 PLAN，覆盖 executor surface 收口、brain-first surface、fleet 聚合和 BYO executor strategy。
5. changelog 记录本次产品定位决策，便于后续 release note 和代码收口引用。

## 阶段计划

1. `PLAN-083`：PMA epic/task/plan tracking 与 AGENTS.md 定位更新。
2. `PLAN-084`：architecture、README、CLI 文档产品语义同步。

## 笔记

- 2026-05-04 11:22：用户确认 AIWorker 应避免与 OpenClaw / Hermes / Codex / Claude Code 等成熟 executor 生态抢资源；本轮先完整落文档和 markdown 追踪，不改 executor 代码。
- 2026-05-04 11:22：完成 PLAN-083 / PLAN-084，已落 PMA 拆分、AGENTS.md、architecture、README、CLI 文档和 changelog。后续 executor/brain/fleet 实现收口由 FEAT-049..052 推进。
