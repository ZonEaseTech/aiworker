# Real E2E Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用真实 `~/.aiworker-dev`、真实 Worker Web、官方 Soul Apps、Codex 和 Claude Code 跑一轮修复后 E2E 回归与 Web 体验深挖。

**Architecture:** 本计划是审计执行计划，不是产品代码实现。证据统一写入 `tmp/real-e2e-regression-2026-05-24/`，最终报告写入 `docs/superpowers/specs/2026-05-24-real-e2e-regression-report.md`。Host 仍只承担 start / shell / locate / mount / bridge；P0/P1 先完整留证，只有阻塞后续测试时才做最小修复。

**Tech Stack:** Bun, AIWorker CLI, local daemon/API, Worker Web, Codex CLI, Claude Code CLI, Browser plugin, curl, tmux, SQLite-backed `AIWORKER_HOME`.

---

## Scope Source

- Approved spec: `docs/superpowers/specs/2026-05-24-real-e2e-regression-design.md`
- Previous audit evidence: `tmp/real-e2e-audit-2026-05-24/`
- Active architecture: `docs/architecture.md#constraint-registry`
- Host skill contract: `.agents/skills/aiworker-host-dev/SKILL.md`
- Soul App skill contract: `.agents/skills/aiworker-soul-app-dev/SKILL.md`

## Scope Check

本计划覆盖一个审计项目：修复后真实 E2E 回归与 Web 深挖。CLI、Web、Soul App、engine 和安装态抽检都服务于同一个目标：验证当前真实 operator path 是否可用、可解释、可恢复。它不拆成多个独立实现计划，因为每个子路径都只产出证据和缺陷，不产出独立产品功能。

## File Structure

- Create: `tmp/real-e2e-regression-2026-05-24/README.md`
  - Run ledger: environment, commit, ports, service ownership, command index.
- Create: `tmp/real-e2e-regression-2026-05-24/findings.md`
  - Severity ledger for P0, P1, P2, P3 and optimization findings.
- Create: `tmp/real-e2e-regression-2026-05-24/e2e-env.sh`
  - Deterministic run ids, worker ids, workspace ids and workspace paths.
- Create directories:
  - `tmp/real-e2e-regression-2026-05-24/commands/`
  - `tmp/real-e2e-regression-2026-05-24/screenshots/`
  - `tmp/real-e2e-regression-2026-05-24/browser/`
  - `tmp/real-e2e-regression-2026-05-24/workspaces/`
- Create: `docs/superpowers/specs/2026-05-24-real-e2e-regression-report.md`
  - Final audit report with matrix, evidence, findings and follow-up recommendations.
- Modify product code only on a P0/P1 blocker:
  - The exact files are determined by the blocker.
  - Before editing, record failing evidence and update `findings.md`.
  - After editing, run focused tests, `bun run crg:update`, and `bun run crg:review`.

## Task 1: Prepare Evidence Ledger

**Files:**
- Create: `tmp/real-e2e-regression-2026-05-24/README.md`
- Create: `tmp/real-e2e-regression-2026-05-24/findings.md`
- Create: `tmp/real-e2e-regression-2026-05-24/e2e-env.sh`
- Create directories under: `tmp/real-e2e-regression-2026-05-24/`

- [ ] **Step 1: Create evidence directories**

Run:

```bash
mkdir -p tmp/real-e2e-regression-2026-05-24/{commands,screenshots,browser,workspaces}
```

Expected: command exits `0`.

- [ ] **Step 2: Capture baseline**

Run:

```bash
{
  echo "# Real E2E Regression 2026-05-24"
  echo
  echo "## Baseline"
  date
  git rev-parse HEAD
  git status --short
  echo
  echo "## Versions"
  echo "bun=$(bun --version)"
  echo "codex_path=$(command -v codex || true)"
  codex --version || true
  echo "claude_path=$(command -v claude || true)"
  claude --version || true
} | tee tmp/real-e2e-regression-2026-05-24/README.md
```

Expected: README records date, commit, git state, Bun, Codex and Claude Code versions.

- [ ] **Step 3: Initialize findings ledger**

Run:

```bash
cat > tmp/real-e2e-regression-2026-05-24/findings.md <<'EOF'
# Findings

## P0

None recorded at evidence setup.

## P1

None recorded at evidence setup.

## P2

None recorded at evidence setup.

## P3 / Optimizations

None recorded at evidence setup.
EOF
```

Expected: `findings.md` contains four severity sections.

- [ ] **Step 4: Record real home preflight without mutation**

Run:

