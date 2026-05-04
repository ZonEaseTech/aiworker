# PLAN-099 Artifact registry kernel

- **status**: draft
- **createdAt**: 2026-05-04 13:52
- **approvedAt**: (pending)
- **relatedTask**: FEAT-054

## 现状

Project Brain 当前能读取 memories / skills / persona，并通过 worker.db 保存
conversations、messages、execution logs 和 evolution observations。但它还没有
通用 artifact registry，无法把简历、合同、表格、工单、代码文件等作为可审计
业务资料登记，也无法记录敏感级别、hash、来源、保留策略和 workflow status。

## 方案

实现 Brain Kernel 的 artifact registry：

1. 定义通用 `BrainArtifact`：`id`、`type`、`ref`、`hash`、`source`、
   `sensitivity`、`retention`、`status`、`evidenceRefs`、`metadata`。
2. Artifact type 由 Soul module 声明；Kernel 不内建 developer / HR / finance 语义。
3. 引用优先于内容复制：敏感材料默认只记录 path/ref/hash/summary，不把全文写进 git-tracked brain。
4. artifact registry 持久化在 worker 数据面；filesystem canonical brain 只保存可 review 的摘要和索引。
5. CLI 提供 read-only inspector，mutating import / classify 命令另走 admission 或显式 operator action。

## 范围

- shared type / zod schema。
- worker.db schema migration（如本 plan 获批实施）。
- core registry service。
- CLI read-only list/show/status。
- developer + HR fixtures。

## 非范围

- 不做全文 OCR / PDF parsing。
- 不做 vector index。
- 不上传 artifact 到 gateway。
- 不把 artifact 内容复制进 fleet.db。

## 风险

1. Artifact registry 很容易变成文档管理系统；第一版只做登记、证据和状态，不做内容平台。
2. PII / secret-like 内容必须默认保守；hash/ref 可以存，原文要看 sensitivity 与 retention。
3. workflow status 不能强行统一所有 Soul；Kernel 只保存通用状态字段，Soul 解释业务含义。

## 验证

- storage migration tests。
- focused core registry tests。
- CLI read-only command tests。
- `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
