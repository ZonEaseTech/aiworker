# Real E2E Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a real operator-path E2E audit of AIWorker using the live local home, Worker Web, official Soul Apps, and authenticated Codex / Claude Code engines.

**Architecture:** This plan is an audit execution plan, not a product-code implementation. It keeps evidence under `tmp/real-e2e-audit-2026-05-24/`, records the final report in `docs/superpowers/specs/2026-05-24-real-e2e-audit-report.md`, and only allows code fixes when a P0/P1 blocks further testing.

**Tech Stack:** Bun, AIWorker CLI, AIWorker local daemon, Worker Web, Browser/Playwright, Codex CLI, Claude Code CLI, shell evidence capture.

---

## File Structure

- Create: `tmp/real-e2e-audit-2026-05-24/README.md`
  - Run ledger with exact commands, start/end timestamps, URLs, and evidence index.
- Create: `tmp/real-e2e-audit-2026-05-24/commands/`
  - Raw stdout/stderr captures for CLI and daemon commands.
- Create: `tmp/real-e2e-audit-2026-05-24/screenshots/`
  - Browser screenshots for desktop and narrow Web checks.
- Create: `tmp/real-e2e-audit-2026-05-24/browser/`
  - Console, network, accessibility or DOM notes exported during Browser checks.
- Create: `tmp/real-e2e-audit-2026-05-24/workspaces/`
  - Text notes that point to real AIWorker workspace paths and list engine-created files. Do not copy secrets.
- Create: `tmp/real-e2e-audit-2026-05-24/findings.md`
  - Working defect and optimization list with severity, evidence, and reproduction steps.
- Create: `docs/superpowers/specs/2026-05-24-real-e2e-audit-report.md`
  - Final human-readable audit report.
- Modify only if a blocking fix is approved by the plan rules:
  - Minimal product files needed to unblock P0/P1.
  - Matching focused tests and PMA/changelog files required by `AGENTS.md`.

## Execution Rules

- Use `~/.aiworker-dev` for source checkout validation unless the test explicitly requires installed preview state.
- Use `~/.aiworker` only after recording current state and explaining why installed state is needed.
- Do not clear, reset, or migrate either home without an explicit written step and user approval.
- Keep engine writes inside AIWorker-created or AIWorker-selected workspace directories.
- Do not let Codex or Claude Code edit `/Users/ben/projects/aiworker` during audit turns.
- Treat `aiworker app smoke`, `web:smoke:mounted-surfaces`, and `smoke:dist-release` as supporting evidence only, never as final acceptance.
- If a P0/P1 blocks the rest of the matrix, capture evidence first, then perform the smallest possible fix and resume testing. P2/P3 are recorded, not fixed.

### Task 1: Prepare Evidence Ledger

**Files:**
- Create: `tmp/real-e2e-audit-2026-05-24/README.md`
- Create: `tmp/real-e2e-audit-2026-05-24/findings.md`
- Create directories under: `tmp/real-e2e-audit-2026-05-24/`

- [ ] **Step 1: Create evidence directories**

Run:

```bash
mkdir -p tmp/real-e2e-audit-2026-05-24/{commands,screenshots,browser,workspaces}
```

Expected: command exits `0`.

- [ ] **Step 2: Capture repository and system baseline**

Run:

```bash
{
  echo "# Real E2E Audit 2026-05-24"
  echo
  echo "## Baseline"
  date
  git rev-parse HEAD
  git status --short
  bun --version
  command -v codex || true
  codex --version || true
  command -v claude || true
  claude --version || true
} | tee tmp/real-e2e-audit-2026-05-24/README.md
```

Expected: README records current date, commit, clean or dirty git state, Bun version, and available engine binaries.

- [ ] **Step 3: Initialize findings file**

Run:

```bash
cat > tmp/real-e2e-audit-2026-05-24/findings.md <<'EOF'
# Findings

## P0

## P1

## P2

## P3 / Optimizations

EOF
```

Expected: findings file has severity sections ready for evidence-backed entries.

- [ ] **Step 4: Record real home preflight without mutation**

Run:

```bash
{
  echo "## AIWorker homes"
  echo "AIWORKER_HOME_DEV=$HOME/.aiworker-dev"
  test -d "$HOME/.aiworker-dev" && find "$HOME/.aiworker-dev" -maxdepth 2 -type f | sort | sed 's#^#dev: #' || true
  echo
  echo "AIWORKER_HOME_INSTALL=$HOME/.aiworker"
  test -d "$HOME/.aiworker" && find "$HOME/.aiworker" -maxdepth 2 -type f | sort | sed 's#^#install: #' || true
} | tee tmp/real-e2e-audit-2026-05-24/commands/home-preflight.txt
```

Expected: preflight lists relevant files without deleting or editing anything.

### Task 2: Start Or Attach To Real Dev Daemon And Web

**Files:**
- Write evidence: `tmp/real-e2e-audit-2026-05-24/commands/dev-status-before.txt`
- Write evidence: `tmp/real-e2e-audit-2026-05-24/commands/dev-start.txt`
- Write evidence: `tmp/real-e2e-audit-2026-05-24/commands/health.json`

- [ ] **Step 1: Check existing dev services**

Run:

```bash
bun run dev:status 2>&1 | tee tmp/real-e2e-audit-2026-05-24/commands/dev-status-before.txt
```

Expected: output identifies whether API `9217` and Web `5173` are already listening.

- [ ] **Step 2: Start dev services only if needed**

If `dev:status` shows API/Web are not both running, run:

```bash
tmux new-session -d -s aiworker-e2e-audit 'cd /Users/ben/projects/aiworker && bun run dev 2>&1 | tee tmp/real-e2e-audit-2026-05-24/commands/dev-start.txt'
```

Expected: tmux session starts. If tmux is unavailable, use:

```bash
setsid bash -lc 'cd /Users/ben/projects/aiworker && bun run dev > tmp/real-e2e-audit-2026-05-24/commands/dev-start.txt 2>&1' &
echo $! | tee tmp/real-e2e-audit-2026-05-24/commands/dev-start.pid
```

- [ ] **Step 3: Wait for daemon health**

Run:

```bash
for i in $(seq 1 80); do
  if curl -fsS http://127.0.0.1:9217/health | tee tmp/real-e2e-audit-2026-05-24/commands/health.json; then
    exit 0
  fi
  sleep 0.5
done
exit 1
```

Expected: health endpoint returns successfully before timeout.

- [ ] **Step 4: Record local info and settings**

Run:

```bash
curl -fsS http://127.0.0.1:9217/api/local/info | tee tmp/real-e2e-audit-2026-05-24/commands/local-info.json
curl -fsS http://127.0.0.1:9217/api/local/settings | tee tmp/real-e2e-audit-2026-05-24/commands/local-settings.json
curl -fsS http://127.0.0.1:9217/api/local/settings/engines | tee tmp/real-e2e-audit-2026-05-24/commands/engine-readiness.json
```

Expected: info/settings JSON is readable; Codex and Claude Code readiness is recorded, including failures.

### Task 3: Verify CLI Operator Flow

**Files:**
- Write evidence under: `tmp/real-e2e-audit-2026-05-24/commands/cli-*.txt`
- Write workspace notes: `tmp/real-e2e-audit-2026-05-24/workspaces/cli-flow.md`

- [ ] **Step 1: Bootstrap official apps through CLI**

Run:

```bash
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts app bootstrap official 2>&1 | tee tmp/real-e2e-audit-2026-05-24/commands/cli-bootstrap-official.txt
```

Expected: command exits `0` or reports apps already installed/enabled without corrupting state.

- [ ] **Step 2: Record app list**

Run:

```bash
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts app list 2>&1 | tee tmp/real-e2e-audit-2026-05-24/commands/cli-app-list.txt
```

Expected: `aiworker-hr` and `aiworker-qa` are visible and enabled or enableable.

- [ ] **Step 3: Create or select an HR worker**

Run:

```bash
E2E_HR_WORKER_ID="e2e-hr-codex-20260524"
if ! AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts worker create --id "$E2E_HR_WORKER_ID" --soul aiworker-hr --name e2e-hr-codex 2>&1 | tee tmp/real-e2e-audit-2026-05-24/commands/cli-worker-create-hr.txt; then
  AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts worker show "$E2E_HR_WORKER_ID" 2>&1 | tee -a tmp/real-e2e-audit-2026-05-24/commands/cli-worker-create-hr.txt
fi
printf 'export E2E_HR_WORKER_ID=%q\n' "$E2E_HR_WORKER_ID" > tmp/real-e2e-audit-2026-05-24/e2e-env.sh
```

