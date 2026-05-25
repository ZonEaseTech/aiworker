# Real E2E P2/P3 Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six P2/P3 findings recorded by the 2026-05-25 real E2E audit without moving Soul App product logic into Host.

**Architecture:** Keep each repair at its owning boundary: session terminal state in core/API, mounted session recovery and default template state in the Soul-owned universal workbench, Host locator/layout fixes in Worker Web, and the legacy artifact probe cleanup in HR app-owned API code. Host remains start / shell / locate / mount / bridge, while workspace and session remain opaque locator or engine-bridge context.

**Tech Stack:** Bun workspaces, TypeScript, React 19, Bun test, Testing Library, shadcn primitives from `@zonease/aiworker-ui`, Hugeicons, `@micro-zoe/micro-app`, AIWorker local daemon, official HR/QA mounted Soul App services.

---

## Scope Source

- Approved design: `docs/superpowers/specs/2026-05-25-real-e2e-p2-p3-repair-design.md`
- PMA task: `docs/task/BUG-157.md`
- PMA plan: `docs/plan/PLAN-414.md`
- Evidence ledger: `tmp/real-e2e-audit-2026-05-25/findings.md`
- Final report: `tmp/real-e2e-audit-2026-05-25/final-report.md`
- Normative architecture: `docs/architecture.md#constraint-registry`
- Host skill: `.agents/skills/aiworker-host-dev/SKILL.md`
- Soul App skill: `.agents/skills/aiworker-soul-app-dev/SKILL.md`

## Scope Check

The spec spans several packages, but the findings came from one real E2E audit and share one verification loop. Keep them in one plan with independently testable tasks. Do not add new app-owned product features, new Host artifact surfaces, or a new E2E harness.

## Component Library Preflight

Visible UI changes must continue using existing shared primitives:

- `@zonease/aiworker-ui/components/dialog`
- `@zonease/aiworker-ui/components/sidebar`
- `@zonease/aiworker-ui/components/item`
- `@zonease/aiworker-ui/components/button`
- `@zonease/aiworker-ui/components/badge`
- `@zonease/aiworker-ui/components/switch`
- `@zonease/aiworker-ui/components/scroll-area`
- `@zonease/aiworker-ui/components/textarea`
- `@zonease/aiworker-ui/components/session-composer`
- `@zonease/aiworker-ui/components/empty`
- `@zonease/aiworker-ui/components/collapsible-group`

Do not add `lucide-react`, raw hex colors, arbitrary color values, Host-owned HR/QA domain panels, Host-side universal workbench route special cases, custom focus traps, or custom scroll locks.

## File Structure

- Modify `docs/task/index.md`
  - Move `BUG-157` through pending, in progress, and completed.
- Modify `docs/task/BUG-157.md`
  - Track owner, status, verification, and completion notes.
- Modify `docs/plan/index.md`
  - Move `PLAN-414` through pending, implementing, and completed.
- Modify `docs/plan/PLAN-414.md`
  - Track implementation status, verification results, and closeout notes.
- Modify `packages/core/src/worker/runtime.test.ts`
  - Assert successful turns complete the session container.
- Modify `packages/core/src/worker/runtime.ts`
  - Update successful one-turn sessions to `completed` with `endedAt`.
- Modify `apps/api/src/modes/worker.local.test.ts`
  - Assert non-stream and stream session creation return completed sessions after successful turns.
- Modify `packages/soul-app-workbench/src/universal-workbench/client-entry.events.test.ts`
  - Cover stream result parsing, created-session retention, and recovery id selection after stream failure.
- Modify `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`
  - Preserve the created session id during stream consumption and refresh detail after stream failures without retrying POST.
