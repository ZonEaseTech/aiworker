# Host Daemon Product Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Host a package-installable daemon product while preserving Host/Worker runtime ownership boundaries.

**Architecture:** Keep `aiworker-host serve` as the low-level foreground API/static server. Promote Host lifecycle to daemon semantics: `start` and `daemon start` spawn `daemon foreground`, `daemon foreground` runs the Host service in-process, and `status/logs/stop/restart/clean` manage the recorded daemon manifest. Development mode keeps Vite as a dev child but enters through the same Host CLI lifecycle contract.

**Tech Stack:** Bun CLI, cac, Bun.serve, node child_process/fs, existing Host server and Host lifecycle modules, Bun tests, architecture contract tests.

---

### Task 1: Lock The Product Startup Contract

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/runtime.md`
- Modify: `tests/architecture/dev-service-contract.test.ts`
- Modify: `tests/architecture/host-dev-startup-contract.test.ts`

- [x] **Step 1: Write failing architecture tests**

Add assertions that Host product startup has daemon commands and that `dev:host`
still enters through `aiworker-host start --dev`.

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
bun test tests/architecture/dev-service-contract.test.ts tests/architecture/host-dev-startup-contract.test.ts --timeout=15000
```

Expected: failure because Host CLI does not expose the complete daemon contract
yet.

- [x] **Step 3: Update canonical docs**

Document that Host aligns with Worker on service lifecycle, while runtime
ownership remains separate.

- [x] **Step 4: Verify architecture tests**

Run the same architecture command. Expected: pass after implementation tasks
land.

### Task 2: Add Host Daemon CLI Surface

**Files:**
- Modify: `apps/host-cli/src/aiworker-host.ts`
- Modify: `apps/host-cli/src/aiworker-host.test.ts`

- [x] **Step 1: Write failing CLI tests**

Add tests for:

- `aiworker-host daemon start`
- `aiworker-host daemon foreground`
- `aiworker-host daemon restart`
- top-level `start/status/stop/restart/logs/clean` aliasing the Host daemon
  lifecycle.

- [x] **Step 2: Run CLI tests to verify failure**

Run:

```bash
bun test apps/host-cli/src/aiworker-host.test.ts --timeout=20000
```

Expected: failure on unknown daemon subcommands.

- [x] **Step 3: Implement minimal CLI routing**

Route daemon commands to the Host lifecycle module. Keep `serve` available as
the low-level server.

- [x] **Step 4: Verify CLI tests**

Run the same CLI test command. Expected: pass.

### Task 3: Implement Host Daemon Lifecycle

**Files:**
- Modify: `apps/host-cli/src/host-lifecycle.ts`
- Modify: `apps/host-cli/src/host-lifecycle.test.ts`
- Modify: `scripts/dev-host.sh`
- Modify: `scripts/dev-host-control.sh`

- [x] **Step 1: Write failing lifecycle tests**

Add tests that production `start` records a `host-daemon` service spawned through
`daemon foreground`, `restart` stops then starts, and `foreground` serves Host
API/static Web in the current process.

- [x] **Step 2: Run lifecycle tests to verify failure**

Run:

```bash
bun test apps/host-cli/src/host-lifecycle.test.ts --timeout=20000
```

Expected: failure because lifecycle still spawns `serve` directly and has no
restart/foreground contract.

- [x] **Step 3: Implement daemon lifecycle**

Add lifecycle methods for `foreground`, `restart`, default static Web asset
resolution, daemon manifest writing, pid/log tracking, and safe stop/clean.

- [x] **Step 4: Verify lifecycle tests**

Run the lifecycle command again. Expected: pass.

### Task 4: Browser Proof And Cleanup

**Files:**
- Modify: `tests/browser/host-dev-loop.spec.ts`
- Modify: `apps/host-cli/src/host-lifecycle.test.ts`

- [x] **Step 1: Update browser proof to use Host CLI lifecycle**

Use `aiworker-host start --dev --manifest <path>` and `aiworker-host clean` so
the browser proof exercises the product entry.

- [x] **Step 2: Run focused lint and browser proof if feasible**

Run:

```bash
bunx eslint apps/host-cli/src/host-lifecycle.ts apps/host-cli/src/host-lifecycle.test.ts apps/host-cli/src/aiworker-host.ts apps/host-cli/src/aiworker-host.test.ts tests/architecture/dev-service-contract.test.ts tests/architecture/host-dev-startup-contract.test.ts tests/browser/host-dev-loop.spec.ts
```

Run the browser proof only if the local environment has Playwright dependencies
available without new setup.

### Task 5: Final Verification And Commit

**Files:**
- All touched files.

- [x] **Step 1: Run focused verification**

Run:

```bash
bun test apps/host-cli/src/host-lifecycle.test.ts apps/host-cli/src/aiworker-host.test.ts --timeout=20000
bun test tests/architecture/dev-service-contract.test.ts tests/architecture/host-dev-startup-contract.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-host-cli' typecheck
bun run docs:check
bun run test:contracts
```

- [x] **Step 2: Run runtime smoke**

Run `bun run dev:host`, check `status`, `/host`, `/api/host/options`, then run
`bun run dev:host:clean` and verify the ports are clear.

- [x] **Step 3: Run code-review-graph**

Inspect impacted flows and risk.

- [x] **Step 4: Commit**

Commit the Host daemon product startup change with a Conventional Commit
message.
