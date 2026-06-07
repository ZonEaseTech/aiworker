# Env Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a root `/.env.example`, update ignored root `/.env` with the same project env inventory, and keep `packages/worker-daemon/.env.example` consistent with the root contract.

**Architecture:** Treat the root env example as the repo-level source of truth. The implementation is config/documentation only: it extracts current env names from code and scripts, groups them by runtime surface, preserves local `.env` values, and uses a mechanical verification script to catch omissions.

**Tech Stack:** Bun, TypeScript/JavaScript one-off verification, shell, existing AIWorker dev lifecycle scripts.

---

### Task 1: Write Root Env Inventory

**Files:**
- Create: `.env.example`
- Modify: `.env`
- Read: `docs/superpowers/specs/2026-06-07-env-inventory-design.md`
- Read: `packages/worker-daemon/.env.example`
- Read: `scripts/dev-local.sh`
- Read: `scripts/dev-host.sh`
- Read: `scripts/dev-host-control.sh`
- Read: `scripts/dev-fleet-web.ts`
- Read: `packages/worker-runtime/src/config/worker.ts`
- Read: `apps/host-cli/src/aiworker-host.ts`
- Read: `apps/host-cli/src/host-lifecycle.ts`

- [ ] **Step 1: Confirm current local values without printing secrets**

Run:

```bash
awk 'BEGIN{FS="="} /^[[:space:]]*#/ {next} /^[[:space:]]*$/ {next} /^[A-Za-z_][A-Za-z0-9_]*=/ {print $1}' .env | sort -u
```

Expected output includes:

```text
CADDY_BASIC_AUTH_PASSWORD
CADDY_BASIC_AUTH_USERNAME
```

- [ ] **Step 2: Create root `.env.example`**

Use `apply_patch` to add `.env.example` with this exact structure and keys. Keep values empty for secrets and tokens.