- Modify `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
  - Cover default template resolution and Start readiness.
- Modify `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`
  - Initialize `selectedTemplateId` from the first available declared template.
- Modify `apps/web/src/worker/__tests__/worker-studio.test.tsx`
  - Cover narrow Worker Configuration structure and duplicate worker row differentiators.
- Modify `apps/web/src/worker/worker-configuration-dialog.tsx`
  - Keep entry-file controls reachable at 390px.
- Modify `apps/web/src/worker/worker-workbench-tree.tsx`
  - Display stable Host metadata for duplicate worker names.
- Modify `apps/aiworker-hr/product/web/people-workbench/api.test.ts`
  - Assert HR app boot no longer requests legacy `/api/local/artifacts`.
- Modify `apps/aiworker-hr/product/web/people-workbench/api.ts`
  - Remove the legacy Host artifact list request and leave artifacts empty unless an app-owned API exists.
- Modify `docs/changelog.md`
  - Record the repair batch after verification.

## Task 1: Claim PMA Tracking

**Files:**
- Modify: `docs/task/index.md`
- Modify: `docs/task/BUG-157.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/plan/PLAN-414.md`

- [ ] **Step 1: Verify tracking records exist and are pending**

Run:

```bash
rg -n "BUG-157|PLAN-414" docs/task/index.md docs/task/BUG-157.md docs/plan/index.md docs/plan/PLAN-414.md
```

Expected: output includes `BUG-157` and `PLAN-414`; index markers are `[ ]`; detail files have `status: pending`.

- [ ] **Step 2: Claim `BUG-157`**

Edit the header of `docs/task/BUG-157.md` to:

```md
# BUG-157 Real E2E P2/P3 repair batch

- **status**: in_progress
- **priority**: P2
- **owner**: codex
- **createdAt**: 2026-05-25
- **claimedAt**: 2026-05-25
- **plan**: PLAN-414
- **relatesTo**: HOST-001, SOUL-001, CONFIG-001, PROTO-001, MOUNT-001, UI-001, ENGINE-001
```

- [ ] **Step 3: Mark indexes active**

In `docs/task/index.md`, set:

```md
- [-] [**BUG-157 Real E2E P2/P3 repair batch**](BUG-157.md) `P2`
```

In `docs/plan/index.md`, set:

```md
- [-] [**PLAN-414 Real E2E P2/P3 repair batch**](PLAN-414.md) `2026-05-25`
```

- [ ] **Step 4: Mark `PLAN-414` implementing**

Edit the header of `docs/plan/PLAN-414.md` to:

```md
# PLAN-414 Real E2E P2/P3 repair batch

- **status**: implementing
- **createdAt**: 2026-05-25
- **approvedAt**: 2026-05-25
- **relatedTask**: BUG-157
- **superpowersSpec**: docs/superpowers/specs/2026-05-25-real-e2e-p2-p3-repair-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-25-real-e2e-p2-p3-repair.md
```

- [ ] **Step 5: Verify tracking state**

Run:

```bash
tail -5 docs/task/index.md
tail -5 docs/plan/index.md
sed -n '1,10p' docs/task/BUG-157.md
sed -n '1,10p' docs/plan/PLAN-414.md
```

Expected: `BUG-157` and `PLAN-414` are marked `[-]`, task owner is `codex`, task status is `in_progress`, and plan status is `implementing`.

## Task 2: Complete Successful Sessions In Core/API

**Files:**
- Modify: `packages/core/src/worker/runtime.test.ts`
- Modify: `packages/core/src/worker/runtime.ts`
- Modify: `apps/api/src/modes/worker.local.test.ts`

- [ ] **Step 1: Add the failing core runtime assertion**

In `packages/core/src/worker/runtime.test.ts`, inside `it('runs the workspace session loop from turn to completion', ...)`, add these assertions after the existing `result.invocation.status` assertion:

```ts
    expect(result.session.status).toBe('completed')
    expect(result.session.endedAt).not.toBeNull()
```

Also add these assertions after `const snapshot = workerRuntime.snapshot()`:

```ts
    expect(snapshot.sessions[0]?.status).toBe('completed')
    expect(snapshot.sessions[0]?.endedAt).not.toBeNull()
