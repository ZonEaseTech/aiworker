# Real E2E Repair Batches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the real E2E audit regressions in recoverable batches: failed Claude Code sessions, mounted workspace locators, Worker Configuration scope, and the local engines readiness endpoint.

**Architecture:** Host remains start / shell / locate / mount / bridge. Session execution fixes stay at the Host engine invocation boundary; universal workbench behavior stays inside the Soul-owned mounted workbench package; Host Web only consumes opaque worker/workspace/session locators and declared micro-app surfaces. Worker Configuration is reduced to worker-scoped Host shell preferences and worker overlay/local enablement.

**Tech Stack:** Bun workspaces, TypeScript, React 19, Vitest/Testing Library, Bun test, OpenAPIHono, shadcn primitives from `@zonease/aiworker-ui`, `@micro-zoe/micro-app`, AIWorker Host/Soul local daemon API.

---

## Scope Source

- Approved design: `docs/superpowers/specs/2026-05-24-real-e2e-repair-plan-design.md`
- Real audit evidence: `tmp/real-e2e-audit-2026-05-24/`
- Normative architecture: `docs/architecture.md#constraint-registry`
- Host skill contract: `.agents/skills/aiworker-host-dev/SKILL.md`
- Soul App skill contract: `.agents/skills/aiworker-soul-app-dev/SKILL.md`

## Scope Check

The spec covers four related repair batches from the same real E2E audit. They touch separate surfaces, but they are ordered so each batch produces independently testable software:

1. Batch 1 restores failed-session recovery.
2. Batch 2 restores mounted workspace locator propagation.
3. Batch 3 removes the Worker Configuration workspace-scope leak.
4. Batch 4 aligns the documented local engines endpoint.

Do not combine the batches into one commit. Each batch should go green on focused tests before the next batch starts.

## Component Library Preflight

Batch 3 changes visible Host Web UI. Use existing primitives only:

- `@zonease/aiworker-ui/components/dialog`
- `@zonease/aiworker-ui/components/sidebar`
- `@zonease/aiworker-ui/components/item`
- `@zonease/aiworker-ui/components/badge`
- `@zonease/aiworker-ui/components/button`
- `@zonease/aiworker-ui/components/switch`
- `@zonease/aiworker-ui/components/scroll-area`

Do not add `lucide-react`, hex colors, arbitrary Tailwind values, new focus traps, or app-local primitives. Existing Hugeicons imports may stay where already used.

## File Structure

- Modify `packages/core/src/worker/executor.ts`
  - Exports the local CLI hard-timeout constant and accepts a test-only timeout option.
  - Keeps external engines responsible for their own tool loop, model, approval and profile behavior.
- Modify `packages/core/src/worker/executor.test.ts`
  - Covers timeout termination without waiting 300 seconds.
- Modify `packages/core/src/worker/runtime.test.ts`
  - Covers failed session/turn/invocation terminal state.
- Modify `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`
  - Refreshes selected session detail during polling, including the parent session terminal status.
  - Dispatches an opaque workspace locator event after mounted workspace creation.
- Modify `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
  - Covers failed-session rendering and follow-up composer recovery.
- Modify `packages/soul-app-workbench/src/universal-workbench/timeline/SessionTimeline.tsx`
  - Avoids duplicate `turn.error` rendering when a matching backend error event exists.
- Modify `packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model.ts`
  - Removes stale running status signals when the turn is terminal failed/succeeded.
- Modify `packages/shared/src/soul-app/micro-app.ts`
  - Adds an opaque mounted child locator event for workspace selection.
- Modify `apps/web/src/lib/micro-app-runtime.ts`
  - Normalizes the new workspace locator event from mounted apps.
- Modify `apps/web/src/worker/studio/mounted-surface.tsx`
  - Handles workspace locator events by asking WorkerStudio to select the workspace.
- Modify `apps/web/src/worker/worker-studio.tsx`
  - Wires the mounted workspace selection callback to Host route state.
  - Removes Worker Configuration projection props after Batch 3.
- Modify `apps/web/src/worker/worker-configuration-dialog.tsx`
  - Removes workspace projection UI.
  - Keeps worker overlay assets and worker-scoped workbench route selection.
- Modify `apps/web/src/worker/__tests__/worker-studio.test.tsx`
  - Covers mounted workspace locator propagation and Worker Configuration boundary text.
- Modify `apps/api/src/modes/worker.ts`
  - Adds `GET /api/local/settings/engines`.
- Modify `apps/api/src/modes/worker/openapi.ts`
  - Adds the OpenAPI path.
- Modify `apps/api/src/modes/worker.local.test.ts`
  - Covers the endpoint and OpenAPI path.
- Modify `docs/executor-engines.md`
  - Aligns readiness wording with the implemented endpoint.
- Modify PMA files during execution:
  - Create `docs/task/BUG-152.md` and `docs/plan/PLAN-409.md`.
  - Create `docs/task/BUG-153.md` and `docs/plan/PLAN-410.md`.
  - Create `docs/task/BUG-154.md` and `docs/plan/PLAN-411.md`.
  - Create `docs/task/BUG-155.md` and `docs/plan/PLAN-412.md`.
  - Update `docs/task/index.md`, `docs/plan/index.md`, and `docs/changelog.md` at closeout.

## Task 1: Create PMA Tracking Records

**Files:**
- Create: `docs/task/BUG-152.md`
- Create: `docs/task/BUG-153.md`
- Create: `docs/task/BUG-154.md`
- Create: `docs/task/BUG-155.md`
- Create: `docs/plan/PLAN-409.md`
- Create: `docs/plan/PLAN-410.md`
- Create: `docs/plan/PLAN-411.md`
- Create: `docs/plan/PLAN-412.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`

- [ ] **Step 1: Verify planned PMA ids are still free**

Run:

```bash
for f in docs/task/BUG-152.md docs/task/BUG-153.md docs/task/BUG-154.md docs/task/BUG-155.md docs/plan/PLAN-409.md docs/plan/PLAN-410.md docs/plan/PLAN-411.md docs/plan/PLAN-412.md; do
  test ! -e "$f" || { echo "PMA id already exists: $f"; exit 1; }
