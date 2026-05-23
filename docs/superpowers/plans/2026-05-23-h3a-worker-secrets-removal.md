# H3a worker_secrets 孤儿设施清理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 `worker_secrets` 孤儿设施（DB 表 + drop 迁移、死 `secretRef:` 分支、过时 master-key 注入、引用已删符号的陈旧 smoke 脚本），并在架构合同明确 session transcript 是 Host 合法操作台账。

**Architecture:** 支撑 `worker_secrets` 的 `SecretsVault` 类早已从 `packages/core` 移除，残留全是死代码。本计划做纯清理：从 Drizzle schema 删表并生成 DROP 迁移，移除两处死 `secretRef:` 引用分支，删除过时的 master-key 测试注入与孤儿 smoke 脚本，最后补架构合同注解。BYOK key 解析只走 `env:`，不受影响。

**Tech Stack:** TypeScript、Bun、Drizzle ORM（SQLite）、vitest/bun:test。

**来源 spec:** `docs/superpowers/specs/2026-05-23-h3-data-plane-fix-design.md`

**说明（关于 TDD）：** 本计划是纯死代码/孤儿 schema 删除，不存在"先写失败测试"的自然形态。每个删除任务以**验证驱动**：删除 → grep 确认无残留引用 → 跑相关测试套件全绿 → 提交。删除前先 grep 确认引用面，是这里替代 red-test 的纪律。

---

## 背景：执行前必读（已核实）

- `SecretsVault` 不存在于 `packages/core/src`（`core/index.ts` 不导出）。
- `apps/cli/scripts/smoke-aiworker-run.ts:8` `import { recordBrainJournalEvent, SecretsVault } from '@zonease/aiworker-core'`——两符号均不存在；脚本未被 `package.json`/CI 引用，不在 `apps/cli/tsconfig.json` 的 `include`（`src/**/*.ts`）内，从不 typecheck、本就跑不起来。
- `workerEnv` 配置 schema（`packages/core/src/config/worker.ts:8-15`）**不要求** `AIWORKER_MASTER_KEY`；`test-setup.ts` 注释声称要求，是过时说明。
- `resolveApiKey`（`executor.ts:442-453`）只读 `process.env`，与 vault 无关。
- `secretRef:` 仅出现在两处校验谓词，无 manifest/config 使用。
- 迁移目录现有 `0000`–`0006`，下一个是 `0007`（`0006_drop_business_tables.sql` 是 drop 迁移的先例）。
- `packages/core/bunfig.toml:2` `preload = [ "./src/test-setup.ts" ]`。
- 命令：storage 测试 `bun run --filter '@zonease/aiworker-storage-sqlite' test`；core 测试 `bun run --filter '@zonease/aiworker-core' test`；迁移生成 `bun run db:generate:worker`；`bun run typecheck` / `bun run lint` / `bun run docs:check`。

## File Structure

- Modify: `packages/storage-sqlite/src/worker/schema.ts`（删 `workerSecrets` 表）
- Create（生成）: `packages/storage-sqlite/drizzle/worker/0007_*.sql` + `meta/0007_snapshot.json` + `meta/_journal.json` 更新（由 `db:generate:worker` 产出）
- Modify: `packages/core/src/worker/engine-assets.ts:316-318`、`apps/api/src/modes/worker.ts:657-659`（删死 `secretRef:` 分支）
- Delete: `packages/core/src/test-setup.ts`（过时 master-key 注入）+ `packages/core/bunfig.toml` 移除 preload 行
- Delete: `apps/cli/scripts/smoke-aiworker-run.ts`（孤儿脚本）
- Modify: `docs/architecture.md`（DATA-001 / Data Contract 注解）

---

## Task 1: 删除 worker_secrets 表并生成 DROP 迁移

**Files:**
- Modify: `packages/storage-sqlite/src/worker/schema.ts:263-271`
- Generate: `packages/storage-sqlite/drizzle/worker/0007_*.sql` + meta

- [ ] **Step 1: 删除前确认引用面**

Run: `rg -n "workerSecrets|worker_secrets|WorkerSecret" packages apps --type ts | rg -v 'drizzle/'`
Expected: 仅 `packages/storage-sqlite/src/worker/schema.ts:263` 一处（表定义本身）。若出现其它读写引用，停下报告（说明并非孤儿，需重新评估）。

