# PLAN-062 CLI IA canonical worker/fleet/gateway command tree

- **status**: completed
- **createdAt**: 2026-05-02 11:24
- **approvedAt**: 2026-05-02 11:24
- **completedAt**: 2026-05-02 14:07
- **relatedTask**: REFACTOR-015

## 现状

1. `apps/cli/src/aiworker.ts` 直接注册所有命令，命令树混合了本地 worker、远端 worker、fleet、gateway 和 install。
2. 本地 worker 命令使用 dash-form：`config-show`、`config-set`、`schedule-list`、`approvals-list` 等。
3. 远端 operator 命令有一部分挂在 root：`pair`、`chat`、`logs`、`config get/set`、`enroll approve` 等。
4. `docs/architecture.md` 和 `docs/cli.md` 仍把命令树描述为 worker-local dash-form + operator-remote two-word form。
5. 用户已明确 1.0.0 前不考虑 legacy 兼容，不需要旧命令 alias 或 shim。

## 方案

### 1. 命令语义

- 裸 `aiworker <cmd>`：当前本地 worker 快捷入口。
- `aiworker worker ...`：当前本地 worker canonical 分组。
- `aiworker fleet ...`：fleet 控制面、远端 worker 操作、pair、OTP enrollment。
- `aiworker gateway ...`：gateway 进程生命周期和 gateway systemd install。

### 2. 本地 worker 命令

Canonical：

```bash
aiworker worker init
aiworker worker scope
aiworker worker doctor
aiworker worker serve
aiworker worker run
aiworker worker config show
aiworker worker config set <json>
aiworker worker token rotate
aiworker worker approvals list
aiworker worker approvals grant <taskId> <toolCallId>
aiworker worker schedule list
aiworker worker schedule add
aiworker worker schedule remove <jobId>
aiworker worker sessions list
aiworker worker sessions show <sessionKey>
aiworker worker sessions maintenance
aiworker worker soul list
aiworker worker soul show <preset>
aiworker worker executor mcp add <name>
aiworker worker executor mcp sync
aiworker worker executor doctor
```

Root shortcuts retained because root means local worker:

```bash
aiworker init
aiworker scope
aiworker doctor
aiworker serve
aiworker run
aiworker config show
aiworker config set <json>
aiworker token rotate
aiworker approvals list
aiworker approvals grant <taskId> <toolCallId>
aiworker schedule list
aiworker schedule add
aiworker schedule remove <jobId>
aiworker sessions list
aiworker sessions show <sessionKey>
aiworker sessions maintenance
aiworker soul list
aiworker soul show <preset>
aiworker executor mcp add <name>
aiworker executor mcp sync
aiworker executor doctor
```

### 3. Fleet commands

```bash
aiworker fleet list
aiworker fleet info <workerId>
aiworker fleet launch
aiworker fleet stop <workerId>
aiworker fleet remove <workerId>
aiworker fleet pair --worker-url <url> --bootstrap-token <token>
aiworker fleet enroll list
aiworker fleet enroll approve <otp>
aiworker fleet enroll reject <otp>
aiworker fleet chat <workerId> <text>
aiworker fleet logs <workerId>
aiworker fleet config get <workerId>
aiworker fleet config set <workerId> <json>
aiworker fleet token rotate <workerId>
aiworker fleet approvals list
aiworker fleet approvals grant <workerId> <taskId> <toolCallId>
aiworker fleet schedule list <workerId>
aiworker fleet schedule add <workerId>
aiworker fleet schedule remove <workerId> <jobId>
```

### 4. Gateway commands

```bash
aiworker gateway start
aiworker gateway status
aiworker gateway stop
aiworker gateway install systemd
```

### 5. 代码归属

- `apps/cli/src/commands/worker/`：本地 worker 命令实现。
- `apps/cli/src/commands/fleet/`：operator-to-gateway / remote worker 命令实现。
- `apps/cli/src/commands/gateway/`：gateway lifecycle / install 实现。
- `apps/cli/src/aiworker.ts` 只负责注册命令和启动流程。

## 范围

- 改 CLI command registration、help grouping、argv folding 和 numeric option validation。
- 移动 CLI command implementation files 到 worker/fleet/gateway 目录。
- 更新 active docs：`AGENTS.md`、`docs/cli.md`、`docs/architecture.md`、README、`docs/gateway.md` 和 changelog。
- 更新 CLI tests 与 operator command docstrings。

## 非范围

- 不实现 `aiworker up`。
- 不实现 executor auto detection。
- 不改 gateway protocol method names。
- 不做旧命令 alias、compat shim 或 migration layer。

## 风险

1. 多词命令深度从 2 增加到 4，需要确保 `preprocessArgv` 长前缀优先仍覆盖 `worker executor mcp add` 等命令。
2. 文档里历史 plan/task 会保留旧命令，不能机械全仓替换历史记录；只更新当前权威 docs 和当前代码注释。
3. CLI tests 依赖 command count 和 help grouping，需要同步完整命令列表，避免漏注册。

## 验证

- `bun test apps/cli/src/aiworker.test.ts`
- `bun test apps/cli/src/commands/worker/run.test.ts apps/cli/src/commands/worker/sessions.test.ts apps/cli/src/commands/worker/doctor.test.ts apps/cli/src/commands/worker/executor.test.ts apps/cli/src/commands/fleet/common.test.ts apps/cli/src/commands/fleet/pair.test.ts apps/cli/src/commands/fleet/enroll.test.ts apps/cli/src/commands/gateway/install.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' test:stress`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bunx eslint apps/cli/src/aiworker.ts apps/cli/src/help.ts apps/cli/src/lib/bootstrap.ts apps/cli/src/commands/worker apps/cli/src/commands/fleet apps/cli/src/commands/gateway`
- `git diff --check`