done
```

Expected: exit 0 with no output.

- [ ] **Step 2: Add `BUG-152` for Claude Code failed-session recovery**

Create `docs/task/BUG-152.md` with:

```md
# BUG-152 Web Claude Code session failure remains running and blocks follow-up

- **status**: in-progress
- **priority**: P1
- **owner**: codex
- **createdAt**: 2026-05-24
- **claimedAt**: 2026-05-24
- **plan**: PLAN-409
- **relatesTo**: ENGINE-001, MOUNT-001, PROTO-001

## Background

The real E2E audit in `tmp/real-e2e-audit-2026-05-24/` showed a Web-originated
Claude Code session timing out after 300 seconds. The daemon persisted the
session and turn as `failed`, but the mounted universal workbench still rendered
running/requesting status and kept the follow-up composer disabled.

## Evidence

- `tmp/real-e2e-audit-2026-05-24/findings.md`
- `tmp/real-e2e-audit-2026-05-24/commands/web-claude-session-show-late.txt`
- `tmp/real-e2e-audit-2026-05-24/browser/web-task5-failed-session-dom.json`
- `tmp/real-e2e-audit-2026-05-24/screenshots/web-task5-failed-session-selected.png`

## Acceptance Criteria

1. Failed session and turn terminal state is reflected in the mounted universal workbench.
2. Stale running/requesting status is not shown after a terminal failed turn.
3. The timeout error appears once.
4. Follow-up input is usable again when engine readiness is true.
5. Host still only owns the engine invocation boundary and does not implement Claude Code's tool loop.
```

- [ ] **Step 3: Add `PLAN-409` for Batch 1**

Create `docs/plan/PLAN-409.md` with:

```md
# PLAN-409 Web Claude Code failed-session recovery

- **status**: approved
- **createdAt**: 2026-05-24
- **approvedAt**: 2026-05-24
- **relatedTask**: BUG-152

## Proposal

1. Name and test the local CLI hard timeout in `packages/core/src/worker/executor.ts`.
2. Assert failed runtime turns return failed session, turn, invocation and event state.
3. Refresh selected session detail in the mounted universal workbench polling path so parent session status cannot stay stale.
4. Suppress stale running status signals and duplicate error rendering in the timeline.
5. Prove the failed session fixture renders recoverably.

## Verification

- `bun test packages/core/src/worker/executor.test.ts`
- `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck`
```

- [ ] **Step 4: Add `BUG-153` and `PLAN-410` for mounted workspace locator**

Create `docs/task/BUG-153.md` with:

```md
# BUG-153 Mounted QA universal workbench misses selected workspace locator

- **status**: in-progress
- **priority**: P2
- **owner**: codex
- **createdAt**: 2026-05-24
- **claimedAt**: 2026-05-24
- **plan**: PLAN-410
- **relatesTo**: MOUNT-001, PROTO-001, CONFIG-001

## Background

The real E2E audit created a QA worker and workspace through Web. The workspace
existed in the daemon, but the mounted QA universal workbench URL still only
contained `workerId` and `theme`, not `workspaceId`.

## Evidence

- `tmp/real-e2e-audit-2026-05-24/browser/web-qa-mounted-desktop-layout.json`
- `tmp/real-e2e-audit-2026-05-24/commands/api-workspaces-after-web-task4.json`

## Acceptance Criteria

1. A mounted app can report an opaque selected workspace locator to Host.
2. Host updates worker/workspace route state without interpreting workspace domain meaning.
3. Mounted URL query and micro-app host data both include the selected workspace id.
4. No Host Web universal workbench special case is introduced.
```

Create `docs/plan/PLAN-410.md` with:

```md
# PLAN-410 Mounted workspace locator propagation

- **status**: approved
- **createdAt**: 2026-05-24
- **approvedAt**: 2026-05-24
- **relatedTask**: BUG-153

## Proposal

1. Extend the mounted micro-app child event union with an opaque workspace locator event.
2. Normalize the event in Host Web's micro-app runtime adapter.
3. Dispatch the event after the universal workbench creates a workspace through the mounted API.
4. Let `MountedSoulAppRouteSurface` pass the workspace id to `WorkerStudio`, which updates route state.
5. Cover the Web-created QA workspace flow with a focused WorkerStudio test.

## Verification

- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`
```

- [ ] **Step 5: Add `BUG-154` and `PLAN-411` for Worker Configuration boundary**

Create `docs/task/BUG-154.md` with:

```md
# BUG-154 Worker Configuration leaks workspace projection scope

- **status**: in-progress
- **priority**: P2
- **owner**: codex
- **createdAt**: 2026-05-24
- **claimedAt**: 2026-05-24
- **plan**: PLAN-411
- **relatesTo**: CONFIG-001, UI-001

## Background

The real E2E audit found workspace projection wording and actions inside
Host-owned Worker Configuration. CONFIG-001 limits Worker Configuration to the
current Soul worker; workspace/session ids remain opaque locator or bridge
context and must not become Host configuration scopes.

## Evidence

- `tmp/real-e2e-audit-2026-05-24/browser/web-hr-worker-config.dom.txt`
- `tmp/real-e2e-audit-2026-05-24/browser/web-qa-worker-config.dom.txt`
- `tmp/real-e2e-audit-2026-05-24/screenshots/web-hr-worker-config-stable.png`
- `tmp/real-e2e-audit-2026-05-24/screenshots/web-qa-worker-config-stable.png`

## Acceptance Criteria

1. Worker Configuration no longer shows workspace projection UI or wording.
2. Worker overlay asset management still works.
3. Worker-scoped workbench route preference still works.
4. UI checks pass after the visible Host Web change.
```

Create `docs/plan/PLAN-411.md` with:

```md
# PLAN-411 Worker Configuration boundary cleanup

- **status**: approved
- **createdAt**: 2026-05-24
- **approvedAt**: 2026-05-24
- **relatedTask**: BUG-154

## Proposal

1. Remove projection props, state and actions from `WorkerConfigurationDialog`.
2. Keep worker-scoped workbench tab selection in a neutral Workbench panel.
3. Update WorkerStudio call sites so no selected workspace is passed into Worker Configuration.
4. Update tests to assert absent workspace configuration wording and retained worker overlay behavior.

## Verification

- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run ui:check`
```

- [ ] **Step 6: Add `BUG-155` and `PLAN-412` for engines endpoint drift**

Create `docs/task/BUG-155.md` with:

```md
# BUG-155 Local settings engines endpoint returns 404

