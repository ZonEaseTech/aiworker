# PLAN-067 `aiworker init` Soul prompt under legacy home collision

- **status**: completed
- **createdAt**: 2026-05-02 21:26
- **relatedTask**: BUG-048

## 现状

1. `aiworker init` 当前只在 brand-new project branch 中调用 `resolveRequiredProjectSoul`。
2. `resolveProjectRoot(cwd)` 把当前目录或祖先目录中的任意 `.aiworker/` 都视为 project root。
3. 旧 user-scope 默认目录也是 `~/.aiworker/`。当 operator 在 `$HOME` 下执行 `aiworker init`，已有 `~/.aiworker/` 会被 project detection 当成 `$HOME` project `.aiworker/`。
4. 进入 existing project branch 后，`--soul` 变成 optional；未传 `--soul` 时不会 prompt，也不会补 `SOUL.md` / `AGENT.md` 的 Soul 选择。

## 方案

### 1. 区分 legacy home 与 project scope

在 init/scope 的 project detection 入口增加判定：如果检测到的 project root 等于当前 user home，且 `.aiworker/` 缺少 project-scope 标记文件或 Soul material，则不要把它当作 project root。

候选判定信号：

- project-scope material：`.aiworker/SOUL.md`、`.aiworker/AGENT.md`、`.aiworker/capability-packs.json`。
- legacy/user-scope material：`.aiworker/worker.db`、`.aiworker/workers/`、`.aiworker/.env`。

MVP 可以在 `aiworker init` 内部处理，避免立刻改变所有 `resolveAiworkerScope()` 调用的全局语义；如果验证发现 `scope` 也误导，再同步 `fs-layout` 的 resolver。

### 2. 缺 Soul material 时 fail closed

对 existing project branch 增加缺失检查：

- 如果 `.aiworker/` 存在但缺少 `SOUL.md` / `AGENT.md`，interactive TTY 应提示选择 Soul 并只补缺失 project template。
- 非交互应返回 usage error，要求 `--soul <preset>`。
- 不覆盖已有 persona 文件；只通过 `ensureProjectAiworker` 的 seed-if-absent 语义补缺。

### 3. 保留显式 user-scope

继续保留：

- `aiworker init --global` 用于 user-scope。
- `AIWORKER_HOME=/path aiworker init` 用于 explicit scope。

这两条不进入 Soul prompt，因为它们不是 project-scope Soul 初始化。

## 范围

- `apps/cli/src/commands/worker/init.ts`
- `apps/cli/src/commands/worker/init.integration.test.ts`
- 可能涉及 `packages/fs-layout/src/index.ts` 和对应测试，视调查结果决定是否需要统一 resolver 行为。
- `docs/cli.md` / README 只在命令行为或 operator guidance 变化时更新。

## 非范围

- 不改变 `aiworker up` 的 stage 语义。
- 不迁移或删除现有 `~/.aiworker/` 内容。
- 不引入 legacy command alias。
- 不做 release publish；修复完成后再决定是否发 `0.5.1`。

## 风险

1. `~/.aiworker/` 同时可能被用户主动当作项目目录使用；修复需要避免把真实 `$HOME` project 误判为 legacy home。
2. 全局修改 `resolveProjectRoot` 会影响 serve/run/doctor/scope 等命令，MVP 可先在 init 内部收敛风险。
3. 自动补 `SOUL.md` / `AGENT.md` 必须保持不覆盖用户已有内容。

## 验证

- `bun test apps/cli/src/commands/worker/init.integration.test.ts`
- `bun test apps/cli/src/aiworker.test.ts`
- 如果修改 fs-layout：`bun test packages/fs-layout/src/index.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `git diff --check`

## 结果

1. `resolveProjectRoot()` now ignores `$HOME/.aiworker/` when it lacks project-scope Soul markers (`AGENT.md` and `SOUL.md`), so `aiworker scope` reports `user` for legacy home state.
2. Existing project init branches now require Soul selection when `.aiworker/AGENT.md` or `.aiworker/SOUL.md` is missing; non-interactive runs fail closed with `--soul <preset>` guidance.
3. Marked project roots, including `$HOME` when it has valid Soul material, remain project scope and re-init idempotently preserves existing files.
4. `--global` and `AIWORKER_HOME` remain explicit user/legacy-scope paths and do not trigger project Soul init.

## 验证结果

- `bun test packages/fs-layout/src/index.test.ts`
- `bun test apps/cli/src/commands/worker/init.integration.test.ts`
- `bun test apps/cli/src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-fs-layout' typecheck`
- Manual reproduction: legacy `$HOME/.aiworker/` now makes `init --dry-run` require `--soul`, and `scope` reports `user`.
- `git diff --check`

## 已确认

- 修复同步覆盖 `init` 和 `scope`，因为二者共享同一个 project detection 入口。
- 交互式 existing `.aiworker/` 缺 Soul material 时直接走 Soul prompt；非交互仍 fail closed。
