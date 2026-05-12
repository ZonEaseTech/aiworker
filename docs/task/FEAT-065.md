# FEAT-065 Soul App developer onboarding and validation harness

- **status**: pending
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-12 21:00
- **plan**: PLAN-289
- **relatesTo**: FEAT-060, FEAT-061, FEAT-062, FEAT-063, FEAT-064, docs, apps/cli, apps/web, packages/shared

## 背景

本轮架构目标之一是让更多开发者加入 AIWorker 开发。仅有协议和 reference apps 不够；
新开发者需要能创建、运行、验证、调试和提交一个 Soul App，而不需要理解 Host 的全部
内部实现。

## 目标

建立 Soul App authoring、onboarding 和 validation harness，使开发者能用模板创建
新的 vertical app，并在 standalone 与 Host mounted 两种模式下完成验收。

具体目标：

1. 提供 `aiworker app create` 或等价 scaffold。
2. 提供 manifest/protocol/artifact/review/permission validation。
3. 提供 standalone smoke 和 Host mounted smoke。
4. 提供开发者文档、示例、贡献边界和 PR 检查清单。
5. 提供 UI/functional acceptance harness，降低 review 成本。

## 非目标

- 不承诺远程 marketplace 发布。
- 不让生成器创建完整业务逻辑。
- 不绕过 PMA 和 code-review-graph 工作流。
- 不把 Host 内部模块暴露给 app author。

## 验收标准

- 新开发者能用一个命令生成最小 Soul App。
- 生成的 app 能通过 manifest/schema/protocol 校验。
- 生成的 app 能 standalone 启动并在浏览器中打开。
- 生成的 app 能被 Host mounted 并完成 workspace/session/artifact/review smoke。
- 文档说明如何选择 workspace types、capabilities、artifact schemas、connectors 和 review policy。
- CI 或本地 harness 能输出明确的失败原因。

## 调查结论

- 当前仓库已有 PMA、Worker Web focused tests、Playwright/browser smoke 和
  code-review-graph review 流程，可作为 Soul App 验收基线。
- 缺少面向外部/新增开发者的 app authoring path 和一键验证入口。

## 备注

这个功能把架构落地到协作效率：更多开发者可以在协议边界内贡献垂直 Soul App。
