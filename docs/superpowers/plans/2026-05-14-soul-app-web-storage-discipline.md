# Soul App Web Storage Discipline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a trusted first-party Soul App browser storage discipline with a scoped SDK helper, validation self-check, documentation, and tests.

**Architecture:** Keep Host broker storage as the durable domain state path. Add a small SDK helper for browser `localStorage` / `sessionStorage` scoped by app, worker, workspace, and session. Add validation/self-check coverage so first-party Soul Apps cannot accidentally use raw Web Storage APIs in production source.

**Tech Stack:** Bun, TypeScript, bun:test, existing CLI `app validate`, root lint scripts, PMA docs.

---

## File Structure

- Modify `packages/soul-app-sdk/src/index.ts`: export `createSoulAppWebStorage` and related result/types.
- Modify `packages/soul-app-sdk/src/index.test.ts`: add TDD tests for key scoping, no global clear, unavailable storage handling, and JSON failure handling.
- Modify `apps/cli/src/aiworker.ts`: add `webStorageIssues` to Soul App validation, scan app production `src/`, and fail validation on raw Web Storage API use.
- Modify `apps/cli/src/aiworker.test.ts`: add a failing validation fixture for raw `localStorage/sessionStorage`.
- Modify `scripts/check-soul-app-boundaries.ts`: include the same Web Storage self-check in root lint for official apps.
- Modify `package.json`: wire the root lint command to run the updated boundary/self-check script; no new script is necessary if the existing script name remains accurate.
- Modify `docs/architecture.md`: document trusted first-party browser storage discipline and future third-party isolation gate.
- Modify `docs/soul-app-developer.md`: document SDK helper usage and direct Web Storage prohibition.
- Modify `packages/soul-app-sdk/README.md`: document helper API.
- Add/modify PMA files `docs/task/FEAT-084.md`, `docs/plan/PLAN-321.md`, `docs/task/index.md`, `docs/plan/index.md`, and `docs/changelog.md`.

## Task 1: SDK Scoped Web Storage Helper

**Files:**
- Modify: `packages/soul-app-sdk/src/index.test.ts`
- Modify: `packages/soul-app-sdk/src/index.ts`
- Modify: `packages/soul-app-sdk/README.md`

- [ ] **Step 1: Write failing tests**

Add tests similar to:

```ts
it('scopes browser storage keys by app, worker, workspace, and session', () => {
  const local = new MemoryStorage()
  const session = new MemoryStorage()
  const storage = createSoulAppWebStorage({
    appId: 'demo-soul-app',
    localStorage: local,
    sessionId: 'session-1',
    sessionStorage: session,
    workerId: 'worker-1',
    workspaceId: 'workspace-1',
  })

  expect(storage.local.set('filters', { status: 'open' }).ok).toBe(true)
  expect(storage.session.set('draft', { text: 'hello' }).ok).toBe(true)
  expect(local.getItem('aiworker:app:demo-soul-app:worker-1:workspace-1:local:filters')).toBe(JSON.stringify({ status: 'open' }))
  expect(session.getItem('aiworker:app:demo-soul-app:worker-1:workspace-1:session:session-1:draft')).toBe(JSON.stringify({ text: 'hello' }))
})
```

Also add tests for `clearScope()` deleting only matching keys, invalid keys failing, unavailable storage returning `{ ok: false }`, and invalid JSON returning `{ ok: false, code: 'parse_error' }`.

- [ ] **Step 2: Run RED**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-sdk' test src/index.test.ts
```

Expected: fail because `createSoulAppWebStorage` and test `MemoryStorage` behavior are not implemented.

- [ ] **Step 3: Implement the helper**

Add exported interfaces and helper in `packages/soul-app-sdk/src/index.ts`:

```ts
export interface SoulAppWebStorageOptions {
  appId: string
  localStorage?: StorageLike
  sessionId?: string
  sessionStorage?: StorageLike
  workerId?: string
  workspaceId?: string
}

export interface StorageLike {
  readonly length: number
  clear?: () => void
  getItem: (key: string) => string | null
  key: (index: number) => string | null
  removeItem: (key: string) => void
  setItem: (key: string, value: string) => void
}
```

Expose `local` and `session` facades with `get`, `set`, `remove`, `clearScope`, and `key`.

- [ ] **Step 4: Run GREEN**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-sdk' test src/index.test.ts
bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck
```

Expected: both pass.

- [ ] **Step 5: Document SDK helper**

Update `packages/soul-app-sdk/README.md` with a concise example:

```ts
const storage = createSoulAppWebStorage({ appId, workerId, workspaceId, sessionId })
storage.local.set('filters', { status: 'open' })
storage.session.set('draft', { body: '...' })
```