```bash
{
  echo "## AIWorker homes"
  echo "AIWORKER_HOME_DEV=$HOME/.aiworker-dev"
  test -d "$HOME/.aiworker-dev" && find "$HOME/.aiworker-dev" -maxdepth 3 -type f | sort | sed 's#^#dev: #' || true
  echo
  echo "AIWORKER_HOME_INSTALL=$HOME/.aiworker"
  test -d "$HOME/.aiworker" && find "$HOME/.aiworker" -maxdepth 3 -type f | sort | sed 's#^#install: #' || true
} | tee tmp/real-e2e-regression-2026-05-24/commands/home-preflight.txt
```

Expected: command lists home files without deleting, migrating or editing either home.

- [ ] **Step 5: Create run environment file**

Run:

```bash
E2E_RUN_ID="$(date +%Y%m%d-%H%M%S)"
{
  printf 'export E2E_RUN_ID=%q\n' "$E2E_RUN_ID"
  printf 'export E2E_ROOT=%q\n' "/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24"
  printf 'export AIWORKER_HOME=%q\n' "$HOME/.aiworker-dev"
  printf 'export E2E_API_URL=%q\n' "http://127.0.0.1:9217"
  printf 'export E2E_WEB_URL=%q\n' "http://127.0.0.1:5173"
  printf 'export E2E_HR_WORKER_ID=%q\n' "e2e-hr-codex-$E2E_RUN_ID"
  printf 'export E2E_QA_WORKER_ID=%q\n' "e2e-qa-web-$E2E_RUN_ID"
} > tmp/real-e2e-regression-2026-05-24/e2e-env.sh
```

Expected: `e2e-env.sh` records a unique run id and deterministic worker ids.

## Task 2: Start Or Attach To Dev Services

**Files:**
- Write evidence: `tmp/real-e2e-regression-2026-05-24/commands/dev-status-before.txt`
- Write evidence: `tmp/real-e2e-regression-2026-05-24/commands/listeners-before.txt`
- Write evidence: `tmp/real-e2e-regression-2026-05-24/commands/dev-start.txt`
- Write evidence: `tmp/real-e2e-regression-2026-05-24/commands/health.json`

- [ ] **Step 1: Record existing dev status and listeners**

Run:

```bash
bun run dev:status 2>&1 | tee tmp/real-e2e-regression-2026-05-24/commands/dev-status-before.txt
{
  echo "port 9217"
  lsof -nP -iTCP:9217 -sTCP:LISTEN 2>/dev/null || true
  echo
  echo "port 5173"
  lsof -nP -iTCP:5173 -sTCP:LISTEN 2>/dev/null || true
} | tee tmp/real-e2e-regression-2026-05-24/commands/listeners-before.txt
```

Expected: output identifies whether API `9217` and Web `5173` are already listening.

- [ ] **Step 2: Start dev services when both ports are free**

Run:

```bash
if lsof -nP -iTCP:9217 -sTCP:LISTEN >/dev/null 2>&1 || lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "A listener already exists; attach to existing services and do not start tmux." | tee tmp/real-e2e-regression-2026-05-24/commands/dev-start.txt
else
  tmux new-session -d -s aiworker-e2e-regression 'cd /Users/ben/projects/aiworker && bun run dev 2>&1 | tee tmp/real-e2e-regression-2026-05-24/commands/dev-start.txt'
  echo "started-by-regression" > tmp/real-e2e-regression-2026-05-24/dev-started-by-regression.txt
fi
```

Expected: either the command records attachment to existing services or starts `tmux` session `aiworker-e2e-regression`.

- [ ] **Step 3: Wait for daemon health**

Run:

```bash
for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:9217/health | tee tmp/real-e2e-regression-2026-05-24/commands/health.json; then
    exit 0
  fi
  sleep 1
done
exit 1
```

Expected: `/health` returns JSON with `status` equal to `ok`.

- [ ] **Step 4: Wait for Worker Web**

Run:

```bash
for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:5173/ >/dev/null; then
    echo "web ok" | tee tmp/real-e2e-regression-2026-05-24/commands/web-health.txt
    exit 0
  fi
  sleep 1
done
exit 1
```

Expected: Worker Web responds before timeout.

## Task 3: Record API, Settings And Official Apps

**Files:**
- Write evidence under: `tmp/real-e2e-regression-2026-05-24/commands/`

- [ ] **Step 1: Record daemon local info and settings**

Run:

```bash
curl -fsS http://127.0.0.1:9217/api/local/info | tee tmp/real-e2e-regression-2026-05-24/commands/local-info.json
curl -fsS http://127.0.0.1:9217/api/local/settings | tee tmp/real-e2e-regression-2026-05-24/commands/local-settings.json
curl -fsS http://127.0.0.1:9217/api/local/settings/engines | tee tmp/real-e2e-regression-2026-05-24/commands/engine-readiness.json
curl -fsS http://127.0.0.1:9217/openapi.json | tee tmp/real-e2e-regression-2026-05-24/commands/openapi.json >/dev/null
```

Expected: all four requests exit `0`; `engine-readiness.json` contains `engines`, `engineId` and `executionMode`.

