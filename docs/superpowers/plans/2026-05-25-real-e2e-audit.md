# 真实流程 E2E 审计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用真实 dev 默认 home、真实 daemon/Web、官方 HR/QA Soul App、Codex 与 Claude Code 本地鉴权环境，完成一次非冒烟的 AIWorker E2E 审计并产出可复查证据。

**Architecture:** 这是审计执行计划，不是产品代码实现计划。执行过程通过正常源码 dev 路径启动 AIWorker，不显式设置 `AIWORKER_HOME`，并把 CLI、API、Web、browser、engine、log 证据统一写入 `tmp/real-e2e-audit-2026-05-25/`。除非 P0/P1 阻断后续审计，否则只记录问题，不在审计中途修复产品代码。

**Tech Stack:** Bun, AIWorker CLI, AIWorker local daemon, Host Web Shell, official HR/QA Soul Apps, Browser/Playwright, Codex CLI, Claude Code CLI, shell evidence capture.

---

## File Structure

- Create: `tmp/real-e2e-audit-2026-05-25/README.md`
  - 审计 ledger，记录时间、commit、实际 home、服务 URL、对象 id、证据索引。
- Create: `tmp/real-e2e-audit-2026-05-25/e2e-env.sh`
  - 本次审计创建或选择的 worker/workspace/session id 与路径。只存非 secret metadata。
- Create: `tmp/real-e2e-audit-2026-05-25/commands/`
  - CLI、dev lifecycle、curl、进程检查的 stdout/stderr/exit code。
- Create: `tmp/real-e2e-audit-2026-05-25/api/`
  - `/health`、settings、workers、workspaces、sessions、OpenAPI 等 JSON snapshots。
- Create: `tmp/real-e2e-audit-2026-05-25/browser/`
  - Browser/Playwright 的 DOM dumps、layout JSON、console/network 摘要。
- Create: `tmp/real-e2e-audit-2026-05-25/screenshots/`
  - desktop、narrow、settings、Worker Configuration、HR/QA mounted、success/failure state 稳定截图。
- Create: `tmp/real-e2e-audit-2026-05-25/logs/`
  - daemon/tmux/dev log 摘录、focused error scan、端口监听状态。
- Create: `tmp/real-e2e-audit-2026-05-25/artifacts/`
  - 真实 workspace artifact 的路径索引和摘要，不复制 secret。
- Create: `tmp/real-e2e-audit-2026-05-25/findings.md`
  - 按 P0/P1/P2/P3 分级的 findings ledger。
- Create: `tmp/real-e2e-audit-2026-05-25/final-report.md`
  - 最终人工可读审计报告。
- Modify only if a P0/P1 blocker prevents the remaining audit:
  - 最小必要产品代码、对应测试、PMA/task/plan/changelog；此类修复必须先停下记录 blocker evidence。

## Execution Rules

- 源码 dev 路径禁止显式设置 `AIWORKER_HOME`。命令使用 `env -u AIWORKER_HOME -u WORKER_DB_PATH ...`，确保产品自己选择默认 `~/.aiworker-dev`。
- 不清空、不重建、不迁移 `~/.aiworker-dev`；只记录已有状态并创建可识别的 `e2e-...-20260525` 对象。
- 不删除用户已有 worker/workspace/session。
- Codex 与 Claude Code 的任务只能写入 AIWorker workspace 内的轻量 artifact。
- 不让 engine 读写 `/Users/ben/projects/aiworker`。
- `app smoke`、`web:smoke:mounted-surfaces` 等只能作为辅助证据，不能作为最终验收。
- P2/P3 问题只记录。P0/P1 blocker 先保留证据，再决定最小修复、绕过或停止。
- Browser evidence 必须覆盖 desktop 与 narrow viewport；不能只看命令行。

### Task 1: 准备证据目录与审计 ledger

**Files:**
- Create: `tmp/real-e2e-audit-2026-05-25/README.md`
- Create: `tmp/real-e2e-audit-2026-05-25/findings.md`
- Create: `tmp/real-e2e-audit-2026-05-25/e2e-env.sh`
- Create directories under: `tmp/real-e2e-audit-2026-05-25/`

- [ ] **Step 1: 创建证据目录**

Run:

```bash
mkdir -p tmp/real-e2e-audit-2026-05-25/{commands,api,browser,screenshots,logs,artifacts}
```

Expected: command exits `0`.

- [ ] **Step 2: 记录 repo 与工具基线**

Run:

```bash
{
  echo "# 真实流程 E2E 审计 2026-05-25"
  echo
  echo "## Baseline"
  date
  git rev-parse HEAD
  git status --short
  bun --version
  node --version
  command -v codex || true
  codex --version || true
  command -v claude || true
  claude --version || true
} 2>&1 | tee tmp/real-e2e-audit-2026-05-25/README.md
```

Expected: `README.md` 记录当前时间、commit、git 状态、Bun/Node 版本，以及 Codex/Claude Code binary 状态。

- [ ] **Step 3: 初始化 findings ledger**

Run:

```bash
cat > tmp/real-e2e-audit-2026-05-25/findings.md <<'EOF'
# Findings

## P0

## P1

## P2

## P3 / Optimizations

EOF
```

Expected: `findings.md` 具备四个 severity section。

- [ ] **Step 4: 初始化本次审计 env 文件**

Run:

```bash
cat > tmp/real-e2e-audit-2026-05-25/e2e-env.sh <<'EOF'
export E2E_AUDIT_DIR="tmp/real-e2e-audit-2026-05-25"
export E2E_HR_CODEX_WORKER_ID="e2e-hr-codex-20260525"
export E2E_HR_CLAUDE_WORKER_ID="e2e-hr-claude-20260525"
export E2E_QA_WEB_WORKER_ID="e2e-qa-web-20260525"
export E2E_CODEX_ARTIFACT="artifacts/e2e-codex-20260525.md"
export E2E_CLAUDE_ARTIFACT="artifacts/e2e-claude-code-20260525.md"
EOF
```

Expected: `e2e-env.sh` contains only deterministic ids and artifact names.

- [ ] **Step 5: 记录真实 home preflight，不做 mutation**

Run:

```bash
{
  echo "## AIWorker home preflight"
  echo "Expected source-dev default: $HOME/.aiworker-dev"
  echo
  test -d "$HOME/.aiworker-dev" && find "$HOME/.aiworker-dev" -maxdepth 3 -type f | sort | sed 's#^#dev: #' || true
  echo
  echo "Installed/default packaged home for reference: $HOME/.aiworker"
  test -d "$HOME/.aiworker" && find "$HOME/.aiworker" -maxdepth 2 -type f | sort | sed 's#^#install: #' || true
} 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/home-preflight.txt
```

Expected: preflight lists existing local files without deleting or editing anything.

