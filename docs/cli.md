# AIWorker CLI

AIWorker CLI 现在只服务本地 worker loop：

```text
pack -> work order -> run -> artifact -> review -> lesson
```

Fleet、gateway、case、brain、session、approval、schedule 命令树不再属于默认
CLI surface。

## 快速开始

```bash
aiworker init --soul developer
aiworker daemon start --open
aiworker run --message "Review this repository and produce a release-readiness brief"
aiworker runs list
aiworker artifacts list --run <runId>
aiworker review show <runId>
aiworker lessons promote <runId>
```

使用 `aiworker daemon status`、`aiworker daemon logs` 和
`aiworker daemon stop` 管理本地进程。

## 命令索引

```text
aiworker
  init
  daemon
    start
    status
    stop
    logs
    check
    inspect
    foreground
  run
  runs
    list
    show
    cancel
  artifacts
    list
    show
  review
    list
    show
    rerun
    promote
  lessons
    promote
  pack
    list
    show
  doctor
  executor
    doctor
    select
    capability list
    capability show
    mcp add
    mcp sync
  commands
```

## 说明

- `init` 写入 project-local worker state 和 pack material。
- `daemon start` 后台启动 worker HTTP/API/Web 进程。
- `run` 向 daemon 提交 work order；它不是第二条 executor 直连路径。
- 成功的 daemon run 会把最终 assistant 输出捕获为 `assistant-output` artifact，
  路径为 `.aiworker/local/artifacts/runs/<runId>/`。
- `artifacts` 展示 worker loop 产出或索引的文件 metadata。
- `review` 是 run 后的 evidence/risk/lesson surface。
- `lessons promote` 从已 review 的 lesson candidates 创建 durable-context
  proposals。它不把 executor-native memory 声称为 canonical AIWorker context。
- `executor *` 命令只描述 project overlay hints 与 readiness；executor-native
  MCP、skill、plugin、auth、sandbox、session 仍由外部 executor 自己拥有。

## 验证

CLI 改动通常需要运行：

```bash
bun run --filter '@zonease/aiworker-cli' test
bun run --filter '@zonease/aiworker-cli' typecheck
bun run --filter '@zonease/aiworker-cli' build:bundle
bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run
```

跨 package runtime 改动还应运行匹配的 API/Web/Core focused tests 和 `bun run check`。
