# 真实流程 E2E 第 6 轮发布绑定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成一次发布绑定的长 E2E：source-dev 真实流程、正式通道发布、刚发布版本 installed 真实流程、对比报告，并沉淀一个薄 E2E skill。

**Architecture:** 本计划不修改产品实现，除非 source-dev 或 release gate 发现 P0/P1 且用户批准进入修复批次。执行以证据目录为主线，先验证 `/Users/ben/.aiworker-dev`，再真实 tag/publish 到正式通道，最后用刚发布的 `@zonease/aiworker-cli` 在 `/Users/ben/.aiworker` 验证 installed operator path。Host 只作为 shell/locator/mount/bridge 被测试，HR/QA 领域 UI、API 和 artifact 仍归 Soul App。

**Tech Stack:** Bun, AIWorker CLI, local daemon API, Host Web Shell, official HR/QA Soul Apps, Codex CLI, Claude Code CLI, npm, GitHub Actions, Browser/Playwright-style evidence, shell evidence capture.

---

## File Structure

- Create: `tmp/real-e2e-audit-2026-05-26-round6/README.md` - 第 6 轮证据 ledger，记录 baseline、phase 状态、版本、服务 URL、对象 id 和证据索引。
- Create: `tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh` - 本轮非 secret metadata，包含目录、对象前缀、artifact 名称、发布版本、端口和 session id。
- Create: `tmp/real-e2e-audit-2026-05-26-round6/commands/` - CLI、git、npm、gh、curl、gate 命令输出。
- Create: `tmp/real-e2e-audit-2026-05-26-round6/api/` - source-dev 与 installed API snapshots。
- Create: `tmp/real-e2e-audit-2026-05-26-round6/browser/` - Web DOM、layout、console、network、scan 证据。
- Create: `tmp/real-e2e-audit-2026-05-26-round6/screenshots/` - desktop 与 390px 截图。
- Create: `tmp/real-e2e-audit-2026-05-26-round6/logs/` - daemon、tmux、release workflow、focused scan 日志。
- Create: `tmp/real-e2e-audit-2026-05-26-round6/artifacts/` - workspace artifact path index 和摘要。
- Create: `tmp/real-e2e-audit-2026-05-26-round6/findings.md` - P0/P1/P2/P3 findings ledger。
- Create: `tmp/real-e2e-audit-2026-05-26-round6/final-report.md` - 最终发布绑定 E2E 报告。
- Create: `.agents/skills/aiworker-release-e2e/SKILL.md` - 薄 E2E skill，只记录流程骨架和防跑偏规则。
- Modify: `apps/cli/package.json` - release gate 通过后 bump 到选定的 `< 1.0.0` 正式版本。
- Modify: generated/published package artifacts under `apps/cli/dist/` - 由 build 命令生成，只作为 release evidence，不手写。

## Execution Rules

- 不使用 fake home、mock engine、mock session 或测试专用 Soul App。
- source-dev 主 home 是 `/Users/ben/.aiworker-dev`；installed home 是 `/Users/ben/.aiworker`。
- installed lane 必须基于刚发布的 npm package；不能使用 repo `dist` 冒充。
- 发布通道是正式通道：npm `latest` 和非 prerelease GitHub Release。
- 版本必须 `< 1.0.0`；默认选下一个 patch release，除非 live registry/tag 状态证明需要其他 `0.x.y`。
- P0/P1 阻断 source-dev 或 release gate 时停止 tag/publish，写 blocked report。
- P2/P3 默认登记，不中途修；若影响 operator 安装、启动、Web 使用、engine bridge 或发布产物完整性，升级为 release blocker。
- 不复制 secret、auth profile、token 或外部账号数据。
- 长驻进程放 tmux；不要使用 `kill $(lsof -ti:PORT)`，只匹配监听进程。

### Task 1: 准备证据目录、baseline 和 stop gates

**Files:**
- Create: `tmp/real-e2e-audit-2026-05-26-round6/README.md`
- Create: `tmp/real-e2e-audit-2026-05-26-round6/findings.md`
- Create: `tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh`
- Create directories under: `tmp/real-e2e-audit-2026-05-26-round6/`

- [ ] **Step 1: 创建证据目录**

Run:

```bash
mkdir -p tmp/real-e2e-audit-2026-05-26-round6/{commands,api,browser,screenshots,logs,artifacts}
```

Expected: command exits `0`.

- [ ] **Step 2: 写入 baseline README**

Run:

```bash
{
  echo "# 真实流程 E2E 第 6 轮发布绑定审计 - 2026-05-26"
  echo
  echo "## Baseline"
  printf 'date: '; date
  printf 'cwd: '; pwd
  printf 'branch: '; git branch --show-current
  printf 'commit: '; git rev-parse HEAD
  printf 'git status --short: '
  status="$(git status --short)"
  if [ -z "$status" ]; then
    echo "clean"
  else
    echo
    printf '%s\n' "$status"
  fi
  printf 'bun --version: '; bun --version
  printf 'node --version: '; node --version
  printf 'codex path: '; command -v codex || true
  printf 'codex --version: '; codex --version || true
  printf 'claude path: '; command -v claude || true
  printf 'claude --version: '; claude --version || true
  printf 'source home: /Users/ben/.aiworker-dev\n'
  printf 'installed home: /Users/ben/.aiworker\n'
} 2>&1 | tee tmp/real-e2e-audit-2026-05-26-round6/README.md
```

Expected: README records timestamp, commit, explicit clean/dirty git status, runtime versions, and engine binary readiness.

- [ ] **Step 3: 初始化 findings ledger**

Apply this patch:

```patch
*** Begin Patch
*** Add File: tmp/real-e2e-audit-2026-05-26-round6/findings.md
+# Findings
+
+每个 finding 必须包含 severity、phase、home、surface、reproduction、actual、expected、evidence、impact、suggested next step。
+
+## P0
+
+## P1
+
+## P2
+
+## P3 / Optimizations
*** End Patch
```

Expected: findings ledger has severity sections and required field reminder.

- [ ] **Step 4: 初始化 env 文件**

Apply this patch:

```patch
*** Begin Patch
*** Add File: tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
+export E2E_AUDIT_DIR="tmp/real-e2e-audit-2026-05-26-round6"
+export E2E_DEV_HOME="/Users/ben/.aiworker-dev"
+export E2E_INSTALLED_HOME="/Users/ben/.aiworker"
+export E2E_DEV_API_PORT="9217"
+export E2E_DEV_WEB_PORT="5173"
+export E2E_INSTALLED_API_PORT="9317"
+export E2E_INSTALLED_WEB_PORT="5273"
+export E2E_DEV_HR_CODEX_WORKER_ID="e2e-r6-dev-hr-codex-20260526"
+export E2E_DEV_HR_CLAUDE_CLI_WORKER_ID="e2e-r6-dev-hr-claude-cli-20260526"
+export E2E_DEV_HR_WEB_CLAUDE_WORKER_ID="e2e-r6-dev-hr-web-claude-20260526"
+export E2E_DEV_QA_WEB_WORKER_ID="e2e-r6-dev-qa-web-20260526"
+export E2E_INSTALLED_HR_CODEX_WORKER_ID="e2e-r6-installed-hr-codex-20260526"
+export E2E_INSTALLED_HR_CLAUDE_CLI_WORKER_ID="e2e-r6-installed-hr-claude-cli-20260526"
+export E2E_INSTALLED_HR_WEB_CLAUDE_WORKER_ID="e2e-r6-installed-hr-web-claude-20260526"
+export E2E_INSTALLED_QA_WEB_WORKER_ID="e2e-r6-installed-qa-web-20260526"
+export E2E_DEV_CODEX_ARTIFACT="artifacts/e2e-r6-dev-codex-20260526.md"
+export E2E_DEV_CLAUDE_CLI_ARTIFACT="artifacts/e2e-r6-dev-claude-cli-20260526.md"
+export E2E_DEV_WEB_CLAUDE_ARTIFACT="artifacts/e2e-r6-dev-web-claude-20260526.md"
+export E2E_INSTALLED_CODEX_ARTIFACT="artifacts/e2e-r6-installed-codex-20260526.md"
+export E2E_INSTALLED_CLAUDE_CLI_ARTIFACT="artifacts/e2e-r6-installed-claude-cli-20260526.md"
+export E2E_INSTALLED_WEB_CLAUDE_ARTIFACT="artifacts/e2e-r6-installed-web-claude-20260526.md"
*** End Patch
```

Expected: env file contains only deterministic non-secret metadata.

- [ ] **Step 5: 记录 stop gates**

Apply this patch:

```patch
*** Begin Patch
*** Update File: tmp/real-e2e-audit-2026-05-26-round6/README.md
@@
+## Stop Gates
+
+- Source-dev P0/P1: stop before release gate and write blocked report.
+- Release gate P0/P1: stop before tag/publish and write blocked report.
+- Version >= 1.0.0: stop immediately.
+- Installed lane must use just-published npm package, not repo dist.
+- P2/P3: record unless it blocks install/start/Web/engine/release artifact integrity.
*** End Patch
```

Expected: README clearly states release stop gates before any risky command.

### Task 2: Source-dev daemon/API/Web baseline

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round6/logs/dev-listeners-before.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/commands/dev-status-before.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/commands/dev-start.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/api/dev-*.json`

- [ ] **Step 1: 记录 source-dev 端口监听**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
{
  echo "## LISTEN $E2E_DEV_API_PORT"
  lsof -nP -iTCP:"$E2E_DEV_API_PORT" -sTCP:LISTEN || true
  echo
  echo "## LISTEN $E2E_DEV_WEB_PORT"
  lsof -nP -iTCP:"$E2E_DEV_WEB_PORT" -sTCP:LISTEN || true
} 2>&1 | tee "$E2E_AUDIT_DIR/logs/dev-listeners-before.txt"
```

Expected: records whether API `9217` and Web `5173` are already listening.

- [ ] **Step 2: 记录 dev status**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
env -u AIWORKER_HOME -u WORKER_DB_PATH bun run dev:status 2>&1 | tee "$E2E_AUDIT_DIR/commands/dev-status-before.txt"
```

Expected: command records current dev service state; non-zero output is evidence, not automatic stop.

- [ ] **Step 3: 启动 source-dev stack when needed**

Run only if API/Web are not both usable:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
tmux new-session -d -s aiworker-e2e-r6-dev-20260526 "cd /Users/ben/projects/aiworker && env -u AIWORKER_HOME -u WORKER_DB_PATH bun run dev 2>&1 | tee $E2E_AUDIT_DIR/commands/dev-start.txt"
```

If the tmux session already exists, run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
tmux capture-pane -pt aiworker-e2e-r6-dev-20260526 -S -2000 > "$E2E_AUDIT_DIR/commands/dev-start-existing-pane.txt" || true
```

Expected: tmux session starts or existing pane is captured.

- [ ] **Step 4: 等待 source-dev health**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
for i in $(seq 1 120); do
  if curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/health" | tee "$E2E_AUDIT_DIR/api/dev-health.txt"; then
    exit 0
  fi
  sleep 0.5
done
exit 1
```

Expected: `/health` returns before timeout. Failure is P0 evidence and stops before release.

- [ ] **Step 5: 采集 source-dev API baseline**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/api/local/info" | tee "$E2E_AUDIT_DIR/api/dev-info.json"
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/api/local/settings" | tee "$E2E_AUDIT_DIR/api/dev-settings.json"
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/api/local/settings/engines" | tee "$E2E_AUDIT_DIR/api/dev-settings-engines.json"
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/api/local/apps" | tee "$E2E_AUDIT_DIR/api/dev-apps-before.json"
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/api/local/workers" | tee "$E2E_AUDIT_DIR/api/dev-workers-before.json"
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/api/local/workspaces" | tee "$E2E_AUDIT_DIR/api/dev-workspaces-before.json"
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/api/local/sessions" | tee "$E2E_AUDIT_DIR/api/dev-sessions-before.json"
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/openapi.json" | tee "$E2E_AUDIT_DIR/api/dev-openapi.json" >/dev/null
curl -fsS -I "http://127.0.0.1:$E2E_DEV_API_PORT/docs" | tee "$E2E_AUDIT_DIR/api/dev-docs.headers"
```

Expected: JSON/header snapshots are written.

### Task 3: Source-dev CLI Codex and Claude Code sessions

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round6/commands/dev-cli-*.txt`
- Append: `tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/artifacts/dev-*.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/api/dev-*-after-cli.json`