```

- [ ] **Step 2: Run the core test and verify it fails**

Run:

```bash
bun test packages/core/src/worker/runtime.test.ts --test-name-pattern "runs the workspace session loop from turn to completion"
```

Expected: FAIL because `result.session.status` is currently `active` and `endedAt` is `null`.

- [ ] **Step 3: Implement successful session completion**

In `packages/core/src/worker/runtime.ts`, replace the successful path session update in `startTurn`:

```ts
      const currentSession = updateSession({ id: session.id, status: 'active', at: this.#now() })
```

with:

```ts
      const finishedAt = this.#now()
      const currentSession = updateSession({
        id: session.id,
        status: 'completed',
        endedAt: finishedAt,
        at: finishedAt,
      })
```

- [ ] **Step 4: Run the core test and verify it passes**

Run:

```bash
bun test packages/core/src/worker/runtime.test.ts --test-name-pattern "runs the workspace session loop from turn to completion"
```

Expected: PASS.

- [ ] **Step 5: Add API coverage for stream and non-stream final session state**

In `apps/api/src/modes/worker.local.test.ts`, find the tests named `streams initial workspace session creation before the engine finishes` and the non-stream workspace session creation test near the session API tests. Add assertions so each successful response proves the final result session is completed.

For the stream test, after `const body = await streamRes.text()`, add:

```ts
    expect(body).toContain('"event":"result"')
    expect(body).toContain('"status":"completed"')
    expect(body).toMatch(/"endedAt":"2026-/)
```

For the non-stream successful creation test, after parsing the JSON result, add:

```ts
    expect(body.session.status).toBe('completed')
    expect(body.session.endedAt).not.toBeNull()
```

- [ ] **Step 6: Run focused API tests**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
```

Expected: PASS. If a test still expects `active` after a successful turn, update that expectation only when the session has a terminal succeeded turn.

- [ ] **Step 7: Commit session lifecycle repair**

Run:

```bash
git add packages/core/src/worker/runtime.ts packages/core/src/worker/runtime.test.ts apps/api/src/modes/worker.local.test.ts
git commit -m "fix: 完成成功会话的顶层状态"
```

Expected: commit succeeds.

## Task 3: Recover Mounted Sessions After Stream Failure

**Files:**
- Modify: `packages/soul-app-workbench/src/universal-workbench/client-entry.events.test.ts`
- Modify: `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`

- [ ] **Step 1: Export stream helpers for focused tests**

In `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`, change these function declarations:

```ts
async function consumeSessionTurnStream(response: Response, onFrame: (frame: SessionTurnStreamFrame) => void): Promise<void> {
```

```ts
function applySessionTurnStreamFrame(
```

to:

```ts
export async function consumeSessionTurnStream(response: Response, onFrame: (frame: SessionTurnStreamFrame) => void): Promise<void> {
```

```ts
export function applySessionTurnStreamFrame(
```

Add this exported helper before `mergeSessionEvents`:

```ts
export function resolveStreamRecoverySessionId(
  streamedSessionId: string | null,
  selectedSessionId: string | null,
): string | null {
  return streamedSessionId ?? selectedSessionId ?? null
}
```

- [ ] **Step 2: Add failing stream recovery tests**

In `packages/soul-app-workbench/src/universal-workbench/client-entry.events.test.ts`, update the import to:

```ts
import {
  applySessionTurnStreamFrame,
  consumeSessionTurnStream,
  isTerminalSessionStatus,
  loadSessionEvents,
  mergeSessionEvents,
  resolveStreamRecoverySessionId,
} from './client-entry'
```

Append these tests inside the `describe` block:

```ts
  it('keeps the streamed session id available for recovery when stream consumption fails', async () => {
    const session = sessionFixture({ id: 'session-created', status: 'active' })
    const frames: string[] = [
      `event: session\ndata: ${JSON.stringify(session)}\n\n`,
    ]
    const response = new Response(new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(frames[0]!))
        controller.error(new Error('stream broke after session frame'))
      },
    }), { headers: { 'content-type': 'text/event-stream' } })
    let streamedSessionId: string | null = null

    await expect(consumeSessionTurnStream(response, (frame) => {
      applySessionTurnStreamFrame(frame, {
        onEvents: () => {},
        onSession: (nextSession) => {
          streamedSessionId = nextSession.id
        },
        onTurn: () => {},
      })
    })).rejects.toThrow('stream broke after session frame')

    expect(resolveStreamRecoverySessionId(streamedSessionId, null)).toBe('session-created')
  })

  it('falls back to the already selected session id when stream fails before a session frame', () => {
    expect(resolveStreamRecoverySessionId(null, 'session-selected')).toBe('session-selected')
    expect(resolveStreamRecoverySessionId(null, null)).toBeNull()
  })
```

Append this helper near the existing `sessionEvent` helper:

```ts
function sessionFixture(input: { id: string, status: 'active' | 'completed' | 'failed' }): LocalSession {
  return {
    capabilityTemplateId: 'aiworker-hr.person-profile',
    context: '',
    createdAt: '2026-05-25T00:00:00.000Z',
    endedAt: input.status === 'active' ? null : '2026-05-25T00:01:00.000Z',
    id: input.id,
    metadataJson: {},
    startedAt: '2026-05-25T00:00:00.000Z',
    status: input.status,
    title: 'Person profile',
    updatedAt: '2026-05-25T00:01:00.000Z',
    workerId: 'worker-1',
    workspaceId: 'workspace-1',
  }
}
```

Also add `LocalSession` to the type import:

```ts
import type { LocalSession, LocalSessionEvent } from '@zonease/aiworker-shared'
```

- [ ] **Step 3: Run stream recovery tests and verify they fail**

Run:

```bash
bun test packages/soul-app-workbench/src/universal-workbench/client-entry.events.test.ts
```

Expected: FAIL until the exported helpers and recovery logic exist.

- [ ] **Step 4: Preserve created session and refresh after create-stream errors**

In `handleCreateSession` inside `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`, replace the current body after `const payload = ...` with:

```ts
    let streamedSessionId: string | null = null
    try {
      const response = await fetch(`${routePrefix}/api/sessions/stream?workerId=${encodeURIComponent(workerId)}&workspaceId=${encodeURIComponent(targetWorkspaceId)}`, {
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      if (!response.ok)
        throw new Error(`Universal workbench API ${response.status}: ${routePrefix}/api/sessions/stream`)
      void consumeSessionTurnStream(response, (frame) => {
        applySessionTurnStreamFrame(frame, {
          onEvents: appendSessionEvents,
          onSession: (session) => {
            streamedSessionId = session.id
            setSelectedSessionId(session.id)
            setSessions(current => upsertSession(current, session))
            void refresh(session.id).catch(() => {})
          },
          onTurn: turn => setTurns(current => upsertTurn(current, turn)),
        })
      }).catch((error) => {
        appendSessionEvents([streamErrorEvent(error)])
        void refresh(resolveStreamRecoverySessionId(streamedSessionId, selectedSessionId)).catch(() => {})
      })
    }
    catch (error) {
      appendSessionEvents([streamErrorEvent(error)])
      await refresh(resolveStreamRecoverySessionId(streamedSessionId, selectedSessionId)).catch(() => {})
    }
```

This preserves the existing POST once policy: the catch path only refreshes with GET calls.

- [ ] **Step 5: Run workbench tests**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-workbench' test
```

Expected: PASS.

- [ ] **Step 6: Commit mounted stream recovery**

Run:

```bash
git add packages/soul-app-workbench/src/universal-workbench/client-entry.tsx packages/soul-app-workbench/src/universal-workbench/client-entry.events.test.ts
git commit -m "fix: 恢复 mounted 会话流失败后的会话详情"
```

Expected: commit succeeds.

## Task 4: Initialize Default Capability Selection

**Files:**
- Modify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
- Modify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`

- [ ] **Step 1: Add default template helper tests**

In `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`, update the import:

```ts
import { resolveDefaultTemplateId, UniversalWorkbenchApp } from './UniversalWorkbenchApp'
```

Append these tests inside the `describe` block:

```ts
  it('initializes a missing template selection from the first available template', () => {
    const templates = [
      { id: 'aiworker-hr.person-profile', name: 'Person Profile' },
      { id: 'aiworker-hr.interview-brief', name: 'Interview Brief' },
    ]

    expect(resolveDefaultTemplateId(undefined, templates)).toBe('aiworker-hr.person-profile')
    expect(resolveDefaultTemplateId('aiworker-hr.interview-brief', templates)).toBe('aiworker-hr.interview-brief')
    expect(resolveDefaultTemplateId('aiworker-hr.missing', templates)).toBe('aiworker-hr.person-profile')
    expect(resolveDefaultTemplateId(undefined, [])).toBeUndefined()
  })
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
bun test packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx --test-name-pattern "initializes a missing template selection"
```

Expected: FAIL because `resolveDefaultTemplateId` is not exported.

- [ ] **Step 3: Implement default template resolution**

In `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx`, add this helper after `templateOptions` related types or before the component:

```ts
export function resolveDefaultTemplateId(
  current: string | undefined,
  templates: readonly UniversalWorkbenchCapabilityTemplate[],
): string | undefined {
  if (templates.length === 0)
    return undefined
  return templates.some(template => template.id === current)
    ? current
    : templates[0]?.id
}
```

Change the state initializer:

```ts
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined)
```

to:

```ts
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(() => resolveDefaultTemplateId(undefined, templates))
```

Replace the current `useEffect` that updates `selectedTemplateId` from `templates` with:

```ts
  useEffect(() => {
    setSelectedTemplateId(current => resolveDefaultTemplateId(current, templates))
  }, [templates])
```

- [ ] **Step 4: Run workbench tests**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-workbench' test
```

Expected: PASS. The existing payload test should still require an explicit selected template in the draft; the app now supplies that selected template by default.

- [ ] **Step 5: Commit default capability selection**

Run:

```bash
git add packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.tsx packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx
git commit -m "fix: 初始化 universal composer 默认能力"
```

Expected: commit succeeds.

## Task 5: Fix Host Web Narrow Layout And Worker Identity

**Files:**
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- Modify: `apps/web/src/worker/worker-configuration-dialog.tsx`
- Modify: `apps/web/src/worker/worker-workbench-tree.tsx`

- [ ] **Step 1: Add duplicate worker row coverage**

In `apps/web/src/worker/__tests__/worker-studio.test.tsx`, add this test near the existing Worker configuration tests:

```ts
  it('shows stable identity metadata when worker names are duplicated', async () => {
    currentWorkers = [
      { createdAt: '2026-05-24T00:00:00.000Z', defaultEngineId: 'codex', id: 'e2e-hr-codex-20260524', metadataJson: {}, name: 'e2e-hr-codex', soulId: HR_SOUL_ID, status: 'active', updatedAt: now },
      { createdAt: '2026-05-25T00:00:00.000Z', defaultEngineId: 'codex', id: 'e2e-hr-codex-20260525', metadataJson: {}, name: 'e2e-hr-codex', soulId: HR_SOUL_ID, status: 'active', updatedAt: now },
      { createdAt: now, defaultEngineId: 'codex', id: 'qa-worker', metadataJson: {}, name: 'QA', soulId: QA_SOUL_ID, status: 'active', updatedAt: now },
    ]
    window.history.replaceState(null, '', '/workers/e2e-hr-codex-20260525')
    render(<WorkerStudio />)

    const switcher = await screen.findByTestId('worker-switcher')

    expect(within(switcher).getByRole('button', { name: /Switch to e2e-hr-codex .*e2e-hr-codex-20260525/ })).toBeTruthy()
    expect(within(switcher).getByText(/e2e-hr-codex-20260525/)).toBeTruthy()
    expect(within(switcher).getByText(/e2e-hr-codex-20260524/)).toBeTruthy()
  })
```

- [ ] **Step 2: Strengthen Worker Configuration narrow test**

In the existing `opens Worker configuration from the worker row without opening Host settings` test, keep the current class assertions and add:

```ts
    expect(screen.getByTestId('worker-overlay-editor-panel').className).toContain('max-md:flex-none')
    expect(screen.getByTestId('worker-overlay-editor-panel').className).toContain('max-md:min-w-0')
```

- [ ] **Step 3: Run Web tests and verify the duplicate worker test fails**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test -- --test-name-pattern "stable identity metadata|opens Worker configuration"
```

Expected: FAIL because worker rows do not yet include stable duplicate identity metadata or the new narrow classes.

- [ ] **Step 4: Add worker identity helper and row metadata**

In `apps/web/src/worker/worker-workbench-tree.tsx`, add these helpers above `WorkerSwitcher`:

```ts
function shortWorkerId(workerId: string): string {
  return workerId.length > 18 ? `${workerId.slice(0, 12)}...${workerId.slice(-4)}` : workerId
}

function workerIdentityDetail(worker: LocalWorker, duplicateName: boolean): string {
  const created = Number.isNaN(Date.parse(worker.createdAt))
    ? null
    : new Date(worker.createdAt).toISOString().slice(0, 10)
  const idLabel = duplicateName ? worker.id : shortWorkerId(worker.id)
  return created ? `${idLabel} · ${created}` : idLabel
}
```

Inside `WorkerSwitcher`, add a memoized name count after `soulGroups`:

```ts
  const workerNameCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const worker of workers)
      counts.set(worker.name, (counts.get(worker.name) ?? 0) + 1)
    return counts
  }, [workers])
```

Inside `group.workers.map`, before `return`, add:

```ts
                        const duplicateName = (workerNameCounts.get(worker.name) ?? 0) > 1
                        const identityDetail = workerIdentityDetail(worker, duplicateName)
```

Change the switch button `aria-label` to:

```tsx
                              aria-label={`Switch to ${worker.name} (${identityDetail})`}
```

Change the description span to:

```tsx
                                <span data-slot="item-description" className="truncate font-normal text-sidebar-foreground/60">{identityDetail}</span>
```

- [ ] **Step 5: Add narrow editor panel classes**

In `apps/web/src/worker/worker-configuration-dialog.tsx`, find the selected editor panel element with `data-testid="worker-overlay-editor-panel"`. Ensure its class list includes:

```tsx
className="flex min-w-0 flex-1 flex-col max-md:w-full max-md:flex-none max-md:min-w-0"
```

Preserve the existing non-layout classes on that element if present.

- [ ] **Step 6: Run Web tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test
```

Expected: PASS.

- [ ] **Step 7: Commit Host Web UI repair**

Run:

```bash
git add apps/web/src/worker/worker-workbench-tree.tsx apps/web/src/worker/worker-configuration-dialog.tsx apps/web/src/worker/__tests__/worker-studio.test.tsx
git commit -m "fix: 区分重复 worker 并修复配置窄屏布局"
```

Expected: commit succeeds.

## Task 6: Remove HR Legacy Artifact Probe

**Files:**
- Modify: `apps/aiworker-hr/product/web/people-workbench/api.test.ts`
- Modify: `apps/aiworker-hr/product/web/people-workbench/api.ts`

- [ ] **Step 1: Change the HR API test to reject legacy artifact calls**

In `apps/aiworker-hr/product/web/people-workbench/api.test.ts`, in `loads local workbench data from the Host public local routes derived from routePrefix`, remove the mock branch:

```ts
          if (url.endsWith('/artifacts'))
            return Response.json({ artifacts: [{ id: 'artifact-1', workspaceId: 'workspace-1' }] })
```

Change the expected requests to:

```ts
      expect(requests).toEqual([
        'GET /api/local/workspaces',
        'GET /api/local/sessions',
        'GET /api/local/workspaces/workspace-1/files/raw/README.md',
      ])
```

Change the artifact assertion to:

```ts
      expect(data.artifacts).toEqual([])
```

- [ ] **Step 2: Run the HR API test and verify it fails**

Run:

```bash
bun test apps/aiworker-hr/product/web/people-workbench/api.test.ts --test-name-pattern "loads local workbench data"
```

Expected: FAIL because `createHrPeopleWorkbenchApi` still requests `/api/local/artifacts`.

- [ ] **Step 3: Remove the Host artifact list request**

In `apps/aiworker-hr/product/web/people-workbench/api.ts`, replace:

```ts
      const [workspacesBody, sessionsBody, artifactsBody] = await Promise.all([
        localJson<{ workspaces: LocalWorkspace[] }>(fetcher, `${localPrefix}/workspaces`),
        localJson<{ sessions: LocalSession[] }>(fetcher, `${localPrefix}/sessions`),
        localJson<{ artifacts: LocalArtifact[] }>(fetcher, `${localPrefix}/artifacts`),
      ])
      const filtered = filterWorkbenchData({
        artifacts: artifactsBody.artifacts,
        profileReadmes: {},
        sessions: sessionsBody.sessions,
        workspaces: workspacesBody.workspaces,
      }, scope)
```

with:

```ts
      const [workspacesBody, sessionsBody] = await Promise.all([
        localJson<{ workspaces: LocalWorkspace[] }>(fetcher, `${localPrefix}/workspaces`),
        localJson<{ sessions: LocalSession[] }>(fetcher, `${localPrefix}/sessions`),
      ])
      const filtered = filterWorkbenchData({
        artifacts: [],
        profileReadmes: {},
        sessions: sessionsBody.sessions,
        workspaces: workspacesBody.workspaces,
      }, scope)
```

If `LocalArtifact` becomes unused in this file, remove it from the type import.

- [ ] **Step 4: Run HR tests**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test
```

Expected: PASS.

- [ ] **Step 5: Commit HR artifact probe cleanup**

Run:

```bash
git add apps/aiworker-hr/product/web/people-workbench/api.ts apps/aiworker-hr/product/web/people-workbench/api.test.ts
git commit -m "fix: 移除 HR workbench 旧 artifact 探测"
```

Expected: commit succeeds.

## Task 7: Run UI, Boundary, Browser, And Review Gates

**Files:**
- Modify: `docs/task/BUG-157.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/PLAN-414.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Run focused package tests**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-web' test
bun run --filter '@zonease/aiworker-hr' test
```

Expected: each command exits 0.

- [ ] **Step 2: Run UI governance and Host/Soul boundary checks**

Run:

```bash
bun run ui:check
bun scripts/check-soul-app-boundaries.ts --completion-audit
```

Expected: both commands exit 0. If `ui:check` reports unrelated historical debt, record the file and reason in `PLAN-414` instead of silently ignoring it.

- [ ] **Step 3: Rebuild mounted client bundles before browser evidence**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' build:client
bun run --filter '@zonease/aiworker-qa' build:client
```

Expected: both commands exit 0 and rebuild mounted client assets used by the running mounted services.

- [ ] **Step 4: Capture browser regression evidence**

Create evidence under:

```text
tmp/real-e2e-p2-p3-repair-2026-05-25/
```

Use Playwright or the Browser plugin, depending on availability, to verify:

```text
1. A succeeded session exposed through API/CLI has status=completed and endedAt set.
2. HR mounted fresh workspace shows Person Profile in the visible capability selector before opening the menu.
3. HR mounted Start is enabled after direct prompt entry.
4. A stream failure fixture preserves or refreshes selected session detail instead of staying on stale New Session.
5. Worker Configuration at 390x844 shows entry-file controls inside the viewport.
6. Duplicate worker names show stable worker id metadata in desktop and narrow worker rows.
7. Dev boot or focused runtime scan no longer records GET /api/local/artifacts 404.
```

Expected: screenshots, layout JSON, console JSON, and a summary JSON/Markdown are written under the evidence directory.

- [ ] **Step 5: Run code-review-graph and whitespace checks**

Run:

```bash
bun run crg:update
bun run crg:review
git diff --check
```

Expected: graph update succeeds, review has no blocking issue, and `git diff --check` exits 0.

- [ ] **Step 6: Record PMA completion**

Append this section to `docs/task/BUG-157.md`:

```md
## Completion Notes

Closed the 2026-05-25 real E2E P2/P3 repair batch:

- Successful one-turn sessions now complete at the session level with `endedAt`.
- Mounted universal workbench preserves created sessions and refreshes details after stream failures.
- Universal composer initializes the default visible capability from declared templates.
- Host Web worker rows expose stable worker identity metadata, and Worker Configuration narrow controls remain reachable.
- HR app-owned boot no longer probes the legacy Host `/api/local/artifacts` route.

Closeout evidence is recorded in `docs/plan/PLAN-414.md` and `tmp/real-e2e-p2-p3-repair-2026-05-25/`.
```

Edit `docs/task/BUG-157.md` header to:

```md
- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-25
- **claimedAt**: 2026-05-25
- **completedAt**: 2026-05-25
```

Keep the existing `priority`, `plan`, and `relatesTo` lines.

- [ ] **Step 7: Record PLAN-414 verification results**

Append this section to `docs/plan/PLAN-414.md`, replacing command counts with the actual observed outputs:

```md
## Verification Results

- `bun run --filter '@zonease/aiworker-core' test` — passed.
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts` — passed.
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test` — passed.
- `bun run --filter '@zonease/aiworker-web' test` — passed.
- `bun run --filter '@zonease/aiworker-hr' test` — passed.
- `bun run ui:check` — passed.
- `bun scripts/check-soul-app-boundaries.ts --completion-audit` — passed.
- `bun run --filter '@zonease/aiworker-hr' build:client` — passed.
- `bun run --filter '@zonease/aiworker-qa' build:client` — passed.
- Browser regression evidence: `tmp/real-e2e-p2-p3-repair-2026-05-25/`.
- `bun run crg:update` — passed.
- `bun run crg:review` — passed.
- `git diff --check` — passed.
```

Edit `docs/plan/PLAN-414.md` header to:

```md
- **status**: completed
- **completedAt**: 2026-05-25
```

Keep the existing `createdAt`, `approvedAt`, `relatedTask`, `superpowersSpec`, and `superpowersPlan` lines.

- [ ] **Step 8: Mark indexes completed**

In `docs/task/index.md`, set:

```md
- [x] [**BUG-157 Real E2E P2/P3 repair batch**](BUG-157.md) `P2`
```

In `docs/plan/index.md`, set:

```md
- [x] [**PLAN-414 Real E2E P2/P3 repair batch**](PLAN-414.md) `2026-05-25`
```

- [ ] **Step 9: Add changelog entry**

Append to `docs/changelog.md`. Use `date '+%H:%M'` at execution time; the timestamp below uses the plan creation time and may be replaced with the actual closeout time:

```md
## 2026-05-25 17:49 [BUG-P2]

Completed the real E2E P2/P3 repair batch from `tmp/real-e2e-audit-2026-05-25/`.

- Completed successful one-turn sessions at the session metadata level.
- Recovered mounted universal workbench session detail after stream failures.
- Initialized universal composer default capability selection from declared templates.
- Added stable Host metadata to duplicate worker rows and kept Worker Configuration narrow controls reachable.
- Removed the HR app-owned legacy `/api/local/artifacts` boot probe.
- Verification evidence: `tmp/real-e2e-p2-p3-repair-2026-05-25/`.
```

- [ ] **Step 10: Commit closeout**

Run:

```bash
git add docs/task/BUG-157.md docs/task/index.md docs/plan/PLAN-414.md docs/plan/index.md docs/changelog.md
git commit -m "docs: 记录真实 E2E P2/P3 修复收口"
```

Expected: commit succeeds.
