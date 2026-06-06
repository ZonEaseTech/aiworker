# Session Title Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize Worker session title source transition rules so auto-naming and user rename share one backend policy.

**Architecture:** Add a small `SessionTitlePolicy` helper inside `packages/worker-runtime`, export it from the runtime package, and use it from both runtime auto-naming and daemon session PATCH rename. Keep Web state behavior unchanged except for running existing regression tests that prove stale snapshots do not flash old titles back.

**Tech Stack:** TypeScript, Bun test, Vitest for worker-web regression tests, existing SQLite worker storage rows.

---

## File Structure

- Create: `packages/worker-runtime/src/worker/session-title-policy.ts`
  - Owns pure title source transition rules.
  - Does not read/write SQLite, call engine, emit events, or know HTTP/Web details.
- Create: `packages/worker-runtime/src/worker/session-title-policy.test.ts`
  - Unit tests for title source transitions.
- Modify: `packages/worker-runtime/src/index.ts`
  - Exports policy functions/types for worker-daemon.
- Modify: `packages/worker-runtime/src/worker/runtime.ts`
  - Replaces local auto-name title overwrite checks with policy calls.
- Modify: `packages/worker-runtime/src/worker/runtime.test.ts`
  - Keeps existing session auto-naming tests; add one narrow regression if policy integration leaves a gap.
- Modify: `packages/worker-daemon/src/modes/worker.ts`
  - Uses policy for explicit user rename metadata handling.
- Modify: `packages/worker-daemon/src/modes/worker.local.test.ts`
  - Adds daemon-level PATCH rename test proving `titleSource='user'`.
- Read-only verification: `apps/worker-web/src/features/local-workspace/model.test.ts`, `apps/worker-web/src/worker/__tests__/worker-studio.test.tsx`
  - Existing stale snapshot tests remain the Web acceptance check.

---

### Task 1: Add Session Title Policy Unit

**Files:**
- Create: `packages/worker-runtime/src/worker/session-title-policy.ts`
- Create: `packages/worker-runtime/src/worker/session-title-policy.test.ts`

- [ ] **Step 1: Write the failing policy tests**

Create `packages/worker-runtime/src/worker/session-title-policy.test.ts`:

```ts
import type { SessionRow } from '@zonease/aiworker-storage-sqlite/worker'

import { describe, expect, it } from 'bun:test'

import {
  applyAutoEngineTitle,
  applyAutoTruncatedTitle,
  applyUserTitle,
  readSessionTitleSource,
} from './session-title-policy'

function session(input: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'session-1',
    workerId: 'worker-1',
    workspaceId: 'workspace-1',
    title: 'New session 1',
    status: 'active',
    metadataJson: {},
    startedAt: '2026-06-06T00:00:00.000Z',
    endedAt: null,
    createdAt: '2026-06-06T00:00:00.000Z',
    updatedAt: '2026-06-06T00:00:00.000Z',
    ...input,
  }
}

describe('session title policy', () => {
  it('reads unknown title sources as auto-default', () => {
    expect(readSessionTitleSource(session())).toBe('auto-default')
    expect(readSessionTitleSource(session({ metadataJson: { titleSource: 'legacy' } }))).toBe('auto-default')
  })

  it('applies an auto-truncated title only to an auto-default session', () => {
    expect(applyAutoTruncatedTitle(session(), 'Check MC')).toEqual({
      title: 'Check MC',
      metadataJson: { titleSource: 'auto-truncated' },
    })
    expect(applyAutoTruncatedTitle(session({ metadataJson: { titleSource: 'auto-engine' } }), 'Check MC')).toBeNull()
    expect(applyAutoTruncatedTitle(session({ metadataJson: { titleSource: 'user' } }), 'Check MC')).toBeNull()
  })

  it('applies an engine title to automatic titles but never to user titles', () => {
    expect(applyAutoEngineTitle(session({ metadataJson: { titleSource: 'auto-truncated' } }), 'Build failure')).toEqual({
      title: 'Build failure',
      metadataJson: { titleSource: 'auto-engine' },
    })
    expect(applyAutoEngineTitle(session({ metadataJson: { titleSource: 'auto-engine' } }), 'Better title')).toEqual({
      title: 'Better title',
      metadataJson: { titleSource: 'auto-engine' },
    })
    expect(applyAutoEngineTitle(session({ metadataJson: { titleSource: 'user' }, title: 'Manual' }), 'Robot')).toBeNull()
  })

  it('marks changed user titles as user-owned without locking unchanged titles', () => {
    expect(applyUserTitle(session({ title: 'New session 1' }), 'Manual title')).toEqual({
      title: 'Manual title',
      metadataJson: { titleSource: 'user' },
    })
    expect(applyUserTitle(session({ title: 'New session 1' }), 'New session 1')).toBeNull()
  })

  it('preserves unrelated metadata when changing title source', () => {
    expect(applyUserTitle(session({ metadataJson: { engineId: 'codex' } }), 'Manual title')).toEqual({
      title: 'Manual title',
      metadataJson: { engineId: 'codex', titleSource: 'user' },
    })
  })
})
```

