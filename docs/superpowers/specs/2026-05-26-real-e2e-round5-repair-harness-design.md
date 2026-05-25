# 真实流程 E2E 第 5 轮修复与 Harness 收敛设计

## 背景

第 5 轮真实流程 E2E 审计证据位于：

```text
tmp/real-e2e-audit-2026-05-26-round5/
```

审计基线使用真实本机环境 `/Users/ben/.aiworker-dev`、真实 Codex 与 Claude Code 鉴权、
真实 CLI/API/Web/Host mounted 路径。审计结果没有 P0，确认两个产品修复项和两个审计工具链/诊断收敛项：

- P1：CLI 选择 `claude-code` 后，session invocation 把 engine id 当成 executable，尝试 spawn
  不存在的 `claude-code`。
- P2：HR universal composer 的 hidden select 已有默认 capability，但可见 combobox 为空，
  输入文字后 Start 仍 disabled。
- P3：in-app Browser 在 mounted micro-app 截图时超时，需要稳定 Playwright fallback。
- P3：in-app Browser 与 fresh Playwright context 的 theme 来源不同，证据里缺少清晰诊断字段。

用户已确认本批次采用方案 C：修 P1/P2，同时把 P3 E2E harness fallback 与 theme 诊断纳入本轮交付。

## 目标

1. CLI `engine select claude-code` 后，新建 session 继续记录 `engineId: "claude-code"`，但实际
   `engineCommand` 解析为本机 readiness 发现的 `claude` executable 或其绝对路径。
2. CLI/API/Web 使用同一套 Host-owned local engine resolution contract，避免 API 能正确运行而
   CLI 走 id-as-command。
3. Universal composer 默认 capability 的 hidden select value、可见 combobox label 和 Start
   readiness 使用同一个 resolved template id。
4. E2E harness 明确把 Playwright fallback 作为 mounted surface 视觉证据的正式路径，不让
   in-app Browser 截图超时阻断留证。
5. Theme 诊断能回答 Host effective theme、mounted URL/data theme、浏览器上下文 theme 来源之间的关系。
6. 交付时有 focused tests、UI governance、Host/Soul boundary audit、真实 browser evidence 和
   code-review-graph 审查。

## 非目标

- 不把 engine preference 或 command resolution 变成 Soul App 领域配置。
- 不允许已有 session 被当前 global engine preference 中途改写。
- 不新增 raw command override；本轮只支持已知 engine id 到本机 command/path 的解析。
- 不让 Host 解释 HR capability 的领域含义；Host 只消费 catalog/template descriptor。
- 不把 theme preference 保存到 Soul App，也不让 Soul App 回写 Host theme。
- 不修 in-app Browser 插件自身的截图超时实现；本轮只收敛 AIWorker E2E 证据路径。

## 架构边界

AIWorker 当前架构合同仍是 Local Shell + Engine Bridge for Soul Apps。Host 只负责 start、shell、
locate、mount、bridge。

P1 属于 Host CLI + engine bridge。CLI 选择 engine id，Host resolver 根据本机 readiness 解析
可执行命令，runtime 在 session/turn/invocation metadata 中冻结 engine id、engine command 和
execution mode。Soul App 不参与解析，也不保存 engine preference。

P2 属于 shared UI primitive 与 Soul-owned mounted workbench 的交互一致性。Universal workbench 从
manifest/catalog 得到 templates，计算当前 worker 的 resolved template id；`ManagedSessionComposer`
和 `SessionComposer` 只负责把该 id 渲染为可见 label 并用于 submit readiness。Host 不解释
`Person Profile` 等 HR 领域语义。

P3 属于真实 E2E harness 与诊断证据。Host 产品逻辑只暴露通用 theme/mount context；审计脚本记录
该 context，并在 Browser 截图失败时使用 Playwright 补齐 screenshot、layout、console 和 theme
诊断证据。

## P1 Engine Resolution 设计

新增或提取一个 Host-owned local engine resolver，供 CLI 与 API 共用。它的输入是 engine id 与
当前本机 engine readiness，输出是：

- `engineId`：稳定产品 id，例如 `claude-code`。
- `engineCommand`：可执行命令或绝对路径，例如 `/Users/ben/.local/bin/claude` 或 `claude`。
- `engineName`：用于诊断展示。
- `executionMode`：`local-cli` 或 `byok`。

解析优先级：

1. `session start --engine claude-code` 这类显式 engine id 参数。
2. CLI `engine.default`。
3. local settings selected engine。
4. worker `defaultEngineId`。
5. `codex` fallback。

创建 session 时，runtime 把解析结果写入 session metadata，并在第一轮 turn/invocation metadata 中使用同一结果。后续 `turn send` 必须优先读取 session 已冻结 metadata；若旧 session 缺失 engine metadata，则读取最近 invocation 恢复；仍缺失时才 fallback 并补齐。

未知 engine id 在创建 session 前失败，错误应指向 engine settings 或 supported engine list。已知但未安装的 engine 在创建 session 前失败，提示 selected engine is not installed，并建议 rescan/readiness，而不是等 executor 抛 `Executable not found`。