- [ ] **Step 2: Bootstrap official Soul Apps through CLI**

Run:

```bash
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts app bootstrap official 2>&1 | tee tmp/real-e2e-regression-2026-05-24/commands/cli-bootstrap-official.txt
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts app list 2>&1 | tee tmp/real-e2e-regression-2026-05-24/commands/cli-app-list.txt
```

Expected: command exits `0`; `aiworker-hr` and `aiworker-qa` are visible and enabled or enableable.

- [ ] **Step 3: Record API workers, workspaces and sessions before new work**

Run:

```bash
curl -fsS http://127.0.0.1:9217/api/local/workers | tee tmp/real-e2e-regression-2026-05-24/commands/api-workers-before.json
curl -fsS http://127.0.0.1:9217/api/local/workspaces | tee tmp/real-e2e-regression-2026-05-24/commands/api-workspaces-before.json
curl -fsS http://127.0.0.1:9217/api/local/sessions | tee tmp/real-e2e-regression-2026-05-24/commands/api-sessions-before.json
```

Expected: commands exit `0` and produce JSON snapshots.

## Task 4: Verify CLI HR To Codex Real Session

**Files:**
- Modify: `tmp/real-e2e-regression-2026-05-24/e2e-env.sh`
- Write evidence under: `tmp/real-e2e-regression-2026-05-24/commands/`
- Write workspace notes under: `tmp/real-e2e-regression-2026-05-24/workspaces/`

- [ ] **Step 1: Create HR worker**

Run:

```bash
source tmp/real-e2e-regression-2026-05-24/e2e-env.sh
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts worker create \
  --id "$E2E_HR_WORKER_ID" \
  --soul aiworker-hr \
  --name "e2e hr codex $E2E_RUN_ID" \
  2>&1 | tee tmp/real-e2e-regression-2026-05-24/commands/cli-worker-create-hr.txt
```

Expected: command exits `0` and prints a worker JSON object.

- [ ] **Step 2: Create HR workspace and record id/path**

Run:

```bash
source tmp/real-e2e-regression-2026-05-24/e2e-env.sh
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts workspace create \
  --worker "$E2E_HR_WORKER_ID" \
  --name "e2e-hr-codex-workspace-$E2E_RUN_ID" \
  --type people-profile \
  2>&1 | tee tmp/real-e2e-regression-2026-05-24/commands/cli-workspace-create-hr.txt
bun -e '
const fs = require("node:fs")
const text = fs.readFileSync("tmp/real-e2e-regression-2026-05-24/commands/cli-workspace-create-hr.txt", "utf8")
const json = JSON.parse(text.slice(text.indexOf("{")))
const ws = json.workspace
fs.appendFileSync("tmp/real-e2e-regression-2026-05-24/e2e-env.sh", `export E2E_HR_WORKSPACE_ID=${JSON.stringify(ws.id)}\nexport E2E_HR_WORKSPACE_PATH=${JSON.stringify(ws.rootPath)}\n`)
'
```

Expected: `e2e-env.sh` contains `E2E_HR_WORKSPACE_ID` and `E2E_HR_WORKSPACE_PATH`.

- [ ] **Step 3: Start real Codex session from CLI**

Run:

```bash
source tmp/real-e2e-regression-2026-05-24/e2e-env.sh
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts session start \
  --worker "$E2E_HR_WORKER_ID" \
  --workspace "$E2E_HR_WORKSPACE_ID" \
  --skill aiworker-hr.person-profile \
  --title "E2E Codex regression $E2E_RUN_ID" \
  --input "E2E audit task: only inside this AIWorker workspace, create artifacts/e2e-codex.md with app id aiworker-hr, workspace id $E2E_HR_WORKSPACE_ID, session id if visible, and one short conclusion. Do not read or modify /Users/ben/projects/aiworker. Do not write secrets." \
  2>&1 | tee tmp/real-e2e-regression-2026-05-24/commands/cli-session-start-codex.txt
```

Expected: command creates a session and first turn. A timeout, prompt, approval wait or auth failure is recorded as a finding with command output.

- [ ] **Step 4: Verify Codex artifact and session list**

Run:

```bash
source tmp/real-e2e-regression-2026-05-24/e2e-env.sh
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts session list 2>&1 | tee tmp/real-e2e-regression-2026-05-24/commands/cli-session-list-after-codex.txt
find "$E2E_HR_WORKSPACE_PATH" -maxdepth 4 -type f | sort | tee tmp/real-e2e-regression-2026-05-24/workspaces/cli-hr-codex-files.txt
test -f "$E2E_HR_WORKSPACE_PATH/artifacts/e2e-codex.md"
sed -n '1,120p' "$E2E_HR_WORKSPACE_PATH/artifacts/e2e-codex.md" | tee tmp/real-e2e-regression-2026-05-24/workspaces/cli-hr-codex-artifact.txt
```