Expected: either a new deterministic worker is created or the existing worker with the same id is shown. `tmp/real-e2e-audit-2026-05-24/e2e-env.sh` records the worker id.

- [ ] **Step 4: Create an HR workspace**

Run:

```bash
source tmp/real-e2e-audit-2026-05-24/e2e-env.sh
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts workspace create --worker "$E2E_HR_WORKER_ID" --name e2e-hr-codex-workspace 2>&1 | tee tmp/real-e2e-audit-2026-05-24/commands/cli-workspace-create-hr.txt
bun -e 'const fs=require("node:fs"); const text=fs.readFileSync("tmp/real-e2e-audit-2026-05-24/commands/cli-workspace-create-hr.txt","utf8"); const json=JSON.parse(text.slice(text.indexOf("{"))); const ws=json.workspace; fs.appendFileSync("tmp/real-e2e-audit-2026-05-24/e2e-env.sh", `export E2E_HR_WORKSPACE_ID=${JSON.stringify(ws.id)}\nexport E2E_HR_WORKSPACE_PATH=${JSON.stringify(ws.rootPath)}\n`);'
```

Expected: command exits `0`, and `e2e-env.sh` records `E2E_HR_WORKSPACE_ID` plus `E2E_HR_WORKSPACE_PATH`.

- [ ] **Step 5: Start a Codex-backed session from CLI**

Run:

```bash
source tmp/real-e2e-audit-2026-05-24/e2e-env.sh
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts session start \
  --worker "$E2E_HR_WORKER_ID" \
  --workspace "$E2E_HR_WORKSPACE_ID" \
  --skill aiworker-hr.person-profile \
  --title "E2E Codex audit" \
  --input "E2E audit task: only inside this AIWorker workspace, create artifacts/e2e-codex.md with app id aiworker-hr, workspace id $E2E_HR_WORKSPACE_ID, session id if visible, and one short conclusion. Do not read or modify /Users/ben/projects/aiworker. Do not write secrets." \
  2>&1 | tee tmp/real-e2e-audit-2026-05-24/commands/cli-session-start-codex.txt
```

Expected: command starts a real session/turn. If it times out, hangs, or asks for permission, record the exact behavior as a finding.

- [ ] **Step 6: Verify CLI session and workspace artifact**

Run:

```bash
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts session list 2>&1 | tee tmp/real-e2e-audit-2026-05-24/commands/cli-session-list-after-codex.txt
```

Then inspect the workspace path from Step 4:

```bash
source tmp/real-e2e-audit-2026-05-24/e2e-env.sh
find "$E2E_HR_WORKSPACE_PATH" -maxdepth 3 -type f | sort | tee tmp/real-e2e-audit-2026-05-24/workspaces/cli-hr-codex-files.txt
test -f "$E2E_HR_WORKSPACE_PATH/artifacts/e2e-codex.md" && sed -n '1,120p' "$E2E_HR_WORKSPACE_PATH/artifacts/e2e-codex.md" | tee tmp/real-e2e-audit-2026-05-24/workspaces/cli-hr-codex-artifact.txt
```

Expected: session is listed and the Codex artifact exists. If not, record the missing link and any timeline/log evidence.

### Task 4: Verify Web Product Flow With Browser

**Files:**
- Write screenshots under: `tmp/real-e2e-audit-2026-05-24/screenshots/`
- Write browser notes under: `tmp/real-e2e-audit-2026-05-24/browser/`
- Write findings in: `tmp/real-e2e-audit-2026-05-24/findings.md`

- [ ] **Step 1: Open Worker Web in Browser**

Use the Browser tool to navigate to:

```text
http://127.0.0.1:5173/
```

Expected: Worker Web loads without a blank screen. Capture console and network errors immediately.

- [ ] **Step 2: Desktop shell check**

Set viewport to approximately `1280x900`. Check:

```text
Host header visible
left panel visible or reachable
Soul App catalog or current worker visible
Settings action reachable
no horizontal overflow
no text overlap
no broken icon surfaces
```

Expected: UI is usable with no blocking style regressions. Save screenshot as `screenshots/web-desktop-shell.png`.

- [ ] **Step 3: Settings and engine readiness check**

