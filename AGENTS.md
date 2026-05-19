# AIWorker Agent Guide

AIWorker 当前目标是 **local-first vertical Soul App host**。Host 提供本地 daemon、安装启用、
鉴权安全、平台设置、能力 broker、统一 shell 与协议定位；Soul App 提供可独立部署的垂直产品，
并拥有领域状态、领域语义、artifact/profile/review/lesson 的解释权。

默认产品路径：

```text
Host -> install/enable Soul App -> Soul worker -> workspace -> session
  -> Soul App exposed views/actions -> business artifact/profile/review/lesson
```

不要把默认体验拉回 developer-only work order、admin dashboard、远程控制面、治理内核或通用
agent runtime 平台。

## 必读入口

- `docs/architecture.md`：当前唯一架构合同；`Constraint Registry` 是 Host / Soul App /
  protocol / data / broker / documentation 硬约束源头。
- `.agents/skills/aiworker-host-dev/SKILL.md`：修改 Host platform、local daemon/API、
  Worker Web Shell、CLI lifecycle、broker、auth/security、shared protocol 或 storage schema
  前必须读取。
- `.agents/skills/aiworker-soul-app-dev/SKILL.md`：修改 Soul App、manifest、standalone、
  Host mounted、capability、artifact/review 或 authoring 文档前必须读取。

不要把历史外部产品映射、旧 gateway/fleet/control-plane、旧治理入口或旧重启计划当作当前实现
约束。当前规范入口只有本文件和 `docs/architecture.md`；PMA、changelog、Superpowers spec/plan
都是审计轨迹，不能覆盖 `docs/architecture.md#constraint-registry`。

## 按任务读取

- CLI 行为或命令文档：`docs/cli.md`。
- 本地 daemon、打包或 operator 运行路径：`docs/deployment.md`。
- 外部 engine 安装、登录和 readiness：`docs/executor-engines.md`。
- Host platform、daemon API、registry、broker、security、storage schema：
  `docs/architecture.md` 和 `aiworker-host-dev` skill。
- Host Web Shell、Settings、workbench：`docs/architecture.md`、`aiworker-host-dev` skill，
  非平凡前端改动再读取 `/pma-web`。
- CLI lifecycle、daemon/app/worker/workspace/session 命令：`docs/cli.md` 和
  `aiworker-host-dev` skill。
- Soul App authoring：`docs/soul-app-developer.md` 和 `aiworker-soul-app-dev` skill。
- 历史 PMA、changelog、Superpowers spec/plan 只作为审计轨迹；不能覆盖当前架构合同。

## 工作方式

- 默认用中文与用户交流；文档、代码注释、commit message、PR title/description 也默认中文。
- 非平凡开发任务遵循 PMA：先调查，再 proposal，获批后实现，并同步 `docs/task/*.md` 与
  `docs/plan/*.md`；后端参考 `/pma-bun`，前端参考 `/pma-web`，代码评审参考 `/pma-cr`。
- 保持改动收敛，优先修当前路径；不要为未要求的旧入口、别名、shim 或兼容层扩范围。
- 1.0.0 前允许破坏性收敛；判断标准是当前架构语义、代码归属和用户可理解的产品路径。
- 不创建非必要说明文件；临时产物放 `tmp/`。
- 修改代码文件后，最终回复前介入 code-review-graph 做变更审查；仅改文档、注释、纯格式或
  用户明确要求跳过时可以跳过，并说明原因。

## 当前实现地图

- `apps/cli`：`aiworker` CLI，本地 daemon lifecycle、Soul App install/enable、worker/workspace/
  session 命令入口。
- `apps/api`：local daemon API 与 Worker Web 静态托管。
- `apps/web`：Host Web Shell 与 worker/workspace/session workbench。
- `apps/aiworker-hr`、`apps/aiworker-qa`：官方维护的参考 Soul App；它们必须通过 install/enable
  进入 Host，不得被 Host 内置。
- `packages/core`：local runtime、Host services、engine adapter 与 protocol 消费侧。
- `packages/shared`：共享 schema、Host/Soul App protocol 类型与工具。
- `packages/soul-app-sdk`：Soul App authoring 的公开 SDK。
- `packages/soul-app-runtime`：standalone 与 Host mounted runtime harness。
- `packages/component`：共享 UI primitives / patterns。
- `packages/storage-sqlite`：Host metadata schema 与 migration；真实业务产物属于 app/workspace
  命名空间，DB 只存平台 metadata、引用或协议 descriptor。
- `packages/fs-layout`：`AIWORKER_HOME`、worker home、workspace 与 `.aiworker/` 布局。

## 产品与实现边界

硬约束以 `docs/architecture.md#constraint-registry` 为准；本段只是 agent 执行时的速查路由。

- Host 是平台定位与能力壳，不是领域数据解释者。
- Soul App 是领域主权方，拥有 profile 组合、artifact schema/content、review rubric、
  lesson/memory 语义和 standalone 体验。
- Host 只能消费 Soul App 通过 manifest/protocol/grant 暴露的 view、action、status、descriptor、
  search、review summary、memory summary 或 audit event。
- 如果 Soul App 不暴露某个 surface，Host 不取、不猜、不补。
- Workspace/project 是业务作用域，不等同于软件仓库；HR 可以是岗位或候选人池，QA 可以是
  release 或 test suite，DevOps 可以是 service、incident 或 runbook。
