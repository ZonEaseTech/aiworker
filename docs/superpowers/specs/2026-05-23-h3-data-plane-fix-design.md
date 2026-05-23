# H3 数据面整改设计

- 日期：2026-05-23
- 来源：`docs/superpowers/specs/2026-05-23-zero-trust-boundary-audit-design.md`（H3）
- 约束基线：DATA-001、Isolation/Security（secret 不得写入 DB metadata）

## 范围决策（用户确认）

H3 拆为两半，本设计只做 **H3a**：

- **H3a（做）**：删除 `worker_secrets` 孤儿设施。复核发现支撑它的 `SecretsVault` 类**早已从
  `packages/core` 移除**（`core/index.ts` 不导出，源码无 `Vault` 字样），残留的只是 DB 表、migration、
  死分支与一个陈旧脚本——纯死代码/孤儿 schema 清理，零运行时风险。
- **H3b（不做，判为非违约）**：`turns`/`engine_invocations`/`session_events` 的内联内容（input、
  Host 组装的 prompt、response、assistant_delta、status/tool 事件）正式认定为 **Host 对 engine bridge
  的合法操作台账**——Host 本地壳的 session 列表/时间线/状态依赖它，DATA-001 本就把 “sessions、engine
  invocation references” 列为合法 Host metadata。只有 **Soul 产出的 artifact 文件**留在 workspace。
  此解释写入架构合同，撤销审计初稿把内联 transcript 当作 DATA-001 违约的判断。

## 已核实事实

- `SecretsVault` 不存在于 `packages/core/src`（`find ... grep -l Vault` 为空；`core/index.ts` 92 行不导出它）。
- `apps/cli/scripts/smoke-aiworker-run.ts:8` 仍 `import { recordBrainJournalEvent, SecretsVault }`——两个符号在
  core 均不存在；该脚本未被 `package.json`/CI 引用，且不在 `apps/cli/tsconfig.json` 的 `include`
  （`src/**/*.ts`）内，故从不 typecheck、本就跑不起来，是孤儿。
- BYOK key 解析 `resolveApiKey`（`packages/core/src/worker/executor.ts:442-453`）只读 `process.env`，不碰 vault。
- `secretRef:` 仅出现在引用校验谓词（`engine-assets.ts:317`、`apps/api/src/modes/worker.ts:658`），
  无任何 manifest/config 使用——死分支，可安全删；`env:`/`$` 引用保留。
- `worker_secrets` 表由初始 migration `drizzle/worker/0000_polite_stellaris.sql` 创建。

## 改动单元（H3a）

1. **schema**：删除 `packages/storage-sqlite/src/worker/schema.ts:263-269` 的 `workerSecrets` 表定义
   及其导出的 Row 类型（如有 `WorkerSecretRow`/`workerSecrets` 在该包 index 的 re-export，一并删）。
2. **migration**：删表后运行 `bun run db:generate:worker`，由 drizzle-kit 生成 DROP `worker_secrets`
   的新 migration（**不手改 `0000`**）。提交生成的 `.sql` 与 meta 快照。
3. **死 `secretRef:` 分支**：从 `packages/core/src/worker/engine-assets.ts:317` 与
   `apps/api/src/modes/worker.ts:658` 的谓词移除 `|| value.startsWith('secretRef:')`，保留 `env:`/`$`。
4. **master key**：移除 `packages/core/src/test-setup.ts` 中注入 `AIWORKER_MASTER_KEY` 的逻辑
   （连同其上的注释）。
5. **孤儿脚本**：`apps/cli/scripts/smoke-aiworker-run.ts` 已 broken（import 不存在的 `SecretsVault`/
   `recordBrainJournalEvent`）且未接入任何入口——删除整个脚本。
6. **架构合同**：在 `docs/architecture.md` 的 DATA-001 与 Data Contract 段补一句：session transcript
   （turns/engine invocation/session event 的内联 input/prompt/response/delta/status）是 Host 操作台账，
   属合法 platform metadata；仅 Soul 产出的 artifact 文件留 workspace。同时确认 “Secret 不得写入 DB
   metadata” 现已无对应表（worker_secrets 已删）。

## 测试与验证

- 现有测试里凡引用 `worker_secrets`/`AIWORKER_MASTER_KEY`/`secretRef:` 的，更新或删除（先 grep 定位）。
- `bun run --filter '@zonease/aiworker-storage-sqlite' test`（schema/migration 仓库测试）。
- `bun run db:generate:worker` 生成 drop 迁移后，跑一次 worker DB 初始化/迁移路径的测试或 smoke，确认
  迁移可应用（无表即 drop 的幂等性由 drizzle 处理）。
- `bun run typecheck`（确认删 schema/分支后无类型残留；预存的 storage-sqlite test 类型报错与本改动无关，按文件归属判断）。
- `bun run lint`（含边界守卫；确认无新违规）。
- `bun run docs:check`（架构合同改动）。
- BYOK 回归：确认 `resolveApiKey` 路径仍只依赖 `env:`，无功能回退。

## 非目标

- 不做 H3b（内联 transcript ref 化）——已判为非违约。
- 不动 `worker_engine_invocations` 既有的 ref 机制。
- 不引入新的 secret 存储；secret 继续走 `.env`/`env:`/vault-ref（外部）。
- 不碰 H4（engine env allowlist）。