```dotenv
# AIWorker root environment example.
# Copy values into .env for local development. Bun loads root .env for package
# scripts, while shell scripts use inherited environment values.

###############################################################################
# Existing local/root values
###############################################################################

# Optional reverse-proxy basic auth values used by local Caddy setups.
CADDY_BASIC_AUTH_USERNAME=
CADDY_BASIC_AUTH_PASSWORD=

###############################################################################
# Worker dev profile
###############################################################################

# Source checkout runtime home. Packaged CLI defaults to ~/.aiworker; source dev
# scripts default to ~/.aiworker-dev.
AIWORKER_HOME=$HOME/.aiworker-dev

# Shared local bind host for dev scripts.
AIWORKER_HOST=127.0.0.1

# Worker daemon bind host. Defaults to AIWORKER_HOST in scripts.
AIWORKER_WORKER_HOST=127.0.0.1

# Worker daemon port.
PORT=9217

# Worker Web Vite bind host and port.
AIWORKER_WEB_HOST=127.0.0.1
AIWORKER_WEB_PORT=5173

# Worker Web API target. Must point at the Worker daemon.
AIWORKER_API_URL=http://127.0.0.1:9217

# Worker dev lifecycle metadata.
AIWORKER_WORKER_MANIFEST=$HOME/.aiworker-dev/dev-worker.json
AIWORKER_WORKER_WEB_TMUX_SESSION=aiworker-vite-worker

###############################################################################
# Worker runtime and storage
###############################################################################

# Optional local API token. If set, must be at least 16 characters.
AIWORKER_LOCAL_TOKEN=

# Single-home Worker DB override. Fleet workers intentionally ignore ambient
# WORKER_DB_PATH and derive DB paths from each worker home.
WORKER_DB_PATH=

# SQLite migrations folder override. Usually leave empty; the runtime resolves
# package migrations automatically.
WORKER_MIGRATIONS_FOLDER=

# Worker workspace root override. Usually leave empty; defaults under
# AIWORKER_HOME.
WORKER_WORKSPACE_ROOT=

###############################################################################
# CLI package shim
###############################################################################

# Optional Bun executable override used by the npm/bunx CLI shim when Bun is not
# on PATH.
AIWORKER_BUN_BIN=

###############################################################################
# Fleet dev harness
###############################################################################

# dev:fleet:clean only deletes the whole AIWORKER_HOME when this is 1.
AIWORKER_DEV_FLEET_PURGE=0

###############################################################################
# Host dev/prod lifecycle
###############################################################################

# Host bind host and fixed dev ports.
AIWORKER_HOST_API_PORT=9117
AIWORKER_HOST_WEB_PORT=5050

# Public Host API base URL. Host Web proxies to this URL in dev.
AIWORKER_HOST_API_URL=http://127.0.0.1:9117

# Host local lifecycle paths.
AIWORKER_HOST_DB=$HOME/.aiworker-dev/host.db
AIWORKER_HOST_MANIFEST=$HOME/.aiworker-dev/dev-host.json
AIWORKER_HOST_LOG_DIR=$HOME/.aiworker-dev
AIWORKER_HOST_DAEMON_LOG=$HOME/.aiworker-dev/host-daemon.log
AIWORKER_HOST_WEB_TMUX_SESSION=aiworker-vite-host

# Development-only static admin identity when Logto/session auth is not enabled.
AIWORKER_HOST_DEV_ADMIN_EMAIL=admin@example.com

# Public browser URL and Worker control/check-in URL overrides.
AIWORKER_HOST_BROWSER_BASE_URL=
AIWORKER_HOST_CONTROL_BASE_URL=

# Production Host Web static asset directory override.
AIWORKER_HOST_WEB_STATIC_DIR=

###############################################################################
# Host Logto/session auth
###############################################################################

# Logto session auth is all-or-nothing. If any required key below is set, all
# required keys must be non-empty.
# Generate session secret with: openssl rand -hex 32
AIWORKER_HOST_SESSION_SECRET=
AIWORKER_HOST_ALLOWED_EMAIL_DOMAINS=
AIWORKER_HOST_BOOTSTRAP_ADMINS=
LOGTO_CLIENT_ID=
LOGTO_CLIENT_SECRET=
LOGTO_ENDPOINT=
LOGTO_ISSUER=

# Optional Logto Management API proof/app setup values.
LOGTO_M2M_APP_ID=
LOGTO_M2M_APP_SECRET=
LOGTO_TENANT_ID=
LOGTO_MANAGEMENT_ENDPOINT=
LOGTO_MANAGEMENT_API_INDICATOR=

###############################################################################
# Worker provisioning/check-in
###############################################################################

# Provisioned Workers use both values together to check in with Host.
AIWORKER_HOST_URL=
AIWORKER_PROVISION_TOKEN=

###############################################################################
# Engine behavior and BYOK references
###############################################################################

# Codex native engine behavior toggles used by the Worker runtime.
AIWORKER_CODEX_DISABLE_PLUGINS=
AIWORKER_CODEX_IGNORE_USER_CONFIG=

# Local CLI engine timeout in milliseconds.
AIWORKER_LOCAL_CLI_ENGINE_TIMEOUT_MS=

# Legacy/compat Codex plugin toggle still recognized by the runtime.
OD_CODEX_DISABLE_PLUGINS=

# BYOK provider secrets. Worker settings should reference these as env:NAME;
# literal API keys are rejected by settings validation.
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

###############################################################################
# Optional worker-daemon/container variables
###############################################################################

AIWORKER_MODE=worker

# 32 bytes hex. Generate with: openssl rand -hex 32
AIWORKER_MASTER_KEY=

# Shared internal secret for legacy/container remote control paths.
# Generate with: openssl rand -hex 24
INTERNAL_SHARED_SECRET=

CLOUD_GATEWAY_MCP_URL=
CLOUD_GATEWAY_MCP_TOKEN=
CLOUD_GATEWAY_DEFAULT_CATEGORY=
CLOUD_GATEWAY_DEFAULT_TYPE_ID=

OPENAI_BASE_URL=https://api.openai.com
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=60000

MAX_CONCURRENT_TOTAL=4
# Per-engine override pattern: MAX_CONCURRENT_<ENGINE>, with dash converted to
# underscore and uppercased. Example: MAX_CONCURRENT_CLAUDE_CODE=2
PROCESS_STALL_TIMEOUT_MS=120000
PROCESS_KILL_TIMEOUT_MS=10000
PROCESS_AUTO_CLEANUP_DELAY_MS=60000
PROCESS_GC_INTERVAL_MS=30000

###############################################################################
# Browser and real-engine test knobs
###############################################################################

AIWORKER_BROWSER_WORKBENCH_RENDER_TIMEOUT_MS=45000
AIWORKER_ENGINE_REAL_TIMEOUT_MS=120000
AIWORKER_ENGINE_REAL_SHORT_TIMEOUT_MS=1
AIWORKER_ENGINE_REAL_WAIT_TIMEOUT_MS=60000
AIWORKER_ENGINE_REAL_DRAIN_MS=1500
AIWORKER_ENGINE_REAL_SAMPLES=1

###############################################################################
# Soul E2E sampling knobs
###############################################################################

AIWORKER_E2E_RUN_ID=
AIWORKER_E2E_COMMIT=
AIWORKER_E2E_HOME=
AIWORKER_E2E_REASONING=
AIWORKER_E2E_ENGINE_TIMEOUT_MS=900000
```

