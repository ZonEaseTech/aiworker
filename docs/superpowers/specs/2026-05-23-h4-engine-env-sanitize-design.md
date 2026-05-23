# H4 engine env 最小透传整改设计

- 日期：2026-05-23
- 来源：`docs/superpowers/specs/2026-05-23-zero-trust-boundary-audit-design.md`（H4，高）
- 约束基线：ENGINE-001（Host 是 engine bridge，只准备 cwd/context/invocation 边界）、Isolation/Security

## 问题

Host 在三处把整个 `process.env` 无过滤注入外部 engine 子进程：

- `packages/core/src/worker/engine-bridge.ts:56-60`：`env: { ...process.env, ...(input.env ?? {}) }`
- `packages/core/src/worker/executor.ts:207-210`：`env: { ...process.env, ...(engine.env ?? {}) }`
- `packages/core/src/worker/executor.ts:335`：`env: options.env ?? process.env`

外部 engine 是半受信边界。整包 Host 环境包含 Host 内部控制凭据，最敏感的是：

- `AIWORKER_LOCAL_TOKEN`——本地 daemon API 的 bearer token；泄漏后 engine 可回调 Host API。
- `AIWORKER_MOUNT_TOKEN`——mounted surface 的签名 token。
- 以及 `AIWORKER_API_URL` 与一批 Host 操作路径（`WORKER_DB_PATH`/`WORKER_MIGRATIONS_FOLDER`/
  `WORKER_WORKSPACE_ROOT`/`AIWORKER_HOME`/`AIWORKER_SHIM_*`/`AIWORKER_BUN_*` 等）。

## 已核实事实

- Host 内部敏感/操作 env 全部落在 `AIWORKER_*`/`WORKER_*`/`OD_*` 命名空间内（全仓 env 枚举）。
- engine 真正需要的 env 都不在这些命名空间：`PATH`/`HOME`/`LANG`/proxy/`SSH_AUTH_SOCK` 以及 engine
  自己的 auth（`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY` 等，均非命名空间前缀）。
- engine 专属 env 由 executor 显式设置（如 `executor.ts:130` 的 `GEMINI_CLI_TRUST_WORKSPACE`），不依赖继承。
- `AIWORKER_CODEX_DISABLE_PLUGINS`/`AIWORKER_CODEX_IGNORE_USER_CONFIG`/`OD_CODEX_DISABLE_PLUGINS` 是 Host
  在 spawn 前自己读取来拼 codex 参数（`executor.ts:91-93`），codex 子进程本身不需要它们。

结论：**denylist 按命名空间剖除**——剥除 `AIWORKER_*`/`WORKER_*`/`OD_*`，其余全保留。低破坏（engine 保留
PATH/HOME/auth/proxy/locale）、未来新增 Host 变量自动拦截、直击实际泄漏点。

## 方案决策（用户确认）

- 策略：denylist 按命名空间前缀剖除，前缀集 `['AIWORKER_', 'WORKER_', 'OD_']`。
- engine 专属 env（`engine.env`/`input.env`）层叠在 sanitized env **之上**：若某 engine 确实需要某个
  命名空间变量，可经其显式 env 覆盖；denylist 只拦"继承来的" Host env。

## 改动单元

1. **新增** `packages/core/src/worker/engine-env.ts`：
   ```ts
   const HOST_INTERNAL_ENV_PREFIXES = ['AIWORKER_', 'WORKER_', 'OD_'] as const

   export function sanitizeEngineEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
     const result: NodeJS.ProcessEnv = {}
     for (const [key, value] of Object.entries(base)) {
       if (HOST_INTERNAL_ENV_PREFIXES.some(prefix => key.startsWith(prefix)))
         continue
       result[key] = value
     }
     return result
   }
   ```
2. **`engine-bridge.ts:56-60`**：`env: { ...sanitizeEngineEnv(), ...(input.env ?? {}) }`（import helper）。
3. **`executor.ts:207-210`**：`env: { ...sanitizeEngineEnv(), ...(engine.env ?? {}) }`。
4. **`executor.ts:335`**：`env: options.env ?? sanitizeEngineEnv()`。

## 测试

- 单测 `engine-env.test.ts`：`sanitizeEngineEnv` 输入含 `AIWORKER_LOCAL_TOKEN`/`AIWORKER_MOUNT_TOKEN`/
  `WORKER_DB_PATH`/`OD_CODEX_DISABLE_PLUGINS`/`PATH`/`HOME`/`ANTHROPIC_API_KEY` 的样本 env，断言：
  三个命名空间的 key 被剥除，`PATH`/`HOME`/`ANTHROPIC_API_KEY` 保留；不修改入参对象（纯函数）。
- 回归：现有 `executor.test.ts`/`engine-bridge` 相关测试仍绿；确认 engine 专属 env 覆盖路径未受影响
  （`input.env`/`engine.env` 仍能注入/覆盖）。
- 确认三处 spawn 站点不再出现裸 `...process.env`（grep）。

## 验证

- `bun run --filter '@zonease/aiworker-core' test`（含新单测与既有 executor 测试）。
- `bun run --filter '@zonease/aiworker-core' typecheck`。
- `bun run lint`（含边界守卫）。
- 人工/smoke：确认外部 engine 仍能正常 spawn（PATH/HOME/auth 保留），且子进程环境不含 `AIWORKER_LOCAL_TOKEN`。

## 非目标

- 不改 worker engine 的 `--dangerously-skip-permissions`（按既定决策，worker CLI engine 故意非交互）。
- 不动 bearer-auth provider 或 sandbox 层（独立关注点）。
- 不引入 allowlist（外部 CLI engine 需要的 env 难以穷举，会高破坏）。
- 不碰 H1/H2/H3 已完成项。
