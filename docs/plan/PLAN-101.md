# PLAN-101 Brain admission MVP for scope assets

- **status**: draft
- **createdAt**: 2026-05-04 13:52
- **approvedAt**: (pending)
- **relatedTask**: FEAT-054

## 现状

Architecture 已经规定 generated memory / brain skill / policy proposal 写入
filesystem 前必须经过 operator approval，但尚未落 worker.db schema、CLI/API
approval surface，也没有把 artifact / Soul proposal 纳入统一 admission 模型。

## 方案

落地 Brain admission MVP：

1. 新增 `brain_admission_proposals` 与 `brain_admission_decisions` worker.db 表。
2. Proposal 必须包含 `kind`、`target`、`summary`、`evidence`、`risk`、
   `confidence`、`rollback`、`payload`、`status`。
3. CLI 提供 `aiworker brain admission list/show/approve/reject`。
4. Approval materializer 第一版只支持低风险、明确目标的 filesystem brain patch 或
   artifact registry status update。
5. 高风险 proposal 默认 pending；reject / approve 都写 audit 决策记录。

## 范围

- worker.db migration。
- shared schemas。
- core admission service。
- CLI approval commands。
- focused tests。

## 非范围

- 不做 Worker Admin UI（由 PLAN-103 收口）。
- 不做自动审批。
- 不把 admission proposal 全文复制到 fleet.db。
- 不复用 executor capability / MCP / plugin 通路。

## 风险

1. Admission 太重会损害轻量 UX；MVP 只拦 generated durable changes，不拦只读 inspection。
2. Materializer 写 filesystem brain 有破坏性风险；必须保留 rollback / dry-run / diff preview。
3. 高风险 HR/finance proposal 涉及敏感材料；CLI 输出需要避免直接打印原文。

## 验证

- migration tests。
- admission service unit tests。
- CLI command tests for list/show/approve/reject。
- secret-like output redaction tests。
- `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' test`