## P2 Composer 默认 Capability 设计

Universal workbench 继续用 `resolveDefaultTemplateId(current, templates)` 得到 `effectiveSelectedTemplateId`：

- templates 为空时返回 `undefined`，Start disabled，显示已有 disabled reason。
- 当前选择不存在时回落到第一个 template。
- 当前选择有效时保留用户选择。

`ManagedSessionComposer` 通过 `selectedTemplateId` 受控传入 `SessionComposer`。`SessionComposerActionBar`
中的 Select trigger 不依赖浏览器 hydration 后的隐式 display state，而是显式根据
`templateOptions.find(option.value === selectedTemplateId)` 渲染 label。Start disabled 判断与 submit
draft payload 使用同一个 `selectedTemplateId`，避免 hidden select 有值但可见 combobox 和 submit
readiness 为空。

回归测试要证明：当 HR templates 包含 `aiworker-hr.person-profile` 且文本框有输入时，combobox 显示
`Person Profile`，Start button enabled，draft 提交携带 `selectedTemplateId:
"aiworker-hr.person-profile"`。

## P3 E2E Harness 与 Theme 诊断设计

第 6 轮及后续真实 E2E harness 应把 mounted surface 证据分为两层：

1. in-app Browser：优先采集 DOM snapshot、layout JSON、console warn/error、resource summary 和
   可交互状态。
2. Playwright fallback：当 in-app Browser screenshot 超时，立即采集 desktop 与 390px screenshot、
   layout JSON、console log、URL、viewport、micro-app readiness 和 selected worker/workspace/session
   locator。

截图超时记录为 tool failure，不记为产品失败；只有 DOM/layout/console/interaction 证明产品不可用时才升级为产品 finding。

Theme 诊断新增轻量证据字段，不改产品所有权：

- Host effective appearance：`light`、`dark` 或 `system -> light|dark`。
- mounted URL `theme` query。
- micro-app data 中的 `theme`。
- 浏览器上下文的 `prefers-color-scheme`、local storage/session storage 中相关 theme key。
- mounted document root class 与 `color-scheme`。

诊断输出可以是 harness JSON 或 test hook，不要求用户界面新增可见调试 UI。

## 组件影响

- `apps/cli/src/aiworker.ts`：CLI session start / turn send 使用 shared resolver，`engine select`
  仍保存 engine id。
- `apps/api/src/modes/worker/settings.ts` 或邻近 Host settings 模块：承载可复用 local engine catalog、
  scan/readiness 与 resolver；如果为了 package 边界需要移动，可放到 Host-owned shared/core 模块。
- `apps/api/src/modes/worker.ts`：继续用 resolver 创建 Web/API session 和 native invocation。
- `packages/core/src/worker/runtime.ts`：保持 session engine freeze 与旧 session fallback 语义。
- `packages/ui/src/components/session-composer.tsx`：修正 controlled Select label 与 submit disabled 状态。
- `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`：补 regression test，
  必要时调整 resolved template id 的传递。
- E2E scripts/docs：新增或更新 round6 harness 脚本/计划，使 Browser screenshot timeout 自动进入
  Playwright fallback 证据路径，并输出 theme diagnostics。

## 验证计划

Focused tests:

- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-ui' test`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`

Governance and boundary:

- `bun run ui:check`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`

Mounted/browser evidence:

- Rebuild official mounted client bundles before browser evidence:
  `bun run --filter '@zonease/aiworker-hr' build:client`
  and `bun run --filter '@zonease/aiworker-qa' build:client` when HR/QA mounted assets are affected.
- Playwright desktop and 390px checks for HR composer default capability, Start readiness and theme diagnostics.
- Playwright desktop and 390px checks for QA mounted locator and Worker Configuration boundary to guard prior regressions.

Code review:

- `bun run crg:update`
- `bun run crg:review`
- `git diff --check`

## PMA 与交付记录

Implementation plan 应创建并同步新的 PMA task/plan，指向
`tmp/real-e2e-audit-2026-05-26-round5/`。任务必须明确本批次包含：

- P1 CLI Claude Code engine command resolution。
- P2 HR universal composer default capability readiness。
- P3 E2E Browser screenshot fallback hardening。
- P3 Host/mounted theme diagnostics。

Closeout 应更新 `docs/changelog.md`，记录实际修复、验证命令、browser evidence 目录和任何保留风险。

## 设计自审

- 无未定项：证据目录、目标、非目标、验证命令和交付边界均已固定。
- 边界一致：Host 只处理本机 engine resolution、mount context 和证据 harness；Soul App 保留领域 UI/API 主权。
- 范围可执行：P1/P2 是产品修复，P3 是 harness/诊断收敛，不要求修 Browser 插件本身。
- 歧义消解：`claude-code` 是 engine id，`claude` 或绝对路径是 engine command；theme diagnostics 是证据字段，不是新的用户设置面。
