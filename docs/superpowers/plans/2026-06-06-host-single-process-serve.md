# Host Single Process Serve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `aiworker-host serve` a single deployable Host process that serves Host Web static assets and Host API from one port.

**Architecture:** Keep Host Web as a Vite-built SPA. `aiworker-host serve` accepts a static directory and routes `/host`, `/assets/*`, and `/favicon.svg` from that directory while preserving `/api/host/*`, `/api/provision/*`, and `/workers/:workerId` API behavior. Development may still use `dev:host`, but server deployment can run one Host process behind Caddy.

**Tech Stack:** Bun, TypeScript, existing `apps/host-cli` server, Vite-built `apps/host-web/dist`, Playwright browser proof.

---

### Task 1: Host Server Static Web Contract

**Files:**
- Modify: `apps/host-cli/src/host-server.test.ts`
- Modify: `apps/host-cli/src/host-server.ts`

- [x] **Step 1: Write failing tests**

Add tests proving that a Host server with `webStaticDir` returns the Host Web index for `/host`, serves static assets such as `/assets/app.js` and `/favicon.svg`, keeps `/api/host/options` as JSON, and rejects path traversal.

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts --timeout=15000
```

Expected: new static Web tests fail because `HostServerOptions` has no `webStaticDir` and `/host` still returns the dev landing text.

- [x] **Step 3: Implement static serving**

Add `webStaticDir?: string` to `HostServerOptions`. In `createHostServer`, serve Web static files only for GET/HEAD requests and only inside the configured directory. Preserve API routes and Worker Access routes.

- [x] **Step 4: Verify green**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts --timeout=15000
```

Expected: Host server tests pass.

### Task 2: CLI Serve Wiring

**Files:**
- Modify: `apps/host-cli/src/aiworker-host.test.ts`
- Modify: `apps/host-cli/src/aiworker-host.ts`

- [x] **Step 1: Write failing tests**

Add tests proving `aiworker-host serve --host 127.0.0.1 --web-static-dir /tmp/host-web-dist` passes `webStaticDir` into `createHostServer`, binds Bun.serve with `hostname`, and prints `webStaticDir` in the startup JSON.

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
bun test apps/host-cli/src/aiworker-host.test.ts --timeout=15000
```

Expected: new CLI tests fail because `serve` does not accept `--host` or `--web-static-dir`.

- [x] **Step 3: Implement CLI options**

Add `--host <host>` and `--web-static-dir <path>` to `serve`. Pass `hostname` to `Bun.serve`, pass `webStaticDir` to `createHostServer`, and include both in the startup JSON.

- [x] **Step 4: Verify green**

Run:

```bash
bun test apps/host-cli/src/aiworker-host.test.ts --timeout=15000
```

Expected: Host CLI tests pass.

### Task 3: Single Process Browser Proof

**Files:**
- Create: `tests/browser/host-single-serve.spec.ts`
- Modify: `package.json`

- [x] **Step 1: Write browser proof**

Add a script that builds Host Web, starts `aiworker-host serve --web-static-dir apps/host-web/dist` on one random port, opens `/host`, verifies the Host console shell, verifies `/api/host/options` works on the same origin, and confirms there are no unexpected browser errors.

- [x] **Step 2: Add package script**

Add:

```json
"test:browser:host-serve": "bun run --filter '@zonease/aiworker-host-web' build && bun tests/browser/host-single-serve.spec.ts"
```

- [x] **Step 3: Verify browser proof**

Run:

```bash
bun run test:browser:host-serve
```

Expected: one Host process serves Web and API from the same port.

### Task 4: Final Verification

**Files:**
- No new files beyond Tasks 1-3.

- [x] **Step 1: Run focused tests**

```bash
bun test apps/host-cli/src/host-server.test.ts apps/host-cli/src/aiworker-host.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-host-web' test
bun run --filter '@zonease/aiworker-host-web' typecheck
bun run test:browser:host-serve
bun run test:browser:phase2
```

- [x] **Step 2: Run code-review-graph**

```bash
bun run crg:review
```

- [x] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-06-06-host-single-process-serve.md apps/host-cli/src/host-server.ts apps/host-cli/src/host-server.test.ts apps/host-cli/src/aiworker-host.ts apps/host-cli/src/aiworker-host.test.ts tests/browser/host-single-serve.spec.ts package.json
git commit -m "feat(host): 支持单进程服务 web 和 api"
```
