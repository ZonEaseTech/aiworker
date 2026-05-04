# PLAN-083 Product positioning PMA tracking and AGENTS guidance

- **status**: completed
- **createdAt**: 2026-05-04 11:22
- **approvedAt**: 2026-05-04 11:22
- **completedAt**: 2026-05-04 11:22
- **relatedTask**: FEAT-048

## 现状

1. AIWorker 文档仍保留较重的 executor capability lifecycle 叙事。
2. 用户明确希望 AIWorker 轻量化，避免与 Codex、Claude Code、Hermes、OpenClaw 等成熟 executor 生态竞争。
3. AIWorker 的更稳定位是 Project Brain + Worker/Fleet aggregation；executor 是 bring-your-own external runtime。
4. PMA task/plan 需要先落清楚，后续代码和 UI 收口才能按小切片推进。

## 方案

1. 新建 `FEAT-048` 作为产品定位 umbrella epic，并拆出：
   - `FEAT-049` executor surface simplification。
   - `FEAT-050` Project Brain product surface。
   - `FEAT-051` Worker/Fleet aggregation surface。
   - `FEAT-052` bring-your-own executor strategy。
2. 新建 `PLAN-083..095`，把每个后续执行切片拆到可独立审批和验证。
3. 更新 `AGENTS.md`，把 repo 工作指引中的产品定位和能力边界切到新方向。

## 范围

- `docs/task/index.md`
- `docs/task/FEAT-048.md` 到 `docs/task/FEAT-052.md`
- `docs/plan/index.md`
- `docs/plan/PLAN-083.md` 到 `docs/plan/PLAN-095.md`
- `AGENTS.md`

## 非范围

- 不改 TypeScript 代码。
- 不删除既有 executor commands。
- 不改变 runtime 行为。

## 风险

1. 已完成的 FEAT-044 / FEAT-047 文档仍记录旧交付历史。新计划通过 FEAT-049 做语义收口，不篡改历史记录。
2. 如果 AGENTS.md 只写“轻量”而不写边界，后续实现可能继续膨胀 executor scope。因此本计划把禁止默认 executor isolation、project overlay 语义和 BYO executor 写成明确规则。

## 验证

- Markdown 文件存在且 index 引用正确。
- `AGENTS.md` 含新的产品定位与 executor 边界。
- `git diff --check`

## 完成记录

- 2026-05-04 11:22：已创建 FEAT-048..052 与 PLAN-083..095，并更新 AGENTS.md 的产品定位规则。