- **status**: in-progress
- **priority**: P2
- **owner**: codex
- **createdAt**: 2026-05-24
- **claimedAt**: 2026-05-24
- **plan**: PLAN-412
- **relatesTo**: ENGINE-001

## Background

`docs/executor-engines.md` documents `GET /api/local/settings/engines`, and the
real E2E audit tried to use it as a read-only readiness endpoint. The daemon
returned 404 even though engine data was available through `/api/local/settings`.

## Evidence

- `tmp/real-e2e-audit-2026-05-24/commands/engine-readiness.json`
- `tmp/real-e2e-audit-2026-05-24/commands/engine-readiness-http.json`

## Acceptance Criteria

1. `GET /api/local/settings/engines` returns non-secret local engine status.
2. OpenAPI includes the route.
3. Documentation states readiness is a read-only Host probe, not engine sandbox or auth ownership.
```

Create `docs/plan/PLAN-412.md` with:

```md
# PLAN-412 Local settings engines endpoint contract

- **status**: approved
- **createdAt**: 2026-05-24
- **approvedAt**: 2026-05-24
- **relatedTask**: BUG-155

## Proposal

1. Add `GET /api/local/settings/engines` next to the existing settings routes.
2. Return `{ engineId, engines, executionMode }` from persisted local settings.
3. Add the OpenAPI path.
4. Clarify docs that the endpoint does not spawn CLIs or read secret contents.

## Verification

- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `git diff --check`
```

- [ ] **Step 7: Append task and plan index entries**

Append these lines to the end of `docs/task/index.md`:

```md
- [-] [**BUG-152 Web Claude Code session failure remains running and blocks follow-up**](BUG-152.md) `P1`
- [-] [**BUG-153 Mounted QA universal workbench misses selected workspace locator**](BUG-153.md) `P2`
- [-] [**BUG-154 Worker Configuration leaks workspace projection scope**](BUG-154.md) `P2`
- [-] [**BUG-155 Local settings engines endpoint returns 404**](BUG-155.md) `P2`
```

Append these lines to the end of `docs/plan/index.md`:

```md
- [-] [**PLAN-409 Web Claude Code failed-session recovery**](PLAN-409.md) `2026-05-24`
- [-] [**PLAN-410 Mounted workspace locator propagation**](PLAN-410.md) `2026-05-24`
- [-] [**PLAN-411 Worker Configuration boundary cleanup**](PLAN-411.md) `2026-05-24`
- [-] [**PLAN-412 Local settings engines endpoint contract**](PLAN-412.md) `2026-05-24`
```

- [ ] **Step 8: Commit PMA setup**

Run:

```bash
git add docs/task/BUG-152.md docs/task/BUG-153.md docs/task/BUG-154.md docs/task/BUG-155.md docs/plan/PLAN-409.md docs/plan/PLAN-410.md docs/plan/PLAN-411.md docs/plan/PLAN-412.md docs/task/index.md docs/plan/index.md
git diff --cached --check
git commit -m "docs: 建立真实 E2E 修复 PMA 跟踪"
```

Expected: commit succeeds.

## Task 2: Make Local CLI Timeout Explicit And Tested

**Files:**
- Modify: `packages/core/src/worker/executor.ts`
- Modify: `packages/core/src/worker/executor.test.ts`

- [ ] **Step 1: Add failing timeout test**

Modify the import in `packages/core/src/worker/executor.test.ts`:

```ts
import { createExternalEngineExecutor, DEFAULT_LOCAL_CLI_ENGINE_TIMEOUT_MS } from './executor'
```

Append this test inside `describe('createExternalEngineExecutor', () => { ... })`:

```ts
  it('terminates local CLI engines after the configured hard timeout', async () => {
    const workspaceRoot = path.join(makeRoot(), 'workspace')
    await mkdir(workspaceRoot, { recursive: true })
    const command = await makeScript(`
trap 'exit 143' TERM
cat >/dev/null
while true; do sleep 0.01; done
`)

    await expect(
      createExternalEngineExecutor({ timeoutMs: 25 }).invoke(baseInput(command, workspaceRoot)),
    ).rejects.toThrow('Process exceeded 25ms and was terminated.')

    await expect(
      readFile(path.join(workspaceRoot, '.aiworker', 'sessions', 'session-1', 'invocations', '0001', 'stderr.log'), 'utf8'),
    ).resolves.toContain('Process exceeded 25ms and was terminated.')
    expect(DEFAULT_LOCAL_CLI_ENGINE_TIMEOUT_MS).toBe(300_000)
  })
```

- [ ] **Step 2: Run the failing timeout test**

Run:

```bash
bun test packages/core/src/worker/executor.test.ts -t "terminates local CLI engines"
```

Expected: FAIL because `createExternalEngineExecutor` does not accept options and the timeout constant is not exported.

- [ ] **Step 3: Add executor options and timeout constant**

In `packages/core/src/worker/executor.ts`, add this near the local engine definition types:

```ts
export const DEFAULT_LOCAL_CLI_ENGINE_TIMEOUT_MS = 300_000

