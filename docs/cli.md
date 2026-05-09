# AIWorker CLI

AIWorker CLI 现在只服务 greenfield local workspace loop：

```text
workspace -> brief -> run -> files/artifacts -> review -> lessons
```

默认命令不再承载旧本地 worker 管理面。远程聚合、gateway、历史会话、定时、审批、
可见治理后台都不属于当前 local deliverable。

## 快速开始

```bash
aiworker init --name "Developer Workspace" --root .
aiworker daemon start --port 8787
aiworker brief create --title "Release readiness" --body "Review this repository and produce a release-readiness brief"
aiworker run start --brief <briefId>
aiworker artifacts list
aiworker review create --run <runId> --artifact <artifactId> --verdict pass
aiworker lessons propose --review <reviewId> --statement "Keep release evidence attached to workspace files"
aiworker lessons accept <lessonId>
```

使用 `aiworker daemon status`、`aiworker daemon logs`、`aiworker daemon check`
和 `aiworker daemon stop` 管理本地进程。

## 命令索引

```text
aiworker init
aiworker daemon start|foreground|status|stop|logs|check
aiworker brief create|list|show
aiworker run start|list|show|cancel
aiworker files list|show|write|delete|search
aiworker artifacts list|show|open
aiworker review list|show|create
aiworker lessons list|propose|accept|reject
aiworker settings list
aiworker executor select|doctor
aiworker open
aiworker commands
```

## 说明

- `init` 创建 local workspace metadata 和 `worker.db`。
- `daemon start` 后台启动 local HTTP API；`daemon foreground` 用于调试。
- `brief create` 记录 operator intent；`run start` 从 brief 或 direct prompt 创建一次 executor run。
- 成功 run 会把输出写成 workspace 文件，并登记 artifact metadata。
- `files` 读写 workspace 内文件；路径必须留在 workspace root 下。
- `review` 是产物之后的复盘面。
- `lessons` 处理可复用经验，accepted lesson 进入 durable local context。
- `executor select/doctor` 只保存和检查薄 adapter hint，不拥有 executor 原生能力。

## 验证

CLI 改动通常需要运行：

```bash
bun run --filter '@zonease/aiworker-cli' test
bun run --filter '@zonease/aiworker-cli' typecheck
bun run --filter '@zonease/aiworker-cli' build:bundle
```

跨 package runtime 改动还应运行匹配的 API/Web/Core focused tests、source-local smoke
和 `bun run check`。
