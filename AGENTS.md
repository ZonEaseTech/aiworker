# AIWorker Agent Guide

AIWorker 当前目标是 **Local Shell + Engine Bridge for Soul Apps**。Host 只保留
start / shell / locate / mount / bridge：启动 Soul App、提供本地 Web/CLI/daemon 壳、定位
worker/workspace/session、挂载 app-owned UI/API，并为 session 准备 cwd/context/engine 调用入口。

默认产品路径：

```text
AIWorker -> Soul App -> workspace -> session -> app-owned work
```

第一原则：Host 是 shell / locator / mount / bridge，不是 Soul App 的上层配置中心。
Host-owned Worker Configuration 的 trigger、dialog shell 和配置边界只到 **Soul worker**；
同一 Soul App 下不同 worker 必须彼此隔离。workspace/session 只可作为不透明 locator/context
传给 mounted Soul surface 或 engine bridge，不能成为 Host 配置层。Soul 如需让 Host 知道
可选项，只能通过 manifest/protocol descriptor 告知；Host 泛化消费 descriptor，不解释、不保存
领域配置字段，不允许 Soul 向 Host left panel、header、toolbar 或 Worker Configuration slot 注册
自定义 UI。

不要把默认体验拉回 developer-only work order、admin dashboard、远程控制面、治理内核、通用
agent runtime 平台，或 Host-owned proposal/broker/review/audit/governance/admission 流程。

## 必读入口

- `docs/architecture.md`：当前唯一架构合同；`Constraint Registry` 是 Host / Soul App /
  protocol / data / engine / UI / documentation 硬约束源头。
- `.agents/skills/aiworker-host-dev/SKILL.md`：修改 Host platform、local daemon/API、
  Worker Web Shell、CLI lifecycle、thin local adapter、shared protocol 或 storage schema
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
- Host platform、daemon API、registry、local enablement、thin adapter、storage schema：
  `docs/architecture.md` 和 `aiworker-host-dev` skill。
- Host Web Shell、Settings、Worker Configuration、workbench mount：`docs/architecture.md`、`aiworker-host-dev` skill，
  非平凡前端改动再读取 `/pma-web`；shadcn/ui 相关改动再读取 `.agents/skills/shadcn/SKILL.md`。
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
- `apps/web`：Host Web Shell、worker-scoped Worker Configuration、locator chrome 与 mounted surface container。
- `apps/aiworker-hr`、`apps/aiworker-qa`：官方维护的参考 Soul App；它们必须通过 install/enable
  进入 Host，不得被 Host 内置。
- `packages/core`：local runtime、Host services、engine adapter 与 protocol 消费侧。
- `packages/shared`：共享 schema、Host/Soul App protocol 类型与工具。
- `packages/soul-app-sdk`：Soul App authoring 的公开 SDK。
- `packages/soul-app-runtime`：standalone 与 Host mounted runtime harness。
- `packages/ui`：shadcn-managed shared UI primitives、theme variables、CLI-owned component output；
  Host Web 与官方 Soul App web 的唯一共享 UI 来源。
- `packages/storage-sqlite`：Host metadata schema 与 migration；真实业务产物属于 app/workspace
  命名空间，DB 只存平台 metadata、引用或协议 descriptor。
- `packages/fs-layout`：`AIWORKER_HOME`、worker home、workspace 与 `.aiworker/` 布局。

## 产品与实现边界

硬约束以 `docs/architecture.md#constraint-registry` 为准；本段只是 agent 执行时的速查路由。

- Host 是本地运行壳和 engine bridge，不是领域数据解释者，也不是通用治理平台。
- Host 只拥有 start / shell / locate / mount / bridge。
- Soul App 是领域主权方，拥有业务对象、领域状态、领域 UI/API、app-owned outputs、
  app-owned confirmation actions、standalone 体验和 Host mounted product surface。
- Host 只能消费 Soul App 通过 manifest/protocol 暴露的 route、mounted UI、action descriptor、
  workspace context、session context 或 lightweight UI event；workspace/session context 仅是
  不透明 locator/bridge context，不是 Host configuration scope。
- Host left panel、Host header、Worker Configuration trigger/dialog shell 属于 Host-owned chrome；
  Soul App 不向这些 Host chrome 注册按钮、slot、renderer 或领域配置字段。
- Worker Configuration 只保存 worker-scoped Host shell preference、worker overlay/local enablement
  和 manifest-derived 泛化选项。需要 workspace/session/domain 配置时，进入 Soul-owned micro-app
  或 app-owned API，由 Soul 自己解释和保存。