Open Settings. Check execution/engine readiness and Soul App status.

Expected: Codex and Claude Code status are understandable; any missing readiness detail becomes a finding. Save screenshot as `screenshots/web-settings-engines.png`.

- [ ] **Step 4: HR mounted surface check**

From Web, enter or create an HR worker and workspace, then open the mounted HR surface.

Expected:

```text
micro-app surface renders
HR app-owned UI is interactive
Host does not render HR domain fields as Host chrome
mounted surface does not overflow viewport
```

Save desktop screenshot as `screenshots/web-hr-mounted-desktop.png`.

- [ ] **Step 5: Narrow viewport HR check**

Set viewport to a width between `390` and `760`.

Expected:

```text
no clipped dialogs
no unreachable primary action
no unreadable columns
no fixed desktop layout forced into narrow viewport
```

Save screenshot as `screenshots/web-hr-mounted-narrow.png`.

- [ ] **Step 6: QA mounted surface check**

Enter or create a QA worker and workspace, then open the mounted QA surface.

Expected: QA mounted surface loads, app-owned language is visible, and Host shell remains generic. Save desktop and narrow screenshots as `screenshots/web-qa-mounted-desktop.png` and `screenshots/web-qa-mounted-narrow.png`.

- [ ] **Step 7: Worker Configuration check**

Open Worker Configuration for the active HR and QA workers.

Expected:

```text
configuration is scoped to current Soul worker
no workspace/session Host configuration scope appears
no Soul App custom UI slot appears inside Host chrome
generic manifest-derived status/options are understandable
```

Save screenshots for HR and QA configuration dialogs.

### Task 5: Verify Web-To-Engine Real Work

**Files:**
- Write screenshots under: `tmp/real-e2e-audit-2026-05-24/screenshots/`
- Write workspace notes under: `tmp/real-e2e-audit-2026-05-24/workspaces/`
- Write browser notes under: `tmp/real-e2e-audit-2026-05-24/browser/`

- [ ] **Step 1: Start a Web session using Claude Code path**

In Worker Web, from a QA or HR workspace, start a session with this input:

```text
E2E audit task: only inside this AIWorker workspace, create artifacts/e2e-claude-code.md with app id, workspace id, session id if visible, and one short conclusion. Do not read or modify /Users/ben/projects/aiworker. Do not write secrets.
```

Expected: Web accepts the request and shows session progress or a clear error.

- [ ] **Step 2: Observe timeline and progress states**

While the turn runs, inspect:

```text
composer disabled/enabled state
send button state
timeline event updates
tool/status event rendering
error or timeout state
```

Expected: user can understand whether the engine is running, blocked, done, or failed. Save screenshots during running and after terminal state.

- [ ] **Step 3: Verify Claude Code workspace artifact**

Find the workspace path from Web or CLI evidence, write it into `E2E_WEB_WORKSPACE_PATH`, then run:

```bash
printf 'export E2E_WEB_WORKSPACE_PATH=%q\n' "$E2E_WEB_WORKSPACE_PATH" >> tmp/real-e2e-audit-2026-05-24/e2e-env.sh
find "$E2E_WEB_WORKSPACE_PATH" -maxdepth 3 -type f | sort | tee tmp/real-e2e-audit-2026-05-24/workspaces/web-claude-files.txt
test -f "$E2E_WEB_WORKSPACE_PATH/artifacts/e2e-claude-code.md" && sed -n '1,120p' "$E2E_WEB_WORKSPACE_PATH/artifacts/e2e-claude-code.md" | tee tmp/real-e2e-audit-2026-05-24/workspaces/web-claude-artifact.txt
```

Expected: artifact exists and only contains non-sensitive audit text. If it does not exist, compare Web timeline, daemon logs, and CLI session state.

- [ ] **Step 4: Refresh Web and re-open session**

Refresh the browser and navigate back to the same worker/workspace/session.

Expected: session list and timeline remain understandable, and the user can find the completed or failed turn without hidden state loss.

### Task 6: Collect Daemon Logs And API State

**Files:**
- Write evidence under: `tmp/real-e2e-audit-2026-05-24/commands/api-*.json`
- Write evidence under: `tmp/real-e2e-audit-2026-05-24/commands/daemon-logs.txt`

- [ ] **Step 1: Capture local API state after flows**

