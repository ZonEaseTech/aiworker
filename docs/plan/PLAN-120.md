# PLAN-120 CLI onboarding polish for command groups and executor hints

- **status**: completed
- **createdAt**: 2026-05-06 02:40
- **approvedAt**: 2026-05-06 02:40
- **completedAt**: 2026-05-06 03:05
- **relatedTask**: BUG-073, TODO-026, BUG-051

## 现状

PLAN-115 剩余 onboarding polish 包含三项：

- `aiworker soul --help` / `brain --help` / `executor --help` 等 group-level help
  会落回顶级 help，没有说明这是 command group。
- `aiworker init` 的 executor recommendation / alternates 文案是 advisory，但看起来像
  enforced compatibility matrix。
- `aiworker executor mcp add --arg -y` 被 option parser 当成未知 option，虽然
  `--arg=-y` 可用。

## 方案

1. **Group help**
   - 在 CLI parse 后、全局 help 退出前识别 unmatched command group + `--help`。
   - 输出该 group 下的 scoped subcommands 与摘要；真实未知命令仍走 unknown-command error。
   - 覆盖 root group、worker group、fleet nested group 等常见前缀。

2. **Advisory executor recommendation**
   - 明确选择 advisory-only 路径：init 文案改成 suggested / also tested，说明其它 engine
     technically supported 但未按该 Soul 特别验证。
   - docs/executor-engines 记录 recommendation 不参与 `executor select` enforcement。

3. **Hyphenated MCP args**
   - 只在 `executor mcp add` / `worker executor mcp add` 命令中，把 `--arg` 后紧随的
     hyphenated value 预处理为 `--arg=<value>`。
   - 其它命令继续使用现有 unknown-option validation。

## 风险

1. **过度吞 unknown option**：预处理只匹配具体命令 + 具体 option，不改变全局 parser。
2. **help exit code**：group-level `--help` 是有效 scoped help，返回 0；非 group unknown
   command 继续返回 2。
3. **recommendation 降级**：文案只改 contract，不限制 operator 选择任意 supported engine。

## 范围

- `apps/cli/src/aiworker.ts`
- `apps/cli/src/help.ts`
- CLI registration / executor tests
- `apps/cli/src/commands/worker/init.ts`
- `docs/executor-engines.md`
- `docs/cli.md`

## 非范围

- 不实现 per-Soul executor compatibility enforcement。
- 不新增 Soul/engine matrix 数据结构。
- 不改变 executor overlay schema。

## 验证

```bash
bun test ./apps/cli/src/aiworker.test.ts ./apps/cli/src/commands/worker/executor.test.ts ./apps/cli/src/commands/worker/init.integration.test.ts
bun run --filter '@zonease/aiworker-cli' typecheck
bun run lint
git diff --check
```

## 进度

- 2026-05-06 02:40：立项并 claim BUG-073 / TODO-026 / BUG-051；开始实现 group help、
  advisory wording 和 `--arg -y` 预处理。
- 2026-05-06 03:05：完成。group-level `--help` 输出 scoped subcommands；init executor
  recommendation 明确 advisory-only；`executor mcp add --arg -y` 被保留为 stdio arg value。
  验证通过：
  `bun test ./apps/cli/src/aiworker.test.ts ./apps/cli/src/commands/worker/executor.test.ts ./apps/cli/src/commands/worker/init.integration.test.ts`
  (64 pass), `bun run --filter '@zonease/aiworker-cli' typecheck`, `bun run lint`。