- 如果 Soul App 不暴露某个 surface，Host 不取、不猜、不补。
- proposal、broker、review、audit、governance、grant 和 admission 不再是 Host 产品内核。
- Workspace/project 是业务作用域，不等同于软件仓库；HR 可以是岗位或候选人池，QA 可以是
  release 或 test suite，DevOps 可以是 service、incident 或 runbook。
- 外部 engine 负责自己的 tool loop、模型、sandbox、approval、auth/profile、native session
  和插件生态；AIWorker 只在 session 层准备 cwd/context、调用或观察 engine。
- Developer Soul 只是 supporting role，用于 code review、release evidence、repo report、
  handoff、risk audit 等；不要让 repo/PMA/coding loop 成为产品中心。

## 数据与 API 规则

- `worker.db` 只存 Host metadata：installed/enabled apps、workers、workspaces、sessions、
  engine invocation references、protocol cache needed for routing、mounted surface references
  和 platform file references。
- 真实业务文件和 artifact 留在 Soul App 的 workspace 文件夹或对象存储命名空间；generic review
  rows、lesson ledgers、admission proposals、profile promotion state、grants-as-product-flow 和
  domain facts 都不是 Host product primitives。
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
- Host left panel 中的 Worker Configuration 入口是 Host 固化平台 action。它针对当前 Soul
  worker，不针对 Soul App 全局，也不针对 workspace/session 下钻。
- Soul App 仍可通过 manifest/protocol 暴露 app-owned `ui.workbench` actions/search/settings 与
  `ui.workspaceContext`，例如让未来 Host-owned web terminal 知道 workspace context；Host
  只能按 descriptor 调用或定位，不解释领域语义。
- Standalone 模式下 Soul App 拥有自己的完整 shell；Host mounted 模式下 Soul App 适配 Host 壳。
- Host mounted 的 app-owned UI 统一通过 `@micro-zoe/micro-app` 挂载；Host 只提供
  通用 mount container、theme/context data 与 protocol/thin adapter 入口，不在 `apps/web`
  内实现 Soul 领域 renderer。`universal-workbench` 与领域专属 workbench 都是 Soul-owned
  micro-app surface；Host 不 import、不特判、不渲染它们。
- 新增或修改 Host Web / Soul App UI 时，从 `packages/ui` 查找 shadcn-managed primitives，
  并在 app 中组合这些 primitives。可复用 UI 归入 `packages/ui`；领域专属 UI 留在 owning app。
- 新增 app-local UI 组件或 CSS 前说明归属：shadcn primitive 组合、Soul App 领域语义，
  或临时迁移步骤。可复用缺口优先通过 `packages/ui` primitives 组合解决。
- 非平凡 UI 设计或 Superpowers spec/plan 包含 `Component Library Preflight`：列出已检查的
  `packages/ui` primitive、说明 app-local UI 归属，并在最终验证跑 `bun run ui:check`。
- 交互组件使用成熟 headless UI；不要手写 focus trap、scroll lock、ARIA 或键盘导航。
- shadcn-managed primitives 与主题变量由 `packages/ui` 承载，并优先通过官方 shadcn CLI
  维护。当前视觉约束来自 shadcn theme、semantic tokens、`packages/ui/components.json` 和本文件；
  历史 PMA/changelog 中的 `DESIGN.md` 只作为审计记录。
- app/web 与官方 Soul App web 的图标也必须跟随 `packages/ui/components.json` 中的
  shadcn `iconLibrary`。当前 preset 是 `hugeicons`，所以可见 UI 不再新增 `lucide-react`
  导入；需要图标时使用 `@hugeicons/core-free-icons` + `HugeiconsIcon`，让 shadcn Button /
  Item / Badge 等 primitive 接管尺寸、颜色与状态。
- 视觉值使用 shadcn semantic CSS variables、Tailwind CSS v4 `@theme` 或
  package-owned tokens；不要在 feature component 中新增 hex 字面量或 arbitrary value。
- shadcn-first 迁移完成前，不能只用冒烟验证收口；必须运行 `bun run ui:check` 或
  `bun scripts/check-web-ui-components.ts --all --audit`，并审查 class dimension、framed
  surface、semantic theme token、custom class、light/dark 截图与可见 radius/border/font
  干扰。若发现多层边框、异常大圆角、字体/明暗模式不一致或 app-local class 漏网，必须先修复
  或明确登记为 domain-owned / temporary migration debt，不能标记迁移 goal 完成。
- 文案用用户能理解的业务对象：Soul App、Soul worker、workspace、session、artifact、profile、
  review、lesson。仅在开发者/诊断界面暴露 invocation、engine、adapter 等底层词汇。

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