export interface ExternalEngineExecutorOptions {
  timeoutMs?: number
}
```

Replace `createExternalEngineExecutor()` with:

```ts
export function createExternalEngineExecutor(options: ExternalEngineExecutorOptions = {}): LocalExecutor {
  return {
    async invoke(input) {
      const executionMode = readString(input.metadata?.executionMode, 'local-cli')
      if (executionMode === 'byok')
        return runByokExecutor(input)
      return runLocalCliExecutor(input, options)
    },
  }
}
```

Change the signature of `runLocalCliExecutor` to:

```ts
async function runLocalCliExecutor(input: LocalExecutorInput, options: ExternalEngineExecutorOptions): Promise<LocalExecutorResult> {
```

Before the `execCommand(...)` call in `runLocalCliExecutor`, add:

```ts
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCAL_CLI_ENGINE_TIMEOUT_MS
```

Replace the existing `300_000` argument in the `execCommand(...)` call with:

```ts
  const execution = await execCommand(command, args, enginePrompt, timeoutMs, {
```

- [ ] **Step 4: Run the timeout test again**

Run:

```bash
bun test packages/core/src/worker/executor.test.ts -t "terminates local CLI engines"
```

Expected: PASS.

- [ ] **Step 5: Run the full executor test file**

Run:

```bash
bun test packages/core/src/worker/executor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit explicit timeout behavior**

Run:

```bash
git add packages/core/src/worker/executor.ts packages/core/src/worker/executor.test.ts
git diff --cached --check
git commit -m "test: 覆盖本地 engine hard timeout"
```

Expected: commit succeeds.

## Task 3: Prove Runtime Failed Session Terminal State

**Files:**
- Modify: `packages/core/src/worker/runtime.test.ts`

- [ ] **Step 1: Strengthen the existing failed-turn runtime test**

In `packages/core/src/worker/runtime.test.ts`, find the test named `records failed turns without throwing away the event trail` and replace its assertions with:

```ts
    expect(result.session.status).toBe('failed')
    expect(result.session.endedAt).not.toBeNull()
    expect(result.turn.status).toBe('failed')
    expect(result.turn.error).toBe('executor failed')
    expect(result.invocation.status).toBe('failed')
    expect(result.invocation.error).toBe('executor failed')
    expect(result.events.map(event => event.type)).toEqual(['status', 'status', 'error'])
    expect(result.events.at(-1)?.payloadJson).toMatchObject({
      message: 'executor failed',
      turnId: result.turn.id,
    })
```

- [ ] **Step 2: Run the focused runtime test**

Run:

```bash
bun test --timeout=30000 packages/core/src/worker/runtime.test.ts -t "records failed turns without throwing away the event trail"
```

Expected: PASS. If it fails, fix `packages/core/src/worker/runtime.ts` so failed turns return the updated failed session and failed invocation already persisted by the runtime catch block.

- [ ] **Step 3: Commit runtime assertion update**

Run:

```bash
git add packages/core/src/worker/runtime.test.ts packages/core/src/worker/runtime.ts
git diff --cached --check
git commit -m "test: 锁定失败 session 终态"
```

Expected: commit succeeds. If `runtime.ts` was unchanged, omit it from `git add`.

## Task 4: Refresh Mounted Session Detail And Recover Failed UI

**Files:**
- Modify: `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`
- Modify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
- Modify: `packages/soul-app-workbench/src/universal-workbench/timeline/SessionTimeline.tsx`
- Modify: `packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model.ts`

- [ ] **Step 1: Add failed-session render test**

In `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`, extend the type import:

```ts
import type { LocalSession, LocalSessionEvent, LocalTurn, LocalWorkspace } from '@zonease/aiworker-shared'
```

Append this test inside `describe('UniversalWorkbenchApp', () => { ... })`:

```ts
  it('renders a failed session as recoverable without stale running status or duplicate timeout errors', () => {
    const workspace = workspaceFixture()
    const session: LocalSession = {
      capabilityTemplateId: 'aiworker-hr.person-profile',
      context: '',
      createdAt: '2026-05-24T07:03:42.523Z',
      endedAt: '2026-05-24T07:08:43.533Z',
      id: 'session-failed',
      metadataJson: {},
      startedAt: '2026-05-24T07:03:42.523Z',
      status: 'failed',
      title: 'E2E audit task',
      updatedAt: '2026-05-24T07:08:43.533Z',
      workerId: 'worker-1',
      workspaceId: workspace.id,
    }
    const timeoutMessage = '/Users/ben/.local/bin/claude exited with code 143: Process exceeded 300000ms and was terminated.'
    const turn: LocalTurn = {
      createdAt: '2026-05-24T07:03:42.526Z',
      error: timeoutMessage,
      id: 'turn-failed',
      input: 'Create the Claude artifact.',
      metadataJson: {},
      response: 'Claude Code exited with code 143.',
      seq: 1,
      sessionId: session.id,
      status: 'failed',
      updatedAt: '2026-05-24T07:08:43.533Z',
    }
    const events: LocalSessionEvent[] = [
      sessionEvent({ id: 366, payloadJson: { status: 'running', turnId: turn.id }, seq: 2, type: 'status', turnId: turn.id }),
      sessionEvent({ id: 369, payloadJson: { agentEvent: { kind: 'status', label: 'requesting' } }, seq: 5, type: 'status', turnId: turn.id }),
      sessionEvent({ id: 371, payloadJson: { message: timeoutMessage, turnId: turn.id }, seq: 7, type: 'error', turnId: turn.id }),
    ]

    const html = renderToStaticMarkup(
      <UniversalWorkbenchApp
        engineReadiness={{ detail: 'Claude Code is ready for session turns.', label: 'Claude Code', ready: true }}
        events={events}
        selectedSessionId={session.id}
        sessions={[session]}
        templates={[{ id: 'aiworker-hr.person-profile', name: 'Person Profile' }]}
        turnInput=""
        turnSubmitting={false}
        turns={[turn]}
        workspace={workspace}
        workspaces={[workspace]}
        onBackToWorkspace={vi.fn()}
        onCreateSession={vi.fn(async () => {})}
        onCreateWorkspace={vi.fn()}
        onRefresh={vi.fn()}
        onSelectSession={vi.fn()}
        onSubmitTurn={vi.fn()}
        onTurnInputChange={vi.fn()}
      />,
    )

    expect(html).toContain('failed')
    expect(html).not.toContain('Session running')
    expect(html).not.toContain('Sending...')
    expect((html.match(/Process exceeded 300000ms/g) ?? [])).toHaveLength(1)
  })
```

Add this helper below `workspaceFixture()`:

```ts
function sessionEvent(input: {
  id: number
  payloadJson: Record<string, unknown>
  seq: number
  type: LocalSessionEvent['type']
  turnId: string | null
}): LocalSessionEvent {
  return {
    createdAt: '2026-05-24T07:08:43.534Z',
    id: input.id,
    invocationId: 'invocation-1',
    payloadJson: input.payloadJson,
    seq: input.seq,
    sessionId: 'session-failed',
    turnId: input.turnId,
    type: input.type,
  }
}
```

- [ ] **Step 2: Run failed-session render test and verify it fails**

Run:

```bash
bun test packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx -t "renders a failed session as recoverable"
```

Expected: FAIL because stale running status or duplicate error text is still rendered.

- [ ] **Step 3: Return session detail from `loadSessionDetail`**

In `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`, add:

```ts
interface SessionDetailResult {
  events: LocalSessionEvent[]
  session: LocalSession
  turns: LocalTurn[]
}
```

Replace `loadSessionDetail(...)` with:

```ts
async function loadSessionDetail(
  routePrefix: string,
  workerId: string,
  sessionId: string,
): Promise<SessionDetailResult> {
  return await fetchJson<SessionDetailResult>(
    `${routePrefix}/api/sessions/${encodeURIComponent(sessionId)}?workerId=${encodeURIComponent(workerId)}`,
  )
}
```

- [ ] **Step 4: Apply selected session detail consistently**

Inside `UniversalWorkbenchMountedClient`, add this helper before `refresh`:

```ts
  function applySessionDetail(detail: SessionDetailResult): void {
    setSessions(current => upsertSession(current, detail.session))
    setTurns(detail.turns)
    setEvents(detail.events)
  }
```

Replace each old `loadSessionDetail(routePrefix, workerId, sessionId, setTurns, setEvents)` call with:

```ts
      const detail = await loadSessionDetail(routePrefix, workerId, nextSelectedSessionId)
      if (!cancelled)
        applySessionDetail(detail)
```

For the `refresh` callback, where no `cancelled` variable exists, use:

```ts
    if (nextSelectedSessionId) {
      const detail = await loadSessionDetail(routePrefix, workerId, nextSelectedSessionId)
      applySessionDetail(detail)
    }
```

- [ ] **Step 5: Replace polling merge with full selected-session detail refresh**

In the selected-session polling effect in `client-entry.tsx`, replace the `poll` body with:

```ts
    const poll = async () => {
      try {
        const detail = await loadSessionDetail(routePrefix, workerId, selectedSessionId)
        if (!cancelled)
          applySessionDetail(detail)
      }
      catch {
        // Best-effort replay keeps the mounted workbench live without taking over Host error policy.
      }
      if (!cancelled)
        timer = setTimeout(poll, SESSION_EVENT_POLL_INTERVAL_MS)
    }
```

- [ ] **Step 6: Suppress stale running status for terminal turns**

In `packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model.ts`, change the `createSessionTimelineViewModel` mapping to:

```ts
      .map((turn) => {
        const compacted = compactTimelineEvents(eventsByTurn.get(turn.id) ?? fallbackResponseEvents(turn))
        return {
          events: suppressStaleTerminalStatus(compacted, turn),
          turn,
        }
      }),
```

Add this function near `fallbackResponseEvents`:

```ts
function suppressStaleTerminalStatus(
  events: SessionTimelineEvent[],
  turn: SessionTimelineTurnInput,
): SessionTimelineEvent[] {
  if (turn.status === 'running')
    return events
  return events.filter((event) => {
    if (event.kind !== 'signal' || event.signalKind !== 'status')
      return true
    return event.status !== 'running'
  })
}
```

- [ ] **Step 7: Avoid duplicate turn error fallback**

In `packages/soul-app-workbench/src/universal-workbench/timeline/SessionTimeline.tsx`, replace the fallback error render:

```tsx
                {item.turn.error ? <DefaultSessionEvent event={{ id: `error-${item.turn.id}`, kind: 'error', message: item.turn.error, turnId: item.turn.id }} /> : null}
```

with:

```tsx
                {shouldRenderTurnErrorFallback(item.events, item.turn.error)
                  ? <DefaultSessionEvent event={{ id: `error-${item.turn.id}`, kind: 'error', message: item.turn.error!, turnId: item.turn.id }} />
                  : null}
```

Add this helper near `collectToolResults`:

```ts
function shouldRenderTurnErrorFallback(events: SessionTimelineEvent[], error: string | null | undefined): boolean {
  const normalized = error?.trim()
  if (!normalized)
    return false
  return !events.some(event => event.kind === 'error' && event.message.trim() === normalized)
}
```

- [ ] **Step 8: Run failed-session render test again**

Run:

```bash
bun test packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx -t "renders a failed session as recoverable"
```

Expected: PASS.

- [ ] **Step 9: Run workbench package tests and typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit failed-session UI recovery**

Run:

```bash
git add packages/soul-app-workbench/src/universal-workbench/client-entry.tsx packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx packages/soul-app-workbench/src/universal-workbench/timeline/SessionTimeline.tsx packages/soul-app-workbench/src/universal-workbench/timeline/session-view-model.ts
git diff --cached --check
git commit -m "fix: 恢复 mounted session 失败态"
```

Expected: commit succeeds.

## Task 5: Propagate Mounted Workspace Locator Back To Host

**Files:**
- Modify: `packages/shared/src/soul-app/micro-app.ts`
- Modify: `apps/web/src/lib/micro-app-runtime.ts`
- Modify: `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`
- Modify: `apps/web/src/worker/studio/mounted-surface.tsx`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Add failing WorkerStudio mounted locator test**

In `apps/web/src/worker/__tests__/worker-studio.test.tsx`, update the hoisted mock listener type:

```ts
  dataListeners: new Map<string, (event: { actionId?: string, appId?: string, input?: unknown, surfaceId?: string, type: string, workerId?: string | null, workspaceId?: string | null }) => void>(),
```

Update the mocked `addMountedMicroAppDataListener` listener type to match the same object shape.

Append this test near the mounted route tests:

```ts
  it('updates Host workspace locator when a mounted app selects a workspace', async () => {
    currentWorkers = [
      { createdAt: now, defaultEngineId: 'codex', id: 'qa-worker', metadataJson: {}, name: 'QA', soulId: QA_SOUL_ID, status: 'active', updatedAt: now },
    ]
    currentApps = [
      mountedRouteApp({
        appId: 'aiworker-qa',
        appName: 'AIWorker QA',
        routes: [universalRoute()],
      }),
    ]
    currentWorkspaces = [
      { ...workspace, id: 'qa-workspace', name: 'QA Workspace', workerId: 'qa-worker', updatedAt: '2026-05-24T06:49:06.848Z' },
    ]
    window.history.replaceState(null, '', '/workers/qa-worker')
    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Universal Workbench')
    expect(microApp.getAttribute('url')).toBe('/api/local/apps/aiworker-qa/micro-app/workbench/universal?workerId=qa-worker&theme=light')

    await waitFor(() => {
      expect(microAppRouteMock.dataListeners.has('aiworker-qa--universal-workbench')).toBe(true)
    })
    act(() => {
      microAppRouteMock.dataListeners.get('aiworker-qa--universal-workbench')?.({
        appId: 'aiworker-qa',
        surfaceId: 'universal-workbench',
        type: 'locator:workspace-selected',
        workerId: 'qa-worker',
        workspaceId: 'qa-workspace',
      })
    })

    expect(window.location.pathname).toBe('/workers/qa-worker/workspaces/qa-workspace')
    await waitFor(() => {
      expect(microApp.getAttribute('url')).toBe('/api/local/apps/aiworker-qa/micro-app/workbench/universal?workerId=qa-worker&workspaceId=qa-workspace&theme=light')
    })
    await waitFor(() => {
      expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
        workspaceId: 'qa-workspace',
      })
    })
  })
```

- [ ] **Step 2: Run failing locator test**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx -t "updates Host workspace locator"
```

Expected: FAIL because the event type is not normalized or handled.

- [ ] **Step 3: Extend shared mounted child event type**

In `packages/shared/src/soul-app/micro-app.ts`, add this union member to `MountedMicroAppChildEvent`:

```ts
  | {
    appId?: string
    surfaceId?: string
    type: 'locator:workspace-selected'
    workerId: string
    workspaceId: string
  }
```

- [ ] **Step 4: Normalize the event in Host Web runtime**

In `apps/web/src/lib/micro-app-runtime.ts`, add this `switch` case in `normalizeMountedMicroAppChildEvent`:

```ts
    case 'locator:workspace-selected': {
      const workerId = stringOrUndefined(data.workerId)
      const workspaceId = stringOrUndefined(data.workspaceId)
      if (!workerId || !workspaceId)
        return null
      return {
        appId: stringOrUndefined(data.appId),
        surfaceId: stringOrUndefined(data.surfaceId),
        type: 'locator:workspace-selected',
        workerId,
        workspaceId,
      }
    }
```

- [ ] **Step 5: Dispatch the locator event after mounted workspace creation**

In `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`, update `handleCreateWorkspace` after `setWorkspaces(...)`:

```ts
    setWorkspaces(current => [...current.filter(workspace => workspace.id !== result.workspace.id), result.workspace])
    window.microApp?.dispatch?.({
      appId: hostData.appId ?? null,
      surfaceId: hostData.surfaceId ?? 'universal-workbench',
      type: 'locator:workspace-selected',
      workerId,
      workspaceId: result.workspace.id,
    })
```

If `MountedHostData` lacks `surfaceId`, add it:

```ts
  surfaceId?: string | null
```

- [ ] **Step 6: Add selection callback to mounted surface**

In `apps/web/src/worker/studio/mounted-surface.tsx`, add prop:

```ts
  onSelectWorkspace?: (workspaceId: string) => void
```

Include it in the function parameter list and prop type. Then update `handleMountedMicroAppChildEvent`:

```ts
    if (event.type === 'locator:workspace-selected') {
      if (event.workerId === workerId)
        onSelectWorkspace?.(event.workspaceId)
      return
    }
```

Add `onSelectWorkspace` and `workerId` to the `useCallback` dependency array.

- [ ] **Step 7: Wire selection in WorkerStudio**

In `apps/web/src/worker/worker-studio.tsx`, pass this prop to `MountedSoulAppRouteSurface`:

```tsx
                    onSelectWorkspace={(workspaceId) => {
                      setSelectedWorkspaceId(workspaceId)
                      navigateWorkerRoute({ kind: 'workspace', workerId: selectedWorker.id, workspaceId })
                    }}
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx -t "updates Host workspace locator"
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx -t "renders universal workbench routes through the micro-app mount path"
```

Expected: PASS.

- [ ] **Step 9: Run shared and web focused package tests**

Run:

```bash
bun run --filter '@zonease/aiworker-shared' test
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
bun scripts/check-soul-app-boundaries.ts --completion-audit
```

Expected: PASS.

- [ ] **Step 10: Commit mounted locator propagation**

Run:

```bash
git add packages/shared/src/soul-app/micro-app.ts apps/web/src/lib/micro-app-runtime.ts packages/soul-app-workbench/src/universal-workbench/client-entry.tsx apps/web/src/worker/studio/mounted-surface.tsx apps/web/src/worker/worker-studio.tsx apps/web/src/worker/__tests__/worker-studio.test.tsx
git diff --cached --check
git commit -m "fix: 同步 mounted workspace locator"
```

Expected: commit succeeds.

## Task 6: Remove Workspace Projection From Worker Configuration

**Files:**
- Modify: `apps/web/src/worker/worker-configuration-dialog.tsx`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Add failing boundary assertions**

In `apps/web/src/worker/__tests__/worker-studio.test.tsx`, append this test near the Worker Configuration tests:

```ts
  it('keeps Worker configuration scoped away from workspace projection', async () => {
    window.history.replaceState(null, '', '/workers/hr-worker/workspaces/workspace-1')
    render(<WorkerStudio />)

    fireEvent.click(await screen.findByRole('button', { name: 'Configure HR' }))
    const dialog = screen.getByRole('dialog', { name: 'Worker configuration' })

    expect(within(dialog).queryByText('Projection')).toBeNull()
    expect(within(dialog).queryByText(/Workspace:/)).toBeNull()
    expect(within(dialog).queryByText('No workspace selected')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Run projection' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Toggle Skills' })).toBeTruthy()
  })
```

- [ ] **Step 2: Run failing boundary test**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx -t "scoped away from workspace projection"
```

Expected: FAIL because projection UI still exists.

- [ ] **Step 3: Remove projection props and state**

In `apps/web/src/worker/worker-configuration-dialog.tsx`, remove these imports from the first line:

```ts
LocalWorkspace, SoulAppProjectionReceipt
```

Remove these props from `WorkerConfigurationDialog`:

```ts
  onProjectWorkspaceAssets,
  projectionWorkspace,
```

Remove these prop types:

```ts
  onProjectWorkspaceAssets?: () => Promise<SoulAppProjectionReceipt | null> | SoulAppProjectionReceipt | null
  projectionWorkspace?: LocalWorkspace | null
```

Remove these state declarations:

```ts
  const [projecting, setProjecting] = useState(false)
  const [projectionStatus, setProjectionStatus] = useState<string | null>(null)
```

Change:

```ts
  const [selectedPanel, setSelectedPanel] = useState<null | 'projection'>(null)
```

to:

```ts
  const [selectedPanel, setSelectedPanel] = useState<null | 'workbench'>(null)
```

- [ ] **Step 4: Replace Projection menu with worker-scoped Workbench menu**

In `worker-configuration-dialog.tsx`, replace the `SidebarMenu` item titled `Projection` with:

```tsx
                {workbenchTabs && workbenchTabs.length > 1
                  ? (
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            isActive={selectedPanel === 'workbench'}
                            size="lg"
                            className="h-11 items-start py-1.5"
                            onClick={() => {
                              setSelectedPanel('workbench')
                              setSelectedAssetId(null)
                            }}
                          >
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="truncate">Workbench</span>
                              <span className="truncate font-normal text-sidebar-foreground/60">
                                Worker route preference
                              </span>
                            </span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    )
                  : null}
```

- [ ] **Step 5: Replace Projection content panel with Workbench panel**

Replace the `selectedPanel === 'projection'` branch with:

```tsx
                  : selectedPanel === 'workbench'
                    ? (
                        <ItemGroup className="gap-3">
                          <Item variant="muted">
                            <ItemContent className="grid min-w-0 gap-3">
                              <ItemTitle>Workbench</ItemTitle>
                              <ItemDescription>
                                Choose the declared mounted route used by this Soul worker.
                              </ItemDescription>
                            </ItemContent>
                          </Item>
                          {workbenchTabs && workbenchTabs.length > 1
                            ? (
                                <Item variant="default">
                                  <ItemContent className="grid min-w-0 gap-2">
                                    <ItemTitle>Workbench route</ItemTitle>
                                    <ItemDescription>This preference is stored for this worker only.</ItemDescription>
                                    <ItemActions className="gap-0.5" role="tablist" aria-label="Workbench routes">
                                      {workbenchTabs.map(tab => (
                                        <button
                                          key={tab.id}
                                          type="button"
                                          role="tab"
                                          aria-selected={tab.id === activeWorkbenchTabId}
                                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                            tab.id === activeWorkbenchTabId
                                              ? 'bg-background text-foreground shadow-sm'
                                              : 'text-muted-foreground hover:text-foreground'
                                          }`}
                                          onClick={() => onSelectWorkbenchTab?.(tab)}
                                        >
                                          {tab.label}
                                        </button>
                                      ))}
                                    </ItemActions>
                                  </ItemContent>
                                </Item>
                              )
                            : null}
                        </ItemGroup>
                      )
