# 真实流程 E2E 第 5 轮审计设计

## 背景

AIWorker 当前架构合同是 Local Shell + Engine Bridge for Soul Apps，默认产品路径是：

```text
AIWorker -> Soul App -> workspace -> session -> app-owned work
```

第 5 轮审计继续使用真实本机环境和真实外部 engine 鉴权，不使用 fake home、mock engine、mock
session 或测试专用 Soul App。主路径使用 `/Users/ben/.aiworker-dev`，安装态
`/Users/ben/.aiworker` 只做 bounded 参照，避免把一次源码 dev 审计变成两个完整矩阵。

用户已经明确要求直接执行完整采集，因此本设计不再追加阻塞性澄清问题；若执行中遇到 P0/P1
阻断，先完整留证，再只做解除阻塞所需的最小修复或改道采集。

## 目标

- 覆盖真实 CLI、local daemon API、Host Web Shell、官方 HR/QA Soul App、mounted micro-app
  surface、workspace/session locator 和 engine bridge。
- 使用本机已鉴权的 Codex 与 Claude Code 跑真实 operator 流程。
- Web 是重点审计面，必须覆盖 desktop 与 390px narrow viewport。
- 主动采集 bug 与优化项，不以 smoke pass 作为验收标准。
- 回归第四轮 P2/P3：session 顶层状态、CLI engine selection、HR composer 默认 capability、
  Worker Configuration 窄屏裁切、Host/Soul theme 不一致、stale poller、Claude 日期漂移。
- 保持 Host/Soul 边界：Host 只 locate/mount/bridge，不解释领域状态，不补 Soul-owned UI。

## 非目标

- 不清空、不重建、不迁移 `/Users/ben/.aiworker-dev` 或 `/Users/ben/.aiworker`。
- 不删除既有 worker/workspace/session。
- 不把 HR/QA 或 universal workbench 变成 Host-owned renderer。
- 不在审计中途修 P2/P3；只登记证据和建议。
- 不复制 secret、engine auth profile、raw token 或外部账号数据到证据目录。

## 证据目录与命名

本轮证据目录：

```text
tmp/real-e2e-audit-2026-05-26-round5/
```

新增对象使用稳定前缀：

```text
e2e-r5-hr-codex-20260526
e2e-r5-hr-claude-cli-20260526
e2e-r5-hr-web-claude-20260526
e2e-r5-qa-web-20260526
```

真实 workspace artifact 只写入对应 AIWorker workspace，例如：

```text
artifacts/e2e-r5-codex-20260526.md
artifacts/e2e-r5-claude-cli-20260526.md
artifacts/e2e-r5-web-claude-20260526.md
```

## 审计矩阵

### 1. Baseline

记录 repo 状态、当前 commit、Bun/Node/Codex/Claude Code readiness、端口监听、tmux/dev
service、真实 home 文件概况、API baseline 和 installed-home bounded baseline。

### 2. CLI 与 API

使用真实 CLI surface 完成 official app bootstrap、worker create、workspace create、session start
和 session show/list。API 用 `/health`、`/openapi.json`、`/docs`、settings、engines、workers、
workspaces、sessions 做交叉验证。

### 3. Codex 路径

创建 HR worker/workspace/session，使用 Codex 写入轻量 workspace artifact。验证 artifact 路径、
session event、turn 状态、CLI/API/Web 可见状态和 session 顶层状态语义。

### 4. Claude Code CLI 路径

明确记录 `engine select claude-code` 或 worker/session-level engine 选择的实际效果。若 CLI
仍静默使用 Codex，登记为 engine precedence/UX finding；若能用 Claude Code，验证 artifact、
turn 和 session 状态。

### 5. Web HR 路径

通过真实 Host Web 打开 HR worker/workspace/mounted surface，覆盖 desktop 和 390px。检查
composer 默认 capability、Start 可用性、session timeline、成功/失败恢复、theme 传播、console
warn/error、layout 裁切、micro-app URL context、stale session poller。

### 6. Web Claude Code 路径

从 Web 发起真实 Claude Code session，在 workspace 内写 artifact。若失败或超时，分离 engine
执行失败、AIWorker event/status 记录、Web recovery 控件、artifact visibility 和日志责任。

### 7. Web QA 路径

通过真实 Host Web 打开 QA worker/workspace/mounted surface，覆盖 desktop 和 390px。检查 QA
locator correctness、release/test-suite 业务对象可见性、Host/Soul theme、layout compression、
console/network 异常和 Worker Configuration 边界。

### 8. Worker Configuration 与边界

HR 与 QA 都需要打开 Worker Configuration，记录 desktop 与 390px 状态。结合可见截图、DOM、
layout JSON、dialog textContent 和 outerHTML scan，检查是否出现 workspace/session/domain
配置泄漏，是否还有 entry-file detail controls offscreen。

## 证据要求

证据目录结构：

```text
tmp/real-e2e-audit-2026-05-26-round5/
  README.md
  e2e-env.sh
  commands/
  api/
  browser/
  screenshots/
  logs/
  artifacts/
  findings.md
  final-report.md
```

每个 finding 必须包含 severity、surface、reproduction、actual、expected、evidence、impact 和
suggested next step。最终报告必须列出创建的 worker/workspace/session、成功路径、失败或 partial
路径、证据索引和推荐处理顺序。

## 错误处理

- P0/P1：dev stack 不可用、API/Web 不可访问、official app mount 失败、真实 session 完全无法发起、
  Web 关键路径不可操作。先留证，再做最小 unblock 或记录停止点。
- P2/P3：只登记，不中途修复。
- Browser 工具失败和产品失败分开分类；若 in-app Browser 截图失败，使用稳定 DOM/layout/console 和
  Playwright-style fallback 证据补齐。
- Engine 失败不能自动归咎外部工具；必须同时记录 AIWorker 的 status、event、artifact 和 recovery
  表现。

## 交付物

- `tmp/real-e2e-audit-2026-05-26-round5/findings.md`
- `tmp/real-e2e-audit-2026-05-26-round5/final-report.md`
- 关键 screenshots、DOM/layout JSON、console/network 摘要、API snapshots、daemon/dev logs、
  artifact path indexes。
- 聊天最终回复只总结最高信号结果，并指向报告文件。

## 设计自审

- 无占位符：路径、对象前缀、artifact 名称、severity 和交付物均已固定。
- 边界一致：Host 只负责 shell/locator/mount/bridge，HR/QA 领域 UI 与 artifact 归 Soul App。
- 范围收敛：本轮是真实 E2E 采集，不包含 P2/P3 修复。
- 歧义消解：`/Users/ben/.aiworker-dev` 是主审计 home，`/Users/ben/.aiworker` 是 installed-home
  bounded 参照。