- [ ] **Step 1: Bootstrap official apps in source-dev**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts app bootstrap official 2>&1 | tee "$E2E_AUDIT_DIR/commands/dev-cli-app-bootstrap-official.txt"
```

Expected: HR and QA official apps are installed/enabled or already present.

- [ ] **Step 2: Create HR Codex worker/workspace**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts worker create --id "$E2E_DEV_HR_CODEX_WORKER_ID" --soul aiworker-hr --name "$E2E_DEV_HR_CODEX_WORKER_ID" 2>&1 | tee "$E2E_AUDIT_DIR/commands/dev-cli-worker-create-hr-codex.txt"
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts workspace create --worker "$E2E_DEV_HR_CODEX_WORKER_ID" --type people-profile --name "E2E R6 DEV HR Codex 20260526" 2>&1 | tee "$E2E_AUDIT_DIR/commands/dev-cli-workspace-create-hr-codex.txt"
DEV_HR_CODEX_WORKSPACE_ID=$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(data.workspace.id)' "$E2E_AUDIT_DIR/commands/dev-cli-workspace-create-hr-codex.txt")
printf 'export E2E_DEV_HR_CODEX_WORKSPACE_ID="%s"\n' "$DEV_HR_CODEX_WORKSPACE_ID" >> "$E2E_AUDIT_DIR/e2e-env.sh"
```

Expected: worker and workspace are created or duplicate/existing behavior is captured. Workspace id is appended.

- [ ] **Step 3: Start real Codex CLI session**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts session start --worker "$E2E_DEV_HR_CODEX_WORKER_ID" --workspace "$E2E_DEV_HR_CODEX_WORKSPACE_ID" --skill aiworker-hr.person-profile --engine codex --title "E2E R6 DEV Codex" --input "在当前 AIWorker workspace 内创建 artifacts/e2e-r6-dev-codex-20260526.md，写入一段中文说明，包含日期 2026-05-26、worker id、workspace id，并说明这是第 6 轮 source-dev 真实 E2E Codex 证据。不要修改仓库文件。" 2>&1 | tee "$E2E_AUDIT_DIR/commands/dev-cli-session-start-codex.txt"
```

Expected: command reaches terminal output. If it fails, capture as engine/AIWorker evidence and classify severity before release.

- [ ] **Step 4: Create HR Claude Code worker/workspace**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts engine select claude-code 2>&1 | tee "$E2E_AUDIT_DIR/commands/dev-cli-engine-select-claude-code.txt"
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts worker create --id "$E2E_DEV_HR_CLAUDE_CLI_WORKER_ID" --soul aiworker-hr --name "$E2E_DEV_HR_CLAUDE_CLI_WORKER_ID" 2>&1 | tee "$E2E_AUDIT_DIR/commands/dev-cli-worker-create-hr-claude.txt"
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts workspace create --worker "$E2E_DEV_HR_CLAUDE_CLI_WORKER_ID" --type people-profile --name "E2E R6 DEV HR Claude CLI 20260526" 2>&1 | tee "$E2E_AUDIT_DIR/commands/dev-cli-workspace-create-hr-claude.txt"
DEV_HR_CLAUDE_CLI_WORKSPACE_ID=$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(data.workspace.id)' "$E2E_AUDIT_DIR/commands/dev-cli-workspace-create-hr-claude.txt")
printf 'export E2E_DEV_HR_CLAUDE_CLI_WORKSPACE_ID="%s"\n' "$DEV_HR_CLAUDE_CLI_WORKSPACE_ID" >> "$E2E_AUDIT_DIR/e2e-env.sh"
```

Expected: engine selection and object creation output are captured.

- [ ] **Step 5: Start real Claude Code CLI session**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
env -u AIWORKER_HOME -u WORKER_DB_PATH bun apps/cli/src/aiworker.ts session start --worker "$E2E_DEV_HR_CLAUDE_CLI_WORKER_ID" --workspace "$E2E_DEV_HR_CLAUDE_CLI_WORKSPACE_ID" --skill aiworker-hr.person-profile --engine claude-code --title "E2E R6 DEV Claude CLI" --input "在当前 AIWorker workspace 内创建 artifacts/e2e-r6-dev-claude-cli-20260526.md，写入一段中文说明，包含日期 2026-05-26、worker id、workspace id，并说明这是第 6 轮 source-dev 真实 E2E Claude Code CLI 证据。不要修改仓库文件。" 2>&1 | tee "$E2E_AUDIT_DIR/commands/dev-cli-session-start-claude.txt"
```

Expected: session succeeds or provides actionable AIWorker/engine failure evidence.

- [ ] **Step 6: Capture source-dev after-CLI snapshots and artifact index**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/api/local/workers" | tee "$E2E_AUDIT_DIR/api/dev-workers-after-cli.json"
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/api/local/workspaces" | tee "$E2E_AUDIT_DIR/api/dev-workspaces-after-cli.json"
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/api/local/sessions" | tee "$E2E_AUDIT_DIR/api/dev-sessions-after-cli.json"
find "$E2E_DEV_HOME/workers" -path "*e2e-r6-dev-*.md" -print 2>/dev/null | sort | tee "$E2E_AUDIT_DIR/artifacts/dev-artifact-index.txt"
```

Expected: snapshots and artifact index are written. Missing artifact is a finding.

