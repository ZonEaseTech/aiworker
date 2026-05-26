# 真实流程 E2E 第 6 轮发布绑定设计

## 背景

AIWorker 当前架构合同是 Local Shell + Engine Bridge for Soul Apps，默认产品路径是：

```text
AIWorker -> Soul App -> workspace -> session -> app-owned work
```

第 6 轮 E2E 不再把 source-dev、release 和 installed test 分开看。它是一条发布绑定长任务：
先在源码态用真实 `/Users/ben/.aiworker-dev` 跑完整 operator flow，再执行正式通道发布 gate、
打 tag、等待 GitHub Actions/npm 发布完成，最后用刚发布到正式通道的 package 在
`/Users/ben/.aiworker` 跑 installed operator flow。

本轮仍不使用 fake home、mock engine、mock session 或测试专用 Soul App。Codex 与 Claude Code
使用本机已鉴权环境。Web 是重点审计面，必须覆盖 desktop 与 390px narrow viewport，不能以
smoke pass 作为验收标准。

## 目标

- 验证 source-dev、正式发布产物和 installed operator path 之间是否一致。
- 覆盖真实 CLI、local daemon API、Host Web Shell、官方 HR/QA Soul App、mounted micro-app
  surface、workspace/session locator 和 engine bridge。
- 使用本机已鉴权的 Codex 与 Claude Code 跑真实 session，并验证 app-owned workspace artifact。
- 通过真实 tag、GitHub Actions、npm `latest` 和 GitHub Release 验证发布链路。
- 主动收集 bug、体验阻塞、样式偏移、状态不一致和优化项。
- 最终沉淀一个很薄的 E2E skill，保存流程骨架、防跑偏规则和报告形状，避免下一轮重新解释。

## 非目标

- 不发布 `1.0.0` 或更高版本；本轮正式通道仍必须保持 `0.x.y`。
- 不把预发布通道当作本轮发布成功标准。
- 不把本地 `dist` 或 `npm pack` 冒充 installed test；installed lane 必须基于刚发布的 package。
- 不清空、不重建、不迁移 `/Users/ben/.aiworker-dev` 或 `/Users/ben/.aiworker`。
- 不删除既有 worker/workspace/session。
- 不把 HR/QA 或 universal workbench 变成 Host-owned renderer。
- 不在审计中途修 P2/P3；只登记证据和建议。P0/P1 先留证，再决定最小 unblock 或停止发布。
- 不把 final E2E skill 做重；它不是自动化框架、不是完整测试 harness、不是大文档体系。
- 不复制 secret、engine auth profile、raw token 或外部账号数据到证据目录。

## 版本与发布规则

- 发布通道：正式通道，npm `latest`，GitHub Release 非 prerelease。
- 版本保护：发布版本必须满足 `< 1.0.0`。默认优先 patch release，例如从 `0.19.0` 到
  `0.19.1`，但执行前必须实时核对 npm/GitHub 当前状态后再确定具体版本。
- 若 source-dev lane 或 release gate 出现 P0/P1，停止 tag/publish，交付 blocked report。
- 若 P2/P3 直接影响 operator 安装、启动、Web 使用、engine bridge 或发布产物完整性，可升级为
  release blocker；否则登记为发布后修复项。
- tag、commit message、PR/release 文案默认中文；Conventional Commit type 保持英文。

## 证据目录与命名

本轮证据目录：

```text
tmp/real-e2e-audit-2026-05-26-round6/
```

source-dev lane 对象前缀：

```text
e2e-r6-dev-hr-codex-20260526
e2e-r6-dev-hr-claude-cli-20260526
e2e-r6-dev-hr-web-claude-20260526
e2e-r6-dev-qa-web-20260526
```

installed lane 对象前缀：

```text
e2e-r6-installed-hr-codex-20260526
e2e-r6-installed-hr-claude-cli-20260526
e2e-r6-installed-hr-web-claude-20260526
e2e-r6-installed-qa-web-20260526
```

真实 artifact 只写入对应 AIWorker workspace，例如：

```text
artifacts/e2e-r6-dev-codex-20260526.md
artifacts/e2e-r6-dev-claude-cli-20260526.md
artifacts/e2e-r6-dev-web-claude-20260526.md
artifacts/e2e-r6-installed-codex-20260526.md
artifacts/e2e-r6-installed-claude-cli-20260526.md
artifacts/e2e-r6-installed-web-claude-20260526.md
```

## Phase A: Source-Dev Real E2E

主 home 是 `/Users/ben/.aiworker-dev`。源码态必须先通过完整真实流程，才允许进入发布 gate。

覆盖范围：

- repo baseline、git status、当前 commit、Bun/Node/Codex/Claude Code readiness；
- dev daemon/API/Web 启动或连接，记录 9217/5173 listener、tmux、health、OpenAPI、settings、
  engines、workers、workspaces、sessions；
- official app bootstrap；
- HR Codex CLI worker/workspace/session，验证 artifact、session events、turn 状态、Web 可见状态；
- HR Claude Code CLI worker/workspace/session，明确验证 engine selection 和实际 invocation；
- Web HR mounted surface，覆盖 desktop 与 390px；
- Web Claude Code session，验证 submit、terminal/recovery、artifact、API/session status；
- Web QA mounted surface，覆盖 desktop 与 390px；
- HR/QA Worker Configuration desktop 与 390px，检查窄屏裁切、scope 泄漏、Host/Soul 边界；
- console、network、layout JSON、DOM text、outerHTML forbidden-scope scan。