- [ ] **Step 2: Run policy tests to verify failure**

Run:

```bash
bun test packages/worker-runtime/src/worker/session-title-policy.test.ts
```

Expected: FAIL because `./session-title-policy` does not exist.

- [ ] **Step 3: Implement the policy helper**

Create `packages/worker-runtime/src/worker/session-title-policy.ts`:

```ts
import type { SessionRow } from '@zonease/aiworker-storage-sqlite/worker'

export type SessionTitleSource = 'auto-default' | 'auto-truncated' | 'auto-engine' | 'user'

export interface SessionTitlePatch {
  metadataJson: Record<string, unknown>
  title: string
}

const TITLE_SOURCES = new Set<SessionTitleSource>(['auto-default', 'auto-truncated', 'auto-engine', 'user'])

export function readSessionTitleSource(session: Pick<SessionRow, 'metadataJson'>): SessionTitleSource {
  const source = readRecord(session.metadataJson).titleSource
  return typeof source === 'string' && TITLE_SOURCES.has(source as SessionTitleSource)
    ? source as SessionTitleSource
    : 'auto-default'
}

export function applyAutoTruncatedTitle(session: Pick<SessionRow, 'metadataJson' | 'title'>, title: string): SessionTitlePatch | null {
  if (!validTitleChange(session.title, title))
    return null
  if (readSessionTitleSource(session) !== 'auto-default')
    return null
  return titlePatch(session, title, 'auto-truncated')
}

export function applyAutoEngineTitle(session: Pick<SessionRow, 'metadataJson' | 'title'>, title: string): SessionTitlePatch | null {
  if (!validTitleChange(session.title, title))
    return null
  if (readSessionTitleSource(session) === 'user')
    return null
  return titlePatch(session, title, 'auto-engine')
}

export function applyUserTitle(session: Pick<SessionRow, 'metadataJson' | 'title'>, title: string): SessionTitlePatch | null {
  if (!validTitleChange(session.title, title))
    return null
  return titlePatch(session, title, 'user')
}

function titlePatch(session: Pick<SessionRow, 'metadataJson'>, title: string, source: SessionTitleSource): SessionTitlePatch {
  return {
    title,
    metadataJson: { ...readRecord(session.metadataJson), titleSource: source },
  }
}

function validTitleChange(currentTitle: string, nextTitle: string): boolean {
  return nextTitle.trim().length > 0 && nextTitle !== currentTitle
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
```

- [ ] **Step 4: Run policy tests to verify pass**

Run:

```bash
bun test packages/worker-runtime/src/worker/session-title-policy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Export the policy from worker-runtime**

Modify `packages/worker-runtime/src/index.ts` and add:

```ts
export {
  applyAutoEngineTitle,
  applyAutoTruncatedTitle,
  applyUserTitle,
  readSessionTitleSource,
  type SessionTitlePatch,
  type SessionTitleSource,
} from './worker/session-title-policy'
```

- [ ] **Step 6: Run worker-runtime typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-worker-runtime' typecheck
```

Expected: PASS.

---

### Task 2: Use Policy From Runtime Auto-Naming

