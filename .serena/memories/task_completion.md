# Task Completion Checklist

完成代码任务前：
- 检查 `git status --short`，确认只改了任务相关文件，不回滚用户已有改动。
- 跑和改动范围匹配的聚焦验证；跨 package、发布、迁移、安全边界或公共协议改动再跑更宽 gate。
- 至少考虑：`bun run typecheck`、`bun run lint`、`bun run test`、`bun run build`、`bun run check` 中哪些与本次改动相关。
- 文档/配置单文件改动可按需只跑 `git diff --check`，但需要说明未跑更宽 gate 的原因。
- schema 改动必须通过 Drizzle schema/migration 流程，并验证 fleet/worker migration 没混用。
- 前端改动需要关注 fleet/worker 边界、设计 token、响应式和构建；必要时跑 `bun run --filter '@zonease/aiworker-web' build`。
- CLI/API/runtime 改动优先补聚焦测试；涉及发布产物时跑 CLI bundle 和必要 smoke。

交付给用户时：
- 默认中文总结。
- 说明改了什么、验证命令和结果；未运行的 gate 要说明原因。
- 如需 commit，commit message 用中文 Conventional Commit，例如 `fix: 修复 worker 启动生命周期`。
- 对生产写操作或高风险迁移，先给 dry-run/read-only 验证计划，等确认后再执行 commit/写入。