### Task 4: Source-dev Web HR/QA and Worker Configuration audit

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round6/browser/dev-*.json`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/screenshots/dev-*.png`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/api/dev-web-*.json`

- [ ] **Step 1: Open source-dev Worker Web desktop**

Use Browser or Playwright fallback at:

```text
http://127.0.0.1:5173
```

Capture:

```text
tmp/real-e2e-audit-2026-05-26-round6/browser/dev-web-desktop-layout.json
tmp/real-e2e-audit-2026-05-26-round6/browser/dev-web-console.json
tmp/real-e2e-audit-2026-05-26-round6/browser/dev-web-network.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/dev-web-desktop.png
```

Expected: Host shell and mounted surfaces are visible; no blank product surface.

- [ ] **Step 2: Open source-dev HR mounted surface at 390px**

Set viewport to `390x844`, select/create the `E2E_DEV_HR_WEB_CLAUDE_WORKER_ID` HR worker/workspace by id, and capture:

```text
tmp/real-e2e-audit-2026-05-26-round6/browser/dev-hr-narrow-layout.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/dev-hr-narrow.png
```

Expected: evidence records horizontal overflow, clipped controls, theme alignment, micro-app context and composer readiness.

- [ ] **Step 3: Start source-dev Web Claude Code session**

In Web, submit a real Claude Code prompt:

```text
在当前 AIWorker workspace 内创建 artifacts/e2e-r6-dev-web-claude-20260526.md，写入中文说明，包含日期 2026-05-26、worker id、workspace id，并说明这是第 6 轮 source-dev Web Claude Code 证据。不要修改仓库文件。
```

Capture:

```text
tmp/real-e2e-audit-2026-05-26-round6/browser/dev-web-claude-before-submit.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/dev-web-claude-before-submit.png
tmp/real-e2e-audit-2026-05-26-round6/browser/dev-web-claude-after-terminal.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/dev-web-claude-after-terminal.png
tmp/real-e2e-audit-2026-05-26-round6/api/dev-web-claude-session-detail.json
```

Expected: evidence proves submitted state, terminal/recovery state, artifact visibility or failure handling.

- [ ] **Step 4: Capture source-dev Worker Configuration for HR and QA**

Capture desktop and `390x844` state for HR and QA Worker Configuration:

```text
tmp/real-e2e-audit-2026-05-26-round6/browser/dev-worker-configuration-hr-desktop.json
tmp/real-e2e-audit-2026-05-26-round6/browser/dev-worker-configuration-hr-narrow.json
tmp/real-e2e-audit-2026-05-26-round6/browser/dev-worker-configuration-qa-desktop.json
tmp/real-e2e-audit-2026-05-26-round6/browser/dev-worker-configuration-qa-narrow.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/dev-worker-configuration-hr-narrow.png
tmp/real-e2e-audit-2026-05-26-round6/screenshots/dev-worker-configuration-qa-narrow.png
```

Expected: evidence includes visible layout plus textContent/outerHTML scan for workspace/session/domain configuration leakage.

- [ ] **Step 5: Open source-dev QA mounted desktop and narrow**

Create/select QA worker/workspace by `E2E_DEV_QA_WEB_WORKER_ID` and capture desktop plus `390x844`:

```text
tmp/real-e2e-audit-2026-05-26-round6/browser/dev-qa-desktop-layout.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/dev-qa-desktop.png
tmp/real-e2e-audit-2026-05-26-round6/browser/dev-qa-narrow-layout.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/dev-qa-narrow.png
```

Expected: QA mounted URL uses target worker/workspace; release/test-suite UI is visible; layout and console/network issues are recorded.

### Task 5: Source-dev release readiness classification

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round6/api/dev-final-*.json`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/logs/dev-focused-error-scan.txt`
- Modify: `tmp/real-e2e-audit-2026-05-26-round6/findings.md`
- Modify: `tmp/real-e2e-audit-2026-05-26-round6/README.md`

- [ ] **Step 1: Capture source-dev final state**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/api/local/workers" | tee "$E2E_AUDIT_DIR/api/dev-final-workers.json"
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/api/local/workspaces" | tee "$E2E_AUDIT_DIR/api/dev-final-workspaces.json"
curl -fsS "http://127.0.0.1:$E2E_DEV_API_PORT/api/local/sessions" | tee "$E2E_AUDIT_DIR/api/dev-final-sessions.json"
```

Expected: final source-dev state snapshots include created E2E objects.

- [ ] **Step 2: Focused source-dev error scan**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
{
  rg -n "error|warn|failed|exception|Unhandled|stream|timeout|E2E|e2e-r6-dev" "$E2E_AUDIT_DIR" apps packages 2>/dev/null || true
} | tee "$E2E_AUDIT_DIR/logs/dev-focused-error-scan.txt"
```

Expected: scan output is available for classification. Exclude self-referential false positives when writing findings.

- [ ] **Step 3: Classify source-dev release readiness**

Edit `tmp/real-e2e-audit-2026-05-26-round6/findings.md` so every issue found so far has the required fields. Then append one of these lines to README:

```text
source-dev gate: PASS - no P0/P1 release blocker found
```

or:

```text
source-dev gate: BLOCKED - P0/P1 release blocker found; do not tag or publish
```

Expected: README has an explicit source-dev gate result. If blocked, skip Tasks 6-8 and go to Task 10 with a blocked report.

### Task 6: Release version selection and local gates

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round6/commands/release-*.txt`
- Append: `tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh`
- Modify: `apps/cli/package.json`
- Generated: `apps/cli/dist/**`

- [ ] **Step 1: Query live npm/GitHub release state**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
npm view @zonease/aiworker-cli version dist-tags --json 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-npm-view-before.json"
gh release list --limit 10 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-gh-list-before.txt"
git ls-remote --tags origin 'v*' 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-remote-tags-before.txt"
node -e 'const pkg=require("./apps/cli/package.json"); console.log(pkg.version)' | tee "$E2E_AUDIT_DIR/commands/release-local-version-before.txt"
```

Expected: evidence shows current npm latest, GitHub Releases, remote tags and local package version.

- [ ] **Step 2: Choose next `< 1.0.0` version**

Run this helper to propose the next patch version from local `apps/cli/package.json`:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
node - <<'NODE' | tee "$E2E_AUDIT_DIR/commands/release-version-proposal.txt"
const pkg = require('./apps/cli/package.json')
const [major, minor, patch] = pkg.version.split('.').map(Number)
if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
  throw new Error(`Unexpected local version: ${pkg.version}`)
}
if (major >= 1) {
  throw new Error(`Refusing to release ${pkg.version}: version must remain < 1.0.0`)
}
const next = `${major}.${minor}.${patch + 1}`
console.log(next)
NODE
```

Expected: proposal is a `0.x.y` version. If current npm/GitHub state requires a different `0.x.y`, record the reason in README before editing version.

- [ ] **Step 3: Set release version in env**

Run after confirming the target version:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
TARGET_VERSION="$(tail -n 1 "$E2E_AUDIT_DIR/commands/release-version-proposal.txt")"
case "$TARGET_VERSION" in
  0.*.*) ;;
  *) echo "Refusing target version $TARGET_VERSION; must be 0.x.y" >&2; exit 1 ;;