## Phase B: Release Gates And Formal Publish

source-dev lane 没有 P0/P1 后，进入发布准备。

必须采集：

- 当前 npm `latest` / GitHub Release / repo tag 状态；
- 目标版本选择证据，确认 `< 1.0.0`；
- `bun run check` 或范围等价 gate；
- `bun run test`；
- `bun run build`；
- `bun run --filter '@zonease/aiworker-web' build`；
- `bun run --filter '@zonease/aiworker-cli' build:bundle`；
- `cd apps/cli && npm pack --dry-run --json`；
- `bun run --filter '@zonease/aiworker-cli' smoke:dist-release`；
- `bun run ui:check`；
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`；
- package content 验证：Worker Web static assets、worker DB migrations、official HR/QA release resources。

发布步骤必须是真实正式通道：

- 更新版本为选定的 `0.x.y`；
- release prep commit；
- tag；
- push branch/tag；
- 等待 GitHub Actions release workflow；
- 验证 npm `latest` 解析到目标版本；
- 验证 GitHub Release 非 draft、非 prerelease；
- 验证 release assets 与 package 内容；
- 验证 `bunx @zonease/aiworker-cli@<version> --version`。

## Phase C: Installed Real E2E

installed lane 使用 `/Users/ben/.aiworker`，并且必须基于刚发布的正式 package。不能使用 repo dist
替代。

覆盖范围：

- installed daemon status、logs、app list、worker/workspace/session baseline；
- 用刚发布版本启动 daemon/API/Web，记录端口、health、OpenAPI、settings、engines；
- official app bootstrap；
- HR Codex CLI worker/workspace/session；
- HR Claude Code CLI worker/workspace/session；
- Web HR mounted surface desktop 与 390px；
- Web Claude Code session；
- Web QA mounted surface desktop 与 390px；
- HR/QA Worker Configuration desktop 与 390px；
- artifact、session event、turn status、session top-level lifecycle、Web timeline/composer/recovery；
- console/network/layout/DOM 证据。

installed lane 可以创建 `e2e-r6-installed-*` 对象和 workspace artifact，但不得清空、迁移或删除
既有用户数据。若已安装 home 的既有 daemon、版本或状态阻断安全执行，必须先留证，再把 lane 标记为
blocked 或 partial，不强行覆盖。

## Phase D: Comparison And Report

最终报告按阶段和横向矩阵组织：

- source-dev success/failure；
- release gate success/failure；
- tag/npm/GitHub release success/failure；
- installed success/failure；
- dev vs installed 差异；
- CLI vs Web 差异；
- Codex vs Claude Code 差异；
- HR vs QA 差异；
- desktop vs 390px 差异；
- P0/P1/P2/P3 findings；
- 发布阻断、发布后修复项、优化项；
- evidence index。

每个 finding 必须包含：

- severity；
- phase；
- home；
- surface；
- reproduction；
- actual；
- expected；
- evidence；
- impact；
- suggested next step。

Engine 失败不能自动归咎外部工具；必须同时记录 AIWorker 的 invocation、status、event、artifact
和 Web recovery 表现。Browser 工具失败和产品失败分开分类；若 in-app Browser 截图失败，使用
DOM/layout/console 和 Playwright-style fallback 证据补齐。

## Phase E: Thin E2E Skill

第六轮结束后沉淀一个薄 skill。它只保存可复用流程，不承载实现细节：

- 何时使用：AIWorker release-backed E2E、真实 home、真实 engine、Web-heavy 审计；
- 必守边界：Host 是 shell/locator/mount/bridge，Soul App owns domain UI/API/artifacts；
- 标准阶段：source-dev E2E -> release gates -> formal publish -> installed E2E -> comparison report；
- 证据形状：README、e2e-env、commands、api、browser、screenshots、logs、artifacts、findings、
  final-report；
- 防跑偏规则：不 mock、不 fake home、不用 smoke pass 收口、不把 repo dist 冒充 installed、
  不自动升 1.0、不存 secret；
- 最小检查清单：CLI/API/Web/HR/QA/Codex/Claude Code/desktop/390px/Worker Configuration；
- 报告字段和 severity 分类。

这个 skill 不应该包含完整命令矩阵、浏览器脚本、大量历史说明或自动化 harness。具体命令和对象前缀留在
每轮 plan 中生成。

## 交付物

- `tmp/real-e2e-audit-2026-05-26-round6/findings.md`
- `tmp/real-e2e-audit-2026-05-26-round6/final-report.md`
- release verification evidence：npm、GitHub Release、tag、Actions、package contents、`bunx`
  version；
- source-dev 与 installed 的 screenshots、DOM/layout JSON、console/network 摘要、API snapshots、
  daemon/dev logs、artifact path indexes；
- thin E2E skill 文件；
- 聊天最终回复只总结最高信号结果，并指向报告文件。

## 设计自审

- 无占位符：路径、阶段、home、对象前缀、artifact 名称、发布规则和交付物均已固定。
- 边界一致：Host 只负责 shell/locator/mount/bridge，HR/QA 领域 UI 与 artifact 归 Soul App。
- 范围收敛：本轮是发布绑定长 E2E；P2/P3 修复不在本轮执行范围，薄 skill 只做流程沉淀。
- 歧义消解：正式通道是 npm `latest` 与非 prerelease GitHub Release；版本必须 `< 1.0.0`；
  installed lane 必须使用刚发布 package，不能使用 repo dist 冒充。