- [ ] **Step 2: 删除 schema 表定义**

删除 `packages/storage-sqlite/src/worker/schema.ts` 第 263-271 行整个 `workerSecrets` 块：
```ts
export const workerSecrets = sqliteTable('worker_secrets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  valueEnc: text('value_enc').notNull(),
  nonce: text('nonce').notNull(),
  authTag: text('auth_tag').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(nowIso),
  updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
})
```
（确认删后 `integer`/`text`/`nowIso` 等仍被文件其它表使用——它们是；不要动 import。）

- [ ] **Step 3: 生成 DROP 迁移**

Run: `bun run db:generate:worker`
Expected: 生成 `packages/storage-sqlite/drizzle/worker/0007_*.sql`，内容包含 `DROP TABLE \`worker_secrets\`;`，并更新 `meta/0007_snapshot.json` 与 `meta/_journal.json`。

- [ ] **Step 4: 验证迁移内容**

Run: `cat packages/storage-sqlite/drizzle/worker/0007_*.sql`
Expected: 含 `DROP TABLE \`worker_secrets\`;`（且不含其它意外表变更——若有，说明 schema 有其它漂移，停下排查）。

- [ ] **Step 5: 跑 storage 测试**

Run: `bun run --filter '@zonease/aiworker-storage-sqlite' test`
Expected: 全绿。若有测试引用 `workerSecrets`，更新或删除该测试后再跑。

- [ ] **Step 6: 提交**

```bash
git add packages/storage-sqlite/src/worker/schema.ts packages/storage-sqlite/drizzle/worker/
git commit -m "$(cat <<'EOF'
fix: 删除孤儿 worker_secrets 表并生成 drop 迁移

SecretsVault 早已从 core 移除,该表无读写代码。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 清理死代码引用（secretRef 分支 / master-key / 孤儿脚本）

**Files:**
- Modify: `packages/core/src/worker/engine-assets.ts:316-318`
- Modify: `apps/api/src/modes/worker.ts:657-659`
- Delete: `packages/core/src/test-setup.ts`
- Modify: `packages/core/bunfig.toml`（移除 preload 行）
- Delete: `apps/cli/scripts/smoke-aiworker-run.ts`

- [ ] **Step 1: 删除前确认引用面**

Run: `rg -n "secretRef:|AIWORKER_MASTER_KEY|MASTER_KEY|SecretsVault|recordBrainJournalEvent" packages apps | rg -v 'drizzle/'`
Expected: `secretRef:` 仅在 `engine-assets.ts:317` 与 `apps/api/src/modes/worker.ts:658` 的谓词；`AIWORKER_MASTER_KEY` 仅在 `test-setup.ts` 与 `smoke-aiworker-run.ts`；`SecretsVault`/`recordBrainJournalEvent` 仅在 `smoke-aiworker-run.ts`。若 `secretRef:`/`AIWORKER_MASTER_KEY` 出现在其它运行时代码或测试断言，停下报告。

- [ ] **Step 2: 移除死 `secretRef:` 分支（两处）**

`packages/core/src/worker/engine-assets.ts:316-318` →
```ts
function isSecretReferenceValue(value: string): boolean {
  return value.startsWith('$') || value.startsWith('env:')
}
```
`apps/api/src/modes/worker.ts:657-659` →
```ts
function isSecretReference(value: string): boolean {
  return value.startsWith('$') || value.startsWith('env:')
}
```

- [ ] **Step 3: 删除过时 master-key 注入与 preload**

- 删除整个文件 `packages/core/src/test-setup.ts`（其唯一作用是注入已不被任何 schema 要求的 `AIWORKER_MASTER_KEY`）。
- `packages/core/bunfig.toml`：删除 `preload = [ "./src/test-setup.ts" ]` 这一行（若 `[test]` 段因此变空，保留段头或一并删空段，确保 TOML 合法）。

- [ ] **Step 4: 删除孤儿 smoke 脚本**

```bash
git rm apps/cli/scripts/smoke-aiworker-run.ts
```

- [ ] **Step 5: 跑 core + api 测试与 typecheck**

Run: `bun run --filter '@zonease/aiworker-core' test && bun run --filter '@zonease/aiworker-api' test && bun run --filter '@zonease/aiworker-core' typecheck`
Expected: 全绿、typecheck exit 0。重点确认删除 `test-setup.ts` preload 后 core 测试不依赖 `AIWORKER_MASTER_KEY`（不应依赖——配置 schema 不要求它）。若某测试因缺该 env 失败，说明它确实需要——停下报告，不要悄悄塞回。

- [ ] **Step 6: lint 改动文件**

Run: `bunx eslint packages/core/src/worker/engine-assets.ts apps/api/src/modes/worker.ts`
Expected: exit 0（这两个改动文件无新增 lint 错误；仓库其它预存 lint 债不在本任务范围）。

- [ ] **Step 7: 提交**

```bash
git add packages/core/src/worker/engine-assets.ts apps/api/src/modes/worker.ts packages/core/bunfig.toml
git rm packages/core/src/test-setup.ts apps/cli/scripts/smoke-aiworker-run.ts
git commit -m "$(cat <<'EOF'
fix: 清理 worker_secrets 残留死引用