**Files:**
- Modify: `packages/worker-runtime/src/worker/runtime.ts`
- Modify: `packages/worker-runtime/src/worker/runtime.test.ts`

- [ ] **Step 1: Run existing runtime auto-name tests before editing**

Run:

```bash
bun test packages/worker-runtime/src/worker/runtime.test.ts --timeout=15000
```

Expected: PASS before refactor.

- [ ] **Step 2: Import policy functions**

Modify `packages/worker-runtime/src/worker/runtime.ts` imports:

```ts
import {
  applyAutoEngineTitle,
  applyAutoTruncatedTitle,
  readSessionTitleSource,
} from './session-title-policy'
```

- [ ] **Step 3: Replace the title source check in `maybeKickSessionAutoName`**

Replace the local metadata source read with the policy read:

```ts
const titleSource = readSessionTitleSource(context.session)
if (titleSource !== 'auto-default')
  return
```

- [ ] **Step 4: Replace `applyAutoNameTitle` internals with policy dispatch**

Replace the body of `applyAutoNameTitle` in `packages/worker-runtime/src/worker/runtime.ts`:

```ts
private applyAutoNameTitle(sessionId: string, title: string, source: 'auto-engine' | 'auto-truncated'): SessionRow | null {
  const session = getSession(sessionId)
  if (!session)
    return null
  const patch = source === 'auto-truncated'
    ? applyAutoTruncatedTitle(session, title)
    : applyAutoEngineTitle(session, title)
  if (!patch)
    return null
  const updated = updateSession({
    id: sessionId,
    title: patch.title,
    metadataJson: patch.metadataJson,
    at: this.#now(),
  })
  this.bus.emit({ kind: 'session', workspaceId: updated.workspaceId, sessionId, payload: { status: updated.status }, at: this.#now() })
  return updated
}
```

- [ ] **Step 5: Run runtime tests**

Run:

```bash
bun test packages/worker-runtime/src/worker/session-title-policy.test.ts packages/worker-runtime/src/worker/runtime.test.ts --timeout=15000
```

Expected: PASS.

- [ ] **Step 6: Commit runtime policy integration**

Run:

```bash
git add packages/worker-runtime/src/worker/session-title-policy.ts packages/worker-runtime/src/worker/session-title-policy.test.ts packages/worker-runtime/src/worker/runtime.ts packages/worker-runtime/src/index.ts
git commit -m "refactor(worker): 集中 session title policy"
```

Expected: commit succeeds.

---

### Task 3: Use Policy From Daemon Session Rename

**Files:**
- Modify: `packages/worker-daemon/src/modes/worker.ts`
- Modify: `packages/worker-daemon/src/modes/worker.local.test.ts`

- [ ] **Step 1: Write the failing daemon PATCH rename test**

Add this test near the existing session API tests in `packages/worker-daemon/src/modes/worker.local.test.ts`:

```ts
it('marks explicit session rename as user-owned title source', async () => {
  const target = await app()
  const worker = await createFreeformWorker(target, 'session-rename-worker')
  const { session } = await createWorkspaceAndSession(target, worker.id)

  const renameRes = await target.request(`/api/sessions/${session.id}`, {
    body: JSON.stringify({ title: 'Manual investigation title' }),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  })

  expect(renameRes.status).toBe(200)
  const body = await renameRes.json() as { session: { title: string, metadataJson: Record<string, unknown> } }
  expect(body.session.title).toBe('Manual investigation title')
  expect(body.session.metadataJson.titleSource).toBe('user')
})
```

- [ ] **Step 2: Run the daemon test and verify current behavior**

Run:

```bash
bun test packages/worker-daemon/src/modes/worker.local.test.ts --timeout=15000
```

Expected: PASS before refactor, because existing daemon logic already sets `titleSource='user'`. This is still the safety test for the refactor.

- [ ] **Step 3: Import `applyUserTitle` into daemon worker mode**

Modify `packages/worker-daemon/src/modes/worker.ts` imports from `@zonease/aiworker-worker-runtime`:

```ts
import {
  applyUserTitle,
  createExternalEngineExecutor,
  createLocalWorkerRuntime,
  createWorkerOrchestrator,
  getWorkerEnv,
  WorkerOrchestrator,
} from '@zonease/aiworker-worker-runtime'
```

