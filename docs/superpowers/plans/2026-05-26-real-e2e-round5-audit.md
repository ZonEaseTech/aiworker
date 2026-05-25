# 真实流程 E2E 第 5 轮审计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用真实 `/Users/ben/.aiworker-dev`、真实 daemon/Web、官方 HR/QA Soul App、Codex 与 Claude Code 本机鉴权环境，完成第 5 轮非冒烟 E2E 审计并产出可复查证据。

**Architecture:** 这是审计执行计划，不是产品代码实现计划。执行通过正常源码 dev 路径和真实 Host Web/CLI/API 采集证据；除非 P0/P1 阻断后续审计，否则只记录问题，不修改产品代码。

**Tech Stack:** Bun, AIWorker CLI, AIWorker local daemon, Host Web Shell, official HR/QA Soul Apps, Browser/Playwright evidence, Codex CLI, Claude Code CLI, shell evidence capture.

---

## File Structure

- Create: `tmp/real-e2e-audit-2026-05-26-round5/README.md` - 审计 ledger，记录 commit、home、服务 URL、对象 id、证据索引。
- Create: `tmp/real-e2e-audit-2026-05-26-round5/e2e-env.sh` - 本轮 worker/workspace/session id 与 artifact 名称，只存非 secret metadata。
- Create: `tmp/real-e2e-audit-2026-05-26-round5/commands/` - CLI、curl、进程、gate 命令输出。
- Create: `tmp/real-e2e-audit-2026-05-26-round5/api/` - API JSON snapshots。
- Create: `tmp/real-e2e-audit-2026-05-26-round5/browser/` - DOM、layout、console、network 摘要。
- Create: `tmp/real-e2e-audit-2026-05-26-round5/screenshots/` - desktop/narrow/Web 状态截图。
- Create: `tmp/real-e2e-audit-2026-05-26-round5/logs/` - daemon/dev/tmux/focused error scan。
- Create: `tmp/real-e2e-audit-2026-05-26-round5/artifacts/` - workspace artifact path index 和摘要。
- Create: `tmp/real-e2e-audit-2026-05-26-round5/findings.md` - P0/P1/P2/P3 findings ledger。
- Create: `tmp/real-e2e-audit-2026-05-26-round5/final-report.md` - 最终审计报告。

## Execution Rules

- 主审计 home 是 `/Users/ben/.aiworker-dev`；不清空、不重建、不迁移。
- `/Users/ben/.aiworker` 只做 installed-home bounded 参照。
- 新增对象使用 `e2e-r5-*` 前缀，便于和既有用户数据区分。
- 真实 engine 任务只写 AIWorker workspace 内的轻量 artifact。
- 不复制 secret、auth profile、token 或外部账号数据。
- P2/P3 只登记。P0/P1 先留证，再最小 unblock 或停止。
- `app smoke` 或自动 gate 只能做辅助证据，不能替代真实 Web/CLI E2E。

### Task 1: 准备证据目录与 baseline ledger

**Files:**
- Create: `tmp/real-e2e-audit-2026-05-26-round5/README.md`
- Create: `tmp/real-e2e-audit-2026-05-26-round5/findings.md`
- Create: `tmp/real-e2e-audit-2026-05-26-round5/e2e-env.sh`
- Create directories under: `tmp/real-e2e-audit-2026-05-26-round5/`

- [ ] **Step 1: 创建证据目录**

Run:

```bash
mkdir -p tmp/real-e2e-audit-2026-05-26-round5/{commands,api,browser,screenshots,logs,artifacts}
```

Expected: command exits `0`.

- [ ] **Step 2: 写入 baseline README**

Run:

```bash
{
  echo "# 真实流程 E2E 第 5 轮审计 - 2026-05-26"
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
} 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/README.md
```

Expected: README records timestamp, commit, git status, runtime versions, Codex binary and Claude Code binary status.

- [ ] **Step 3: 初始化 findings ledger**

Run:

```bash
printf '# Findings\n\n## P0\n\n## P1\n\n## P2\n\n## P3 / Optimizations\n\n' > tmp/real-e2e-audit-2026-05-26-round5/findings.md
```

Expected: findings ledger has four severity sections.

- [ ] **Step 4: 初始化 env 文件**

Run:

```bash
{
  echo 'export E2E_AUDIT_DIR="tmp/real-e2e-audit-2026-05-26-round5"'
  echo 'export E2E_HR_CODEX_WORKER_ID="e2e-r5-hr-codex-20260526"'
  echo 'export E2E_HR_CLAUDE_CLI_WORKER_ID="e2e-r5-hr-claude-cli-20260526"'
  echo 'export E2E_HR_WEB_CLAUDE_WORKER_ID="e2e-r5-hr-web-claude-20260526"'
  echo 'export E2E_QA_WEB_WORKER_ID="e2e-r5-qa-web-20260526"'
  echo 'export E2E_CODEX_ARTIFACT="artifacts/e2e-r5-codex-20260526.md"'
  echo 'export E2E_CLAUDE_CLI_ARTIFACT="artifacts/e2e-r5-claude-cli-20260526.md"'
  echo 'export E2E_WEB_CLAUDE_ARTIFACT="artifacts/e2e-r5-web-claude-20260526.md"'
} > tmp/real-e2e-audit-2026-05-26-round5/e2e-env.sh
```

Expected: env file contains deterministic IDs and artifact names only.

### Task 2: 连接或启动真实 dev daemon/Web

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round5/logs/listeners-before.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round5/commands/dev-status-before.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round5/commands/dev-start.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round5/api/*.json`

- [ ] **Step 1: 记录端口监听**

Run:

```bash
{
  echo "## LISTEN 9217"
  lsof -nP -iTCP:9217 -sTCP:LISTEN || true
  echo
  echo "## LISTEN 5173"
  lsof -nP -iTCP:5173 -sTCP:LISTEN || true
} 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/logs/listeners-before.txt
```

Expected: records whether API `9217` and Web `5173` are already listening.

- [ ] **Step 2: 记录 dev status**

Run:

```bash
env -u AIWORKER_HOME -u WORKER_DB_PATH bun run dev:status 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/dev-status-before.txt
```

Expected: command records current dev service state; failure is evidence, not an automatic stop.

- [ ] **Step 3: 启动 dev stack when needed**

Run only if API/Web are not both usable:

```bash
tmux new-session -d -s aiworker-e2e-r5-20260526 'cd /Users/ben/projects/aiworker && env -u AIWORKER_HOME -u WORKER_DB_PATH bun run dev 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/dev-start.txt'
```

Expected: tmux session starts. If the session already exists, capture instead:

```bash
tmux capture-pane -pt aiworker-e2e-r5-20260526 -S -2000 > tmp/real-e2e-audit-2026-05-26-round5/commands/dev-start-existing-pane.txt || true
```

- [ ] **Step 4: 等待 health**

Run:

```bash
for i in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:9217/health | tee tmp/real-e2e-audit-2026-05-26-round5/api/health.txt; then
    exit 0
  fi
  sleep 0.5
done
exit 1
```

Expected: `/health` returns before timeout. Failure is P0 evidence.

- [ ] **Step 5: 采集 API baseline**

Run:

```bash
curl -fsS http://127.0.0.1:9217/api/local/settings | tee tmp/real-e2e-audit-2026-05-26-round5/api/settings.json
curl -fsS http://127.0.0.1:9217/api/local/settings/engines | tee tmp/real-e2e-audit-2026-05-26-round5/api/settings-engines.json
curl -fsS http://127.0.0.1:9217/api/local/workers | tee tmp/real-e2e-audit-2026-05-26-round5/api/workers-before.json
curl -fsS http://127.0.0.1:9217/api/local/workspaces | tee tmp/real-e2e-audit-2026-05-26-round5/api/workspaces-before.json
curl -fsS http://127.0.0.1:9217/api/local/sessions | tee tmp/real-e2e-audit-2026-05-26-round5/api/sessions-before.json
curl -fsS http://127.0.0.1:9217/openapi.json | tee tmp/real-e2e-audit-2026-05-26-round5/api/openapi.json >/dev/null
curl -fsS -I http://127.0.0.1:9217/docs | tee tmp/real-e2e-audit-2026-05-26-round5/api/docs.headers
```

Expected: JSON/header snapshots are written.

### Task 3: CLI official app, Codex, and Claude Code paths

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round5/commands/cli-*.txt`
- Append: `tmp/real-e2e-audit-2026-05-26-round5/e2e-env.sh`
- Write: `tmp/real-e2e-audit-2026-05-26-round5/artifacts/*`

- [ ] **Step 1: Bootstrap official apps**

Run:

```bash
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts app bootstrap official 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/cli-app-bootstrap-official.txt
```

Expected: HR and QA official apps are installed/enabled or already present.

- [ ] **Step 2: Create HR Codex worker and workspace**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round5/e2e-env.sh
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts worker create --id "$E2E_HR_CODEX_WORKER_ID" --soul aiworker-hr --name "$E2E_HR_CODEX_WORKER_ID" 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/cli-worker-create-hr-codex-r5.txt
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts workspace create --worker "$E2E_HR_CODEX_WORKER_ID" --type people-profile --name "E2E R5 HR Codex 20260526" 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/cli-workspace-create-hr-codex-r5.txt
HR_CODEX_WORKSPACE_ID=$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(data.workspace.id)' tmp/real-e2e-audit-2026-05-26-round5/commands/cli-workspace-create-hr-codex-r5.txt)
printf 'export E2E_HR_CODEX_WORKSPACE_ID="%s"\n' "$HR_CODEX_WORKSPACE_ID" >> tmp/real-e2e-audit-2026-05-26-round5/e2e-env.sh
```

Expected: worker and workspace are created or existing duplicate behavior is captured.

- [ ] **Step 3: Start real Codex session**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round5/e2e-env.sh
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts session start --worker "$E2E_HR_CODEX_WORKER_ID" --workspace "$E2E_HR_CODEX_WORKSPACE_ID" --skill aiworker-hr.person-profile --engine codex --title "E2E R5 Codex" --input "在当前 AIWorker workspace 内创建 artifacts/e2e-r5-codex-20260526.md，写入一段中文说明，包含日期 2026-05-26、worker id、workspace id，并说明这是第 5 轮真实 E2E Codex 证据。不要修改仓库文件。" 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/cli-session-start-codex-r5.txt
```

Expected: command reaches terminal output; artifact path stays inside workspace.

- [ ] **Step 4: Exercise Claude Code CLI selection**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round5/e2e-env.sh
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts engine select claude-code 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/cli-engine-select-claude-code-r5.txt
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts worker create --id "$E2E_HR_CLAUDE_CLI_WORKER_ID" --soul aiworker-hr --name "$E2E_HR_CLAUDE_CLI_WORKER_ID" 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/cli-worker-create-hr-claude-r5.txt
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts workspace create --worker "$E2E_HR_CLAUDE_CLI_WORKER_ID" --type people-profile --name "E2E R5 HR Claude CLI 20260526" 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/cli-workspace-create-hr-claude-r5.txt
HR_CLAUDE_CLI_WORKSPACE_ID=$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(data.workspace.id)' tmp/real-e2e-audit-2026-05-26-round5/commands/cli-workspace-create-hr-claude-r5.txt)
printf 'export E2E_HR_CLAUDE_CLI_WORKSPACE_ID="%s"\n' "$HR_CLAUDE_CLI_WORKSPACE_ID" >> tmp/real-e2e-audit-2026-05-26-round5/e2e-env.sh
```

Expected: selection and object creation output reveal whether worker/session default engine follows Claude Code.

- [ ] **Step 5: Start the intended Claude Code CLI session**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round5/e2e-env.sh
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts session start --worker "$E2E_HR_CLAUDE_CLI_WORKER_ID" --workspace "$E2E_HR_CLAUDE_CLI_WORKSPACE_ID" --skill aiworker-hr.person-profile --engine claude-code --title "E2E R5 Claude CLI" --input "在当前 AIWorker workspace 内创建 artifacts/e2e-r5-claude-cli-20260526.md，写入一段中文说明，包含日期 2026-05-26、worker id、workspace id，并说明这是第 5 轮真实 E2E Claude Code CLI 证据。不要修改仓库文件。" 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/cli-session-start-claude-r5.txt
```

Expected: command either uses Claude Code successfully or captures the engine-selection mismatch as evidence.

### Task 4: Web HR/QA mounted surfaces and Worker Configuration

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round5/browser/*.json`
- Write: `tmp/real-e2e-audit-2026-05-26-round5/screenshots/*.png`

- [ ] **Step 1: Open Worker Web desktop**

Use the in-app Browser at `http://127.0.0.1:5173` and capture:

```text
browser/hr-desktop-initial-r5.json
screenshots/hr-desktop-initial-r5.png
browser/console-desktop-r5.json
browser/network-desktop-r5.json
```

Expected: Host shell and mounted surface are visible; no blank product surface.

- [ ] **Step 2: Open HR mounted surface at 390px**

Resize to `390x844` and capture:

```text
browser/hr-narrow-layout-r5.json
screenshots/hr-narrow-r5.png
```

Expected: record horizontal overflow, clipped controls, theme alignment, micro-app context and composer readiness.

- [ ] **Step 3: Start Web Claude Code HR session**

In Web, create/select the HR web worker/workspace, confirm Claude Code engine, submit a session prompt that writes `artifacts/e2e-r5-web-claude-20260526.md`, then capture:

```text
browser/web-claude-before-submit-r5.json
screenshots/web-claude-before-submit-r5.png
browser/web-claude-after-terminal-r5.json
screenshots/web-claude-after-terminal-r5.png
api/web-claude-session-detail-r5.json
```

Expected: evidence proves submitted state, terminal state, artifact visibility or failure recovery.

- [ ] **Step 4: Check Worker Configuration for HR and QA**

Capture desktop and 390px dialog state for both apps:

```text
browser/worker-configuration-hr-desktop-r5.json
browser/worker-configuration-hr-narrow-r5.json
browser/worker-configuration-qa-desktop-r5.json
browser/worker-configuration-qa-narrow-r5.json
screenshots/worker-configuration-hr-narrow-r5.png
screenshots/worker-configuration-qa-narrow-r5.png
```

Expected: evidence includes visible layout plus textContent/outerHTML forbidden-scope scan results.

- [ ] **Step 5: Open QA mounted desktop and narrow**

Create/select QA worker/workspace and capture desktop plus 390px:

```text
browser/qa-desktop-layout-r5.json
screenshots/qa-desktop-r5.png
browser/qa-narrow-layout-r5.json
screenshots/qa-narrow-r5.png
```

Expected: QA mounted URL uses target worker/workspace; release/test-suite UI is visible; layout and console/network issues are recorded.

### Task 5: Installed-home bounded reference and gates

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round5/commands/installed-home-*.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round5/commands/ui-check.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round5/commands/check-soul-app-boundaries-completion-audit.txt`

- [ ] **Step 1: Inspect installed home read-only**

Run:

```bash
AIWORKER_HOME="$HOME/.aiworker" bun apps/cli/src/aiworker.ts daemon status 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/installed-home-daemon-status.txt
AIWORKER_HOME="$HOME/.aiworker" bun apps/cli/src/aiworker.ts app list 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/installed-home-app-list.txt
AIWORKER_HOME="$HOME/.aiworker" bun apps/cli/src/aiworker.ts worker list 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/installed-home-worker-list.txt
```

Expected: installed-home state is captured without mutating user data.

- [ ] **Step 2: Run focused guardrails**

Run:

```bash
bun run ui:check 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/ui-check.txt
bun scripts/check-soul-app-boundaries.ts --completion-audit 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round5/commands/check-soul-app-boundaries-completion-audit.txt
```

Expected: guardrail outputs are captured. Failures become findings unless they are unrelated existing failures with clear evidence.

### Task 6: Final scan, findings, and report

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round5/logs/focused-error-scan.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round5/api/final-*.json`
- Write: `tmp/real-e2e-audit-2026-05-26-round5/findings.md`
- Write: `tmp/real-e2e-audit-2026-05-26-round5/final-report.md`

- [ ] **Step 1: Capture final runtime state**

Run:

```bash
curl -fsS http://127.0.0.1:9217/api/local/workers | tee tmp/real-e2e-audit-2026-05-26-round5/api/final-workers.json
curl -fsS http://127.0.0.1:9217/api/local/workspaces | tee tmp/real-e2e-audit-2026-05-26-round5/api/final-workspaces.json
curl -fsS http://127.0.0.1:9217/api/local/sessions | tee tmp/real-e2e-audit-2026-05-26-round5/api/final-sessions.json
```

Expected: final state snapshots include created E2E objects.

- [ ] **Step 2: Focused error scan**

Run:

```bash
{
  rg -n "error|warn|failed|exception|Unhandled|stream|timeout|E2E|e2e-r5" tmp/real-e2e-audit-2026-05-26-round5 logs apps packages 2>/dev/null || true
} | tee tmp/real-e2e-audit-2026-05-26-round5/logs/focused-error-scan.txt
```

Expected: scan output is available for final classification.

- [ ] **Step 3: Write findings ledger**

Use the evidence files to fill `findings.md` with severity, surface, reproduction, actual, expected, evidence, impact and suggested next step for every bug or optimization.

Expected: no finding is missing evidence references.

- [ ] **Step 4: Write final report**

Write `final-report.md` with scope, created objects, execution summary, findings summary, positive regression notes, evidence index and recommended follow-up order.

Expected: final report clearly separates verified facts, partial evidence and unverified areas.

## Plan Self-Review

- Spec coverage: baseline, CLI/API, Codex, Claude Code CLI, Web HR, Web Claude, Web QA, Worker Configuration, installed-home reference, guardrails and final report all map to tasks.
- Placeholder scan: commands use fixed paths and object prefixes; workspace ids are parsed from real CLI output and appended to `e2e-env.sh` before use.
- Type/name consistency: evidence directory, object prefixes and artifact names match the design document.