esac
printf 'export E2E_RELEASE_VERSION="%s"\n' "$TARGET_VERSION" >> "$E2E_AUDIT_DIR/e2e-env.sh"
printf 'export E2E_RELEASE_TAG="v%s"\n' "$TARGET_VERSION" >> "$E2E_AUDIT_DIR/e2e-env.sh"
echo "release target: $TARGET_VERSION" | tee "$E2E_AUDIT_DIR/commands/release-target-version.txt"
```

Expected: env file now includes `E2E_RELEASE_VERSION` and `E2E_RELEASE_TAG`.

- [ ] **Step 4: Bump CLI package version**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
node - <<'NODE'
const fs = require('fs')
const path = 'apps/cli/package.json'
const version = process.env.E2E_RELEASE_VERSION
if (!version || !/^0\.\d+\.\d+$/.test(version)) {
  throw new Error(`Refusing release version ${version}; expected 0.x.y`)
}
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'))
pkg.version = version
fs.writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`)
NODE
git diff -- apps/cli/package.json | tee "$E2E_AUDIT_DIR/commands/release-version-diff.txt"
```

Expected: only `apps/cli/package.json` version changes to the chosen `0.x.y`.

- [ ] **Step 5: Run release gates**

Run each command and preserve output:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
bun run check 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-bun-run-check.txt"
bun run test 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-bun-run-test.txt"
bun run build 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-bun-run-build.txt"
bun run --filter '@zonease/aiworker-web' build 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-web-build.txt"
bun run --filter '@zonease/aiworker-cli' build:bundle 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-cli-build-bundle.txt"
```

Expected: every gate exits `0`. Any failure is a release blocker.

- [ ] **Step 6: Run package and boundary release checks**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
(cd apps/cli && npm pack --dry-run --json) 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-npm-pack-dry-run.json"
bun run --filter '@zonease/aiworker-cli' smoke:dist-release 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-smoke-dist-release.txt"
bun run ui:check 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-ui-check.txt"
bun scripts/check-soul-app-boundaries.ts --completion-audit 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-boundary-completion-audit.txt"
git diff --check 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-git-diff-check.txt"
```

Expected: every check exits `0`. Any failure is a release blocker.

- [ ] **Step 7: Verify package contents**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
{
  test -f apps/cli/dist/package.json && echo "dist package: ok"
  test -d apps/cli/dist/web && echo "web static: ok"
  test -d apps/cli/dist/drizzle/worker && echo "worker migrations: ok"
  test -d apps/cli/dist/official-apps/aiworker-hr && echo "official HR: ok"
  test -d apps/cli/dist/official-apps/aiworker-qa && echo "official QA: ok"
  node -e 'const pkg=require("./apps/cli/dist/package.json"); console.log(`dist version: ${pkg.version}`)'
  find apps/cli/dist/official-apps -maxdepth 3 -type f | sort | sed -n '1,120p'
} 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-package-content-check.txt"
```

Expected: output confirms all required release resources exist and dist version matches target.

### Task 7: Release commit, tag, push, and workflow verification

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round6/commands/release-git-*.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/logs/release-workflow-*.txt`
- Modify: git history, remote branch, remote tag

- [ ] **Step 1: Confirm clean staged scope before release commit**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
git status --short | tee "$E2E_AUDIT_DIR/commands/release-git-status-before-commit.txt"
git diff -- apps/cli/package.json | tee "$E2E_AUDIT_DIR/commands/release-version-final-diff.txt"
```

Expected: only intentional version/package generated changes are dirty. If unrelated user changes exist, do not stage them.

- [ ] **Step 2: Commit release prep**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
git add apps/cli/package.json
git commit -m "chore: 发布 AIWorker $E2E_RELEASE_VERSION" 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-git-commit.txt"
```

Expected: commit succeeds with only the package version change. If build generated tracked dist changes, inspect and stage only release-intentional files before committing.

- [ ] **Step 3: Create annotated tag**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
git tag -a "$E2E_RELEASE_TAG" -m "AIWorker $E2E_RELEASE_VERSION" 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-git-tag.txt"
```

Expected: annotated tag exists locally. If tag already exists, stop and classify before proceeding.

- [ ] **Step 4: Push branch and tag**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
git push origin HEAD 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-git-push-head.txt"
git push origin "$E2E_RELEASE_TAG" 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-git-push-tag.txt"
```

Expected: branch and tag push succeed. Tag push triggers `.github/workflows/release.yml`.

- [ ] **Step 5: Monitor release workflow**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
gh run list --workflow release.yml --limit 5 2>&1 | tee "$E2E_AUDIT_DIR/logs/release-workflow-list.txt"
RUN_ID="$(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
printf 'export E2E_RELEASE_WORKFLOW_RUN_ID="%s"\n' "$RUN_ID" >> "$E2E_AUDIT_DIR/e2e-env.sh"
gh run watch "$RUN_ID" --exit-status 2>&1 | tee "$E2E_AUDIT_DIR/logs/release-workflow-watch.txt"
gh run view "$RUN_ID" --log 2>&1 | tee "$E2E_AUDIT_DIR/logs/release-workflow-log.txt"
```

Expected: workflow completes successfully. Failure is a release blocker; do not start installed lane until resolved.

- [ ] **Step 6: Verify post-release npm and GitHub state**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
npm view @zonease/aiworker-cli version dist-tags --json 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-npm-view-after.json"
bunx "@zonease/aiworker-cli@$E2E_RELEASE_VERSION" --version 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-bunx-version.txt"
gh release view "$E2E_RELEASE_TAG" --json tagName,isDraft,isPrerelease,assets,url 2>&1 | tee "$E2E_AUDIT_DIR/commands/release-gh-release-view.json"
```

Expected: npm `version` and `latest` equal `E2E_RELEASE_VERSION`; `bunx` reports `aiworker/<version>`; GitHub Release is not draft and not prerelease.

### Task 8: Installed daemon/API/Web baseline from just-published package

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round6/logs/installed-listeners-before.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/commands/installed-*.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/api/installed-*.json`