```

Remove the `Run projection` item, `projectWorkspaceAssets()` function, and all `projectionStatus` rendering.

- [ ] **Step 6: Remove projection wiring from WorkerStudio**

In `apps/web/src/worker/worker-studio.tsx`, remove the `projectSelectedWorkspaceOverlay` function call site from `WorkerConfigurationDialog`:

```tsx
        onProjectWorkspaceAssets={projectSelectedWorkspaceOverlay}
        projectionWorkspace={selectedWorkspace?.workerId === workerConfigurationWorker?.id ? selectedWorkspace : null}
```

Keep `projectSelectedWorkspaceOverlay` only if another non-configuration caller still uses it. If no references remain, delete the function and remove `projectWorkerWorkspaceOverlay` from imports.

- [ ] **Step 7: Update existing Worker Configuration tests**

In `apps/web/src/worker/__tests__/worker-studio.test.tsx`, replace clicks using:

```ts
fireEvent.click(screen.getByRole('button', { name: /^Projection/ }))
```

with:

```ts
fireEvent.click(screen.getByRole('button', { name: /^Workbench/ }))
```

Delete assertions that expect:

```ts
screen.getByRole('button', { name: 'Run projection' })
screen.findByText('Projection updated with 4 items.')
```

Replace `tablist` labels:

```ts
screen.getByRole('tablist', { name: 'Workbench routes' })
```

- [ ] **Step 8: Run Worker Configuration focused tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx -t "Worker configuration"
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx -t "workbench"
```

