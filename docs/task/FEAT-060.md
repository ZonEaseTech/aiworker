# FEAT-060 Soul App protocol and manifest contract

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-12 21:00
- **plan**: PLAN-284
- **relatesTo**: docs/architecture.md, GOALS.md, packages/shared, apps/api, apps/web, apps/cli

## 背景

AIWorker 当前已经形成 `host -> local daemon -> Soul worker -> workspace ->
session -> artifact -> review -> lesson` 的主路径，并完成了 HR 专业工作台的首个
落地。但这个实现仍然以仓库内模块为主，尚未建立一个让 `aiworker-hr`、
`aiworker-qa` 这类垂直产品既能独立运行、又能被 AIWorker Host 挂载的正式协议。

如果没有协议层，更多开发者加入后只能在 Host 仓库内部继续添加领域分支，最终会把
AIWorker 拉回单体应用。Soul App protocol 的目标是把垂直领域产品能力声明成稳定合同，
让 Host 与 Soul App 双方可以独立演进。

## 目标

建立 `soul-app/v1` 协议和 manifest 合同，明确一个 Soul App 如何声明自身身份、
兼容性、capability、workspace type、artifact type、UI/API 贡献、connector 需求、
storage namespace、review/memory policy 和 standalone/mounted 运行模式。

具体目标：

1. 定义可版本化的 `SoulAppManifest` schema。
2. 定义 Host 只读 manifest 的发现与兼容性校验规则。
3. 定义 runtime/API/UI/artifact/review/event/connector 等协议面的边界。
4. 明确 Soul Pack 与 Soul App 的关系：pack 是内容资产，app 是可独立部署的垂直产品。
5. 为后续 Host 挂载、standalone runtime、HR/QA 外部化和开发者 SDK 提供共同合同。

## 非目标

- 不在本功能内实现 Host 挂载 runtime。
- 不拆出 HR/QA 独立仓库。
- 不实现 app marketplace 或远程插件商店。
- 不让 Soul App 直接控制 external engine、Host DB secret 或全局权限。

## 验收标准

- `soul-app/v1` manifest schema 有明确字段、版本、兼容性和错误语义。
- manifest 能表达 standalone 与 host-mounted 两种模式。
- manifest 能声明 capabilities、workspace types、artifact types、UI/API 贡献、
  connector 权限、storage namespace 和 review/memory policy。
- Host 与 Soul App 的协议边界被文档化并有 schema/type 测试。
- 旧 Soul pack 仍可作为内容资产被 manifest 引用或内嵌。
- 协议设计不得要求 Host import 某个垂直 app 的源码内部模块。

## 调查结论

- 当前 `docs/architecture.md` 只定义了 Soul worker / pack / workbench descriptor，
  没有定义可独立部署的 Soul App。
- 当前 HR 专业工作台证明领域 UI 差异是必要的，但仍没有独立注册/挂载协议。
- 用户明确要求 Host 能接纳各种 Soul，各 Soul 又不依赖 Host 运行，两侧通过
  API/manifest/protocol 交互。

## 实现记录

- 在 `packages/shared/src/soul-app/` 增加 `soul-app/v1` manifest schema、静态
  JSON parse helper、Host discovery validation helper 和 operator-facing issue
  code。
- Manifest 覆盖 app identity、protocol/version、Host/SDK compatibility、
  standalone/host-mounted modes、Soul、pack refs、capabilities、workspace
  types、artifact types、UI/API contributions、storage namespace、connector
  needs、memory policy、permissions、healthcheck 和 protocol exports。
- 定义 Lifecycle、Runtime、Artifact、Review、Event、Connector 和 UI contribution
  protocol surface types；本轮不实现 Host registry、mount runtime 或 SDK。
- 增加 HR 与 QA reference manifest fixtures，证明同一合同能表达 people/HR 与
  release/QA 两类 Soul App，同时保留 Soul pack 作为内容资产引用。
- 增加 shared tests 覆盖有效 fixture、unsupported protocol、Host version
  incompatibility、required connector 缺失、storage namespace、unsafe
  permission、missing UI/API entry、artifact schema 错误和 JSON parse 语义。

## 验证

- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `git diff --check`
- `bun run crg:build`
- `bun run crg:review`

## 备注

这是后续所有 Soul App 化工作的协议前置功能。它不是阶段计划，而是一个完整的协议
交付项。