### Task 2: 启动或连接真实 dev daemon/Web

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-25/commands/dev-status-before.txt`
- Write: `tmp/real-e2e-audit-2026-05-25/commands/dev-start.txt`
- Write: `tmp/real-e2e-audit-2026-05-25/api/*.json`
- Write: `tmp/real-e2e-audit-2026-05-25/logs/listeners-before.txt`

- [ ] **Step 1: 记录端口监听状态**

Run:

```bash
{
  echo "## LISTEN 9217"
  lsof -nP -iTCP:9217 -sTCP:LISTEN || true
  echo
  echo "## LISTEN 5173"
  lsof -nP -iTCP:5173 -sTCP:LISTEN || true
} 2>&1 | tee tmp/real-e2e-audit-2026-05-25/logs/listeners-before.txt
```

Expected: output records whether API `9217` and Web `5173` are already listening.

- [ ] **Step 2: 检查 dev status**

Run:

```bash
env -u AIWORKER_HOME -u WORKER_DB_PATH bun run dev:status 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/dev-status-before.txt
```

Expected: command records current dev services. If it fails because services are down, keep output and continue to Step 3.

- [ ] **Step 3: 如需要则启动 dev stack**

If Step 1/2 show API/Web are not both usable, run:

```bash
tmux new-session -d -s aiworker-e2e-20260525 'cd /Users/ben/projects/aiworker && env -u AIWORKER_HOME -u WORKER_DB_PATH bun run dev 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/dev-start.txt'
```

Expected: tmux session `aiworker-e2e-20260525` starts. If tmux reports the session already exists, capture it:

```bash
tmux capture-pane -pt aiworker-e2e-20260525 -S -2000 > tmp/real-e2e-audit-2026-05-25/commands/dev-start-existing-pane.txt || true
```

If tmux is unavailable, run:

```bash
setsid bash -lc 'cd /Users/ben/projects/aiworker && env -u AIWORKER_HOME -u WORKER_DB_PATH bun run dev > tmp/real-e2e-audit-2026-05-25/commands/dev-start.txt 2>&1' &
echo $! | tee tmp/real-e2e-audit-2026-05-25/commands/dev-start.pid
```

- [ ] **Step 4: 等待 health**

Run:

```bash
for i in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:9217/health | tee tmp/real-e2e-audit-2026-05-25/api/health.txt; then
    exit 0
  fi
  sleep 0.5
done
exit 1
```

Expected: `/health` returns before timeout. Failure is a P0 blocker; append a finding before deciding whether to stop.

- [ ] **Step 5: 记录 API baseline**

Run:

```bash
curl -fsS http://127.0.0.1:9217/api/local/settings | tee tmp/real-e2e-audit-2026-05-25/api/settings.json
curl -fsS http://127.0.0.1:9217/api/local/settings/engines | tee tmp/real-e2e-audit-2026-05-25/api/settings-engines.json
curl -fsS http://127.0.0.1:9217/api/local/workers | tee tmp/real-e2e-audit-2026-05-25/api/workers-before.json
curl -fsS http://127.0.0.1:9217/api/local/workspaces | tee tmp/real-e2e-audit-2026-05-25/api/workspaces-before.json
curl -fsS http://127.0.0.1:9217/api/local/sessions | tee tmp/real-e2e-audit-2026-05-25/api/sessions-before.json
curl -fsS http://127.0.0.1:9217/openapi.json | tee tmp/real-e2e-audit-2026-05-25/api/openapi.json >/dev/null
curl -fsS -I http://127.0.0.1:9217/docs | tee tmp/real-e2e-audit-2026-05-25/api/docs.headers
```

Expected: all endpoints return successfully. Engine readiness may show failures, but the JSON must be captured.

- [ ] **Step 6: 记录 dev 模式实际 home**

Run:

```bash
{
  echo "## dev log home evidence"
  rg -n "AIWORKER_HOME|\\.aiworker-dev|aiworker.db|web:|api:" tmp/real-e2e-audit-2026-05-25/commands/dev-start.txt tmp/real-e2e-audit-2026-05-25/commands/dev-status-before.txt 2>/dev/null || true
  echo
  echo "## source CLI default paths"
  env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts daemon status || true
} 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/dev-home-evidence.txt
```

Expected: evidence shows the source dev path resolves to `~/.aiworker-dev` or records enough data to diagnose otherwise.

### Task 3: CLI operator 路径与 Codex 成功路径

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-25/commands/cli-*.txt`
- Append: `tmp/real-e2e-audit-2026-05-25/e2e-env.sh`
- Write: `tmp/real-e2e-audit-2026-05-25/artifacts/codex-artifact-index.txt`

- [ ] **Step 1: bootstrap 官方 Soul Apps**

Run:

```bash
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts app bootstrap official 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/cli-bootstrap-official.txt
```

Expected: command exits `0` or reports official apps are already installed/enabled without corrupting state.

- [ ] **Step 2: 记录 app list 与 template list**

Run:

```bash
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts app list 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/cli-app-list.txt
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts template list --soul aiworker-hr 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/cli-template-list-hr.txt
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts template list --soul aiworker-qa 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/cli-template-list-qa.txt
```

Expected: `aiworker-hr` and `aiworker-qa` are visible; HR exposes `aiworker-hr.person-profile`; QA exposes at least one QA template.

- [ ] **Step 3: 创建或复用 HR Codex worker**

Run:

```bash
source tmp/real-e2e-audit-2026-05-25/e2e-env.sh
if ! env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts worker create --id "$E2E_HR_CODEX_WORKER_ID" --soul aiworker-hr --name e2e-hr-codex 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/cli-worker-create-hr-codex.txt; then
  env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts worker show "$E2E_HR_CODEX_WORKER_ID" 2>&1 | tee -a tmp/real-e2e-audit-2026-05-25/commands/cli-worker-create-hr-codex.txt
fi
```

Expected: deterministic HR worker exists or is created.

- [ ] **Step 4: 创建 HR Codex workspace 并保存 id/path**

Run:

```bash
source tmp/real-e2e-audit-2026-05-25/e2e-env.sh
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts workspace create --worker "$E2E_HR_CODEX_WORKER_ID" --name e2e-hr-codex-workspace 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/cli-workspace-create-hr-codex.txt
bun -e 'const fs=require("node:fs"); const text=fs.readFileSync("tmp/real-e2e-audit-2026-05-25/commands/cli-workspace-create-hr-codex.txt","utf8"); const start=text.indexOf("{"); if (start < 0) throw new Error("workspace JSON not found"); const json=JSON.parse(text.slice(start)); const ws=json.workspace; fs.appendFileSync("tmp/real-e2e-audit-2026-05-25/e2e-env.sh", `export E2E_HR_CODEX_WORKSPACE_ID=${JSON.stringify(ws.id)}\nexport E2E_HR_CODEX_WORKSPACE_PATH=${JSON.stringify(ws.rootPath)}\n`);'
```

Expected: `e2e-env.sh` now contains `E2E_HR_CODEX_WORKSPACE_ID` and `E2E_HR_CODEX_WORKSPACE_PATH`.

- [ ] **Step 5: 通过 CLI 启动真实 Codex session**

Run:

```bash
source tmp/real-e2e-audit-2026-05-25/e2e-env.sh
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts session start \
  --worker "$E2E_HR_CODEX_WORKER_ID" \
  --workspace "$E2E_HR_CODEX_WORKSPACE_ID" \
  --skill aiworker-hr.person-profile \
  --title "E2E Codex audit 20260525" \
  --input "E2E audit task: only inside this AIWorker workspace, create $E2E_CODEX_ARTIFACT with app id aiworker-hr, workspace id $E2E_HR_CODEX_WORKSPACE_ID, and one short conclusion. Do not read or modify /Users/ben/projects/aiworker. Do not write secrets." \
  2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/cli-session-start-codex.txt
```

Expected: command creates a real session/turn. If it fails or times out, record a P1 finding with command output and continue only if other audit paths remain possible.

- [ ] **Step 6: 保存 Codex session id**

Run:

```bash
bun -e 'const fs=require("node:fs"); const text=fs.readFileSync("tmp/real-e2e-audit-2026-05-25/commands/cli-session-start-codex.txt","utf8"); const match=text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i); if (!match) throw new Error("session id not found in codex output"); fs.appendFileSync("tmp/real-e2e-audit-2026-05-25/e2e-env.sh", `export E2E_CODEX_SESSION_ID=${JSON.stringify(match[0])}\n`);'
```

Expected: `e2e-env.sh` now contains `E2E_CODEX_SESSION_ID`.

- [ ] **Step 7: 验证 Codex artifact 与状态**

Run:

```bash
source tmp/real-e2e-audit-2026-05-25/e2e-env.sh
{
  echo "workspace=$E2E_HR_CODEX_WORKSPACE_PATH"
  echo "artifact=$E2E_HR_CODEX_WORKSPACE_PATH/$E2E_CODEX_ARTIFACT"
  test -f "$E2E_HR_CODEX_WORKSPACE_PATH/$E2E_CODEX_ARTIFACT"
  sed -n '1,120p' "$E2E_HR_CODEX_WORKSPACE_PATH/$E2E_CODEX_ARTIFACT"
} 2>&1 | tee tmp/real-e2e-audit-2026-05-25/artifacts/codex-artifact-index.txt
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts session list 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/cli-session-list-after-codex.txt
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts session show "$E2E_CODEX_SESSION_ID" 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/cli-session-show-codex.txt
```

Expected: artifact exists and session state is terminal successful. Missing artifact or inconsistent state is a finding.

### Task 4: QA worker/workspace locator 与 API 状态覆盖

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-25/commands/cli-worker-create-qa.txt`
- Write: `tmp/real-e2e-audit-2026-05-25/commands/cli-workspace-create-qa.txt`
- Append: `tmp/real-e2e-audit-2026-05-25/e2e-env.sh`
- Write: `tmp/real-e2e-audit-2026-05-25/api/*-after-cli.json`

- [ ] **Step 1: 创建或复用 QA worker**

Run:

```bash
source tmp/real-e2e-audit-2026-05-25/e2e-env.sh
if ! env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts worker create --id "$E2E_QA_WEB_WORKER_ID" --soul aiworker-qa --name e2e-qa-web 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/cli-worker-create-qa.txt; then
  env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts worker show "$E2E_QA_WEB_WORKER_ID" 2>&1 | tee -a tmp/real-e2e-audit-2026-05-25/commands/cli-worker-create-qa.txt
fi
```

Expected: deterministic QA worker exists or is created.

- [ ] **Step 2: 创建 QA workspace 并保存 id/path**

Run:

```bash
source tmp/real-e2e-audit-2026-05-25/e2e-env.sh
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts workspace create --worker "$E2E_QA_WEB_WORKER_ID" --name e2e-qa-web-workspace 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/cli-workspace-create-qa.txt
bun -e 'const fs=require("node:fs"); const text=fs.readFileSync("tmp/real-e2e-audit-2026-05-25/commands/cli-workspace-create-qa.txt","utf8"); const start=text.indexOf("{"); if (start < 0) throw new Error("workspace JSON not found"); const json=JSON.parse(text.slice(start)); const ws=json.workspace; fs.appendFileSync("tmp/real-e2e-audit-2026-05-25/e2e-env.sh", `export E2E_QA_WORKSPACE_ID=${JSON.stringify(ws.id)}\nexport E2E_QA_WORKSPACE_PATH=${JSON.stringify(ws.rootPath)}\n`);'
```

Expected: `e2e-env.sh` contains `E2E_QA_WORKSPACE_ID` and `E2E_QA_WORKSPACE_PATH`.

- [ ] **Step 3: 采集 CLI 后 API 状态**

Run:

```bash
curl -fsS http://127.0.0.1:9217/api/local/workers | tee tmp/real-e2e-audit-2026-05-25/api/workers-after-cli.json
curl -fsS http://127.0.0.1:9217/api/local/workspaces | tee tmp/real-e2e-audit-2026-05-25/api/workspaces-after-cli.json
curl -fsS http://127.0.0.1:9217/api/local/sessions | tee tmp/real-e2e-audit-2026-05-25/api/sessions-after-cli.json
```

Expected: API state includes the HR/QA workers and workspaces created above.

### Task 5: Browser-heavy Web 产品审计

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-25/browser/*.json`
- Write: `tmp/real-e2e-audit-2026-05-25/browser/*.md`
- Write: `tmp/real-e2e-audit-2026-05-25/screenshots/*.png`
- Append: `tmp/real-e2e-audit-2026-05-25/findings.md`

- [ ] **Step 1: 打开真实 Host Web**

Use the Browser plugin or Playwright to open:

```text
http://127.0.0.1:9217/
```

Expected: Host Web Shell loads without blank screen. If the in-app Browser is unavailable, run Playwright in Step 2 and record the fallback in `browser/web-audit-summary.md`.

- [ ] **Step 2: 创建 Playwright evidence script**

Run:

```bash
cat > tmp/real-e2e-audit-2026-05-25/browser/capture-web-state.mjs <<'EOF'
import { chromium } from 'playwright'
import fs from 'node:fs/promises'

const out = 'tmp/real-e2e-audit-2026-05-25'
const url = 'http://127.0.0.1:9217/'
const viewports = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'narrow', width: 390, height: 844 },
]

const browser = await chromium.launch({ headless: true })
for (const viewport of viewports) {
  const page = await browser.newPage({ viewport })
  const consoleMessages = []
  const pageErrors = []
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }))
  page.on('pageerror', err => pageErrors.push({ message: err.message, stack: err.stack }))
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.screenshot({ path: `${out}/screenshots/web-${viewport.name}-initial.png`, fullPage: true })
  const layout = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    const buttons = [...document.querySelectorAll('button,[role="button"],a,input,textarea,select')].map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        tag: el.tagName,
        text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().slice(0, 120),
        disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
        visible: rect.width > 0 && rect.height > 0,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      }
    })
    const microApps = [...document.querySelectorAll('micro-app')].map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        name: el.getAttribute('name'),
        url: el.getAttribute('url'),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      }
    })
    return {
      title: document.title,
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      scroll: { docWidth: doc.scrollWidth, clientWidth: doc.clientWidth, bodyWidth: body.scrollWidth },
      hasHorizontalOverflow: Math.max(doc.scrollWidth, body.scrollWidth) > doc.clientWidth + 1,
      bodyText: body.innerText.slice(0, 8000),
      buttons,
      microApps,
    }
  })
  await fs.writeFile(`${out}/browser/web-${viewport.name}-layout.json`, JSON.stringify(layout, null, 2))
  await fs.writeFile(`${out}/browser/web-${viewport.name}-console.json`, JSON.stringify({ consoleMessages, pageErrors }, null, 2))
  await page.close()
}
await browser.close()
EOF
```

Expected: `capture-web-state.mjs` is created under `tmp/`; it does not modify product code.

- [ ] **Step 3: 运行 Playwright 初始截图与 layout 检查**

Run:

```bash
node tmp/real-e2e-audit-2026-05-25/browser/capture-web-state.mjs 2>&1 | tee tmp/real-e2e-audit-2026-05-25/browser/capture-web-state.log
```

Expected: screenshots and layout JSON are generated. If Playwright is missing, run `bunx playwright install chromium` only after recording the missing dependency in `browser/capture-web-state.log`.

- [ ] **Step 4: 人工/Browser 检查关键 Web surfaces**

Use Browser or Playwright interactions to inspect:

```text
Host shell
left panel
Settings
Engine readiness
Worker Configuration
HR mounted micro-app
QA mounted micro-app
workspace/session selection
Codex completed session timeline
composer enabled/disabled states
```

For each inspected surface, write one short note into:

```text
tmp/real-e2e-audit-2026-05-25/browser/web-audit-summary.md
```

Expected: summary names the surface, viewport, pass/fail/concern, and evidence file. Any horizontal overflow, text overlap, unreachable control, stale mounted context, misleading state, or visual regression becomes a finding.

- [ ] **Step 5: 针对 Worker Configuration 做窄屏复查**

Use Browser or Playwright at `390x844` and capture:

```text
tmp/real-e2e-audit-2026-05-25/screenshots/worker-configuration-narrow.png
tmp/real-e2e-audit-2026-05-25/browser/worker-configuration-narrow-layout.json
```

Expected: dialog content remains usable without horizontal overflow, clipped text, unreachable buttons, or workspace/session configuration leakage. Any regression is P2 unless it blocks configuration entirely, then P1.

### Task 6: Claude Code Web-originated 真实 session 与失败恢复

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-25/commands/claude-*.txt`
- Write: `tmp/real-e2e-audit-2026-05-25/api/claude-*.json`
- Write: `tmp/real-e2e-audit-2026-05-25/browser/claude-*.json`
- Write: `tmp/real-e2e-audit-2026-05-25/screenshots/claude-*.png`
- Append: `tmp/real-e2e-audit-2026-05-25/e2e-env.sh`
- Append: `tmp/real-e2e-audit-2026-05-25/findings.md`

- [ ] **Step 1: 创建或复用 HR Claude worker**

Run:

```bash
source tmp/real-e2e-audit-2026-05-25/e2e-env.sh
if ! env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts worker create --id "$E2E_HR_CLAUDE_WORKER_ID" --soul aiworker-hr --name e2e-hr-claude 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/cli-worker-create-hr-claude.txt; then
  env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts worker show "$E2E_HR_CLAUDE_WORKER_ID" 2>&1 | tee -a tmp/real-e2e-audit-2026-05-25/commands/cli-worker-create-hr-claude.txt
fi
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts workspace create --worker "$E2E_HR_CLAUDE_WORKER_ID" --name e2e-hr-claude-workspace 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/cli-workspace-create-hr-claude.txt
bun -e 'const fs=require("node:fs"); const text=fs.readFileSync("tmp/real-e2e-audit-2026-05-25/commands/cli-workspace-create-hr-claude.txt","utf8"); const start=text.indexOf("{"); if (start < 0) throw new Error("workspace JSON not found"); const json=JSON.parse(text.slice(start)); const ws=json.workspace; fs.appendFileSync("tmp/real-e2e-audit-2026-05-25/e2e-env.sh", `export E2E_HR_CLAUDE_WORKSPACE_ID=${JSON.stringify(ws.id)}\nexport E2E_HR_CLAUDE_WORKSPACE_PATH=${JSON.stringify(ws.rootPath)}\n`);'
```

Expected: deterministic HR Claude worker/workspace exists and env values are recorded.

- [ ] **Step 2: 在 Web 中选择 Claude Code**

Use Browser to open Settings and choose Claude Code as the active local engine. Capture:

```text
tmp/real-e2e-audit-2026-05-25/screenshots/settings-claude-code-selected.png
tmp/real-e2e-audit-2026-05-25/browser/settings-claude-code-dom.json
```

Then run:

```bash
curl -fsS http://127.0.0.1:9217/api/local/settings/engines | tee tmp/real-e2e-audit-2026-05-25/api/settings-engines-after-claude-select.json
```

Expected: Web selection is visible; API settings reflect selected or available Claude Code state. If Web cannot select Claude Code but CLI/API can, record the Web issue before using fallback.

- [ ] **Step 3: 从 Web 发起 Claude Code session**

Use Browser to select the HR Claude worker/workspace and send this prompt through the Web composer:

```text
E2E audit task: only inside this AIWorker workspace, create artifacts/e2e-claude-code-20260525.md with app id aiworker-hr, the current workspace id, and one short conclusion. Do not read or modify /Users/ben/projects/aiworker. Do not write secrets.
```

Capture immediately after send:

```text
tmp/real-e2e-audit-2026-05-25/screenshots/claude-session-submitted.png
tmp/real-e2e-audit-2026-05-25/browser/claude-session-submitted-dom.json
```

Expected: session starts or the UI gives a clear actionable error. If no Web path can submit, classify it as P1.

- [ ] **Step 4: Poll sessions until Claude Code terminal state**

Run:

```bash
for i in $(seq 1 90); do
  curl -fsS http://127.0.0.1:9217/api/local/sessions | tee tmp/real-e2e-audit-2026-05-25/api/claude-sessions-poll-$i.json >/dev/null
  rg -n "e2e|claude|failed|completed|running|requesting" tmp/real-e2e-audit-2026-05-25/api/claude-sessions-poll-$i.json || true
  sleep 10
done 2>&1 | tee tmp/real-e2e-audit-2026-05-25/commands/claude-session-poll.txt
```

Expected: polling evidence captures completed, failed or long-running state. A 300s timeout/code 143 is a P1/P2 candidate depending on UI recovery and artifact outcome.

- [ ] **Step 5: 验证 Claude artifact 与失败态 UI**

Run:

```bash
source tmp/real-e2e-audit-2026-05-25/e2e-env.sh
{
  echo "workspace=$E2E_HR_CLAUDE_WORKSPACE_PATH"
  echo "artifact=$E2E_HR_CLAUDE_WORKSPACE_PATH/$E2E_CLAUDE_ARTIFACT"
  test -f "$E2E_HR_CLAUDE_WORKSPACE_PATH/$E2E_CLAUDE_ARTIFACT" && sed -n '1,120p' "$E2E_HR_CLAUDE_WORKSPACE_PATH/$E2E_CLAUDE_ARTIFACT" || echo "artifact missing"
} 2>&1 | tee tmp/real-e2e-audit-2026-05-25/artifacts/claude-artifact-index.txt
curl -fsS http://127.0.0.1:9217/api/local/sessions | tee tmp/real-e2e-audit-2026-05-25/api/sessions-after-claude.json
```

Expected: if artifact exists, verify Web timeline success. If artifact is missing or session failed, use Browser to capture failed-state screenshot/DOM and record whether composer is recoverable.

### Task 7: Final API/log/error scan 与报告

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-25/api/final-*.json`
- Write: `tmp/real-e2e-audit-2026-05-25/logs/final-*.txt`
- Write: `tmp/real-e2e-audit-2026-05-25/final-report.md`
- Update: `tmp/real-e2e-audit-2026-05-25/findings.md`

- [ ] **Step 1: 采集 final API 状态**

Run:

```bash
curl -fsS http://127.0.0.1:9217/health | tee tmp/real-e2e-audit-2026-05-25/api/final-health.txt
curl -fsS http://127.0.0.1:9217/api/local/settings | tee tmp/real-e2e-audit-2026-05-25/api/final-settings.json
curl -fsS http://127.0.0.1:9217/api/local/settings/engines | tee tmp/real-e2e-audit-2026-05-25/api/final-settings-engines.json
curl -fsS http://127.0.0.1:9217/api/local/workers | tee tmp/real-e2e-audit-2026-05-25/api/final-workers.json
curl -fsS http://127.0.0.1:9217/api/local/workspaces | tee tmp/real-e2e-audit-2026-05-25/api/final-workspaces.json
curl -fsS http://127.0.0.1:9217/api/local/sessions | tee tmp/real-e2e-audit-2026-05-25/api/final-sessions.json
```

Expected: final API snapshots are captured even if some product flows failed.

- [ ] **Step 2: 采集 logs 与 error scan**

Run:

```bash
{
  echo "## listeners"
  lsof -nP -iTCP:9217 -sTCP:LISTEN || true
  lsof -nP -iTCP:5173 -sTCP:LISTEN || true
  echo
  echo "## tmux"
  tmux capture-pane -pt aiworker-e2e-20260525 -S -3000 2>/dev/null || true
  echo
  echo "## home daemon log tail"
  tail -300 "$HOME/.aiworker-dev/aiworker-daemon.log" 2>/dev/null || true
} 2>&1 | tee tmp/real-e2e-audit-2026-05-25/logs/final-runtime-state.txt

rg -n "error|failed|timeout|exited|code 143|unhandled|overflow|disabled|requesting|running" tmp/real-e2e-audit-2026-05-25 2>&1 | tee tmp/real-e2e-audit-2026-05-25/logs/final-focused-error-scan.txt || true
```

Expected: final logs and focused scan exist. Raw matches are triaged into findings or dismissed as evidence noise.

- [ ] **Step 3: 写最终报告**

Run:

```bash
cat > tmp/real-e2e-audit-2026-05-25/final-report.md <<'EOF'
# 真实流程 E2E 审计报告

## 范围

- Home: source dev default, expected `~/.aiworker-dev`
- Daemon/Web: `http://127.0.0.1:9217/`
- Soul Apps: `aiworker-hr`, `aiworker-qa`
- Engines: Codex, Claude Code

## 创建对象

记录本次创建或复用的 worker/workspace/session id，并引用 `e2e-env.sh`。

## 执行摘要

列出 CLI、API、Web、Codex、Claude Code 各路径的成功、失败或 partial 状态。

## Web 审查摘要

列出 desktop/narrow、Settings、Worker Configuration、HR/QA mounted、session timeline、失败态的主要结论。

## 证据索引

- commands/
- api/
- browser/
- screenshots/
- logs/
- artifacts/

## Findings 摘要

引用 `findings.md` 中的 P0/P1/P2/P3。

## 推荐后续顺序

先处理 P0/P1，再处理影响真实 operator 的 P2，最后处理 P3 polish/observability。
EOF
```

Expected: report skeleton exists and must be filled with actual evidence before completion. Do not leave skeleton text unchanged in final state.

- [ ] **Step 4: 用实际结果填充报告和 findings**

Edit `tmp/real-e2e-audit-2026-05-25/final-report.md` and `tmp/real-e2e-audit-2026-05-25/findings.md` with the collected evidence. Every finding must include:

```text
- Severity:
- Surface:
- Reproduction:
- Actual:
- Expected:
- Evidence:
- Impact:
- Suggested next step:
```

Expected: no finding is vague, and each one points to at least one evidence file.

- [ ] **Step 5: 最终自检**

Run:

```bash
test -s tmp/real-e2e-audit-2026-05-25/final-report.md
test -s tmp/real-e2e-audit-2026-05-25/findings.md
rg -n "记录本次创建|列出 CLI|skeleton|待补|占位" tmp/real-e2e-audit-2026-05-25/final-report.md tmp/real-e2e-audit-2026-05-25/findings.md && exit 1 || true
git status --short
```

Expected: final files are non-empty, no placeholder/skeleton text remains, and git status is understood. If only `tmp/` evidence changed, no code-review-graph is required. If product code changed for a blocker, run `bun run crg:update` and `bun run crg:review`.

### Task 8: Handoff And Execution Choice

**Files:**
- Read: `tmp/real-e2e-audit-2026-05-25/final-report.md`
- Read: `tmp/real-e2e-audit-2026-05-25/findings.md`

- [ ] **Step 1: Summarize only high-signal outcomes**

Final response must include:

```text
- 审计是否完成真实 CLI/API/Web/engine 路径
- Codex 成功路径结果
- Claude Code Web-originated 路径结果
- 最高严重度 findings
- final-report.md 与 findings.md 路径
- 未能运行或不可靠的验证项
```

Expected: final response does not paste the full report and does not claim a green result if real failures exist.

- [ ] **Step 2: Leave services state explicit**

If the dev stack was started during the audit, state whether it remains running in `tmux` or was stopped. If it was already running before the audit, do not stop it.

Expected: user can inspect live state or knows which process/session to clean up.

## Self-Review Checklist

- Spec coverage:
  - Real dev default home without explicit `AIWORKER_HOME`: Task 2 and Execution Rules.
  - CLI lifecycle and official app bootstrap: Task 3.
  - API evidence: Tasks 2, 4, 7.
  - Browser-heavy Web audit: Task 5.
  - Codex success path: Task 3.
  - Claude Code Web-originated path and failure recovery: Task 6.
  - Findings and final report: Task 7.
  - No P2/P3 mid-audit fixes: Execution Rules and Task 7.
- Placeholder scan:
  - The report skeleton in Task 7 is explicitly required to be replaced before completion.
  - No plan step uses undefined ids; all dynamic ids are captured in `e2e-env.sh`.
- Command safety:
  - No `kill $(lsof -ti:PORT)` pattern.
  - No deletion of `~/.aiworker-dev`.
  - No copying of auth files or secrets.