移除死 secretRef 分支、过时 AIWORKER_MASTER_KEY 测试注入与 preload、引用已删
SecretsVault/recordBrainJournalEvent 的孤儿 smoke 脚本。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 架构合同补注（transcript 为操作台账 + secret-in-DB 已无表）

**Files:**
- Modify: `docs/architecture.md`（DATA-001 行与 Data Contract / Isolation 段）

- [ ] **Step 1: 在 Data Contract 段补 transcript 操作台账注解**

在 `docs/architecture.md` 的 “Data Contract” 段（`worker.db stores Host metadata only` 列表附近）补一句，明确：

```
Session transcript records — turn input, Host-assembled engine prompt, engine
response, assistant deltas and status/tool events stored inline on `turns`,
`engine_invocations` and `session_events` — are Host operational ledger for the
local shell's session list, timeline and status. They are platform metadata
under DATA-001, not Soul domain content. Only Soul-produced artifact files stay
in the Soul App workspace.
```

- [ ] **Step 2: 在 Isolation/Security 段确认 secret-in-DB 已无对应表**

在 `docs/architecture.md` Isolation/Security 的 “Secret 只能放 .env、vault 或 secret reference” 条目后补一句：

```
Host stores no encrypted secret table in `worker.db`; the prior `worker_secrets`
vault was removed. Engine/BYOK secrets resolve only through `env:`/`$` references.
```

- [ ] **Step 3: 文档合同检查**

Run: `bun run docs:check`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add docs/architecture.md
git commit -m "$(cat <<'EOF'
docs: 明确 session transcript 为 Host 操作台账,确认无 secret-in-DB

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 收尾验证（全部任务完成后）

- [ ] **Step 1: 全仓确认无残留**

Run: `rg -n "worker_secrets|workerSecrets|SecretsVault|recordBrainJournalEvent|AIWORKER_MASTER_KEY|secretRef:" packages apps | rg -v 'drizzle/worker/000[0-6]'`
Expected: 仅 `drizzle/worker/0007_*.sql` 与 meta 快照中作为 DROP/历史残留的 `worker_secrets` 字样；源码、配置、脚本中 0 命中其余符号。

- [ ] **Step 2: 相关包测试 + typecheck**

Run: `bun run --filter '@zonease/aiworker-storage-sqlite' test && bun run --filter '@zonease/aiworker-core' test && bun run --filter '@zonease/aiworker-api' test && bun run typecheck`
Expected: 测试全绿；typecheck 中预存的 storage-sqlite test 类型报错（与本改动无关）按文件归属判断，本改动不应新增类型错误。

- [ ] **Step 3: BYOK 回归确认**

Run: `rg -n "resolveApiKey|env:" packages/core/src/worker/executor.ts | head`
Expected: 确认 BYOK key 仍只经 `env:`/`process.env` 解析，未受 secret 清理影响。

---

## 非目标

- 不做 H3b（内联 transcript ref 化）——已判为非违约。
- 不动 `worker_engine_invocations` 既有 ref 机制。
- 不改 `workerEnv` 配置 schema（它本就不含 master key）。
- 不引入新 secret 存储。
- 不碰 H4（engine env allowlist）。