Keep the existing imported names in the file and add `applyUserTitle` to that import list.

- [ ] **Step 4: Replace inline rename metadata logic in PATCH `/api/sessions/:sessionId`**

Replace the inline `renaming` block:

```ts
const incomingMetadata = result.data.metadata
  ? { ...(session.metadataJson ?? {}), ...(result.data.metadata ?? {}) }
  : session.metadataJson ?? {}
const titlePatch = typeof result.data.title === 'string'
  ? applyUserTitle({ title: session.title, metadataJson: incomingMetadata }, result.data.title)
  : null
const metadataJson = titlePatch?.metadataJson ?? (result.data.metadata ? incomingMetadata : undefined)
return c.json({ session: updateSession({
  id: session.id,
  metadataJson,
  status: result.data.status,
  title: titlePatch?.title ?? result.data.title,
}) })
```

- [ ] **Step 5: Run daemon tests**

Run:

```bash
bun test packages/worker-daemon/src/modes/worker.local.test.ts --timeout=15000
```

Expected: PASS.

- [ ] **Step 6: Run daemon typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-worker-daemon' typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit daemon integration**

Run:

```bash
git add packages/worker-daemon/src/modes/worker.ts packages/worker-daemon/src/modes/worker.local.test.ts
git commit -m "refactor(worker): 复用 session 手动命名策略"
```

Expected: commit succeeds.

---

### Task 4: Verify Web Session Title Sync Regressions

**Files:**
- Read-only: `apps/worker-web/src/features/local-workspace/model.test.ts`
- Read-only: `apps/worker-web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Run local workspace model tests**

Run:

```bash
cd apps/worker-web && bunx vitest run --testTimeout=15000 src/features/local-workspace/model.test.ts
```

Expected: PASS. This keeps the stale `updatedAt` merge guard intact.

- [ ] **Step 2: Run WorkerStudio session title tests**

Run:

```bash
cd apps/worker-web && bunx vitest run --testTimeout=15000 src/worker/__tests__/worker-studio.test.tsx
```

Expected: PASS. This verifies the header/sidebar immediately reflect returned truncated titles and do not flash old names from stale detail responses.

---

### Task 5: Final Verification And Review

**Files:**
- All files modified in Tasks 1-3.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
bun test packages/worker-runtime/src/worker/session-title-policy.test.ts packages/worker-runtime/src/worker/runtime.test.ts packages/worker-daemon/src/modes/worker.local.test.ts --timeout=15000
```

Expected: PASS.

- [ ] **Step 2: Run focused typechecks**

Run:

```bash
bun run --filter '@zonease/aiworker-worker-runtime' typecheck
bun run --filter '@zonease/aiworker-worker-daemon' typecheck
```

Expected: both PASS.

- [ ] **Step 3: Run code-review-graph**

Run:

```bash
bun run crg:review
```

Expected: command completes and reports no blocking issue for the changed title policy surface.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git diff --stat
git diff -- packages/worker-runtime/src/worker/session-title-policy.ts packages/worker-runtime/src/worker/session-title-policy.test.ts packages/worker-runtime/src/worker/runtime.ts packages/worker-runtime/src/index.ts packages/worker-daemon/src/modes/worker.ts packages/worker-daemon/src/modes/worker.local.test.ts
```

Expected: diff only contains title policy extraction, runtime policy usage, daemon policy usage, and focused tests.

- [ ] **Step 5: Commit final verification changes if Tasks 2 and 3 were not already committed separately**

Run:

```bash
git add packages/worker-runtime/src/worker/session-title-policy.ts packages/worker-runtime/src/worker/session-title-policy.test.ts packages/worker-runtime/src/worker/runtime.ts packages/worker-runtime/src/index.ts packages/worker-daemon/src/modes/worker.ts packages/worker-daemon/src/modes/worker.local.test.ts
git commit -m "refactor(worker): 统一 session title 策略"
```

Expected: commit succeeds if there are staged changes. If Tasks 2 and 3 already created separate commits, this step has no changes to commit.