State that broker storage remains the durable domain path.

## Task 2: CLI Validation Web Storage Self-Check

**Files:**
- Modify: `apps/cli/src/aiworker.test.ts`
- Modify: `apps/cli/src/aiworker.ts`

- [ ] **Step 1: Write failing CLI validation test**

Add a test after the private import tests:

```ts
it('fails Soul App validation on raw browser storage usage', async () => {
  const appDir = path.join(root, 'raw-storage-app')

  expect(await runCli(argv('app', 'create', 'raw-storage-app', '--dir', appDir))).toBe(0)
  output = ''
  await writeFile(path.join(appDir, 'src/raw-storage.ts'), [
    'localStorage.setItem("theme", "dark")',
    'window.sessionStorage.clear()',
    '',
  ].join('\n'))

  expect(await runCli(argv('app', 'validate', appDir))).toBe(1)
  const validation = JSON.parse(output) as {
    validation: {
      status: string
      webStorageIssues: Array<{ file: string, message: string, symbol: string }>
    }
  }
  expect(validation.validation.status).toBe('fail')
  expect(validation.validation.webStorageIssues.map(issue => issue.symbol)).toEqual(['localStorage', 'window.sessionStorage.clear'])
})
```

- [ ] **Step 2: Run RED**

Run:

```bash
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts
```

Expected: fail because `webStorageIssues` is not reported.

- [ ] **Step 3: Implement CLI scan**

Add a `WebStorageIssue` interface, include `webStorageIssues` in `AppValidationResult` and `validationReport`, and scan `src/` files for raw `localStorage`, `window.localStorage`, `sessionStorage`, `window.sessionStorage`, and direct `clear()` calls on those objects.

Use messages that explain the fix:

```text
Soul Apps must use createSoulAppWebStorage(...) instead of raw browser Web Storage APIs.
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts
```

Expected: pass.

## Task 3: Root Official App Self-Check

**Files:**
- Modify: `scripts/check-soul-app-boundaries.ts`
- Modify: `package.json` if script wording needs to stay clear

- [ ] **Step 1: Write failing self-check behavior**

Because this script is a direct Bun script, add a small helper and test manually with a temporary fixture if there is no existing script test harness. The failing case should be a Soul App source file containing:

```ts
window.localStorage.clear()
```

Expected script output includes:

```text
Soul Apps must use createSoulAppWebStorage(...) instead of raw browser Web Storage APIs.
```

- [ ] **Step 2: Implement root scan**

Reuse the same source-file traversal as import boundary scanning. Report raw browser storage issues for apps discovered by `discoverSoulApps()`.

- [ ] **Step 3: Run root self-check**

Run:

```bash
bun scripts/check-soul-app-boundaries.ts
```

Expected: pass for current official HR/QA apps.

Run:

```bash
bun run lint
```

Expected: pass, proving the self-check remains wired through root lint.

## Task 4: Architecture And Authoring Docs

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/soul-app-developer.md`

- [ ] **Step 1: Update architecture**

Add a concise subsection under isolation/security or data rules:

```text
Host Web same-realm Soul App code is trusted first-party code. It is governed by scoped browser storage discipline, not treated as an untrusted plugin sandbox.
```

Mention `aiworker:host:*`, `aiworker:app:*`, and the future third-party gate.

- [ ] **Step 2: Update authoring docs**

Document that Soul Apps use `createSoulAppWebStorage(...)` for browser-scoped UI state, use broker storage for durable domain state, and never store secrets in browser storage.

- [ ] **Step 3: Verify docs**

Run:

```bash
bun run docs:check
git diff --check
```

Expected: pass.

## Task 5: PMA Closeout, Verification, And Review

**Files:**
- Modify: `docs/task/FEAT-084.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/PLAN-321.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Run focused gates**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-sdk' test src/index.test.ts
bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts
bun scripts/check-soul-app-boundaries.ts
```

Expected: all pass.

- [ ] **Step 2: Run root gates**

Run:

```bash
bun run check
git diff --check
```

Expected: both pass. Run `bun run build` if public package exports or CLI behavior changed in a way that needs bundle verification.

- [ ] **Step 3: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: exit 0 or actionable findings resolved before completion.

- [ ] **Step 4: Close PMA files**

Set `FEAT-084` and `PLAN-321` to completed, append changelog evidence, and mark the indexes `[x]`.

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json packages/soul-app-sdk apps/cli scripts docs
git commit -m "feat: enforce Soul App Web Storage discipline"
```

Expected: commit succeeds with only scoped files staged.
