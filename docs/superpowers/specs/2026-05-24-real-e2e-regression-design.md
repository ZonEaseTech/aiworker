# 修复后真实 E2E 回归与 Web 深挖设计

## 背景

上一轮真实 operator 路径审计记录在 `tmp/real-e2e-audit-2026-05-24/`。它证明
CLI 到 Codex 的真实 session 路径可以写入 workspace artifact，同时暴露了 Web 到
Claude Code 失败态恢复、mounted workspace locator、Worker Configuration 边界和 engine
readiness endpoint 等问题。

当前 `main` 已包含这些修复。本轮不是新增 smoke，也不是只验证脚本能跑通，而是在修复后重新走
真实流程，并把 Web 产品体验作为主线深挖。测试必须遵守当前架构合同：

```text
AIWorker -> Soul App -> workspace -> session -> app-owned work
```

Host 仍只拥有 start、shell、locate、mount 和 bridge。测试不把 AIWorker 拉回旧的
developer-only work order、Host-owned 领域工作流或通用 agent runtime。

## 目标

- 使用真实 `~/.aiworker-dev`、真实 local daemon、真实 Worker Web、真实官方 Soul Apps 和已鉴权的
  Codex / Claude Code，完成一轮修复后回归。
- 重点复测上一轮 P1/P2 修复是否在真实 Web 和 CLI 路径中生效。
- 深挖 Web 体验阻塞、样式偏移、窄屏问题、console/network 错误、失败态恢复和 mounted micro-app
  状态同步。
- 产出带证据的缺陷与优化项清单，而不是以 smoke PASS 作为验收。
- 如遇 P0/P1 阻塞，先完整留证，再做解除阻塞所需的最小修复并继续测试。

## 非目标

- 不清空、重置或迁移 `~/.aiworker-dev` 或 `~/.aiworker`。
- 不把 `aiworker app smoke`、`web:smoke:mounted-surfaces` 或发布 smoke 当作最终验收标准。
- 不为本轮先开发新的 E2E harness。
- 不在 Host Web 内实现 Soul App 领域 renderer、领域配置或领域工作流。
- 不让 Codex 或 Claude Code 修改 `/Users/ben/projects/aiworker`，除非后续进入明确的修复阶段且由本轮
  operator 控制改动。
- 不中途修 P2/P3。它们只记录，后续进入 PMA 修复。

## 环境策略

主环境使用源码态 `~/.aiworker-dev`。本轮可以创建新的 `e2e-*` worker、workspace、session 和轻量
artifact，并保留它们作为复现证据。

安装态 `~/.aiworker` 放在最后做抽检。抽检前先记录当前 home、端口和 daemon 状态；若需要启动服务，
使用不冲突端口。安装态只检查启动、official app 可见、Web 可打开和 engine readiness 可读，不作为
主要写入环境。

如果 9217 或 5173 已被其他监听进程占用，只记录监听进程并改用明确的替代端口；不使用按端口粗暴
kill 的方式清理环境。

## 测试矩阵

### 必跑路径

1. `~/.aiworker-dev` daemon 和 Worker Web 启动、health、local info、settings、engine readiness。
2. CLI bootstrap official apps，并记录 HR/QA 是否 installed 和 enabled。
3. CLI 创建或复用 HR worker/workspace，用 Codex 发起真实 session，让 engine 在 workspace 内写入
   `artifacts/e2e-codex.md`。
4. Web 创建或复用 QA worker/workspace，检查 mounted micro-app URL 和 host data 是否包含 selected
   `workspaceId`。
5. Web Settings 确认或切换 Claude Code readiness，用 Web composer 发起真实 session，让 engine 在
   workspace 内写入 `artifacts/e2e-claude-code.md`，或在失败时验证 failed 终态、错误唯一性和 composer
   恢复。
6. 打开 HR/QA 的 Worker Configuration，确认它只包含 worker-scoped Host shell preference、worker
   overlay/local enablement 和 declared workbench route preference，不出现 workspace projection 配置语义。
7. 桌面视口约 `1280x900` 与窄屏 `390-760` 都截图检查，覆盖 Host shell、mounted surface、Settings、
   Worker Configuration 和 session detail。

### 深挖路径

- failed session 后刷新页面、重新选择 session、继续 follow-up。
- worker、workspace、session route 直接访问、浏览器后退和刷新。
- HR/QA mounted surface 在主题切换后的可读性与边界状态。
- console error、network 404/500、micro-app lifecycle error、React duplicate key、hydration/runtime warning。
- 输入框 busy/disabled 状态、loading 不退出、错误文案不可理解、按钮不可达、dialog/popover 逃出 viewport。
- 页面水平溢出、文本重叠、图标破损、暗色/亮色异常、布局跳动、空白页面或状态闪烁。

### 安装态抽检

