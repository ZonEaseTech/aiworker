# 真实流程 E2E 审计设计

## 背景

本轮目标不是新增一个 mock smoke，也不是证明某个局部脚本能跑通，而是按真实 operator 路径检验 AIWorker 当前产品体验。测试必须沿当前架构合同的默认路径：

```text
AIWorker -> Soul App -> workspace -> session -> app-owned work
```

Host 仍只作为 start / shell / locate / mount / bridge。测试不能把 Host 拉回通用 agent runtime、领域工作流或旧 developer-only work order。Codex 和 Claude Code 已在本机鉴权，本轮允许真实调用它们，并允许它们在 AIWorker workspace 内产生轻量文件改动。

## 范围

本轮使用真实本地状态，不创建一次性 sandbox home：

- 源码开发态优先使用 `~/.aiworker-dev`。
- 需要验证安装或发布态时再使用 `~/.aiworker`，并在执行前记录当前 daemon、DB、workspace 和端口状态。
- 不主动清空、重置或迁移真实 home。
- engine 产生的写入必须限制在 AIWorker 创建或选择的 workspace 内。

覆盖面包括：

- CLI lifecycle：daemon status/start/logs、official app bootstrap、worker/workspace/session/turn 命令。
- Worker Web：Host shell、left panel、Worker Configuration、Settings、catalog、mounted micro-app surface、workspace/session 导航。
- Official Soul Apps：`aiworker-hr` 与 `aiworker-qa` 的 install/enable、mounted surface、workspace/session 真实使用。
- Engine bridge：Codex 和 Claude Code 的 readiness、真实 session turn、cwd/context 投递、session timeline、workspace 文件产物。
- 证据链：命令输出、浏览器截图、console/network 错误、daemon log、workspace 文件、session 状态、可复现步骤。

## 非目标

- 不把 `aiworker app smoke`、`web:smoke:mounted-surfaces` 或 `smoke:dist-release` 当作最终验收。
- 不先开发新的 E2E harness；本轮优先发现真实 bug 和体验阻塞。
- 不为了兼容旧入口、旧命名或旧产品路径扩大测试范围。
- 不在发现普通 bug 后立即修复；只有阻塞后续测试的 P0/P1 才可先做最小修复。
- 不让 engine 修改 AIWorker 仓库源码，除非后续进入明确的修复阶段。

## 测试策略

采用“真实 operator 路径审计式 E2E”。

第一层是基础运行层。检查当前 `~/.aiworker-dev` 或 `~/.aiworker` 的 daemon 状态、端口、日志位置、Web URL、runtime version、官方 Soul App catalog、engine readiness 和 settings 投影。这里关注真实状态是否可解释，错误是否可恢复，文案是否让用户知道下一步。

第二层是 Web 产品层。用 Browser/Playwright 作为主工具打开 Worker Web，走首次进入、app 选择、worker 创建/切换、workspace 创建/选择、session 创建/进入、mounted micro-app 渲染、Settings 与 Worker Configuration。桌面和窄屏都要检查。任何文本溢出、按钮不可达、遮挡、布局跳动、暗色/亮色异常、空状态困惑、loading 不退出、错误被吞掉或 console/network error 都记录为问题。

第三层是真实工作层。分别通过 CLI 和 Web 各至少完成一条从 Soul App 到 session 的路径，并分别用 Codex 与 Claude Code 执行轻量真实任务。任务应要求 engine 在当前 workspace 内写入一个明确、无敏感信息的小文件，或更新 app-owned artifact 文件。验证点包括 cwd 是否正确、workspace instruction 是否投递、session turn 是否记录、timeline 是否可见、workspace 文件是否存在、Web 刷新后状态是否一致。

第四层是证据与缺陷层。每个流程记录开始条件、操作步骤、观察结果、失败截图或日志、影响范围和复现方式。缺陷按严重度分级，优化项单列。测试报告要区分“通过”“阻塞”“降级可用”“未覆盖”，避免用单个 PASS 掩盖体验问题。

## Web 检查要求

Web 是本轮重点，不是 CLI 的附属验证。每条核心 Web 路径至少检查：

- 桌面视口：`1280x900` 或接近实际开发窗口。
- 窄屏视口：宽度约 `390-760`，覆盖移动或窄窗口体验。
- 页面无不可解释的 blank、闪烁、布局漂移或水平溢出。
- Dialog、popover、sidebar、mounted micro-app 不超出 viewport。
- Host header、left panel、Worker Configuration 不出现 Soul App 自定义 slot 或领域字段。
- mounted Soul App surface 通过 micro-app 渲染，不由 Host Web 特判领域 UI。
- Settings 中 engine readiness、app status 和错误状态可读。
- 浏览器 console 和 network error 必须进入证据。

## Engine 任务设计

真实 engine 任务保持轻量、可验证、低风险：

- Codex 路径：让 engine 在 workspace 内创建或更新 `artifacts/e2e-codex.md`，写入当前 session id、app id、workspace id 和一句简短结论。
- Claude Code 路径：让 engine 在 workspace 内创建或更新 `artifacts/e2e-claude-code.md`，写入同类信息。
- 如果目标 Soul App 有更合适的 app-owned artifact 目录，优先使用该目录；否则使用 workspace 内普通 `artifacts/`。
- 任务提示必须明确“只在当前 workspace 内写文件，不读取或修改 AIWorker 仓库源码，不写 secret”。
- 若 engine 出现权限确认、挂起、超时或登录异常，记录真实交互和可恢复性，不把它当作 smoke harness 的普通失败吞掉。

## 缺陷分级

- P0：阻塞核心路径，导致 daemon/Web 不可用、无法进入 Soul App、无法创建 workspace/session、真实 engine 完全无法运行，或有数据破坏/越界写入风险。
- P1：关键路径可进入但主要工作无法完成，例如 mounted surface 无交互、session turn 卡死、engine cwd 错误、Web 状态刷新后丢失、主要按钮不可点击。
- P2：明显体验或质量问题，例如样式偏移、窄屏遮挡、错误文案不可理解、loading 状态误导、console/network error 但主路径仍可绕过。
- P3：优化项，例如文案可更清晰、状态反馈可更及时、证据下载或复制路径不够顺手。

发现 P0/P1 时先保留证据。如果该问题阻塞后续测试，可以做最小修复并记录“修复前证据、修复范围、修复后继续测试”。P2/P3 不在本轮中途修。

## 输出

最终输出一份真实 E2E 审计报告，包含：

- 测试环境：日期、git commit、home 路径、daemon/Web URL、engine readiness、关键版本。
- 流程矩阵：HR/QA、CLI/Web、Codex/Claude Code、桌面/窄屏的覆盖情况。
- 通过项：附关键证据路径或截图。
- 缺陷清单：严重度、标题、复现步骤、实际结果、期望结果、证据、建议归属。
- 优化项清单：影响、建议、优先级。
- 未覆盖项与原因。
- 后续建议：哪些问题需要立即修复，哪些适合进入 PMA task/plan。

## 验收标准

本轮验收标准不是“所有流程无 bug”，而是：

- 真实 home、真实 daemon、真实 Web、真实 Codex/Claude Code 至少被完整尝试。
- Web 检查成为主路径，且覆盖桌面和窄屏。
- 至少一条 CLI 路径和一条 Web 路径完成到 session/turn 层，除非 P0/P1 阻塞并已有证据。
- 每个失败都有证据和分级，不用 smoke PASS 替代真实观察。
- 不破坏 Host/Soul 边界，不引入 Host-owned 领域工作流。
- 测试产生的写入限制在 AIWorker workspace 内，真实 home 不被无记录地清理或重置。

