# PLAN-099 Artifact registry kernel

- **status**: completed
- **createdAt**: 2026-05-04 13:52
- **approvedAt**: 2026-05-04 15:00
- **completedAt**: 2026-05-04 15:35
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

## 进度

- 2026-05-04 15:00：用户批准 PLAN-099 设计（shared schema + worker.db 表 + core registry + CLI 只读 inspector，默认 redact confidential / secret）。
- 2026-05-04 15:35：实现完成。
  - `packages/shared/src/brain/artifact.ts`：`BrainArtifact` zod schema（`id`、`scopeId`、`type`、`ref`、`hash`、`source`、`sensitivity`、`status`、`retention`、`summary`、`evidenceRefs`、`metadata`、`createdAt`、`updatedAt`）+ `brainArtifactRegisterInputSchema` 默认 `sensitivity=internal` / `status=active` + `redactBrainArtifact` 工具：confidential / secret 自动把 ref + hash 替换为 `<redacted>`，summary 保留。`packages/shared/src/index.ts` 暴露给下游。
  - `packages/storage-sqlite/src/worker/schema.ts`：新增 `brain_artifacts` 表 + `(scope_id, type)` / `(status, type)` / `updated_at` 三索引。`bun run db:generate:worker` 生成 `0005_worthless_whiplash.sql` 迁移。
  - `packages/core/src/worker/brain/artifacts/registry.ts`：`BrainArtifactRegistry`（register / get / requireById / list / setStatus / count），`list` / `get` / `setStatus` 默认 `redactSensitive=true`，`minSensitivity` 过滤、`scopeId` / `type` / `status` 复合过滤。`packages/core/src/index.ts` 暴露。
  - CLI `aiworker brain artifacts list / show`（root + worker namespace）：默认 redact，`--show-sensitive` 解锁；`--scope`、`--type`、`--status`、`--min-sensitivity`、`--limit` 过滤；不构建 WorkerRuntime（直接读 worker.db）。`apps/cli/src/help.ts` 与 `apps/cli/src/aiworker.test.ts` 同步注册 + 摘要。
  - 测试：shared `artifact.test.ts`（developer + HR fixture、所有验证 / redact 边界）；storage `EXPLAIN QUERY PLAN` 命中三索引；core `registry.test.ts` 10 个 case 覆盖 register / list / minSensitivity / setStatus / count / metadata round-trip / redact 默认；CLI `brain-artifacts.test.ts` 7 个 case 覆盖默认 redact、`--show-sensitive`、scope+type 过滤、limit 越界、show 不存在 / 空 id。
  - 验证：`bun run --filter '@zonease/aiworker-shared' test` 75 pass、`bun run --filter '@zonease/aiworker-storage-sqlite' test` 17 pass、`bun run --filter '@zonease/aiworker-core' test` 531 pass、`bun run --filter '@zonease/aiworker-cli' test` 137 pass、`bun run typecheck` 全 workspace 通过、`bun run lint` 通过。
