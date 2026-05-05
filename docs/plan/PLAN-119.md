# PLAN-119 Init secret handling and executor doctor status truthfulness

- **status**: completed
- **createdAt**: 2026-05-06 02:00
- **approvedAt**: 2026-05-06 02:00
- **completedAt**: 2026-05-06 02:35
- **relatedTask**: BUG-071, BUG-072

## 现状

PLAN-115 第 4 阶段保留两个 operator trust / safety 缺陷：

- `aiworker executor doctor` 在 fresh-init overlay 默认场景中，header 使用过滤后的
  warning count，`Status:` 行仍使用未过滤 warning 集合，出现 `0 WARN` 但
  `Status: WARN` 的自相矛盾输出。
- `aiworker init` 默认通过 core bootstrap 在 stdout 打印完整 bootstrap token，且
  dotenv bootstrap 在 stderr 打印完整 `AIWORKER_MASTER_KEY`；这两个值容易进入终端日志、
  CI artifact 或共享截图。

## 方案

1. **Doctor status rubric 统一**
   - `Status:` 使用与 header 相同的 surfaced WARN rubric。
   - INFO 行不提升 section status；fresh-init overlay empty warning 被过滤后显示 PASS。
   - 增加 fresh-init executor doctor snapshot 断言。

2. **Init secret safe defaults**
   - `aiworker init` 调用 dotenv bootstrap 时默认不打印 master key 明文，只打印 `.env`
     路径和离线备份提示。
   - `loadWorkerContext` 暴露 `justMinted`，`init` 以 silent 方式加载 identity，再由 init
     自己处理首次 token delivery。
   - 默认把完整 bootstrap token 写入 chmod 0600 token file，并在 stdout 只打印 masked
     token 与文件路径；`--token-file <path>` 可覆盖路径。
   - `--show-token` 显式 opt-in 后才在高可见 warning block 中显示完整 token。
   - 首次 token delivery 后仍标记 `bootstrapShownAt`，保持一次性语义。

3. **Docs / tests / tracking**
   - CLI help 与 docs 说明 `--token-file` / `--show-token` 迁移路径。
   - 更新 init integration tests 覆盖默认不输出 raw token、token file chmod 0600、
     `--show-token` gated raw 输出，以及 master-key 默认不明文输出。

## 风险

1. **脚本兼容性**：旧脚本 grep stdout 的 `AIWORKER_BOOTSTRAP_TOKEN=` 需要改为读取
   token file 或显式 `--show-token`；文档必须给迁移路径。
2. **一次性语义**：默认 token file 也是一次性 delivery，避免后续 re-init 重打 token。
3. **安全提示强度**：默认不输出 master key value；operator 备份 `.env` 文件即可。

## 范围

- `apps/cli/src/commands/worker/init.ts`
- `apps/cli/src/commands/worker/executor.ts`
- `apps/cli/src/context.ts`
- `packages/core/src/worker/bootstrap/print.ts`
- `packages/core/src/index.ts`
- CLI command registration/help/docs/tests

## 非范围

- 不实现新的 master-key export command。
- 不修改 gateway supervisor 的 container-log bootstrap token polling。
- 不修改 worker serve / API token rotate 输出。

## 验证

```bash
bun test ./apps/cli/src/commands/worker/init.integration.test.ts ./apps/cli/src/commands/worker/executor.test.ts ./packages/core/src/worker/bootstrap/bootstrap.test.ts
bun run --filter '@zonease/aiworker-cli' typecheck
bun run --filter '@zonease/aiworker-core' typecheck
bun run lint
git diff --check
```

## 进度

- 2026-05-06 02:00：立项并 claim BUG-071 / BUG-072；完成根因定位，开始实现 safe init
  token delivery 与 doctor status rubric 统一。
- 2026-05-06 02:35：完成。`executor doctor` header 和 `Status:` 使用同一 surfaced rubric；
  `aiworker init` 默认把完整 bootstrap token 写入 chmod 0600 token file，stdout 只显示
  masked token 与 master-key `.env` 路径，`--show-token` 才显示明文。验证通过：
  `bun test ./apps/cli/src/commands/worker/init.integration.test.ts ./apps/cli/src/commands/worker/executor.test.ts ./packages/core/src/worker/bootstrap/bootstrap.test.ts`
  (37 pass), `bun run --filter '@zonease/aiworker-cli' typecheck`,
  `bun run --filter '@zonease/aiworker-core' typecheck`, `bun run lint`。
