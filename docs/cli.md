# AIWorker CLI

> 状态：`REFACTOR-026` 的 OD-style local worker loop 已进入默认路径；Brain、
> case、fleet、gateway 仍保留为 secondary/admin surface，不再是首屏 onboarding。

CLI 默认让本地 worker loop 一眼可见：

```text
init -> daemon start -> run -> inspect artifacts -> review -> promote lesson
```

Root help 必须回答两个问题：

1. 下一步能做什么？
2. 结果会出现在哪里？

## 产品规则

- CLI 默认服务 local worker。
- Fleet/gateway commands 是 deferred 或 secondary。
- `init` 结束时必须给出具体下一步。
- `run` 必须走 HTTP API 和 web 共享的同一套 run service。
- Command name 描述 operator intent，不暴露内部治理层。
- Executor-native capability 属于外部 executor；CLI 可以做 readiness check 和 bootstrap
  hint，但不是 executor capability source of truth。

## 默认命令树

```text
aiworker
  init
  daemon
    start
    stop
    restart
    status
    logs
    check
    inspect
  run
  runs
    list
    show
    cancel
  artifacts
    list
    show
  pack
    list
    show
  review
    list
    show
    promote
    rerun
  doctor
  executor
    doctor
    select
```

这是当前默认 operator path。`aiworker worker ...` 提供等价 canonical 入口，适合脚本
或文档强调角色边界。

## `aiworker init`

目标行为：

- 为当前 workspace 创建或更新 `.aiworker/` local worker state；
- 选择 worker pack，例如 `developer`、`hr-recruiting`、`project-manager`、
  `qa-reviewer`；
- 写入 daemon 与 executor config，secret 只能存 ref；
- 校验 pack 文件和基本 workspace access；
- 输出启动 daemon 和打开 web workbench 的下一步命令。

目标示例：

```bash
aiworker init --worker developer
```

期望输出形态：

```text
Workspace initialized.
Worker pack: developer
Next:
  aiworker daemon start --open
  aiworker run "Describe the work you want done"
```

## `aiworker daemon`

`daemon` 命令负责本地进程生命周期。

目标示例：

```bash
aiworker daemon start --open
aiworker daemon status
aiworker daemon logs --tail 100
aiworker daemon stop
```

daemon 提供：

- worker HTTP API；
- run SSE streams；
- worker web bundle；
- local metadata store；
- executor adapters。

长驻进程管理必须显式。开发流程可以按仓库规则使用 tmux，或使用 pidfile/logfile fallback。

## `aiworker run`

`run` 向 local daemon 提交 work order，不能实现第二条执行路径。

目标示例：

```bash
aiworker run "Review the current repo and produce a release-readiness brief"
aiworker run --pack hr-recruiting --template candidate-screen ./resumes/alex.md
aiworker run --workspace ../product "Draft a PM spec from the linked notes"
```

目标输出：

```text
Run created: run_...
Web: http://127.0.0.1:.../worker/runs/run_...
Events:
  run.created
  prompt.composed
  executor.started
```

完整 event stream 由 web 消费，也可通过 `aiworker runs events` 检查。

## Runs

目标命令：

```bash
aiworker runs list
aiworker runs show run_...
aiworker runs events run_...
aiworker runs cancel run_...
```

Run 是 CLI、HTTP API、web 共享的执行 contract。一个 run 可以包含 messages、executor
events、file changes、indexed artifacts、review state 和 lesson candidates。

## Artifacts

目标命令：

```bash
aiworker artifacts list --run run_...
aiworker artifacts show artifact_...
aiworker artifacts open artifact_...
```

Artifact 是 workspace 中的文件。CLI 可以显示 metadata、preview、open path，但生成的业务
deliverable 不应被隐藏进 SQLite。

## Packs

目标命令：

```bash
aiworker packs list
aiworker packs show developer
aiworker packs validate ./my-pack
aiworker packs install ./my-pack
```

Worker pack 定义领域表面：

- `SKILL.md`：worker capability 与 stance；
- domain-system files：业务约定和 rubrics；
- templates：可复用 work-order shapes；
- examples：期望 artifacts；
- review guidance。

CLI 可以校验文件结构和缺失引用，但不能硬编码 pack-specific workflows。

## Review And Lessons

目标命令：

```bash
aiworker review show run_...
aiworker review accept run_... --artifact artifact_...
aiworker review follow-up run_... --note "Needs manual verification"
aiworker review lesson run_... --from artifact_...

aiworker lessons list
aiworker lessons show lesson_...
aiworker lessons promote lesson_...
aiworker lessons reject lesson_... --reason "Too narrow"
```

Review 是 run 后决策。Lesson promotion 必须指回 run、artifact、message 或 operator
显式输入。

## Readiness Checks

目标命令：

```bash
aiworker check
aiworker doctor
```

Checks 应报告：

- workspace state；
- selected worker pack 与 domain system；
- daemon reachability；
- local database reachability；
- executor adapter readiness；
- missing bootstrap hints；
- secret-reference hydration status，但不能打印 secret。

Executor-native auth 和 capability 仍由 executor runtime 拥有。

## Legacy Surfaces

这些表面仍存在，但属于 secondary/admin：

- Brain governance commands；
- case-first commands；
- fleet/gateway commands；
- enrollment 与 remote worker commands。

它们不应出现在 primary onboarding path。后续如与 local worker model 冲突，应移动到
明确的 secondary/admin namespace，或在 1.0 前破坏性删除。

## CLI Slice 验证

CLI 变更通常需要验证：

- focused parser/command tests；
- root help 与 command help snapshots；
- `bun run --filter '@zonease/aiworker-cli' build:bundle`；
- 当 lifecycle 或 run path 变化时，增加 source-local daemon start + run submission smoke。

文档-only CLI 更新可以只跑 `git diff --check`。
