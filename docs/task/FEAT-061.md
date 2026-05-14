# FEAT-061 Host Soul App registry and mount runtime

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-12 21:00
- **plan**: PLAN-285
- **relatesTo**: FEAT-060, apps/api, apps/cli, apps/web, packages/core, packages/storage-sqlite, packages/shared

## 背景

定义 Soul App protocol 后，AIWorker Host 需要一个真实的 registry 和 mount runtime，
让 operator 能安装、启用、禁用、升级并使用各种 Soul App。Host 仍然拥有 local daemon、
workspace/session/turn runtime、engine broker、artifact/review/memory service 和
connector broker；Soul App 贡献垂直能力，但不能侵入 Host 内部实现。

## 目标

实现 Host 侧 Soul App registry 与 mount runtime，使 `aiworker-host` 可以接纳
`aiworker-hr`、`aiworker-qa` 等 app，并把它们挂到统一 Web Shell、API、CLI 和
worker/workspace/session 流程中。

具体目标：

1. Host 能发现并注册本地 Soul App manifest。
2. Host 能持久化 app 安装、启用、禁用、版本和健康状态。
3. Host 能把 app capabilities 映射成 Soul worker 可用能力。
4. Host 能挂载 app UI route/panel/artifact preview/review panel。
5. Host 能把 app API route 置于 scoped namespace 下。
6. Host 保持 runtime 主权：engine、connector、artifact、review、memory 仍由 Host broker 统一控制。

## 非目标

- 不实现 Soul App standalone runtime。
- 不做远程 marketplace 或自动下载。
- 不允许 Soul App 绕过 Host broker 直接访问 secret、engine 或 Host DB。
- 不把 HR/QA 业务逻辑写进 Host 分支。

## 验收标准

- [x] CLI/Web 能列出 installed/enabled/disabled/error 状态的 Soul Apps。
- [x] Host 能从 manifest 注册 capabilities、workspace types、artifact types 和 UI slots。
- [x] Worker 创建流程能选择来自 Soul App 的 Soul/capability。
- [x] UI/API route 挂载必须带 app namespace，且不会覆盖 Host core route。
- [x] 禁用某个 Soul App 后，新 worker/session 不再能使用其能力；已有 metadata 保留可审计状态。
- [x] Host mounted 模式不要求 Host import vertical app 内部源码。

## 调查结论

- 当前 Worker Web 已有 Soul workbench renderer registry，但它是编译期模块结构，不是
  Host-level app registry。
- 当前 local daemon worker/session API 可以作为挂载后的统一 runtime 基础。
- 需要新增 app registry 层，避免后续每个 vertical Soul 都修改 Host 路由和导航主结构。
- FEAT-060 已提供 `soul-app/v1` manifest schema、validation helper 和 HR/QA
  reference manifest fixtures；PLAN-285 应消费这些静态 manifest，不重新定义协议。
- 当前 Host catalog 直接读取 `BUILTIN_VERTICAL_SOULS` 和
  `BUILTIN_CAPABILITY_TEMPLATES`，需要增加 enabled Soul App 的 projected Soul /
  capability catalog，但不能执行 Soul App 内部代码。

## 备注

PLAN-285 已实现 Host 侧 registry、manifest 静态挂载发现和生命周期面；外部 Soul App
UI/API handler 执行、standalone SDK、隔离 broker、HR/QA 抽取和开发者脚手架仍分别
留给 PLAN-286..289。

## 完成记录

- 2026-05-12 22:47: 完成 Host Soul App registry 持久化、manifest install /
  enable / disable / healthcheck、enabled app catalog projection、CLI/API/Web
  生命周期入口和 worker/session capability 使用路径。
- API namespace 只保留 `/api/local/apps/:appId/*` scoped boundary；PLAN-285
  不执行外部 Soul App API handler，启用后访问贡献 API 会返回保留命名空间错误。
- 禁用 app 后不删除既有 metadata；新模板发现和新 session 使用会被阻断。

## 验证

- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-storage-sqlite' typecheck`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-storage-sqlite' test`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:build`
- `bun run crg:review`