- [ ] **Step 3: Rewrite ignored root `.env` with the same groups**

Use `apply_patch` to replace `.env` with the same structure as `.env.example`, but preserve current local values for:

```dotenv
CADDY_BASIC_AUTH_USERNAME=<existing local value>
CADDY_BASIC_AUTH_PASSWORD=<existing local value>
```

Every secret/token/API-key variable not already present locally must remain empty. Non-sensitive defaults should match `.env.example`.

- [ ] **Step 4: Verify the local `.env` value policy**

Run:

```bash
awk -F= '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  /^[A-Za-z_][A-Za-z0-9_]*=/ {
    key=$1
    value=$0
    sub(/^[^=]*=/, "", value)
    if (key ~ /(SECRET|TOKEN|API_KEY|PASSWORD|MASTER_KEY)$/ && value != "" && key !~ /^CADDY_BASIC_AUTH_/) {
      print key
    }
  }
' .env
```

Expected output:

```text
```

- [ ] **Step 5: Commit root env files**

Do not stage `.env`; it is ignored and local-only.

```bash
git add .env.example
git commit -m "docs: 添加根环境变量示例"
```

Expected output includes:

```text
1 file changed
```

### Task 2: Reconcile Package-Local Worker Daemon Example

**Files:**
- Modify: `packages/worker-daemon/.env.example`
- Read: `.env.example`

- [ ] **Step 1: Compare package example against root example**

Run:

```bash
awk 'BEGIN{FS="="} /^[[:space:]]*#/ {next} /^[[:space:]]*$/ {next} /^[A-Za-z_][A-Za-z0-9_]*=/ {print $1}' .env.example | sort -u > /tmp/aiworker-root-env.keys
awk 'BEGIN{FS="="} /^[[:space:]]*#/ {next} /^[[:space:]]*$/ {next} /^[A-Za-z_][A-Za-z0-9_]*=/ {print $1}' packages/worker-daemon/.env.example | sort -u > /tmp/aiworker-worker-daemon-env.keys
comm -23 /tmp/aiworker-worker-daemon-env.keys /tmp/aiworker-root-env.keys
```

Expected output:

```text
```

- [ ] **Step 2: Update package-local example to point to root**

Use `apply_patch` to replace the stale historical wording at the top of `packages/worker-daemon/.env.example` with:

```dotenv
# Worker daemon package env subset.
# The repo-level source of truth is ../../.env.example. Keep this file as a
# package-local subset for Docker/package consumers that run worker-daemon
# directly.
```

Keep the worker-daemon-specific subset below it. Ensure the subset values match the root file for keys that appear in both files:

```dotenv
AIWORKER_MODE=worker
AIWORKER_MASTER_KEY=
INTERNAL_SHARED_SECRET=
CLOUD_GATEWAY_MCP_URL=
CLOUD_GATEWAY_MCP_TOKEN=
CLOUD_GATEWAY_DEFAULT_CATEGORY=
CLOUD_GATEWAY_DEFAULT_TYPE_ID=
OPENAI_BASE_URL=https://api.openai.com
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=60000
PORT=9217
MAX_CONCURRENT_TOTAL=4
PROCESS_STALL_TIMEOUT_MS=120000
PROCESS_KILL_TIMEOUT_MS=10000
PROCESS_AUTO_CLEANUP_DELAY_MS=60000
PROCESS_GC_INTERVAL_MS=30000
```

- [ ] **Step 3: Verify package subset consistency**

Run:

```bash
bun run - <<'EOF'
const fs = await import('node:fs')

function readEnv(path) {
  const result = new Map()
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      continue
    const index = line.indexOf('=')
    result.set(line.slice(0, index), line.slice(index + 1))
  }
  return result
}

const root = readEnv('.env.example')
const subset = readEnv('packages/worker-daemon/.env.example')
const mismatches = []
for (const [key, value] of subset) {
  if (!root.has(key)) {
    mismatches.push(`${key}: missing from root`)
    continue
  }
  if (root.get(key) !== value)
    mismatches.push(`${key}: root=${root.get(key)} subset=${value}`)
}

if (mismatches.length) {
  console.error(mismatches.join('\n'))
  process.exit(1)
}
console.log(`package subset ok (${subset.size} keys)`)
EOF
```

Expected output:

```text
package subset ok
```

- [ ] **Step 4: Commit package example reconciliation**

```bash
git add packages/worker-daemon/.env.example
git commit -m "docs: 对齐 worker daemon 环境变量示例"
```

Expected output includes:

```text
1 file changed
```

### Task 3: Verify Full Project-Specific Env Coverage

**Files:**
- Read: `.env.example`
- Read: `.env`
- Read: `apps/**`
- Read: `packages/**`
- Read: `scripts/**`
- Read: `tests/**`
- Read: `docs/architecture.md`
- Read: `docs/protocol.md`
- Read: `docs/runtime.md`
- Read: `docs/testing.md`

- [ ] **Step 1: Run focused source extraction check**

Run:

```bash
bun run - <<'EOF'
const fs = await import('node:fs')
const path = await import('node:path')
const childProcess = await import('node:child_process')

const includeRoots = [
  'apps',
  'packages',
  'scripts',
  'tests',
  'docs/architecture.md',
  'docs/protocol.md',
  'docs/runtime.md',
  'docs/testing.md',
  'README.md',
  'README.zh-CN.md',
  'AGENTS.md',
  'package.json',
]

const excludedPathParts = [
  'node_modules',
  'dist',
  '.turbo',
  'docs/superpowers/plans',
]

const ambient = new Set([
  'BUN_INSTALL',
  'HOME',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'LOGNAME',
  'NODE_ENV',
  'NODE_EXTRA_CA_CERTS',
  'NO_PROXY',
  'PATH',
  'PREFIX',
  'SHELL',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'TEMP',
  'TERM',
  'TMP',
  'TMPDIR',
  'TZ',
  'USER',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'npm_config_prefix',
])

const fixtureOnly = new Set([
  'AIWORKER_BROWSER_MOUNT_TIMEOUT_MS',
  'AIWORKER_EVIDENCE_DIR',
  'AIWORKER_LOGTO_PROOF_BASE_URL',
  'AIWORKER_PHASE2_URL',
  'AIWORKER_PHASE2_WORKER_URL',
  'AIWORKER_WORKER_ACCESS_LOCAL_URL',
  'AIWORKER_BOOTSTRAP_TOKEN',
  'AIWORKER_ARGS_DISPLAY',
  'AIWORKER_BUN_BUNDLE',
  'AIWORKER_SHIM_DIR',
  'TEST_ENGINE_ENV_LOG',
])

const prefixes = [
  'AIWORKER_',
  'WORKER_',
  'LOGTO_',
  'OPENAI_',
  'ANTHROPIC_',
  'CLOUD_GATEWAY_',
  'CADDY_',
  'INTERNAL_',
  'MAX_CONCURRENT_',
  'PROCESS_',
  'OD_CODEX_',
  'PORT',
]

function walk(entry, files = []) {
  if (!fs.existsSync(entry))
    return files
  const stat = fs.statSync(entry)
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(entry))
      walk(path.join(entry, name), files)
    return files
  }
  if (excludedPathParts.some(part => entry.includes(part)))
    return files
  if (!/\.(ts|tsx|js|jsx|sh|md|json)$/.test(entry))
    return files
  files.push(entry)
  return files
}

function readExampleKeys(file) {
  const keys = new Set()
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)
    if (match)
      keys.add(match[1])
  }
  return keys
}

const files = includeRoots.flatMap(root => walk(root))
const found = new Set()
const patterns = [
  /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /process\.env\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g,
  /Bun\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /\b([A-Z][A-Z0-9_]{2,})=\$\{[^}]+:-/g,
  /\b([A-Z][A-Z0-9_]{2,})=/g,
]

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const key = match[1]
      if (!key)
        continue
      if (!prefixes.some(prefix => key === prefix || key.startsWith(prefix)))
        continue
      if (ambient.has(key) || fixtureOnly.has(key))
        continue
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|MIT|SDK|MCP|API|URL|JSON|HTTP|HTTPS|CLI|UI|DB)$/.test(key))
        continue
      found.add(key)
    }
  }
}

const example = readExampleKeys('.env.example')
const missing = [...found].filter(key => !example.has(key)).sort()
if (missing.length) {
  console.error(`Missing env keys in .env.example:\n${missing.join('\n')}`)
  process.exit(1)
}

console.log(`env coverage ok (${found.size} project keys checked)`)
EOF
```