- [ ] **Step 1: Stop conflicting installed listener only if it belongs to this run**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
{
  echo "## LISTEN $E2E_INSTALLED_API_PORT"
  lsof -nP -iTCP:"$E2E_INSTALLED_API_PORT" -sTCP:LISTEN || true
  echo
  echo "## LISTEN $E2E_INSTALLED_WEB_PORT"
  lsof -nP -iTCP:"$E2E_INSTALLED_WEB_PORT" -sTCP:LISTEN || true
} 2>&1 | tee "$E2E_AUDIT_DIR/logs/installed-listeners-before.txt"
```

Expected: listener state captured. If a conflicting process exists and is not from this run, record partial/blocker instead of killing it.

- [ ] **Step 2: Inspect installed home read-only**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
AIWORKER_HOME="$E2E_INSTALLED_HOME" bunx "@zonease/aiworker-cli@$E2E_RELEASE_VERSION" daemon status 2>&1 | tee "$E2E_AUDIT_DIR/commands/installed-daemon-status-before.txt"
AIWORKER_HOME="$E2E_INSTALLED_HOME" bunx "@zonease/aiworker-cli@$E2E_RELEASE_VERSION" app list 2>&1 | tee "$E2E_AUDIT_DIR/commands/installed-app-list-before.txt"
AIWORKER_HOME="$E2E_INSTALLED_HOME" bunx "@zonease/aiworker-cli@$E2E_RELEASE_VERSION" worker list 2>&1 | tee "$E2E_AUDIT_DIR/commands/installed-worker-list-before.txt"
```

Expected: installed home baseline is captured without clearing data.

- [ ] **Step 3: Start just-published installed daemon**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
tmux new-session -d -s aiworker-e2e-r6-installed-20260526 "AIWORKER_HOME=$E2E_INSTALLED_HOME PORT=$E2E_INSTALLED_API_PORT AIWORKER_WORKER_HOST=127.0.0.1 bunx @zonease/aiworker-cli@$E2E_RELEASE_VERSION daemon foreground --host 127.0.0.1 --port $E2E_INSTALLED_API_PORT 2>&1 | tee /Users/ben/projects/aiworker/$E2E_AUDIT_DIR/commands/installed-daemon-foreground.txt"
```

Expected: installed daemon starts in tmux from the just-published package.

- [ ] **Step 4: Wait for installed health**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
for i in $(seq 1 160); do
  if curl -fsS "http://127.0.0.1:$E2E_INSTALLED_API_PORT/health" | tee "$E2E_AUDIT_DIR/api/installed-health.txt"; then
    exit 0
  fi
  sleep 0.5
done
exit 1
```

Expected: `/health` returns before timeout. Failure is installed P0/P1 evidence.

- [ ] **Step 5: Capture installed API baseline**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
curl -fsS "http://127.0.0.1:$E2E_INSTALLED_API_PORT/api/local/info" | tee "$E2E_AUDIT_DIR/api/installed-info.json"
curl -fsS "http://127.0.0.1:$E2E_INSTALLED_API_PORT/api/local/settings" | tee "$E2E_AUDIT_DIR/api/installed-settings.json"
curl -fsS "http://127.0.0.1:$E2E_INSTALLED_API_PORT/api/local/settings/engines" | tee "$E2E_AUDIT_DIR/api/installed-settings-engines.json"
curl -fsS "http://127.0.0.1:$E2E_INSTALLED_API_PORT/api/local/apps" | tee "$E2E_AUDIT_DIR/api/installed-apps-before.json"
curl -fsS "http://127.0.0.1:$E2E_INSTALLED_API_PORT/api/local/workers" | tee "$E2E_AUDIT_DIR/api/installed-workers-before.json"
curl -fsS "http://127.0.0.1:$E2E_INSTALLED_API_PORT/api/local/workspaces" | tee "$E2E_AUDIT_DIR/api/installed-workspaces-before.json"
curl -fsS "http://127.0.0.1:$E2E_INSTALLED_API_PORT/api/local/sessions" | tee "$E2E_AUDIT_DIR/api/installed-sessions-before.json"
curl -fsS "http://127.0.0.1:$E2E_INSTALLED_API_PORT/openapi.json" | tee "$E2E_AUDIT_DIR/api/installed-openapi.json" >/dev/null
```

Expected: installed runtime version matches `E2E_RELEASE_VERSION`; snapshots are written.

### Task 9: Installed CLI/Web real E2E from published package

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round6/commands/installed-cli-*.txt`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/browser/installed-*.json`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/screenshots/installed-*.png`
- Append: `tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/artifacts/installed-*.txt`

- [ ] **Step 1: Bootstrap official apps from installed package**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
AIWORKER_HOME="$E2E_INSTALLED_HOME" bunx "@zonease/aiworker-cli@$E2E_RELEASE_VERSION" app bootstrap official 2>&1 | tee "$E2E_AUDIT_DIR/commands/installed-cli-app-bootstrap-official.txt"
```

Expected: HR and QA official apps bootstrap from published resources.

- [ ] **Step 2: Run installed Codex CLI session**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
AIWORKER_HOME="$E2E_INSTALLED_HOME" bunx "@zonease/aiworker-cli@$E2E_RELEASE_VERSION" worker create --id "$E2E_INSTALLED_HR_CODEX_WORKER_ID" --soul aiworker-hr --name "$E2E_INSTALLED_HR_CODEX_WORKER_ID" 2>&1 | tee "$E2E_AUDIT_DIR/commands/installed-cli-worker-create-hr-codex.txt"
AIWORKER_HOME="$E2E_INSTALLED_HOME" bunx "@zonease/aiworker-cli@$E2E_RELEASE_VERSION" workspace create --worker "$E2E_INSTALLED_HR_CODEX_WORKER_ID" --type people-profile --name "E2E R6 INSTALLED HR Codex 20260526" 2>&1 | tee "$E2E_AUDIT_DIR/commands/installed-cli-workspace-create-hr-codex.txt"
INSTALLED_HR_CODEX_WORKSPACE_ID=$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(data.workspace.id)' "$E2E_AUDIT_DIR/commands/installed-cli-workspace-create-hr-codex.txt")
printf 'export E2E_INSTALLED_HR_CODEX_WORKSPACE_ID="%s"\n' "$INSTALLED_HR_CODEX_WORKSPACE_ID" >> "$E2E_AUDIT_DIR/e2e-env.sh"
AIWORKER_HOME="$E2E_INSTALLED_HOME" bunx "@zonease/aiworker-cli@$E2E_RELEASE_VERSION" session start --worker "$E2E_INSTALLED_HR_CODEX_WORKER_ID" --workspace "$INSTALLED_HR_CODEX_WORKSPACE_ID" --skill aiworker-hr.person-profile --engine codex --title "E2E R6 INSTALLED Codex" --input "在当前 AIWorker workspace 内创建 artifacts/e2e-r6-installed-codex-20260526.md，写入一段中文说明，包含日期 2026-05-26、worker id、workspace id，并说明这是第 6 轮 installed 真实 E2E Codex 证据。不要修改仓库文件。" 2>&1 | tee "$E2E_AUDIT_DIR/commands/installed-cli-session-start-codex.txt"
```