- 记录 `~/.aiworker` 当前文件轮廓和端口状态。
- 使用当前可用安装入口或打包产物启动到非冲突端口。
- 检查 Web 首页、official apps、`/api/local/settings/engines` 和 `/openapi.json`。
- 若源码态主流程已稳定且时间允许，再抽一条轻量 worker/workspace 路径；否则不扩大安装态写入。

## Browser 与视觉检查

Browser 是 Web 测试主工具。每个核心 Web 状态至少保留一份截图和一份轻量 DOM/layout 记录。截图命名
应包含视口、Soul App 和状态，例如 `web-qa-mounted-desktop.png`、`web-hr-config-narrow.png`。

浏览器检查不只看主路径是否能点通，还要记录可见体验问题：

- Host header、left panel 和 mounted surface 是否互相遮挡。
- Dialog、popover、sidebar、mounted micro-app 是否在桌面和窄屏内可达。
- 可点击控件是否有明确 label、状态和 disabled 原因。
- 错误状态是否显示真实可恢复路径。
- 任何 console/network error 都进入证据，即使主路径仍可绕过。

## Engine 任务

真实 engine 任务保持轻量、可验证、低风险。

Codex CLI 路径提示：

```text
E2E audit task: only inside this AIWorker workspace, create artifacts/e2e-codex.md with app id,
workspace id, session id if visible, and one short conclusion. Do not read or modify
/Users/ben/projects/aiworker. Do not write secrets.
```

Claude Code Web 路径提示同样限制写入当前 AIWorker workspace，并写入
`artifacts/e2e-claude-code.md`。如果 Claude Code 受模型、账号、approval、插件或 native session 影响失败，
记录真实行为。AIWorker 的验收点是 cwd/context 是否正确、终态是否清楚、Web 是否可恢复、证据是否完整，
不是要求 Host 接管 engine tool loop。

## 证据布局

新证据目录为：

```text
tmp/real-e2e-regression-2026-05-24/
```

计划文件：

- `README.md`：环境、commit、端口、home、开始/结束时间、命令索引。
- `commands/`：CLI、curl、daemon/Web 启动日志、session show、events、turns、settings 输出。
- `screenshots/`：桌面、窄屏、关键失败态和修复前后截图。
- `browser/`：DOM 摘要、console/network 错误、layout 检查结果。
- `workspaces/`：真实 workspace 路径索引、engine 产物文件内容摘要，不复制 secret。
- `findings.md`：P0/P1/P2/P3 缺陷和优化项。
- `docs/superpowers/specs/2026-05-24-real-e2e-regression-report.md`：最终报告。

## 缺陷分级

- P0：daemon/Web 不可用、无法进入 Soul App、无法创建 workspace/session、真实 engine 完全无法运行、
  或出现数据破坏和越界写入风险。
- P1：关键路径可进入但主要工作无法完成，例如 Web session 卡死、failed 状态不可恢复、engine cwd 错误、
  mounted surface 主要交互不可用、session 刷新后丢失。
- P2：明显质量或体验问题，例如样式偏移、窄屏遮挡、错误文案不可理解、console/network error、
  Worker Configuration 边界文案漂移，但主路径仍可继续。
- P3：优化项，例如状态反馈、文案、证据入口、可观察性或操作顺序可以更顺手。

P0/P1 处理规则：先记录复现步骤、截图、日志、API 状态和 workspace 状态。如果阻塞后续测试，做最小修复、
跑聚焦验证、记录修复前后证据，然后继续本轮 E2E。P2/P3 不中途修复。

## 报告输出

最终报告包含：

- 测试环境：日期、commit、home、端口、daemon/Web URL、engine binary/version/readiness。
- 流程矩阵：HR/QA、CLI/Web、Codex/Claude Code、桌面/窄屏、源码态/安装态覆盖情况。
- 通过项：关键证据路径、截图或 workspace artifact。
- 缺陷清单：严重度、标题、复现步骤、实际结果、期望结果、证据、建议归属。
- 优化项清单：影响、建议和优先级。
- 未覆盖项与原因。
- 后续建议：立即修复项、适合进入 PMA task/plan 的项、需要单独设计的 engine isolation 或安装态问题。

## 验收标准

- 真实 `~/.aiworker-dev`、真实 daemon、真实 Worker Web、真实 Codex 和 Claude Code 都至少被完整尝试。
- Web 是主路径，覆盖桌面和窄屏，并保存截图和 console/network 证据。
- 至少一条 CLI 到 session/turn/artifact 路径完成，除非 P0/P1 阻塞且已有证据。
- Web 到 session/turn 路径完成或以明确 failed/recoverable 状态收口。
- 上一轮四类修复点都有真实回归证据：Claude failed recovery、workspace locator、Worker Configuration
  边界、engine readiness endpoint。
- 不使用 smoke PASS 替代真实观察。
- 不破坏 Host/Soul 边界，不引入 Host-owned 领域工作流。
- 测试产生的写入限制在 AIWorker workspace 内，真实 home 不被无记录地清理或重置。