Expected output:

```text
env coverage ok
```

- [ ] **Step 2: Verify `.env` has the same project keys as `.env.example`**

Run:

```bash
awk 'BEGIN{FS="="} /^[[:space:]]*#/ {next} /^[[:space:]]*$/ {next} /^[A-Za-z_][A-Za-z0-9_]*=/ {print $1}' .env.example | sort -u > /tmp/aiworker-env-example.keys
awk 'BEGIN{FS="="} /^[[:space:]]*#/ {next} /^[[:space:]]*$/ {next} /^[A-Za-z_][A-Za-z0-9_]*=/ {print $1}' .env | sort -u > /tmp/aiworker-env-local.keys
diff -u /tmp/aiworker-env-example.keys /tmp/aiworker-env-local.keys
```

Expected output:

```text
```

- [ ] **Step 3: Verify dev lifecycle status still reads cleanly**

Run:

```bash
bun run dev:status
bun run dev:host:status
```

Expected output:

```text
[dev:status] AIWORKER_HOME=
```

and Host status prints JSON with:

```text
"profile": "host"
```

The Worker daemon does not need to be running. If it is not running, `daemon: not reachable` is acceptable.

- [ ] **Step 4: Inspect git status and ignored `.env` behavior**

Run:

```bash
git status --short --ignored .env .env.example packages/worker-daemon/.env.example
```

Expected output includes `.env.example` or `packages/worker-daemon/.env.example` only if there are uncommitted tracked changes, and includes ignored `.env` as:

```text
!! .env
```

- [ ] **Step 5: Run code-review-graph only if runtime code changed**

If only `.env.example`, ignored `.env`, and `packages/worker-daemon/.env.example` changed, skip code-review-graph because the repo contract says docs-only/instruction-only changes do not require it.

If any runtime source file changed, run:

```bash
bun run crg:review
```

Expected output should not report a blocker for the touched runtime files.

- [ ] **Step 6: Final commit if tracked verification edits remain**

If Task 3 required editing tracked files, commit them:

```bash
git add .env.example packages/worker-daemon/.env.example
git commit -m "docs: 完成环境变量清单校验"
```

Expected output includes:

```text
docs: 完成环境变量清单校验
```

If there are no tracked changes, skip this commit.