- 外部 engine 负责自己的 tool loop、模型、sandbox、approval、auth/profile、native session
  和插件生态；AIWorker 只在 session 层准备 cwd/context、调用或观察 engine。
- Developer Soul 只是 supporting role，用于 code review、release evidence、repo report、
  handoff、risk audit 等；不要让 repo/PMA/coding loop 成为产品中心。

## 数据与 API 规则

- `worker.db` 存 Host metadata：installed apps、workers、workspaces、sessions、engine
  invocations、protocol cache、grants、platform files/descriptors、Host audit，以及可选的通用
  review/lesson ledger。
- 真实业务文件和 artifact 留在 Soul App 的 workspace 文件夹或对象存储命名空间；DB 只存引用、
  hash、status、source、owner app id 或 protocol descriptor。
- Host 不合成 HR profile，不解释 QA release verdict，不把 Soul App 记忆提升规则硬编码进平台。
- API 文档以代码为准：OpenAPIHono `app.doc('/openapi.json')` + `/docs`。
- 新增或修改 API 时同步 zod schema、OpenAPI metadata、typed client/proto 和相关测试。
- Schema 变更通过 `packages/storage-sqlite` 的 Drizzle schema 与 migration 生成，不手写应用层绕过。
- Secret 只能放 `.env` 或 vault/ref；不要写入 engine config、manifest、`.aiworker/*.json`、
  DB metadata、日志、prompt、review rubric 或 skill 文件。

## UI 规则

- Worker Web 应是 Soul worker / workspace / session / artifact/profile 工作台，不是设置页、
  日志页或治理概念陈列。
- Host 拥有当前 shell layout 与 full-width Host header；header action 是 Host 固化平台 action，
  不再下放给 Soul App 作为 slot 配置。
- Soul App 仍可通过 manifest/protocol 暴露 app-owned `ui.workbench` actions/search/settings 与
  `ui.workspaceContext`，例如让未来 Host-owned web terminal 知道 workspace context；Host
  只能按 descriptor 调用或定位，不解释领域语义。
- Standalone 模式下 Soul App 拥有自己的完整 shell；Host mounted 模式下 Soul App 适配 Host 壳。
- 新增或修改 Host Web / Soul App UI 时必须优先从 `packages/component` 查找 primitives、
  patterns、layout 与 package-owned styles。新增 app-local UI 组件或 CSS 前必须说明缺口：
  组件库尚无对应 primitive/pattern、该 UI 确实是 Soul App 领域语义，或属于临时迁移步骤。
  可复用缺口必须补进 `packages/component` 或登记到组件 catalog 的 migration queue；不要默认
  在 app 内手搓样式。
- 非平凡 UI proposal 必须包含 `Component Library Preflight`：列出已检查的
  `packages/component` primitive/pattern、说明为什么不能直接复用、以及是否需要补组件库或登记
  `componentMigrationQueue`。若新增或修改 app-local CSS/组件，最终验证必须跑 `bun run ui:check`。
- 交互组件使用成熟 headless UI；不要手写 focus trap、scroll lock、ARIA 或键盘导航。
- 视觉值来自根目录 `DESIGN.md`，通过 Tailwind CSS v4 `@theme` 接入；不要新增 hex 字面量或
  arbitrary value。
- 文案用用户能理解的业务对象：Soul App、Soul worker、workspace、session、artifact、profile、
  review、lesson。仅在开发者/诊断界面暴露 invocation、engine、broker 等底层词汇。

## 常用命令

- 安装依赖：`bun install`
- 类型检查：`bun run typecheck`
- Lint：`bun run lint`
- 测试：`bun run test`
- 常规 gate：`bun run check`
- UI 组件治理检查：`bun run ui:check`
- 构建：`bun run build`
- Web 构建：`bun run --filter '@zonease/aiworker-web' build`
- API 构建：`bun run --filter '@zonease/aiworker-api' build`
- CLI bundle：`bun run --filter '@zonease/aiworker-cli' build:bundle`
- Worker DB schema：`bun run db:generate:worker`
- code-review-graph：`bun run crg:status` / `bun run crg:update` / `bun run crg:review`

优先跑与改动范围匹配的聚焦命令；跨 package、发布、迁移、安全或公共 API 改动再跑全量 gate。

## Shell、Git 与验证

- 命令默认用 `bash`。
- 长驻进程优先放 tmux，session name 用 `{basename}-{hash}`；没有 tmux 时用 `setsid`/`nohup`
  + 明确 pidfile/logfile，并在完成后清理。
- 禁止 `kill $(lsof -ti:PORT)`；如需按端口处理，只匹配监听进程，例如
  `lsof -tiTCP:PORT -sTCP:LISTEN`。
- Commit message / PR title / PR description 使用中文；Conventional Commit type 保持英文，例如
  `feat:`、`fix:`、`refactor:`、`docs:`、`chore:`、`test:`、`ops:`。
- 提交前说明已运行的验证命令和结果；未能运行的 gate 要说明原因。
- 简单文件查找优先 `rg` / `rg --files`。
- 单文件文档/配置改动直接读写即可，不需要强行使用 MCP 或 code-review-graph。
