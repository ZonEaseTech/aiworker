# 真实流程 E2E 审计设计

## 背景

AIWorker 当前定位是 Local Shell + Engine Bridge for Soul Apps。当前默认
operator 路径是：

```text
AIWorker -> Soul App -> workspace -> session -> app-owned work
```

本次审计使用真实本地开发路径和真实外部 engine。它不是冒烟测试，不使用模拟场景，也不使用
测试夹具替代官方 HR/QA Soul App。

源码 dev 模式负责 home 选择。审计通过正常 dev 路径启动 AIWorker，例如 `bun run dev`，并记录
产品实际解析到的 home、数据库、pid/log 文件和 worker 路径。源码 dev 路径不显式设置
`AIWORKER_HOME`，因为 dev 模式默认已经落到 `~/.aiworker-dev`。

## 目标

- 覆盖真实 CLI、local daemon API、Host Web Shell、官方 HR/QA Soul App、mounted micro-app
  surface、workspace/session locator 和 engine bridge。
- 使用 operator 已经完成本地鉴权的 Codex 和 Claude Code 跑真实流程。
- 把 Web 作为重点审计面，覆盖布局、交互、响应式、状态恢复和视觉回归。
- 收集 bug 和优化项，保留可复查证据，而不是停在 pass/fail 冒烟结果。
- 保持 `docs/architecture.md` 中的 Host/Soul 边界：Host 负责 locate、mount 和 bridge；
  Soul App 拥有领域 UI/API 与 app-owned work。

## 非目标

- 不清空或重建 `~/.aiworker-dev`。
- 不使用临时 fake home、mock engine、mock session 或测试专用 Soul App fixture。
- 测试时不把 Host 拉回领域工作流、配置中心或通用 agent runtime。
- 审计过程中不修 P2/P3 问题，只记录证据。
- 不删除已有用户数据。新增审计对象必须使用清晰可识别的命名。

## 环境与命名

审计证据目录：

```text
tmp/real-e2e-audit-2026-05-25/
```

新增对象使用稳定命名，方便识别审计状态，例如：

```text
e2e-hr-codex-20260525
e2e-hr-claude-20260525
e2e-qa-web-20260525
```

最终报告必须列出本次创建的每个 worker、workspace 和 session，能拿到 id/path 时一并记录。

## 测试矩阵

### 1. 基线采集

采集：

- `git status --short` 和最近 commit。
- Bun、Node、Codex、Claude Code binary/readiness 信息。
- 既有 daemon、tmux、pid/log 和端口状态。
- 实际 dev-mode home、数据库路径、worker root 和 app registry 状态。
- `~/.aiworker-dev` 中与测试相关的既有 workers、workspaces 和 sessions；只记录，不删除。

### 2. Local Daemon 与 API 生命周期

通过正常源码 dev 路径启动 AIWorker。验证：

- `/health`
- `/api/local/settings`
- `/api/local/settings/engines`
- `/api/local/workers`
- `/api/local/workspaces`
- `/api/local/sessions`
- `/openapi.json`
- `/docs`

确认官方 HR/QA Soul App 是通过 lifecycle bootstrap 安装/启用，而不是被 Host 当作内置领域模块。

### 3. CLI Operator 路径

使用真实 CLI surface：

- 检查 app lifecycle 状态。
- 创建或选择 HR 与 QA Soul worker。
- 创建 workspace。
- 启动 session。
- 用受支持的命令和 API 交叉检查 session。

不要使用 `session list --worker`，因为 CLI 不支持这个选项。需要按 worker 检查 session 时，使用
普通 `session list` 加 API/JSON 过滤。

### 4. Codex 成功路径

跑一个真实 Codex session，在选中的 AIWorker workspace 内写入轻量 artifact，例如：

```text
artifacts/e2e-codex-20260525.md
```

验证：