Expected: `artifacts/e2e-codex.md` exists inside the HR workspace and contains the requested ids or a clear explanation from the engine.

## Task 5: Set Up Browser Automation Evidence

**Files:**
- Write screenshots under: `tmp/real-e2e-regression-2026-05-24/screenshots/`
- Write browser notes under: `tmp/real-e2e-regression-2026-05-24/browser/`

- [ ] **Step 1: Expose Node REPL browser runtime if needed**

Use tool discovery for `node_repl js` and run the next Browser cells through the `js` execution tool.

Expected: the `js` tool is callable. If it is unavailable after tool discovery, record that blocker in `findings.md` and use terminal Playwright only after stating the fallback reason.

- [ ] **Step 2: Initialize Browser runtime**

Run in the Node REPL `js` tool:

```js
if (!globalThis.agent) {
  const { setupBrowserRuntime } = await import("/Users/ben/.codex/plugins/cache/openai-bundled/browser/26.519.41501/scripts/browser-client.mjs");
  await setupBrowserRuntime({ globals: globalThis });
}
if (!globalThis.browser) {
  globalThis.browser = await agent.browsers.get("iab");
}
await browser.nameSession("🔎 AIWorker E2E Regression");
if (typeof tab === "undefined") {
  globalThis.tab = await browser.tabs.new();
}
globalThis.viewport = await browser.capabilities.get("viewport");
```

Expected: `browser`, `tab` and `viewport` bindings exist for later Browser steps.

- [ ] **Step 3: Open Worker Web and capture desktop shell**

Run in the Node REPL `js` tool:

```js
const fs = await import("node:fs/promises");
await viewport.set({ width: 1280, height: 900 });
await tab.goto("http://127.0.0.1:5173/");
await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/browser/web-desktop-shell.snapshot.md", await tab.playwright.domSnapshot());
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/screenshots/web-desktop-shell.png", Buffer.from(await tab.screenshot({ fullPage: true })));
console.log(await tab.url());
```

Expected: Worker Web loads; screenshot and DOM snapshot files are written.

- [ ] **Step 4: Capture console errors and layout facts**

Run in the Node REPL `js` tool:

```js
const fs = await import("node:fs/promises");
const layout = await tab.playwright.evaluate(() => {
  const doc = document.documentElement;
  const body = document.body;
  return {
    url: location.href,
    title: document.title,
    viewport: { width: innerWidth, height: innerHeight },
    scroll: { width: doc.scrollWidth, height: doc.scrollHeight, clientWidth: doc.clientWidth, clientHeight: doc.clientHeight },
    horizontalOverflow: doc.scrollWidth > doc.clientWidth || body.scrollWidth > body.clientWidth,
    microApps: Array.from(document.querySelectorAll("micro-app")).map((node) => ({
      name: node.getAttribute("name"),
      url: node.getAttribute("url"),
      hasData: Boolean(node.getAttribute("data")),
    })),
  };
});
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/browser/web-desktop-shell-layout.json", JSON.stringify(layout, null, 2));
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/browser/web-desktop-console-errors.json", JSON.stringify(await tab.dev.logs({ levels: ["error", "warn"], limit: 100 }), null, 2));
console.log(JSON.stringify(layout, null, 2));
```

Expected: `horizontalOverflow` is `false` or a P2 finding is recorded with screenshot evidence.

## Task 6: Verify Web QA Workspace And Mounted Locator

**Files:**
- Modify: `tmp/real-e2e-regression-2026-05-24/e2e-env.sh`
- Write evidence under: `tmp/real-e2e-regression-2026-05-24/browser/`
- Write evidence under: `tmp/real-e2e-regression-2026-05-24/screenshots/`
- Write evidence under: `tmp/real-e2e-regression-2026-05-24/commands/`

- [ ] **Step 1: Create QA worker and workspace through API as a stable setup baseline**

Run:

```bash
source tmp/real-e2e-regression-2026-05-24/e2e-env.sh
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts worker create \
  --id "$E2E_QA_WORKER_ID" \
  --soul aiworker-qa \
  --name "e2e qa web $E2E_RUN_ID" \
  2>&1 | tee tmp/real-e2e-regression-2026-05-24/commands/cli-worker-create-qa.txt
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts workspace create \
  --worker "$E2E_QA_WORKER_ID" \
  --name "e2e-qa-web-workspace-$E2E_RUN_ID" \
  --type release-readiness \
  2>&1 | tee tmp/real-e2e-regression-2026-05-24/commands/cli-workspace-create-qa.txt
bun -e '
const fs = require("node:fs")
const text = fs.readFileSync("tmp/real-e2e-regression-2026-05-24/commands/cli-workspace-create-qa.txt", "utf8")
const json = JSON.parse(text.slice(text.indexOf("{")))
const ws = json.workspace
fs.appendFileSync("tmp/real-e2e-regression-2026-05-24/e2e-env.sh", `export E2E_QA_WORKSPACE_ID=${JSON.stringify(ws.id)}\nexport E2E_QA_WORKSPACE_PATH=${JSON.stringify(ws.rootPath)}\n`)
'
```

