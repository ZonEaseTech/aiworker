# PLAN-075 Codex MCP projection compatibility

- **status**: completed
- **createdAt**: 2026-05-03 13:09
- **relatedTask**: FEAT-047

## 现状

1. FEAT-044 / PLAN-055 已新增 `.aiworker/executor-capabilities.json` 与 `aiworker executor mcp add/sync/doctor`。
2. 当前 projection builder 会生成 `codex mcp add <name> --scope project --transport streamable-http --url ...`。
3. 本机 `codex-cli 0.125.0` 的 `codex mcp add --help` 只支持 `--url`、stdio command、`--env`、`--bearer-token-env-var` 等参数；不支持 `--scope`、`--transport`、`--header`。
4. 直接运行当前生成的 Codex command 会失败：`unexpected argument '--scope'`。
5. Claude Code projection 是否仍兼容需要单独探测，不能由 Codex 规则推断。

## 方案

把 projection command builder 从 “统一 MCP flags” 改成 per-engine adapter：

1. Codex adapter：
   - streamable HTTP：`codex mcp add <name> --url <url>`。
   - stdio：`codex mcp add <name> -- <command> ...args`。
   - env：只对 stdio server 输出 `--env KEY=VALUE`。
   - bearer token：如 manifest 需要支持，新增明确字段映射到 `--bearer-token-env-var <ENV_VAR>`，不把 secretRef 展开成明文。
   - 不输出 `--scope`、`--transport`、`--header`。
2. Claude Code adapter：
   - 重新探测当前 `claude mcp add --help`，按实际参数面生成命令。
   - 如无法稳定支持 project scope，fail clearly，不写私有 config。
3. `executor mcp sync --dry-run` 输出应与真实 CLI 参数一致；非 dry-run 测试用 fake binary 断言 argv。
4. `executor doctor` 对 engine 不支持的 descriptor 字段给出 error/warning，例如 Codex HTTP headers 暂不能投影。

## 范围

- `apps/cli/src/commands/worker/executor.ts` projection builder 与 validation。
- `packages/shared/src/executor-capabilities.ts` 只在确需表达 Codex bearer-token env var 时小幅扩展。
- CLI executor tests。
- `docs/cli.md` 中 Codex / Claude MCP projection 文档。

## 非范围

- 不手写 Codex 私有 config 文件。
- 不实现 secretRef hydration。
- 不新增 brain/runtime MCP 命令。
- 不改变 `.aiworker/mcp.json` 语义。

## 风险

1. Codex CLI 参数面可能继续变化；实现应通过 adapter 和 focused tests 降低漂移影响。
2. Header 类 HTTP MCP server 对 Codex CLI 可能没有等价投影能力；必须 fail clearly，而不是静默丢字段。
3. `secretRef` 与 env var name 的边界要清楚：manifest 可以引用 secret，但 sync 不能把明文写入 engine config。

## 验证

- `bun test apps/cli/src/commands/worker/executor.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- 本机 Codex CLI smoke：
  - `codex mcp add --help`
  - `aiworker executor mcp sync --engine codex --dry-run`
  - fake-binary non-dry-run argv test

## 交付标准

AIWorker 生成的 Codex MCP projection command 与当前 Codex CLI 兼容；不支持的 descriptor 字段会明确失败，不会生成看似可执行但实际必炸的 command。

## 完成记录

- 2026-05-03 13:44：`executor mcp sync` 改为 per-engine adapter。Codex 生成 `codex mcp add <name> --url <url>` 或 `codex mcp add <name> -- <command> ...args`，支持 `--bearer-token-env-var`，不再输出 `--scope` / `--transport` / 通用 `--header`。Claude Code projection 按当前 `claude mcp add` 参数面输出 `--scope project --transport ...`。
- Codex generic HTTP headers、SSE、HTTP env 等不支持组合会明确 fail；非 dry-run 仍拒绝 unresolved `secretRef`，不 hydrate 明文 secret。
- 验证：`codex --version` 为 `codex-cli 0.128.0`；`codex mcp add --help` 确认当前参数面；`bun test apps/cli/src/commands/worker/executor.test.ts` 覆盖 Codex dry-run、fake-binary apply argv、unsupported headers 与 secretRef apply 拒绝。