Expected: PASS.

- [ ] **Step 9: Run UI checks**

Run:

```bash
bun run --filter '@zonease/aiworker-web' typecheck
bun run ui:check
```

Expected: PASS.

- [ ] **Step 10: Commit Worker Configuration cleanup**

Run:

```bash
git add apps/web/src/worker/worker-configuration-dialog.tsx apps/web/src/worker/worker-studio.tsx apps/web/src/worker/__tests__/worker-studio.test.tsx
git diff --cached --check
git commit -m "fix: 收口 Worker Configuration workspace 边界"
```

Expected: commit succeeds.

## Task 7: Add Local Settings Engines Endpoint

**Files:**
- Modify: `apps/api/src/modes/worker.ts`
- Modify: `apps/api/src/modes/worker/openapi.ts`
- Modify: `apps/api/src/modes/worker.local.test.ts`
- Modify: `docs/executor-engines.md`

- [ ] **Step 1: Add failing API test**

In `apps/api/src/modes/worker.local.test.ts`, inside `it('persists settings and supports engine rescan/test actions', async () => { ... })`, after the initial `/api/local/settings` assertions, add:

```ts
    const enginesRes = await target.request('/api/local/settings/engines')
    expect(enginesRes.status).toBe(200)
    const enginesBody = await enginesRes.json() as {
      engineId: string
      engines: Array<{ id: string, installed: boolean }>
      executionMode: string
    }
    expect(enginesBody.engineId).toBe(initial.settings.engineId)
    expect(enginesBody.executionMode).toBe(initial.settings.executionMode)
    expect(enginesBody.engines.map(engine => engine.id)).toEqual(initial.settings.engines.map(engine => engine.id))
```