Expected: QA worker and workspace exist; ids are appended to `e2e-env.sh`.

- [ ] **Step 2: Navigate directly to QA workspace route in Browser**

Run in the Node REPL `js` tool:

```js
const fs = await import("node:fs/promises");
const envText = await fs.readFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/e2e-env.sh", "utf8");
const env = Object.fromEntries(envText.split("\n").filter((line) => line.startsWith("export ")).map((line) => {
  const [key, ...valueParts] = line.replace(/^export /, "").split("=");
  return [key, valueParts.join("=").replace(/^'|'$/g, "").replace(/^"|"$/g, "")];
}));
await viewport.set({ width: 1280, height: 900 });
await tab.goto(`http://127.0.0.1:5173/workers/${env.E2E_QA_WORKER_ID}/workspaces/${env.E2E_QA_WORKSPACE_ID}`);
await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/browser/web-qa-mounted-desktop.snapshot.md", await tab.playwright.domSnapshot());
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/screenshots/web-qa-mounted-desktop.png", Buffer.from(await tab.screenshot({ fullPage: true })));
```

Expected: QA mounted surface renders on the workspace route.

- [ ] **Step 3: Assert mounted micro-app receives workspace locator**

Run in the Node REPL `js` tool:

```js
const fs = await import("node:fs/promises");
const locatorState = await tab.playwright.evaluate(() => Array.from(document.querySelectorAll("micro-app")).map((node) => ({
  name: node.getAttribute("name"),
  url: node.getAttribute("url"),
  data: node.getAttribute("data"),
})));
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/browser/web-qa-mounted-locator.json", JSON.stringify(locatorState, null, 2));
console.log(JSON.stringify(locatorState, null, 2));
```

Expected: at least one `micro-app` entry for QA includes the current `workspaceId` in its URL or host data. If missing, record a P1 or P2 depending on whether session work is blocked.

- [ ] **Step 4: Capture narrow QA workspace layout**

Run in the Node REPL `js` tool:

```js
const fs = await import("node:fs/promises");
await viewport.set({ width: 390, height: 844 });
await tab.reload();
await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/browser/web-qa-mounted-narrow.snapshot.md", await tab.playwright.domSnapshot());
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/screenshots/web-qa-mounted-narrow.png", Buffer.from(await tab.screenshot({ fullPage: true })));
await viewport.set({ width: 1280, height: 900 });
```

Expected: narrow layout remains usable, with no obvious horizontal overflow or blocked primary controls.

## Task 7: Verify Worker Configuration Boundary

**Files:**
- Write evidence under: `tmp/real-e2e-regression-2026-05-24/browser/`
- Write screenshots under: `tmp/real-e2e-regression-2026-05-24/screenshots/`

- [ ] **Step 1: Open HR worker route and capture configuration trigger state**

Run in the Node REPL `js` tool:

```js
const fs = await import("node:fs/promises");
const envText = await fs.readFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/e2e-env.sh", "utf8");
const env = Object.fromEntries(envText.split("\n").filter((line) => line.startsWith("export ")).map((line) => {
  const [key, ...valueParts] = line.replace(/^export /, "").split("=");
  return [key, valueParts.join("=").replace(/^'|'$/g, "").replace(/^"|"$/g, "")];
}));
await viewport.set({ width: 1280, height: 900 });
await tab.goto(`http://127.0.0.1:5173/workers/${env.E2E_HR_WORKER_ID}/workspaces/${env.E2E_HR_WORKSPACE_ID}`);
await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/browser/web-hr-worker-route.snapshot.md", await tab.playwright.domSnapshot());
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/screenshots/web-hr-worker-route.png", Buffer.from(await tab.screenshot({ fullPage: true })));
```

Expected: HR worker route renders and exposes a visible Host-owned configuration trigger.

- [ ] **Step 2: Open Worker Configuration dialog through visible UI**

Use the latest DOM snapshot to identify the unique visible configuration trigger for the current worker. Before clicking, verify the chosen locator resolves to exactly one element.

Expected: Worker Configuration dialog opens. Save a fresh DOM snapshot and screenshot immediately after it opens.

- [ ] **Step 3: Save configuration dialog evidence**

Run in the Node REPL `js` tool after the dialog is open:

```js
const fs = await import("node:fs/promises");
const snapshot = await tab.playwright.domSnapshot();
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/browser/web-hr-worker-config.snapshot.md", snapshot);
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/screenshots/web-hr-worker-config.png", Buffer.from(await tab.screenshot({ fullPage: true })));
const forbidden = ["Projection", "Run projection", "No workspace selected", "Workspace:"].filter((text) => snapshot.includes(text));
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/browser/web-hr-worker-config-forbidden.json", JSON.stringify({ forbidden }, null, 2));
console.log(JSON.stringify({ forbidden }, null, 2));
```

Expected: `forbidden` is an empty array. Any listed string becomes a P2 Worker Configuration boundary finding.

- [ ] **Step 4: Repeat boundary scan for QA worker**

Navigate to `http://127.0.0.1:5173/workers/$E2E_QA_WORKER_ID/workspaces/$E2E_QA_WORKSPACE_ID`, open Worker Configuration, and run the same forbidden-text scan with output files:

```text
tmp/real-e2e-regression-2026-05-24/browser/web-qa-worker-config.snapshot.md
tmp/real-e2e-regression-2026-05-24/screenshots/web-qa-worker-config.png
tmp/real-e2e-regression-2026-05-24/browser/web-qa-worker-config-forbidden.json
```

Expected: QA Worker Configuration also has no workspace projection wording.

## Task 8: Verify Web Claude Code Session And Recovery

**Files:**
- Write evidence under: `tmp/real-e2e-regression-2026-05-24/browser/`
- Write screenshots under: `tmp/real-e2e-regression-2026-05-24/screenshots/`
- Write API/session evidence under: `tmp/real-e2e-regression-2026-05-24/commands/`
- Write workspace evidence under: `tmp/real-e2e-regression-2026-05-24/workspaces/`

- [ ] **Step 1: Record engine readiness immediately before Web session**

Run:

```bash
curl -fsS http://127.0.0.1:9217/api/local/settings/engines | tee tmp/real-e2e-regression-2026-05-24/commands/engine-readiness-before-claude.json
```

Expected: JSON records whether Claude Code is ready. If Claude Code is not ready, record a P1 only when the settings UI cannot explain or recover from the state.

- [ ] **Step 2: Use Web Settings to select or confirm Claude Code**

Open Settings through visible Worker Web UI. Use Browser snapshots to target the unique Settings control and the engine selection control. Save:

```text
tmp/real-e2e-regression-2026-05-24/browser/web-settings-before-claude.snapshot.md
tmp/real-e2e-regression-2026-05-24/screenshots/web-settings-before-claude.png
tmp/real-e2e-regression-2026-05-24/browser/web-settings-after-claude.snapshot.md
tmp/real-e2e-regression-2026-05-24/screenshots/web-settings-after-claude.png
```

Expected: Settings shows Claude Code readiness in user-readable language, or gives a clear reason it cannot be selected.

- [ ] **Step 3: Submit real Claude Code task from Web composer**

Navigate to the HR workspace route and submit this exact prompt through the mounted Web composer:

```text
E2E audit task: only inside this AIWorker workspace, create artifacts/e2e-claude-code.md with app id aiworker-hr, the current workspace id, session id if visible, and one short conclusion. Do not read or modify /Users/ben/projects/aiworker. Do not write secrets.
```

Expected: Web creates a session/turn. If a permission, timeout, account, model or plugin issue appears, preserve the exact UI state and API state before taking recovery action.

- [ ] **Step 4: Poll session and workspace artifact evidence**

Run:

```bash
source tmp/real-e2e-regression-2026-05-24/e2e-env.sh
curl -fsS http://127.0.0.1:9217/api/local/sessions | tee tmp/real-e2e-regression-2026-05-24/commands/api-sessions-after-claude.json
find "$E2E_HR_WORKSPACE_PATH" -maxdepth 4 -type f | sort | tee tmp/real-e2e-regression-2026-05-24/workspaces/web-hr-claude-files.txt
if test -f "$E2E_HR_WORKSPACE_PATH/artifacts/e2e-claude-code.md"; then
  sed -n '1,120p' "$E2E_HR_WORKSPACE_PATH/artifacts/e2e-claude-code.md" | tee tmp/real-e2e-regression-2026-05-24/workspaces/web-hr-claude-artifact.txt
else
  echo "missing artifacts/e2e-claude-code.md" | tee tmp/real-e2e-regression-2026-05-24/workspaces/web-hr-claude-artifact-missing.txt
fi
```

Expected: either the Claude artifact exists, or missing artifact is paired with session failure evidence and UI recovery evidence.

- [ ] **Step 5: Verify failed-session recovery when Claude fails**

If Claude Code session fails or times out, select the failed session in Web, refresh the page, and save:

```text
tmp/real-e2e-regression-2026-05-24/browser/web-claude-failed-session.snapshot.md
tmp/real-e2e-regression-2026-05-24/screenshots/web-claude-failed-session.png
tmp/real-e2e-regression-2026-05-24/browser/web-claude-failed-console-errors.json
```