Expected: session uses published package and creates workspace artifact.

- [ ] **Step 3: Run installed Claude Code CLI session**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
AIWORKER_HOME="$E2E_INSTALLED_HOME" bunx "@zonease/aiworker-cli@$E2E_RELEASE_VERSION" engine select claude-code 2>&1 | tee "$E2E_AUDIT_DIR/commands/installed-cli-engine-select-claude-code.txt"
AIWORKER_HOME="$E2E_INSTALLED_HOME" bunx "@zonease/aiworker-cli@$E2E_RELEASE_VERSION" worker create --id "$E2E_INSTALLED_HR_CLAUDE_CLI_WORKER_ID" --soul aiworker-hr --name "$E2E_INSTALLED_HR_CLAUDE_CLI_WORKER_ID" 2>&1 | tee "$E2E_AUDIT_DIR/commands/installed-cli-worker-create-hr-claude.txt"
AIWORKER_HOME="$E2E_INSTALLED_HOME" bunx "@zonease/aiworker-cli@$E2E_RELEASE_VERSION" workspace create --worker "$E2E_INSTALLED_HR_CLAUDE_CLI_WORKER_ID" --type people-profile --name "E2E R6 INSTALLED HR Claude CLI 20260526" 2>&1 | tee "$E2E_AUDIT_DIR/commands/installed-cli-workspace-create-hr-claude.txt"
INSTALLED_HR_CLAUDE_CLI_WORKSPACE_ID=$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(data.workspace.id)' "$E2E_AUDIT_DIR/commands/installed-cli-workspace-create-hr-claude.txt")
printf 'export E2E_INSTALLED_HR_CLAUDE_CLI_WORKSPACE_ID="%s"\n' "$INSTALLED_HR_CLAUDE_CLI_WORKSPACE_ID" >> "$E2E_AUDIT_DIR/e2e-env.sh"
AIWORKER_HOME="$E2E_INSTALLED_HOME" bunx "@zonease/aiworker-cli@$E2E_RELEASE_VERSION" session start --worker "$E2E_INSTALLED_HR_CLAUDE_CLI_WORKER_ID" --workspace "$INSTALLED_HR_CLAUDE_CLI_WORKSPACE_ID" --skill aiworker-hr.person-profile --engine claude-code --title "E2E R6 INSTALLED Claude CLI" --input "在当前 AIWorker workspace 内创建 artifacts/e2e-r6-installed-claude-cli-20260526.md，写入一段中文说明，包含日期 2026-05-26、worker id、workspace id，并说明这是第 6 轮 installed 真实 E2E Claude Code CLI 证据。不要修改仓库文件。" 2>&1 | tee "$E2E_AUDIT_DIR/commands/installed-cli-session-start-claude.txt"
```

Expected: session uses Claude Code or records engine-selection/runtime failure.

- [ ] **Step 4: Capture installed Web desktop and HR narrow**

Open the installed Web served by the published package. If the daemon serves Web on the API port, use:

```text
http://127.0.0.1:9317
```

Capture desktop and `390x844` HR state:

```text
tmp/real-e2e-audit-2026-05-26-round6/browser/installed-web-desktop-layout.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/installed-web-desktop.png
tmp/real-e2e-audit-2026-05-26-round6/browser/installed-hr-narrow-layout.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/installed-hr-narrow.png
```

Expected: published package serves Host Web and mounted HR surface without missing assets.

- [ ] **Step 5: Start installed Web Claude Code session**

In installed Web, submit a real Claude Code prompt:

```text
在当前 AIWorker workspace 内创建 artifacts/e2e-r6-installed-web-claude-20260526.md，写入中文说明，包含日期 2026-05-26、worker id、workspace id，并说明这是第 6 轮 installed Web Claude Code 证据。不要修改仓库文件。
```

Capture:

```text
tmp/real-e2e-audit-2026-05-26-round6/browser/installed-web-claude-before-submit.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/installed-web-claude-before-submit.png
tmp/real-e2e-audit-2026-05-26-round6/browser/installed-web-claude-after-terminal.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/installed-web-claude-after-terminal.png
tmp/real-e2e-audit-2026-05-26-round6/api/installed-web-claude-session-detail.json
```

Expected: evidence proves Web submission, terminal/recovery state and artifact visibility.

- [ ] **Step 6: Capture installed QA and Worker Configuration**

Capture installed QA desktop/narrow and HR/QA Worker Configuration desktop/narrow:

```text
tmp/real-e2e-audit-2026-05-26-round6/browser/installed-qa-desktop-layout.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/installed-qa-desktop.png
tmp/real-e2e-audit-2026-05-26-round6/browser/installed-qa-narrow-layout.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/installed-qa-narrow.png
tmp/real-e2e-audit-2026-05-26-round6/browser/installed-worker-configuration-hr-desktop.json
tmp/real-e2e-audit-2026-05-26-round6/browser/installed-worker-configuration-hr-narrow.json
tmp/real-e2e-audit-2026-05-26-round6/browser/installed-worker-configuration-qa-desktop.json
tmp/real-e2e-audit-2026-05-26-round6/browser/installed-worker-configuration-qa-narrow.json
tmp/real-e2e-audit-2026-05-26-round6/screenshots/installed-worker-configuration-hr-narrow.png
tmp/real-e2e-audit-2026-05-26-round6/screenshots/installed-worker-configuration-qa-narrow.png
```

Expected: published mounted surfaces are present, responsive, and boundary-compliant or produce findings with evidence.

### Task 10: Final comparison report and thin E2E skill

**Files:**
- Write: `tmp/real-e2e-audit-2026-05-26-round6/api/installed-final-*.json`
- Write: `tmp/real-e2e-audit-2026-05-26-round6/logs/final-focused-error-scan.txt`
- Modify: `tmp/real-e2e-audit-2026-05-26-round6/findings.md`
- Create: `tmp/real-e2e-audit-2026-05-26-round6/final-report.md`
- Create: `.agents/skills/aiworker-release-e2e/SKILL.md`

- [ ] **Step 1: Capture installed final state**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
curl -fsS "http://127.0.0.1:$E2E_INSTALLED_API_PORT/api/local/workers" | tee "$E2E_AUDIT_DIR/api/installed-final-workers.json"
curl -fsS "http://127.0.0.1:$E2E_INSTALLED_API_PORT/api/local/workspaces" | tee "$E2E_AUDIT_DIR/api/installed-final-workspaces.json"
curl -fsS "http://127.0.0.1:$E2E_INSTALLED_API_PORT/api/local/sessions" | tee "$E2E_AUDIT_DIR/api/installed-final-sessions.json"
find "$E2E_INSTALLED_HOME/workers" -path "*e2e-r6-installed-*.md" -print 2>/dev/null | sort | tee "$E2E_AUDIT_DIR/artifacts/installed-artifact-index.txt"
```