In the OpenAPI path test, after the `/api/local/settings` assertion, add:

```ts
    expect(paths).toContain('/api/local/settings/engines')
```

- [ ] **Step 2: Run failing API test**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts -t "persists settings"
```

Expected: FAIL because the endpoint returns 404.

- [ ] **Step 3: Add the route**

In `apps/api/src/modes/worker.ts`, add this route immediately after `app.get('/api/local/settings', ...)`:

```ts
  app.get('/api/local/settings/engines', (c) => {
    const settings = loadLocalSettings()
    return c.json({
      engineId: settings.engineId,
      engines: settings.engines,
      executionMode: settings.executionMode,
    })
  })
```

- [ ] **Step 4: Add the OpenAPI path**

In `apps/api/src/modes/worker/openapi.ts`, add this entry after `/api/local/settings`:

```ts
    { method: 'get', path: '/api/local/settings/engines', summary: 'Show local engine readiness settings', tags: ['settings'] },
```

- [ ] **Step 5: Update docs wording**

In `docs/executor-engines.md`, replace the first sentence under `## Readiness Probe` with:

```md
`GET /api/local/settings/engines` returns the persisted local engine status used by Settings and mounted workbench readiness:
```

Replace the existing readiness bullet paragraph with:

```md
- CLI binary path/version information last discovered by local settings scan;
- selected `engineId`;
- selected `executionMode`.

The endpoint is read-only. It does not spawn CLI processes, does not read secret
contents, and does not guarantee which host/user-level plugins, MCP servers,
skills or native sessions the external engine will load when invoked.
```