Expected: UI shows `failed` or an equivalent terminal error state, does not show stale `running/requesting`, does not duplicate the same timeout error, and composer is usable again when engine readiness is true.

- [ ] **Step 6: Verify successful-session state when Claude succeeds**

If Claude Code succeeds, select the completed session in Web and save:

```text
tmp/real-e2e-regression-2026-05-24/browser/web-claude-completed-session.snapshot.md
tmp/real-e2e-regression-2026-05-24/screenshots/web-claude-completed-session.png
```

Expected: UI shows a completed state, artifact is visible from workspace evidence, and follow-up composer is usable.

## Task 9: Deep Web Visual And Runtime Checks

**Files:**
- Write screenshots under: `tmp/real-e2e-regression-2026-05-24/screenshots/`
- Write browser diagnostics under: `tmp/real-e2e-regression-2026-05-24/browser/`

- [ ] **Step 1: Capture desktop and narrow shell states**

For HR workspace, QA workspace, Settings, Worker Configuration and selected session detail, save desktop `1280x900` and narrow `390x844` screenshots.

Expected filenames:

```text
screenshots/web-hr-mounted-desktop.png
screenshots/web-hr-mounted-narrow.png
screenshots/web-qa-mounted-desktop.png
screenshots/web-qa-mounted-narrow.png
screenshots/web-settings-desktop.png
screenshots/web-settings-narrow.png
screenshots/web-session-detail-desktop.png
screenshots/web-session-detail-narrow.png
```

- [ ] **Step 2: Run layout diagnostics for each captured page state**

Run this Browser evaluate snippet on each page state and save to a matching `browser/*.layout.json` file:

```js
({
  url: location.href,
  viewport: { width: innerWidth, height: innerHeight },
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).map((el) => el.getBoundingClientRect().toJSON()),
  microApps: Array.from(document.querySelectorAll("micro-app")).map((el) => ({
    name: el.getAttribute("name"),
    url: el.getAttribute("url"),
    rect: el.getBoundingClientRect().toJSON(),
  })),
})
```

Expected: `horizontalOverflow` is false; dialogs and micro-app rectangles stay inside the viewport or the exception is recorded with screenshot evidence.

- [ ] **Step 3: Record console warnings and errors**

Run:

```js
const fs = await import("node:fs/promises");
await fs.writeFile("/Users/ben/projects/aiworker/tmp/real-e2e-regression-2026-05-24/browser/web-final-console-warnings-errors.json", JSON.stringify(await tab.dev.logs({ levels: ["error", "warn"], limit: 300 }), null, 2));
```

Expected: duplicate keys, micro-app lifecycle errors, 404/500 fetches and runtime warnings are recorded as findings when present.

## Task 10: Installed Home Smoke-Plus抽检

**Files:**
- Write evidence under: `tmp/real-e2e-regression-2026-05-24/commands/install-*`
- Write screenshots under: `tmp/real-e2e-regression-2026-05-24/screenshots/install-*`

- [ ] **Step 1: Record installed home and ports**

Run:

```bash
{
  echo "AIWORKER_HOME_INSTALL=$HOME/.aiworker"
  test -d "$HOME/.aiworker" && find "$HOME/.aiworker" -maxdepth 3 -type f | sort || true
  echo
  echo "port 9317"
  lsof -nP -iTCP:9317 -sTCP:LISTEN 2>/dev/null || true
} | tee tmp/real-e2e-regression-2026-05-24/commands/install-home-preflight.txt
```

Expected: installed home is recorded without mutation.

- [ ] **Step 2: Start installed or packaged entry on a non-conflicting port**

Run:

```bash
if lsof -nP -iTCP:9317 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port 9317 already has listener; skip installed daemon start" | tee tmp/real-e2e-regression-2026-05-24/commands/install-start.txt
else
  tmux new-session -d -s aiworker-e2e-install 'cd /Users/ben/projects/aiworker && AIWORKER_HOME=$HOME/.aiworker PORT=9317 bun apps/cli/src/aiworker.ts daemon foreground --host 127.0.0.1 --port 9317 2>&1 | tee tmp/real-e2e-regression-2026-05-24/commands/install-start.txt'
  echo "started-by-regression" > tmp/real-e2e-regression-2026-05-24/install-started-by-regression.txt
fi
```

Expected: installed-home daemon starts or skip is recorded because the port is occupied.

- [ ] **Step 3: Check installed-home health and readiness**

Run:

```bash
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:9317/health | tee tmp/real-e2e-regression-2026-05-24/commands/install-health.json; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:9317/api/local/settings/engines | tee tmp/real-e2e-regression-2026-05-24/commands/install-engine-readiness.json
curl -fsS http://127.0.0.1:9317/openapi.json | tee tmp/real-e2e-regression-2026-05-24/commands/install-openapi.json >/dev/null
```

