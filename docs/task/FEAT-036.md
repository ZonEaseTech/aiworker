# FEAT-036 CLI `aiworker init` / `aiworker scope` 项目级初始化命令

- **status**: completed
- **priority**: P1
- **owner**: PLAN-023
- **createdAt**: 2026-04-27 18:30
- **claimedAt**: 2026-04-27 19:15
- **completedAt**: 2026-04-27 19:30
- **plan**: PLAN-023

## 描述

基于 REFACTOR-011 的 fs-layout 改造，把 CLI 命令升级为「项目级优先」：

1. **`aiworker init`** 默认行为变更：
   - 在 cwd 创建 `<cwd>/.aiworker/` project layout（调 `ensureProjectAiworker()`）。
   - 要求 cwd 是 git repo（向上找 `.git/`）。否则报错并指引 `aiworker init --global` 或 `--force`。
   - 自动写入 `.aiworker/local/.gitignore` 模板（`worker.db*`、`identity.json`、`.env`、`workspaces/` 等敏感产物全 ignore）。
   - 自动调 `bootstrapDotenv()` 在 `.aiworker/local/.env` mint master key（dotenv-bootstrap 已支持自定义 home，仅需 CLI 入口传 home）。
   - 仍然 `loadWorkerContext()` 跑 worker.db 初始化、mint identity，保持现有 idempotent 行为。
   - `--global` flag 走原 user 级路径（`~/.aiworker/`）。

2. **`aiworker scope`** 新命令（参 `git config --list --show-origin` 风格）：
   - 打印当前命中的 scope（`user` / `project` / `explicit`）+ home 路径。
   - 列出 layout 各文件路径与是否存在（worker.db / identity.json / SOUL.md / AGENT.md / mcp.json 等）。
   - 仅诊断用，无副作用。

3. **`aiworker run` / `aiworker serve`** 保持现状，但底层 fs-layout 自动按 scope 解析，无需 CLI flag。新增可选 `--aiworker-home <path>` 全局 flag 覆盖。

4. **`apps/cli/src/lib/dotenv-bootstrap.ts` 改造**：
   - 已有 `BootstrapOptions.home` 参数，本任务把 CLI 入口（apps/cli/src/index.ts）改为：先 `resolveAiworkerScope()` 拿 home，再传给 `bootstrapDotenv({ home })`。
   - master key 仍每 home 独立（project worker 与 user worker 永远不共享 key）。

5. **README + docs/cli.md 更新**：
   - quickstart 改为 `aiworker init`（默认 project）。
   - `--global` 用法。
   - scope 优先级表。

不在本任务范围：

- 跨 channel 的 dmScope（Phase B）
- bootstrap memory 注入（Phase C）
- skill / MCP per-worker 配置（Phase D）

## 进行时描述

实现 CLI 项目级 init/scope 命令

## 依赖

- **blocked by**: REFACTOR-011
- **blocks**: (后续 PLAN-024~027 默认基于 project layout)

## 笔记

风险：
- 既有 `aiworker init` 用户脚本预期 user 级行为，需要在 release notes 明确「default 由 user 转 project」。
- systemd unit 模板（`apps/cli/src/aim/commands/install.ts`）显式设 `AIWORKER_HOME=%h/.aiworker`，受 scope 优先级保护，不受影响。
- 在非 git repo 强制报错可能影响某些 ad-hoc 脚本，提供 `--global` 与 `--force` 双 escape hatch。

### 2026-04-27 19:30 完成

落地的代码：
- `apps/cli/src/lib/bootstrap.ts`：scope-aware bootstrap（先 `resolveAiworkerScope()` → `process.env.AIWORKER_HOME ??= scope.home` → `bootstrapDotenv({ home })`）
- `apps/cli/src/commands/init.ts`：三分支 `--global` / 已有 project / brand-new project，brand-new 路径 `delete AIWORKER_HOME / AIWORKER_MASTER_KEY / INTERNAL_SHARED_SECRET` 后 re-mint 到 project local，让 fs-layout 自动 project-detect（避免 explicit scope 误嵌 `local/workers/<id>/`）
- `apps/cli/src/commands/scope.ts`：新增诊断命令，box + layout file presence 列表
- `apps/cli/src/aiworker.ts`：`init` 加 `--global` `--force`，新注册 `scope`
- `apps/cli/src/aiworker.test.ts`：EXPECTED_COMMANDS 加 `scope`
- `docs/cli.md`：`aiworker init` 段落改写（双模式表 + project layout 描述 + .gitignore 策略）+ 新 `aiworker scope` 段落 + scope 优先级表
- `README.md`：Install 段加项目级 worker 一句话提示

E2E 验证（在 `/tmp/aiworker-smoke-A` 等清洁目录跑）：
- ✅ user-default scope（cwd 无 .aiworker/，无 AIWORKER_HOME）
- ✅ brand-new project init（git repo + 无 .aiworker/）→ 创建完整 project layout，project-local master key
- ✅ idempotent re-init（同 cwd 再跑）
- ✅ project mode 下 `aiworker scope` 正确显示 home / projectRoot / 文件存在性
- ✅ non-git repo `aiworker init` → 报错 + 三选项指引
- ✅ `aiworker init --global` → user-scope worker
- ✅ `aiworker init --force` → 非 git repo 也能 init
- ✅ project layout 物理结构干净（无 `local/workers/<id>/` 嵌套残留）

测试：
- `bun run --filter '@zonease/aiworker-cli' test` → 34/34 pass（含 scope 命令注册检查）
- `bun run check`（typecheck + lint）→ pass
