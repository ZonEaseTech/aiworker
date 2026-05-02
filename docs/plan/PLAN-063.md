# PLAN-063 Worker quick start `aiworker up`

- **status**: completed
- **createdAt**: 2026-05-02
- **approvedAt**: 2026-05-02 19:09
- **completedAt**: 2026-05-02 19:19
- **relatedTask**: FEAT-045

## 现状

1. CLI IA 已收敛为 root worker shortcut、`worker`、`fleet`、`gateway` 四类入口；`PLAN-062` 明确 `aiworker up` 尚未实现。
2. `aiworker init` 已能做 project-scope 初始化、Soul 选择、capability draft 落盘和下一步提示，但用户仍要手动串 `doctor`、executor 检查、dry-run 和 `serve`。
3. `aiworker serve` 已支持 worker admin URL 提示、`--open` / `--no-open`、gateway 连接、自注册/OTP 和 foreground 生命周期。
4. `aiworker executor doctor` 与 `executor mcp sync --dry-run` 已能检查 executor capability manifest 和 engine CLI availability。

## 方案

### 1. 命令语义

- `aiworker up` 等价于 `aiworker worker up`，表示“把当前本地 worker 拉起来”。
- `aiworker worker up` 是 canonical worker command。
- 不设计 `fleet up` / `gateway up`；fleet/gateway 的生命周期继续由各自命令显式表达。

### 2. 执行阶段

`up` 按固定阶段执行，并在输出里标清每一步：

1. Resolve scope：识别 project / explicit / user scope。
2. Init if needed：如果当前 cwd 没有 `.aiworker/`，调用 `runInit` 的 project 初始化逻辑；非交互 brand-new project 沿用 `--soul <preset>` 必填规则。
3. Worker validation：对 project capability drafts 跑静态验证；严重错误阻断启动，warning 只提示。
4. Executor readiness：检查 executor manifest 和可用 engine CLI；只报告缺失/下一步，不在本阶段自动写 engine config。
5. Serve：复用 `runServe` 启动 worker HTTP/admin，并透传已有 serve 参数。

### 3. 参数设计

```bash
aiworker up [--soul <preset>] [--dry-run]
            [--port <n>] [--host <host>]
            [--gateway <url>] [--gateway-token <token>]
            [--no-reconnect] [--no-serve-web]
            [--open] [--no-open]
```

- `--soul <preset>`：只在 brand-new project init 时使用；已初始化项目下仅用于显式刷新 Soul 模板时才传给 `init`。
- `--dry-run`：打印计划，不初始化、不启动、不打开浏览器。
- 其他参数完全复用 `serve`，避免 `up` 重新实现 server 行为。

### 4. 代码落位

- 新增 `apps/cli/src/commands/worker/up.ts`，只做 orchestration。
- 在 `apps/cli/src/aiworker.ts` 注册 root `up` 和 `worker up`。
- `apps/cli/src/lib/bootstrap.ts` 将 `up` 视为自管 bootstrap 命令，避免 brand-new project 先落到 user-scope fallback。
- help 示例从 `aiworker init --soul developer -> aiworker serve` 收敛为 `aiworker up --soul developer`，同时保留显式 worker tree 示例。

## 范围

- 实现 `aiworker up` / `aiworker worker up`。
- 复用现有 init、doctor、executor doctor、serve 的实现和安全边界。
- 更新 CLI help、README / `docs/cli.md` 中的快速启动描述。
- 增加聚焦测试覆盖 command registration、bootstrap opt-out、dry-run、brand-new project、已初始化 project 和 serve 参数透传。

## 非范围

- 不实现 `fleet up` 或 `gateway up`。
- 不做旧命令 alias、legacy shim 或迁移层。
- 不自动选择 executor engine，不自动写 Codex / Claude Code / Cursor 等 engine project config。
- 不改变 brain capability、executor capability、worker.db、fleet.db 的持久化边界。
- 不做 release publish。

## 风险

1. `up` 会串联初始化和长驻 `serve`，测试必须隔离端口、HOME、AIWORKER_HOME，并确保子进程退出清理。
2. `bootstrapCliDotenv` 如果在 brand-new project 前提前执行，会误创建 user-scope 状态；实现时必须先给 `up` opt-out。
3. executor readiness 只应提示，不应把缺少某个 engine CLI 当成全部 worker 启动失败，否则会破坏“用彼时环境 engine”的便携体验。
4. `--open` 有浏览器副作用，dry-run 和自动化测试必须默认禁用。

## 验证

- `bun test apps/cli/src/aiworker.test.ts`
- `bun test apps/cli/src/lib/bootstrap.test.ts apps/cli/src/commands/worker/up.test.ts`
- `bun test apps/cli/src/commands/worker/up.integration.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `git diff --check`

## 实现取舍

- `up` 的 executor readiness 缺失只做 warning，不在本切片提供 `--strict-executor`。
- 已初始化项目传 `--soul` 不刷新 Soul 模板；MVP 只在 brand-new project 消费 `--soul`。

## 结果

- 已实现 `aiworker up` / `aiworker worker up`，root shortcut 与 worker canonical tree 等价；未新增 `fleet up` / `gateway up`。
- `up` 编排 scope、init、project capability validation、executor readiness 和 `serve`，并透传既有 serve 参数。
- `up --dry-run` 不写 `.aiworker/`、不启动 HTTP server、不打开浏览器。
- executor readiness 当前保持 non-blocking；缺 engine CLI 只提示，严格诊断继续由 `aiworker executor doctor` 承担。
- MVP 下 `--soul` 只在 brand-new project 消费；已初始化 project / explicit scope 传入会返回用法错误，避免误刷新模板。