Expected: health, engine readiness and OpenAPI respond on port `9317`.

## Task 11: Blocking Defect Response Protocol

**Files:**
- Modify: `tmp/real-e2e-regression-2026-05-24/findings.md`
- Modify product files only after P0/P1 evidence capture.
- Modify focused tests matching the product files touched by the fix.

- [ ] **Step 1: Record blocker before any fix**

Append one concrete entry under `## P0` or `## P1` in `findings.md`. The entry must include these labels with observed values from this run: `Impact`, `Reproduction`, `Expected`, `Actual`, `Evidence`, `Suggested owner`, and `Fix decision`. Use `Fix decision: minimal unblock fix in this run.` when the blocker prevents the remaining E2E matrix from running.

Expected: finding has enough evidence for another agent to reproduce the blocker.

- [ ] **Step 2: Make the smallest code change that removes the blocker**

Before editing, identify the owning boundary:

```text
Host API/core/CLI/storage -> aiworker-host-dev rules
Soul App mounted UI/runtime/manifest -> aiworker-soul-app-dev rules
Shared protocol/schema -> both boundary contracts
```

Expected: code change touches only files needed to continue the blocked test path.

- [ ] **Step 3: Run focused verification for the touched surface**

Use the smallest matching command set:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-web' test
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-core' test
bun run ui:check
```

Expected: commands relevant to touched files pass. Commands unrelated to touched files are not required for the unblock fix.

- [ ] **Step 4: Run code-review-graph for code changes**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: code-review-graph completes; any reported issue is fixed or recorded as residual risk in the final report.

- [ ] **Step 5: Resume the E2E matrix from the blocked step**

Return to the task and step that originally failed.

Expected: the same path either passes after the minimal fix or produces a new, separately recorded blocker.

## Task 12: Final Evidence, Report And Cleanup

**Files:**
- Create: `docs/superpowers/specs/2026-05-24-real-e2e-regression-report.md`
- Modify: `tmp/real-e2e-regression-2026-05-24/README.md`
- Modify: `tmp/real-e2e-regression-2026-05-24/findings.md`

- [ ] **Step 1: Capture final daemon, API and git state**

Run:

```bash
{
  echo "## Final State"
  date
  git status --short
  curl -fsS http://127.0.0.1:9217/health || true
  curl -fsS http://127.0.0.1:9217/api/local/settings/engines || true
} | tee tmp/real-e2e-regression-2026-05-24/commands/final-state.txt
```

Expected: final status is recorded even when some API requests fail.

- [ ] **Step 2: Write final report**

Create `docs/superpowers/specs/2026-05-24-real-e2e-regression-report.md` with these sections:

```md
# 修复后真实 E2E 回归报告

## 环境

## 覆盖矩阵

## 通过项

## 缺陷清单

## 优化项

## 未覆盖项

## 后续建议

## 证据索引
```

Expected: every pass, failure and skipped path points to concrete evidence under `tmp/real-e2e-regression-2026-05-24/`.

- [ ] **Step 3: Stop only services started by this run**

Run:

```bash
if test -f tmp/real-e2e-regression-2026-05-24/dev-started-by-regression.txt; then
  tmux capture-pane -pt aiworker-e2e-regression -S -2000 > tmp/real-e2e-regression-2026-05-24/commands/final-dev-pane.txt || true
  tmux send-keys -t aiworker-e2e-regression C-c || true
fi
if test -f tmp/real-e2e-regression-2026-05-24/install-started-by-regression.txt; then
  tmux capture-pane -pt aiworker-e2e-install -S -2000 > tmp/real-e2e-regression-2026-05-24/commands/final-install-pane.txt || true
  tmux send-keys -t aiworker-e2e-install C-c || true
fi
```

Expected: only tmux sessions created by this run are stopped. Pre-existing services are left untouched.

- [ ] **Step 4: Verify report diff**

Run:

```bash
git diff --check -- docs/superpowers/specs/2026-05-24-real-e2e-regression-report.md
git status --short
```

Expected: diff check passes; git status shows the report and any intentional code/doc changes.

## Completion Definition

- `tmp/real-e2e-regression-2026-05-24/` contains command, Browser, screenshot and workspace evidence.
- `docs/superpowers/specs/2026-05-24-real-e2e-regression-report.md` summarizes the run.
- Real `~/.aiworker-dev` daemon/Web, HR/QA, Codex and Claude Code were attempted.
- Web desktop and narrow states were inspected with Browser evidence.
- Previous findings were explicitly regressed: Claude failed recovery, mounted workspace locator, Worker Configuration boundary and engine readiness endpoint.
- P0/P1 blockers were either fixed minimally with focused verification or recorded as unresolved blockers with evidence.
- P2/P3 issues were recorded without widening the implementation scope.
- Any production code changes ran code-review-graph before final response.
