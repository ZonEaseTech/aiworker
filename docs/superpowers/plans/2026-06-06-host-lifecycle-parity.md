# Host Lifecycle Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Host and Worker expose the same service lifecycle experience: start, status, stop, clean, and logs.

**Architecture:** Keep `aiworker-host serve` as the low-level foreground server. Add a Host lifecycle layer used by `aiworker-host start/status/stop/clean/logs`; dev mode delegates to the existing Host dev service harness, and production mode starts one detached Host serve process with built static Web. Root `dev:host*` scripts become thin wrappers around the Host CLI.

**Tech Stack:** Bun, TypeScript, existing Host CLI/server, shell dev harness, tmux-backed dev Web sessions.

---

### Task 1: Host CLI Lifecycle Contract

**Files:**
- Modify: `apps/host-cli/src/aiworker-host.test.ts`
- Modify: `apps/host-cli/src/aiworker-host.ts`
- Create: `apps/host-cli/src/host-lifecycle.ts`

- [x] **Step 1: Write failing tests**

Add Host CLI tests proving:
- `aiworker-host start --dev` delegates to a Host lifecycle starter with mode `dev`.
- `aiworker-host start --web-static-dir apps/host-web/dist` delegates with mode `prod`.
- `status`, `stop`, `clean`, and `logs` are first-class Host CLI commands.

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
bun test apps/host-cli/src/aiworker-host.test.ts --timeout=15000
```

Expected: lifecycle tests fail because the commands and lifecycle dependency do not exist.

- [x] **Step 3: Implement lifecycle commands**

Add `HostLifecycle` dependency injection to `runHostCli`, implement default lifecycle functions, and register `start`, `status`, `stop`, `clean`, and `logs`.

- [x] **Step 4: Verify green**

Run:

```bash
bun test apps/host-cli/src/aiworker-host.test.ts --timeout=15000
```

Expected: Host CLI tests pass.

### Task 2: Dev Script Parity

**Files:**
- Modify: `package.json`
- Modify: `tests/architecture/dev-service-contract.test.ts`
- Modify: `tests/architecture/host-dev-startup-contract.test.ts`

- [x] **Step 1: Write failing architecture tests**

Update dev service tests so Host root scripts call `aiworker-host start/status/stop/clean/logs` instead of exposing shell scripts as the primary lifecycle interface.

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
bun test tests/architecture/dev-service-contract.test.ts tests/architecture/host-dev-startup-contract.test.ts --timeout=15000
```

Expected: tests fail until package scripts point at Host CLI lifecycle commands.

- [x] **Step 3: Update package scripts**

Make `dev:host`, `dev:host:status`, `dev:host:stop`, `dev:host:clean`, and `dev:host:logs` call `bun apps/host-cli/src/aiworker-host.ts ...`.

- [x] **Step 4: Verify green**

Run:

```bash
bun test tests/architecture/dev-service-contract.test.ts tests/architecture/host-dev-startup-contract.test.ts --timeout=15000
```

Expected: architecture tests pass.

### Task 3: Runtime Proof

**Files:**
- No new files beyond Tasks 1-2.

- [x] **Step 1: Run focused verification**

Run:

```bash
bun test apps/host-cli/src/host-options.test.ts apps/host-cli/src/host-server.test.ts apps/host-cli/src/aiworker-host.test.ts --timeout=15000
bun test tests/architecture/dev-service-contract.test.ts tests/architecture/host-dev-startup-contract.test.ts tests/architecture/worker-startup-contract.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-host-cli' typecheck
bun run docs:check
```

- [x] **Step 2: Smoke Host lifecycle**

Run:

```bash
bun run dev:host
bun run dev:host:status
bun run dev:host:logs -- --service api --tail 20
bun run dev:host:stop
```

Expected: Host dev starts via CLI, status reports manifest/services, logs are readable, and stop removes active listeners on `9117` and `5050`.

- [x] **Step 3: Run code-review-graph**

Run code-review-graph for changed files and inspect impact.

- [x] **Step 4: Commit**

Commit the full lifecycle parity change after verification.