- artifact 存在于 workspace 内。
- session events 进入终态成功状态。
- CLI、API 和 Web timeline 的状态一致。
- mounted Soul App surface 正确反映 workspace/session context，且 Host 没有解释领域状态。

### 5. Web 产品路径

用 browser automation 访问真实本地 Host Web Shell。至少覆盖 desktop 和窄屏 viewport：

- Host shell 与 left panel。
- Settings 和 engine readiness。
- Worker Configuration。
- HR mounted micro-app。
- QA mounted micro-app。
- workspace 选择和 session 选择。
- session timeline 与 composer。
- 已完成 session 状态。
- 失败或 timeout session 状态。

Browser 审查必须主动寻找：

- 横向溢出。
- 文本裁切或重叠。
- 控件不可达。
- disabled 控件缺少明确恢复路径。
- 状态文案误导。
- 终态失败后仍显示 spinner 或 running 状态。
- theme 不一致。
- 过度嵌套边框、异常 radius 或 framed surface。
- micro-app mount 闪烁、空白状态或 stale context。

### 6. Claude Code Web-Originated 路径

从 Web 选择或确认 Claude Code 作为真实本地 engine，并启动一个真实 session，在 workspace 内写入
轻量 artifact，例如：

```text
artifacts/e2e-claude-code-20260525.md
```

如果运行失败或超时，必须按证据分类，不能直接归为外部噪声。采集：

- session event stream。
- turn details 和 terminal error。
- daemon log excerpt。
- artifact 是否创建。
- API final state。
- Web status、timeline、composer 和 recovery controls。

需要回归检查的已知点包括 300s daemon timeout、process exit code 143、artifact 缺失、失败后 Web
仍暗示 running/requesting，以及 composer disabled 且没有明确恢复路径。

### 7. 证据采集

证据写入：

```text
tmp/real-e2e-audit-2026-05-25/
  commands/
  api/
  browser/
  screenshots/
  logs/
  artifacts/
  final-report.md
  findings.md
```

证据包括命令 stdout/stderr/exit code、API snapshots、DOM dumps、layout JSON、稳定截图、
console/network 摘要、daemon logs、focused error scans 和 artifact path indexes。不要复制
secret 或外部 engine auth 文件。

## 错误处理

- P0/P1 blocker 包括 dev stack 启动失败、daemon/API 不可用、Web 空白或不可操作、HR/QA mount
  失败、完全无法启动真实 session。先保留证据，再判断是否做最小修复、绕过或停止审计。
- P2/P3 问题不在审计中途修复，除非它阻断后续证据采集。
- engine 失败不能自动视为外部问题。审计必须分离 engine 执行失败和 AIWorker 对 session
  状态、event recording、artifact visibility 与 Web recovery 的责任。
- browser 工具失败与产品失败分开分类。如果 Playwright 截图、DOM dump 或 layout JSON 已能证明
  产品状态，则 in-app Browser 截图超时归为采集噪声。

## Findings 分级

- `P0`：核心产品路径无法启动或无法访问。
- `P1`：普通 operator 的真实 session、mounted app 或恢复路径被阻塞。
- `P2`：重要 UX、状态、布局或合同问题，但存在 workaround。
- `P3`：polish、observability、文案或诊断优化。

每个 finding 必须包含：

- severity。
- surface。
- reproduction path。
- actual behavior。
- expected behavior。
- evidence files。
- impact。
- suggested next step。

## 交付物

`final-report.md` 汇总：

- 环境和实际使用的 home。
- 执行过的命令和 browser 路径。
- 创建的 workers/workspaces/sessions。
- 成功路径。
- 失败或 partial 路径。
- evidence index。
- 推荐后续处理顺序。

`findings.md` 作为 findings ledger，使用稳定 evidence 文件引用。最终聊天回复只总结最高信号结果，
并指向两份报告文件。

## 审批门

本设计获批后，使用 Superpowers writing-plans workflow 创建详细执行计划。执行计划写好并获批前，
不启动真实 E2E 审计。
