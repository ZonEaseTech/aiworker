# FEAT-061 Host Soul App registry and mount runtime

- **status**: pending
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

- CLI/Web 能列出 installed/enabled/disabled/error 状态的 Soul Apps。
- Host 能从 manifest 注册 capabilities、workspace types、artifact types 和 UI slots。
- Worker 创建流程能选择来自 Soul App 的 Soul/capability。
- UI/API route 挂载必须带 app namespace，且不会覆盖 Host core route。
- 禁用某个 Soul App 后，新 worker/session 不再能使用其能力；已有 metadata 保留可审计状态。
- Host mounted 模式不要求 Host import vertical app 内部源码。

## 调查结论

- 当前 Worker Web 已有 Soul workbench renderer registry，但它是编译期模块结构，不是
  Host-level app registry。
- 当前 local daemon worker/session API 可以作为挂载后的统一 runtime 基础。
- 需要新增 app registry 层，避免后续每个 vertical Soul 都修改 Host 路由和导航主结构。

## 备注

本功能是 Host 侧完整挂载能力，不是某个 Soul 的阶段实现。
