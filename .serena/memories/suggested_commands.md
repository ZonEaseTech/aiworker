# Suggested Commands

依赖与全量 gate：
- 安装依赖：`bun install`
- 常规验证：`bun run check`（typecheck + lint）
- 全量类型检查：`bun run typecheck`
- 全量 lint：`bun run lint`
- 全量测试：`bun run test`
- 构建发布产物：`bun run build`

聚焦 workspace：
- Core 测试：`bun run --filter '@zonease/aiworker-core' test`
- API 构建：`bun run --filter '@zonease/aiworker-api' build`
- Web 构建：`bun run --filter '@zonease/aiworker-web' build`
- CLI bundle：`bun run --filter '@zonease/aiworker-cli' build:bundle`
- Storage 测试：`bun run --filter '@zonease/aiworker-storage-sqlite' test`

数据库 schema：
- 生成全部 SQLite schema/migration：`bun run db:generate`
- 只生成 fleet migration：`bun run db:generate:fleet`
- 只生成 worker migration：`bun run db:generate:worker`

本地入口：
- Gateway 前台启动：`aiworker gateway start --port 9218`
- Worker 前台启动：`aiworker serve --port 9217 --gateway ws://127.0.0.1:9218/ws`
- Gateway 健康检查：`curl -fsS http://127.0.0.1:9218/health`
- Worker 健康检查：`curl -fsS http://127.0.0.1:9217/health`
- Systemd unit 渲染预览：`aiworker install systemd --dry-run`

常用 shell：
- 文件查找优先：`rg --files`
- 文本搜索优先：`rg -n '<pattern>' <path>`
- git 状态：`git status --short`
- 查看改动：`git diff -- <path>` / `git diff --check`

优先跑和改动范围匹配的聚焦命令；跨 package、发布、迁移、安全边界或公共协议改动再跑全量 gate。若 bun 不在 PATH，可用 `PATH="$HOME/.bun/bin:$PATH" <command>`。