Run:

```bash
curl -fsS http://127.0.0.1:9217/api/local/apps | tee tmp/real-e2e-audit-2026-05-24/commands/api-apps-after.json
curl -fsS http://127.0.0.1:9217/api/local/settings/engines | tee tmp/real-e2e-audit-2026-05-24/commands/api-engines-after.json
```

Expected: API returns current app and engine status.

- [ ] **Step 2: Capture daemon logs**

Run:

```bash
AIWORKER_HOME="$HOME/.aiworker-dev" bun apps/cli/src/aiworker.ts daemon logs 2>&1 | tee tmp/real-e2e-audit-2026-05-24/commands/daemon-logs.txt
```

Expected: logs are available or command clearly reports how logs are managed in dev mode.

- [ ] **Step 3: Search for obvious runtime errors**

Run:

```bash
rg -n "error|exception|unhandled|timeout|failed|ECONN|EADDR|permission|denied" tmp/real-e2e-audit-2026-05-24/commands tmp/real-e2e-audit-2026-05-24/browser 2>&1 | tee tmp/real-e2e-audit-2026-05-24/commands/error-scan.txt
```

Expected: every meaningful hit is either explained as benign or entered into `findings.md`.

### Task 7: Write Final Audit Report

**Files:**
- Create: `docs/superpowers/specs/2026-05-24-real-e2e-audit-report.md`
- Modify: `tmp/real-e2e-audit-2026-05-24/findings.md`

- [ ] **Step 1: Summarize coverage matrix**

Create the report with this structure:

```markdown
# 真实流程 E2E 审计报告

## 环境

- Date:
- Commit:
- Home:
- API URL:
- Web URL:
- Codex:
- Claude Code:

## 覆盖矩阵

| Area | Path | Result | Evidence |
| --- | --- | --- | --- |
| CLI | HR workspace/session/Codex |  |  |
| Web | HR mounted desktop/narrow |  |  |
| Web | QA mounted desktop/narrow |  |  |
| Web | Claude Code session |  |  |
| API | settings/apps/engines |  |  |

## 缺陷

## 优化项

## 通过项

## 未覆盖

## 后续建议
```

Expected: report exists and every result points to evidence in `tmp/real-e2e-audit-2026-05-24/`.

- [ ] **Step 2: Add each P0/P1/P2/P3 finding**

For each finding, use this exact format:

```markdown
### P2: Short title

- Impact:
- Reproduction:
- Expected:
- Actual:
- Evidence:
- Suggested owner:
```

Expected: no finding lacks reproduction and evidence.

- [ ] **Step 3: Add style and UX issues from Browser checks**

Review every screenshot and browser log. Add entries for:

```text
layout offset
text overflow
clipped dialog
unreachable button
unexpected blank/loading state
visual theme inconsistency
console error
network error
```

Expected: visual and experience issues are not hidden behind functional pass/fail.

- [ ] **Step 4: Run report self-check**

Run:

```bash
rg -n "TBD|待定|FIXME|占位" docs/superpowers/specs/2026-05-24-real-e2e-audit-report.md tmp/real-e2e-audit-2026-05-24/findings.md
git diff --check
```

Expected: no placeholders and no whitespace errors.

### Task 8: Decide Fix Or Follow-Up

**Files:**
- Modify if needed: `docs/task/*.md`
- Modify if needed: `docs/plan/*.md`
- Modify if needed: `docs/changelog.md`

- [ ] **Step 1: Classify next action**

Use this rule:

```text
P0/P1 blocking current use: prepare focused fix task.
P2 visible but workaround exists: create PMA task/plan or leave in audit report as prioritized follow-up.
P3 optimization: leave in audit report unless user asks for immediate polish.
```

Expected: final response clearly states whether implementation fixes were started or only findings were collected.

- [ ] **Step 2: If no code changed, skip code-review-graph explicitly**

Expected final wording:

```text
本轮只新增审计报告和临时证据，没有修改生产代码，因此跳过 code-review-graph。
```

- [ ] **Step 3: If code changed for P0/P1, run required gates**

Run the smallest matching gates from `AGENTS.md`, for example:

```bash
bun run --filter '@zonease/aiworker-web' test
bun run ui:check
bun run crg:update
bun run crg:review
```

Expected: every fix has focused verification and code-review-graph evidence.