Expected: final installed state and artifact index are captured.

- [ ] **Step 2: Final focused scan**

Run:

```bash
source tmp/real-e2e-audit-2026-05-26-round6/e2e-env.sh
{
  rg -n "error|warn|failed|exception|Unhandled|stream|timeout|E2E|e2e-r6|$E2E_RELEASE_VERSION" "$E2E_AUDIT_DIR" apps packages 2>/dev/null || true
} | tee "$E2E_AUDIT_DIR/logs/final-focused-error-scan.txt"
```

Expected: scan output supports final classification. Exclude generated findings/report self-references when needed.

- [ ] **Step 3: Complete findings ledger**

Edit `tmp/real-e2e-audit-2026-05-26-round6/findings.md`. Every finding must include:

```text
### <ID> <Title>
- severity:
- phase:
- home:
- surface:
- reproduction:
- actual:
- expected:
- evidence:
- impact:
- suggested next step:
```

Expected: no finding lacks evidence references.

- [ ] **Step 4: Write final report**

Create `tmp/real-e2e-audit-2026-05-26-round6/final-report.md` with this structure:

```markdown
# AIWorker 第 6 轮发布绑定真实 E2E 报告

## Scope

## Release Target

## Source-Dev Result

## Release Gate And Publish Result

## Installed Result

## Dev Vs Installed Comparison

## Findings Summary

## Evidence Index

## Recommended Follow-Up Order

## Residual Risk
```

Expected: report separates verified facts, partial evidence, blocked areas, AIWorker issues, external engine issues, and UX/style findings.

- [ ] **Step 5: Create thin E2E skill**

Create `.agents/skills/aiworker-release-e2e/SKILL.md` with this exact thin content:

```markdown
---
name: aiworker-release-e2e
description: Use when running AIWorker release-backed real E2E audits across source-dev, formal publish, and installed package validation.
---

# AIWorker Release-Backed E2E

Use this for AIWorker long-form E2E runs where the goal is to verify the real operator path, not a smoke test.

## Boundaries

- Host is shell / locator / mount / bridge.
- Soul Apps own domain UI/API, domain state, app-owned artifacts, and confirmation actions.
- Do not use fake homes, mock engines, mock sessions, or test-only Soul Apps.
- Do not treat repo `dist` or `npm pack` as installed-package proof.
- Do not auto-upgrade to `1.0.0` or later while AIWorker is still pre-1.0.
- Do not copy secrets, engine auth profiles, raw tokens, or external account data into evidence.

## Standard Flow

1. Source-dev real E2E on `/Users/ben/.aiworker-dev`.
2. Release gates and formal publish to npm `latest` plus non-prerelease GitHub Release.
3. Installed real E2E on `/Users/ben/.aiworker` using the just-published package.
4. Compare source-dev vs installed behavior and write findings/report.

## Minimum Coverage

- CLI, daemon API, Host Web, official HR/QA Soul Apps.
- Worker/workspace/session locator flow.
- Codex and Claude Code real sessions.
- Mounted micro-app surfaces.
- Worker Configuration.
- Desktop and 390px narrow browser coverage.
- Artifact, session event, turn status, lifecycle, console/network/layout evidence.

## Evidence Shape

Use one run directory under `tmp/` containing:

- `README.md`
- `e2e-env.sh`
- `commands/`
- `api/`
- `browser/`
- `screenshots/`
- `logs/`
- `artifacts/`
- `findings.md`
- `final-report.md`

Each finding needs severity, phase, home, surface, reproduction, actual, expected, evidence, impact, and suggested next step.
```

Expected: skill is intentionally thin and does not include command matrices, automation harnesses, or historical narrative.

- [ ] **Step 6: Verify skill and docs diff**

Run:

```bash
git diff -- .agents/skills/aiworker-release-e2e/SKILL.md tmp/real-e2e-audit-2026-05-26-round6/final-report.md tmp/real-e2e-audit-2026-05-26-round6/findings.md | sed -n '1,240p'
git diff --check
```

Expected: thin skill is short; no whitespace errors.

## Plan Self-Review

- Spec coverage: Tasks 1-5 cover source-dev real E2E; Tasks 6-7 cover release gates, version guard, tag, GitHub Actions, npm latest and GitHub Release; Tasks 8-9 cover installed real E2E from just-published package; Task 10 covers final comparison report and thin skill.
- Placeholder scan: no `TBD`, `TODO`, or ambiguous "add tests later" steps remain. Commands include exact paths and evidence outputs.
- Type/name consistency: evidence directory is `tmp/real-e2e-audit-2026-05-26-round6/`; object prefixes are `e2e-r6-dev-*` and `e2e-r6-installed-*`; release variables are `E2E_RELEASE_VERSION` and `E2E_RELEASE_TAG`.
- Scope check: this is one release-backed E2E long task. Product bug fixes found during execution are intentionally out of scope unless a P0/P1 must be unblocked before publish with user approval.