- [ ] **Step 6: Run API tests**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit endpoint alignment**

Run:

```bash
git add apps/api/src/modes/worker.ts apps/api/src/modes/worker/openapi.ts apps/api/src/modes/worker.local.test.ts docs/executor-engines.md
git diff --cached --check
git commit -m "fix: 对齐本地 engines readiness endpoint"
```

Expected: commit succeeds.

## Task 8: Final Verification And Closeout

**Files:**
- Modify: `docs/task/BUG-152.md`
- Modify: `docs/task/BUG-153.md`
- Modify: `docs/task/BUG-154.md`
- Modify: `docs/task/BUG-155.md`
- Modify: `docs/plan/PLAN-409.md`
- Modify: `docs/plan/PLAN-410.md`
- Modify: `docs/plan/PLAN-411.md`
- Modify: `docs/plan/PLAN-412.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Run focused package verification**

Run:

```bash
bun test packages/core/src/worker/executor.test.ts
bun test --timeout=30000 packages/core/src/worker/runtime.test.ts
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun scripts/check-soul-app-boundaries.ts --completion-audit
bun run ui:check
```

Expected: all commands PASS.

- [ ] **Step 2: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: commands complete. Address any actionable findings before continuing.

- [ ] **Step 3: Run focused real E2E probes**

Start dev services if they are not already running:

```bash
bun run dev:status
```

If API/Web are not both listening, start them in tmux:

```bash
tmux new-session -d -s aiworker-e2e-repair 'cd /Users/ben/projects/aiworker && bun run dev'
```

Then verify the endpoint:

```bash
curl -fsS http://127.0.0.1:9217/api/local/settings/engines | jq '{engineId, executionMode, engineCount: (.engines | length)}'
```

Expected: JSON with `engineId`, `executionMode`, and `engineCount`.

Run the mounted surface smoke if dev services are healthy:

```bash
bun run web:smoke:mounted-surfaces
```

Expected: PASS.

- [ ] **Step 4: Update PMA docs and changelog**

In each of `docs/task/BUG-152.md`, `BUG-153.md`, `BUG-154.md`, and `BUG-155.md`, change:

```md
- **status**: in-progress
```

to:

```md
- **status**: completed
```

Add:

```md
- **completedAt**: 2026-05-24
```

In `docs/plan/PLAN-409.md` through `PLAN-412.md`, change:

```md
- **status**: approved
```

to:

```md
- **status**: completed
```

Add a `## Verification Result` section to each plan with the exact commands from Step 1 that covered that batch.

In `docs/task/index.md` and `docs/plan/index.md`, replace the four `[-]` markers added in Task 1 with `[x]`.

Add this changelog entry near the top of `docs/changelog.md`:

```md
## 2026-05-24 [fixed] Real E2E audit repair batch

Repaired the blocking findings from `tmp/real-e2e-audit-2026-05-24/`.
Mounted universal workbench sessions now refresh failed terminal state, avoid
stale running status, avoid duplicate timeout errors, and recover the follow-up
composer when engine readiness is true. Mounted Soul App workspace selection now
flows back to Host as an opaque locator, so selected workspace context reaches
micro-app URL/data without Host interpreting domain state.

Worker Configuration no longer exposes workspace projection scope; it remains a
worker-scoped Host shell surface for overlay/local enablement and declared
workbench route preference. The local daemon now serves
`GET /api/local/settings/engines` as a read-only non-secret engine status
projection aligned with docs and OpenAPI.
```

- [ ] **Step 5: Commit closeout docs**

Run:

```bash
git add docs/task/BUG-152.md docs/task/BUG-153.md docs/task/BUG-154.md docs/task/BUG-155.md docs/plan/PLAN-409.md docs/plan/PLAN-410.md docs/plan/PLAN-411.md docs/plan/PLAN-412.md docs/task/index.md docs/plan/index.md docs/changelog.md
git diff --cached --check
git commit -m "docs: 记录真实 E2E 修复收口"
```

Expected: commit succeeds.

## Execution Notes

- If any task uncovers a broader architecture decision, stop after the failing test and report the new decision point.
- Do not run a full `bun run check` until the focused gates are green; if final scope has changed shared contracts or visible UI, run `bun run check` before closeout.
- If real Claude Code still times out after Batch 1, that is acceptable only if the UI shows failed state clearly and allows recovery. External engine success is not the Batch 1 acceptance criterion.
- Do not use `kill $(lsof -ti:PORT)`. If a listener must be inspected, use `lsof -tiTCP:PORT -sTCP:LISTEN`.
