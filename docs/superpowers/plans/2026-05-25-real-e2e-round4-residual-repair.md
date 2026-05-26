# Real E2E Round 4 Residual Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the current-HEAD residual findings from `tmp/real-e2e-audit-2026-05-25-round4/` without repeating BUG-157 / PLAN-414 work.

**Architecture:** Keep engine preference in Host execution settings and freeze the effective engine at session boundaries. Keep mounted theme and stale poller fixes inside Host mount context plus Soul-owned universal workbench client, while Host only passes opaque locator/theme context. Add date context to the engine invocation prompt without rewriting transcript or artifact output.

**Tech Stack:** Bun workspaces, TypeScript, React 19, Bun test, Testing Library, `@micro-zoe/micro-app`, shadcn-managed primitives from `@zonease/aiworker-ui`, AIWorker local daemon, official HR/QA mounted client bundles.

---

## Scope Source

- Approved design: `docs/superpowers/specs/2026-05-25-real-e2e-round4-residual-repair-design.md`
- Evidence ledger: `tmp/real-e2e-audit-2026-05-25-round4/findings.md`
- Final report: `tmp/real-e2e-audit-2026-05-25-round4/final-report.md`
- Completed earlier batch to avoid duplicating: `docs/task/BUG-157.md`, `docs/plan/PLAN-414.md`
- Architecture contract: `docs/architecture.md#constraint-registry`
- Host skill: `.agents/skills/aiworker-host-dev/SKILL.md`
- Soul App skill: `.agents/skills/aiworker-soul-app-dev/SKILL.md`

## Scope Check

The residuals touch CLI/API/Core, Host Web mounting, and the Soul-owned universal workbench client. They share one release-risk evidence source and one verification loop, so keep them in one plan. Do not add a new Web engine picker, a Host-owned Soul configuration surface, a Host transcript rewriter, or a new domain workflow.

## Component Library Preflight

Visible UI work is limited to mounted theme regression checks and existing Worker Configuration/composer regression evidence. Any UI edit in this plan must use existing primitives only:

- `@zonease/aiworker-ui/components/button`
- `@zonease/aiworker-ui/components/dialog`
- `@zonease/aiworker-ui/components/item`
- `@zonease/aiworker-ui/components/session-composer`
- `@zonease/aiworker-ui/components/sidebar`

Do not add `lucide-react`, raw hex colors, arbitrary color values, custom focus traps, custom scroll locks, or Host-rendered Soul domain panels.

## File Structure

- Create `docs/task/BUG-158.md`
  - PMA task for round4 residual repair.
- Modify `docs/task/index.md`
  - Add `BUG-158`.
- Create `docs/plan/PLAN-415.md`
  - PMA implementation tracker for this plan.
- Modify `docs/plan/index.md`
  - Add `PLAN-415`.
- Create `packages/core/src/worker/session-engine.ts`
  - Shared helpers for session engine metadata, fallback resolution, and prompt-safe execution context.
- Modify `packages/core/src/index.ts`
  - Export session engine helpers for API/CLI package consumers.
- Modify `packages/core/src/worker/runtime.ts`
  - Freeze session engine metadata, inherit it on follow-up turns, and add Host current date to prompts.
- Modify `packages/core/src/worker/runtime.test.ts`
  - Cover immutable session engine and Host date prompt context.
- Modify `apps/api/src/modes/worker.ts`
  - Use the shared session engine helper for session creation and follow-up turns.
- Modify `apps/api/src/modes/worker.local.test.ts`
  - Cover Web/API new-session selected engine and existing-session immutable follow-up.
- Modify `apps/cli/src/aiworker.ts`
  - Make `engine select` affect new CLI sessions, add `session start --engine`, and keep `turn send` immutable.
- Modify `apps/cli/src/aiworker.test.ts`
  - Cover CLI selected engine, explicit create-time override, and immutable follow-up behavior.
- Modify `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`
  - Cancel stale pollers and clear selected sessions that do not belong to current locator context.
- Modify `packages/soul-app-workbench/src/universal-workbench/client-entry.events.test.ts`
  - Cover stale poller cancellation and context-scoped selected session behavior.
- Modify `apps/web/src/worker/__tests__/worker-studio.test.tsx`
  - Strengthen mounted theme URL/data assertions and retain existing 390px/composer regressions.
- Modify `docs/changelog.md`
  - Record final residual repair after verification.

## Task 1: Create PMA Tracking

**Files:**
- Create: `docs/task/BUG-158.md`
- Modify: `docs/task/index.md`
- Create: `docs/plan/PLAN-415.md`
- Modify: `docs/plan/index.md`

- [ ] **Step 1: Write the task file**

Create `docs/task/BUG-158.md`:

```md
# BUG-158 Real E2E round4 residual repair

- **status**: pending
- **priority**: P2
- **owner**: unassigned
- **createdAt**: 2026-05-25
- **plan**: PLAN-415
- **relatesTo**: HOST-001, CONFIG-001, PROTO-001, MOUNT-001, ENGINE-001, UI-001

## Background

The fourth real E2E audit in `tmp/real-e2e-audit-2026-05-25-round4/` was captured against baseline `7369a437`. Current HEAD already includes BUG-157 / PLAN-414 fixes for session completion, universal composer default capability, Worker Configuration 390px reachability, duplicate worker labels, mounted stream recovery, and the HR legacy artifact probe.

This task tracks only the current-HEAD residuals: CLI engine selection semantics, immutable session engine behavior, mounted Host/Soul theme alignment, stale mounted session poller cancellation, and date-context prompt polish.

## Evidence

- `tmp/real-e2e-audit-2026-05-25-round4/findings.md`
- `tmp/real-e2e-audit-2026-05-25-round4/final-report.md`
- `tmp/real-e2e-audit-2026-05-25-round4/api/final-sessions.json`
- `tmp/real-e2e-audit-2026-05-25-round4/browser/web-composer-pre-submit-state.json`
- `tmp/real-e2e-audit-2026-05-25-round4/browser/worker-configuration-narrow-r4.json`
- `tmp/real-e2e-audit-2026-05-25-round4/logs/final-runtime-state.txt`

## Acceptance Criteria

1. `aiworker engine select claude-code` affects the next CLI `session start`.
2. `session start --engine <id>` can explicitly select the engine before session creation.
3. Existing sessions keep their original engine for later turns, even if Host engine preference changes.
4. Host shell and mounted HR/QA universal workbench surfaces receive and render the same effective `light|dark` theme.
5. Mounted universal workbench cancels stale session pollers when worker/workspace/session context changes.
6. Engine prompts include a stable Host current date context without rewriting transcript or artifacts.
7. Regression evidence proves BUG-157 items did not regress.
```

- [ ] **Step 2: Add the task index entry**

Append this line to `docs/task/index.md` after `BUG-157`:

```md
- [ ] [**BUG-158 Real E2E round4 residual repair**](BUG-158.md) `P2`
```

- [ ] **Step 3: Write the plan tracker**

Create `docs/plan/PLAN-415.md`:

```md
# PLAN-415 Real E2E round4 residual repair

- **status**: pending
- **createdAt**: 2026-05-25
- **approvedAt**: 2026-05-25
- **relatedTask**: BUG-158
- **superpowersSpec**: docs/superpowers/specs/2026-05-25-real-e2e-round4-residual-repair-design.md
- **superpowersPlan**: docs/superpowers/plans/2026-05-25-real-e2e-round4-residual-repair.md

## Context

This plan implements only the current-HEAD residuals from `tmp/real-e2e-audit-2026-05-25-round4/`. BUG-157 / PLAN-414 already closed the earlier P2/P3 repair batch and must not be duplicated.

## Proposal

1. Share session engine metadata helpers in core.
2. Make CLI/API session creation use Host selected engine and freeze it on the session.
3. Keep follow-up turns on the session engine, not the latest Host preference.
4. Align mounted theme URL/data/rendering for HR and QA.
5. Cancel stale universal workbench pollers when locator context changes.
6. Add Host current date to invocation prompts.
7. Verify focused tests, UI governance, mounted client rebuilds, browser evidence, and code-review-graph.

## Verification

- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run ui:check`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`
- `bun run --filter '@zonease/aiworker-hr' build:client`
- `bun run --filter '@zonease/aiworker-qa' build:client`
- Browser evidence under `tmp/real-e2e-round4-residual-repair-2026-05-25/`
- `bun run crg:update`
- `bun run crg:review`
- `git diff --check`
```

- [ ] **Step 4: Add the plan index entry**

Append this line to `docs/plan/index.md` after `PLAN-414`:

```md
- [ ] [**PLAN-415 Real E2E round4 residual repair**](PLAN-415.md) `2026-05-25`
```

- [ ] **Step 5: Verify tracking files**

Run:

```bash
rg -n "BUG-158|PLAN-415" docs/task docs/plan
```

Expected: four hits or more, covering both detail files and both indexes.

## Task 2: Add Shared Session Engine Helpers

**Files:**
- Create: `packages/core/src/worker/session-engine.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/worker/runtime.test.ts`

- [ ] **Step 1: Write focused helper tests**

Add these names to the existing import block in `packages/core/src/worker/runtime.test.ts`:

```ts
import {
  freezeSessionEngineMetadata,
  readFrozenSessionEngine,
  resolveFrozenSessionEngine,
} from './session-engine'
```

Then add this test block after helper fixtures:

```ts

describe('session engine metadata helpers', () => {
  it('freezes and reads session engine metadata', () => {
    const metadata = freezeSessionEngineMetadata({}, {
      engineCommand: 'claude',
      engineId: 'claude-code',
      executionMode: 'local-cli',
    })

    expect(metadata).toMatchObject({
      engineCommand: 'claude',
      engineId: 'claude-code',
      executionMode: 'local-cli',
    })
    expect(readFrozenSessionEngine(metadata)).toEqual({
      engineCommand: 'claude',
      engineId: 'claude-code',
      executionMode: 'local-cli',
    })
  })

  it('keeps the existing session engine immutable over a new preference', () => {
    expect(resolveFrozenSessionEngine({
      latestInvocation: null,
      requested: { engineCommand: 'codex', engineId: 'codex', executionMode: 'local-cli' },
      sessionMetadata: { engineCommand: 'claude', engineId: 'claude-code', executionMode: 'local-cli' },
    })).toEqual({
      engineCommand: 'claude',
      engineId: 'claude-code',
      executionMode: 'local-cli',
      source: 'session',
    })
  })

  it('falls back to the latest invocation for legacy sessions', () => {
    expect(resolveFrozenSessionEngine({
      latestInvocation: { engineCommand: 'claude', engineId: 'claude-code' },
      requested: { engineCommand: 'codex', engineId: 'codex', executionMode: 'local-cli' },
      sessionMetadata: {},
    })).toEqual({
      engineCommand: 'claude',
      engineId: 'claude-code',
      executionMode: 'local-cli',
      source: 'latest-invocation',
    })
  })
})
```

- [ ] **Step 2: Run helper tests and verify failure**

Run:

```bash
bun test packages/core/src/worker/runtime.test.ts --test-name-pattern "session engine metadata helpers"
```

Expected: FAIL because `./session-engine` does not exist.

- [ ] **Step 3: Implement the helper**

Create `packages/core/src/worker/session-engine.ts`:

```ts
export interface FrozenSessionEngine {
  engineCommand: string | null
  engineId: string
  executionMode: string
}

export interface ResolvedSessionEngine extends FrozenSessionEngine {
  source: 'latest-invocation' | 'requested' | 'session'
}

export interface LatestInvocationEngine {
  engineCommand: string | null
  engineId: string
}

export function readFrozenSessionEngine(metadata: Record<string, unknown> | null | undefined): FrozenSessionEngine | null {
  const engineId = readString(metadata?.engineId)
  if (!engineId)
    return null
  return {
    engineCommand: readNullableString(metadata?.engineCommand),
    engineId,
    executionMode: readString(metadata?.executionMode) ?? 'local-cli',
  }
}

export function freezeSessionEngineMetadata(
  metadata: Record<string, unknown> | null | undefined,
  engine: FrozenSessionEngine,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    engineCommand: engine.engineCommand,
    engineId: engine.engineId,
    executionMode: engine.executionMode,
  }
}

export function resolveFrozenSessionEngine(input: {
  latestInvocation: LatestInvocationEngine | null
  requested: FrozenSessionEngine
  sessionMetadata: Record<string, unknown> | null | undefined
}): ResolvedSessionEngine {
  const sessionEngine = readFrozenSessionEngine(input.sessionMetadata)
  if (sessionEngine)
    return { ...sessionEngine, source: 'session' }
  if (input.latestInvocation?.engineId) {
    return {
      engineCommand: input.latestInvocation.engineCommand,
      engineId: input.latestInvocation.engineId,
      executionMode: input.requested.executionMode,
      source: 'latest-invocation',
    }
  }
  return { ...input.requested, source: 'requested' }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
```

- [ ] **Step 4: Export the helper from the core package**

In `packages/core/src/index.ts`, add this export block near the other worker exports:

```ts
export {
  freezeSessionEngineMetadata,
  readFrozenSessionEngine,
  resolveFrozenSessionEngine,
  type FrozenSessionEngine,
  type LatestInvocationEngine,
  type ResolvedSessionEngine,
} from './worker/session-engine'
```

- [ ] **Step 5: Run helper tests and verify pass**

Run:

```bash
bun test packages/core/src/worker/runtime.test.ts --test-name-pattern "session engine metadata helpers"
```

Expected: PASS.

## Task 3: Freeze Engine And Add Date Context In Runtime

**Files:**
- Modify: `packages/core/src/worker/runtime.ts`
- Modify: `packages/core/src/worker/runtime.test.ts`

- [ ] **Step 1: Add runtime behavior tests**

In `packages/core/src/worker/runtime.test.ts`, add a test after the successful loop test:

```ts
  it('keeps follow-up turns on the frozen session engine and includes Host date context', async () => {
    const workerRuntime = runtime({
      async invoke() {
        return { summary: 'ok' }
      },
    })
    await workerRuntime.init()
    const workspace = await workerRuntime.createWorkspace({ name: 'Engine contract' })
    const session = await workerRuntime.createSession({
      workspaceId: workspace.id,
      capabilityTemplateId: 'candidate-screen',
      title: 'Engine lock',
      metadata: { engineCommand: 'claude', engineId: 'claude-code', executionMode: 'local-cli' },
    })

    await workerRuntime.startTurn({
      engineCommand: 'claude',
      engineId: 'claude-code',
      input: 'first',
      sessionId: session.id,
    })
    const second = await workerRuntime.startTurn({
      engineCommand: 'codex',
      engineId: 'codex',
      input: 'second',
      sessionId: session.id,
    })

    expect(second.invocation.engineId).toBe('claude-code')
    expect(second.invocation.engineCommand).toBe('claude')
    expect(second.invocation.prompt).toContain('Host execution context:')
    expect(second.invocation.prompt).toContain('Current date: 2026-05-09')
  })
```

- [ ] **Step 2: Run runtime behavior test and verify failure**

Run:

```bash
bun test packages/core/src/worker/runtime.test.ts --test-name-pattern "keeps follow-up turns"
```

Expected: FAIL because `startTurn` currently uses requested engine input and prompt lacks Host date context.

- [ ] **Step 3: Import helpers in runtime**

In `packages/core/src/worker/runtime.ts`, add:

```ts
import { freezeSessionEngineMetadata, resolveFrozenSessionEngine } from './session-engine'
```

- [ ] **Step 4: Resolve effective engine at start of `startTurn`**

In `startTurn`, after `const workspace = this.requireWorkspace(session.workspaceId)`, add:

```ts
    const latestInvocation = listEngineInvocations()
      .filter(invocation => invocation.sessionId === session.id)
      .sort((a, b) => b.seq - a.seq)[0] ?? null
    const resolvedEngine = resolveFrozenSessionEngine({
      latestInvocation: latestInvocation
        ? { engineCommand: latestInvocation.engineCommand, engineId: latestInvocation.engineId }
        : null,
      requested: {
        engineCommand: input.engineCommand ?? null,
        engineId: input.engineId,
        executionMode: readString(input.metadata?.executionMode, 'local-cli'),
      },
      sessionMetadata: session.metadataJson,
    })
```

- [ ] **Step 5: Freeze metadata before creating the turn**

Replace the current `const metadata = { ... }` block with:

```ts
    const metadata = freezeSessionEngineMetadata({
      ...(session.metadataJson ?? {}),
      ...(input.metadata ?? {}),
      capabilityTemplateId: session.capabilityTemplateId,
      sessionId: session.id,
      workerId: this.workerId,
      workspaceId: workspace.id,
    }, resolvedEngine)
    if (!readFrozenSessionEngine(session.metadataJson)) {
      updateSession({
        id: session.id,
        metadataJson: metadata,
        at: this.#now(),
      })
    }
```

Also import `readFrozenSessionEngine` from `./session-engine`.

- [ ] **Step 6: Use resolved engine for invocation and executor**

Replace uses of `input.engineId` and `input.engineCommand ?? null` for invocation/executor inside `startTurn` with:

```ts
resolvedEngine.engineId
resolvedEngine.engineCommand
```

The `createEngineInvocation` fields should become:

```ts
      engineId: resolvedEngine.engineId,
      engineCommand: resolvedEngine.engineCommand,
```

The executor invocation fields should become:

```ts
        engineCommand: resolvedEngine.engineCommand,
        engineId: resolvedEngine.engineId,
```

- [ ] **Step 7: Add Host date prompt context**

In `buildInvocationPrompt`, add this block before `Session context:`:

```ts
      '',
      'Host execution context:',
      `Current date: ${this.#now().slice(0, 10)}`,
```

- [ ] **Step 8: Run runtime tests**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test
```

Expected: PASS.

## Task 4: Align CLI Engine Selection With Session Creation

**Files:**
- Modify: `apps/cli/src/aiworker.ts`
- Modify: `apps/cli/src/aiworker.test.ts`

- [ ] **Step 1: Add CLI tests**

In `apps/cli/src/aiworker.test.ts`, add a test near other local CLI command tests:

```ts
  it('uses selected engine for new sessions and keeps existing sessions immutable', async () => {
    await runCli(argv('app', 'bootstrap', 'official'))
    await runCli(argv('worker', 'create', '--id', 'hr-worker', '--name', 'HR', '--soul', 'aiworker-hr'))
    await runCli(argv('workspace', 'create', '--worker', 'hr-worker', '--name', 'CLI workspace'))
    const workspace = JSON.parse(output).workspace
    output = ''

    expect(await runCli(argv('engine', 'select', 'claude-code'))).toBe(0)
    output = ''
    expect(await runCli(argv(
      'session', 'start',
      '--worker', 'hr-worker',
      '--workspace', workspace.id,
      '--skill', 'aiworker-hr.person-profile',
      '--title', 'CLI engine selection',
      '--input', 'write a one line note',
    ))).toBe(0)
    const first = JSON.parse(output)
    expect(first.invocation.engineId).toBe('claude-code')

    output = ''
    expect(await runCli(argv('engine', 'select', 'codex'))).toBe(0)
    output = ''
    expect(await runCli(argv('turn', 'send', '--worker', 'hr-worker', '--session', first.session.id, '--input', 'continue'))).toBe(0)
    const second = JSON.parse(output)
    expect(second.invocation.engineId).toBe('claude-code')
  })

  it('supports explicit engine selection only when creating a session', async () => {
    const help = await runCli(argv('turn', 'send', '--help'))
    expect(help).toBe(0)
    expect(output).not.toContain('--engine')
  })
```

- [ ] **Step 2: Run CLI tests and verify failure**

Run:

```bash
bun test apps/cli/src/aiworker.test.ts --test-name-pattern "selected engine"
```

Expected: FAIL because CLI `session start` still hardcodes Codex.

- [ ] **Step 3: Add CLI engine helpers**

In `apps/cli/src/aiworker.ts`, add near `selectedWorkerId()`:

```ts
const CLI_ENGINE_COMMANDS: Record<string, string> = {
  'claude-code': 'claude',
  codex: 'codex',
  cursor: 'cursor-agent',
  gemini: 'gemini',
  opencode: 'opencode',
  qwen: 'qwen',
}

function selectedCliEngineId(explicit?: string): string {
  if (explicit?.trim())
    return explicit.trim()
  const selected = listSettings().find(setting => setting.key === 'engine.default')?.valueJson
  if (selected && typeof selected === 'object' && 'engine' in selected && typeof selected.engine === 'string' && selected.engine.trim())
    return selected.engine.trim()
  return 'codex'
}

function cliEngineCommand(engineId: string): string {
  return CLI_ENGINE_COMMANDS[engineId] ?? engineId
}
```

- [ ] **Step 4: Add `--engine` to session creation only**

Change the `startSessionCommand` option type to include `engine?: string`:

```ts
async function startSessionCommand(opts: { context?: string, engine?: string, input?: string, model?: string, reasoning?: string, skill?: string, title?: string, worker?: string, workspace?: string }): Promise<void> {
```

Register the option:

```ts
    .option('--engine <id>', 'engine id for this new session')
```

Do not add `--engine` to `turn send`.

- [ ] **Step 5: Use selected engine in `session start`**

Inside `startSessionCommand`, before `runtime.createSession`, add:

```ts
  const engineId = selectedCliEngineId(opts.engine)
  const engineCommand = cliEngineCommand(engineId)
```

Change `sessionMetadata` to:

```ts
  const sessionMetadata = {
    engineCommand,
    engineId,
    executionMode: 'local-cli',
    ...cliEngineOverrideMetadata(opts),
  }
```

Change `runtime.startTurn` to:

```ts
  printJson(await runtime.startTurn({
    sessionId: session.id,
    input,
    engineId,
    engineCommand,
    metadata: {
      ...(session.metadataJson ?? sessionMetadata),
      executionMode: 'local-cli',
      ...cliEngineOverrideMetadata(opts),
    },
  }))
```

- [ ] **Step 6: Let `turn send` request the latest preference but rely on runtime immutability**

In `sendTurnCommand`, add:

```ts
  const engineId = selectedCliEngineId()
  const engineCommand = cliEngineCommand(engineId)
```

Change `runtime.startTurn` to pass those requested values:

```ts
    engineId,
    engineCommand,
```

Runtime will override them when session metadata or latest invocation already freezes a session engine.

- [ ] **Step 7: Run CLI tests**

Run:

```bash
bun run --filter '@zonease/aiworker-cli' test
```

Expected: PASS.

## Task 5: Align API/Web Session Engine Semantics

**Files:**
- Modify: `apps/api/src/modes/worker.ts`
- Modify: `apps/api/src/modes/worker.local.test.ts`

- [ ] **Step 1: Add API tests**

In `apps/api/src/modes/worker.local.test.ts`, first add this import beside other local imports:

```ts
import { loadLocalSettings, saveLocalSettings } from './worker/settings'
```

Then add this test near `it('serves the session workspace loop through /api/local routes', ...)`:

```ts
  it('freezes selected local engine on Web-created sessions and keeps follow-up turns immutable', async () => {
    const target = await app()
    const worker = await createHrWorker(target)
    const workspaceRes = await target.request(`/api/local/workers/${worker.id}/workspaces`, {
      body: JSON.stringify({ name: 'Engine workspace' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(workspaceRes.status).toBe(201)
    const workspaceBody = await workspaceRes.json() as { workspace: { id: string } }
    saveLocalSettings({
      ...loadLocalSettings(),
      engineId: 'claude-code',
      executionMode: 'local-cli',
      engines: [
        { command: 'codex', id: 'codex', installed: true, name: 'Codex CLI', path: 'codex', version: 'test' },
        { command: 'claude', id: 'claude-code', installed: true, name: 'Claude Code', path: 'claude', version: 'test' },
      ],
    })

    const createRes = await target.request(`/api/local/workers/${worker.id}/workspaces/${workspaceBody.workspace.id}/sessions`, {
      body: JSON.stringify({
        capabilityTemplateId: HR_CANDIDATE_SCREEN,
        input: 'first',
        title: 'Engine lock',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const created = await createRes.json() as { invocation: { engineId: string }, session: { id: string } }
    expect(created.invocation.engineId).toBe('claude-code')

    saveLocalSettings({ ...loadLocalSettings(), engineId: 'codex' })
    const turnRes = await target.request(`/api/local/workers/${worker.id}/sessions/${created.session.id}/messages`, {
      body: JSON.stringify({ input: 'second' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const turn = await turnRes.json() as { invocation: { engineId: string } }
    expect(turn.invocation.engineId).toBe('claude-code')
  })
```

- [ ] **Step 2: Run API test and verify failure if API is not aligned**

Run:

```bash
bun test apps/api/src/modes/worker.local.test.ts --test-name-pattern "freezes selected local engine"
```

Expected: FAIL until session metadata is frozen and follow-up uses runtime immutability.

- [ ] **Step 3: Freeze engine metadata when creating Web/API sessions**

In `apps/api/src/modes/worker.ts`, add `freezeSessionEngineMetadata` to the existing `@zonease/aiworker-core` import:

```ts
import { freezeSessionEngineMetadata } from '@zonease/aiworker-core'
```

In `createWorkspaceSessionResponse`, compute the engine before `runtime.createSession`:

```ts
  const settings = loadLocalSettings()
  const engine = selectedEngine(settings)
  const engineId = settings.executionMode === 'local-cli' ? settings.engineId : settings.byok.provider
  const engineCommand = selectedEngineCommand(settings, engine)
  const sessionMetadata = freezeSessionEngineMetadata(metadata, {
    engineCommand,
    engineId,
    executionMode: settings.executionMode,
  })
```

Pass `sessionMetadata` to `runtime.createSession`.

- [ ] **Step 4: Reuse frozen metadata for first turn**

In `createWorkspaceSessionResponse`, change `turnInput` to use `sessionMetadata`:

```ts
  const turnInput = {
    engineCommand,
    engineId,
    input: body.input,
    metadata: {
      ...sessionMetadata,
      ...executionMetadata(settings, engine),
    },
  }
```

- [ ] **Step 5: Keep follow-up turns compatible**

Leave `createSessionMessageResponse` reading current settings as requested input. Runtime immutability from Task 3 will override it for sessions that already have frozen engine metadata.

- [ ] **Step 6: Run API tests**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
```

Expected: PASS.

## Task 6: Cancel Stale Mounted Workbench Pollers

**Files:**
- Modify: `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`
- Modify: `packages/soul-app-workbench/src/universal-workbench/client-entry.events.test.ts`

- [ ] **Step 1: Add poller regression test**

In `packages/soul-app-workbench/src/universal-workbench/client-entry.events.test.ts`, add:

```ts
  it('keeps selected session ids scoped to the current mounted locator context', () => {
    const oldSession = sessionFixture({
      id: 'old-session',
      workerId: 'old-worker',
      workspaceId: 'old-workspace',
    })
    const qaSession = sessionFixture({
      id: 'qa-session',
      workerId: 'qa-worker',
      workspaceId: 'qa-workspace',
    })

    expect(sessionBelongsToMountedContext(oldSession, {
      workerId: 'qa-worker',
      workspaceId: 'qa-workspace',
    })).toBe(false)
    expect(sessionBelongsToMountedContext(qaSession, {
      workerId: 'qa-worker',
      workspaceId: 'qa-workspace',
    })).toBe(true)
    expect(resolveMountedSelectedSessionId({
      hostSessionId: 'old-session',
      latestSelectedSessionId: 'old-session',
      preferredSessionId: null,
      sessions: [qaSession],
      workerId: 'qa-worker',
      workspaceId: 'qa-workspace',
    })).toBe('qa-session')
    expect(resolveMountedSelectedSessionId({
      hostSessionId: null,
      latestSelectedSessionId: 'old-session',
      preferredSessionId: null,
      sessions: [],
      workerId: 'qa-worker',
      workspaceId: 'qa-workspace',
    })).toBeNull()
  })
```

Add `sessionBelongsToMountedContext` and `resolveMountedSelectedSessionId` to the import list from `./client-entry`.

- [ ] **Step 2: Run workbench test and verify failure**

Run:

```bash
bun test packages/soul-app-workbench/src/universal-workbench/client-entry.events.test.ts --test-name-pattern "selected session ids scoped"
```

Expected: FAIL because the exported helper functions do not exist.

- [ ] **Step 3: Export pure context helpers**

In `packages/soul-app-workbench/src/universal-workbench/client-entry.tsx`, add after `shouldRefreshRecoveredSession`:

```ts
export function sessionBelongsToMountedContext(
  session: Pick<LocalSession, 'workerId' | 'workspaceId'>,
  context: { workerId: string | null, workspaceId: string | null },
): boolean {
  if (context.workerId && session.workerId !== context.workerId)
    return false
  if (context.workspaceId && session.workspaceId !== context.workspaceId)
    return false
  return true
}

export function resolveMountedSelectedSessionId(input: {
  hostSessionId: string | null
  latestSelectedSessionId: string | null
  preferredSessionId: string | null
  sessions: readonly LocalSession[]
  workerId: string | null
  workspaceId: string | null
}): string | null {
  const scopedSessions = input.sessions.filter(session => sessionBelongsToMountedContext(session, input))
  const candidateSessionId = input.preferredSessionId ?? input.latestSelectedSessionId ?? input.hostSessionId
  if (candidateSessionId && scopedSessions.some(session => session.id === candidateSessionId))
    return candidateSessionId
  return scopedSessions[0]?.id ?? null
}
```

- [ ] **Step 4: Track locator identity**

In `UniversalWorkbenchMountedClient`, add after `workspaceId`:

```ts
  const locatorKey = `${routePrefix}|${workerId ?? ''}|${workspaceId ?? ''}|${hostData.sessionId ?? ''}`
```

- [ ] **Step 5: Clear invalid selected session on locator changes**

Add this effect after `selectSession`:

```ts
  useEffect(() => {
    const selected = selectedSessionId
      ? sessions.find(session => session.id === selectedSessionId)
      : null
    if (!selectedSessionId)
      return
    if (!selected || !sessionBelongsToMountedContext(selected, { workerId, workspaceId }))
      selectSession(null)
  }, [locatorKey, selectedSessionId, sessions, selectSession, workerId, workspaceId])
```

- [ ] **Step 6: Scope refresh selected-session choice to current sessions**

In `refresh`, replace:

```ts
    const nextSelectedSessionId = preferredSessionId ?? latestSelectedSessionIdRef.current ?? hostData.sessionId ?? nextSessions[0]?.id ?? null
```

with:

```ts
    const nextSelectedSessionId = resolveMountedSelectedSessionId({
      hostSessionId: hostData.sessionId ?? null,
      latestSelectedSessionId: latestSelectedSessionIdRef.current,
      preferredSessionId: preferredSessionId ?? null,
      sessions: nextSessions,
      workerId,
      workspaceId,
    })
    selectSession(nextSelectedSessionId)
```

Add `selectSession` to the `refresh` dependency list.

- [ ] **Step 7: Gate polling by current session membership**

At the start of the polling effect, replace:

```ts
    if (!selectedSessionId || !workerId)
      return
```

with:

```ts
    if (!selectedSessionId || !workerId)
      return
    const selected = sessions.find(session => session.id === selectedSessionId)
    if (!selected || !sessionBelongsToMountedContext(selected, { workerId, workspaceId }))
      return
```

Add `sessions` and `workspaceId` to the polling effect dependency list.

- [ ] **Step 8: Run workbench tests**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-workbench' test
```

Expected: PASS.

## Task 7: Strengthen Mounted Theme Tests

**Files:**
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Add dark theme mounted URL/data assertion**

In `apps/web/src/worker/__tests__/worker-studio.test.tsx`, add a new test after `it('renders universal workbench routes through the micro-app mount path', ...)`:

```ts
  it('passes dark resolved theme to mounted micro-app URL and data', async () => {
    currentSettings = { ...currentSettings, appearance: 'dark' }
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
    window.history.replaceState(null, '', '/workers/qa-worker')
    render(<WorkerStudio />)

    const microApp = await screen.findByTitle('Universal Workbench')
    expect(microApp.getAttribute('url')).toBe('/api/local/apps/aiworker-qa/micro-app/workbench/universal?workerId=qa-worker&theme=dark')
    expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({
      theme: 'dark',
      workerId: 'qa-worker',
    })
  })
```

- [ ] **Step 2: Run Web theme tests**

Run:

```bash
bun test apps/web/src/worker/__tests__/worker-studio.test.tsx --test-name-pattern "theme"
```

Expected: PASS.

- [ ] **Step 3: Preserve existing light assertions**

Confirm existing tests still assert:

```ts
expect(microApp.getAttribute('url')).toContain('theme=light')
expect((microApp as HTMLElement & { data?: Record<string, unknown> }).data).toMatchObject({ theme: 'light' })
```

In the universal route light test's existing `toMatchObject` block, include:

```ts
      theme: 'light',
```

to the existing `toMatchObject` block.

- [ ] **Step 4: Run Web tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test
```

Expected: PASS.

## Task 8: Verify Regressions With Browser Evidence

**Files:**
- Create: `tmp/real-e2e-round4-residual-repair-2026-05-25/`

- [ ] **Step 1: Rebuild official mounted clients**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' build:client
bun run --filter '@zonease/aiworker-qa' build:client
```

Expected: both commands exit 0 and write updated mounted client bundles.

- [ ] **Step 2: Start or reuse the dev service**

Run:

```bash
tmux has-session -t aiworker-e2e-20260525 || tmux new-session -d -s aiworker-e2e-20260525 'AIWORKER_HOME=/Users/ben/.aiworker-dev bun run dev'
```

Expected: tmux session exists and serves daemon/API on `http://127.0.0.1:9217`.

- [ ] **Step 3: Capture browser evidence**

Use Browser or Playwright to record:

```text
tmp/real-e2e-round4-residual-repair-2026-05-25/theme-light.json
tmp/real-e2e-round4-residual-repair-2026-05-25/theme-dark.json
tmp/real-e2e-round4-residual-repair-2026-05-25/stale-poller-log-scan.txt
tmp/real-e2e-round4-residual-repair-2026-05-25/worker-config-390.png
tmp/real-e2e-round4-residual-repair-2026-05-25/composer-default-capability.json
tmp/real-e2e-round4-residual-repair-2026-05-25/session-completed.json
```

Required evidence:

```json
{
  "hostDataTheme": "light-or-dark",
  "microAppUrlTheme": "same-value",
  "shellDataTheme": "same-value",
  "stalePollerRequestsAfterRouteChange": 0,
  "workerConfigurationHasHorizontalOverflow": false,
  "composerStartDisabledWithDefaultCapability": false,
  "sessionStatusAfterSuccessfulTurn": "completed"
}
```

- [ ] **Step 4: Run governance and boundary checks**

Run:

```bash
bun run ui:check
bun scripts/check-soul-app-boundaries.ts --completion-audit
```

Expected: both commands exit 0.

## Task 9: Close PMA, Changelog, And Review Graph

**Files:**
- Modify: `docs/task/BUG-158.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/PLAN-415.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Run full focused verification**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test
bun run --filter '@zonease/aiworker-cli' test
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-web' test
bun run ui:check
bun scripts/check-soul-app-boundaries.ts --completion-audit
bun run --filter '@zonease/aiworker-hr' build:client
bun run --filter '@zonease/aiworker-qa' build:client
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: both commands exit 0 or `crg:review` returns only non-blocking findings that are recorded in the final response.

- [ ] **Step 3: Close task and plan**

Update `docs/task/BUG-158.md` header:

```md
- **status**: completed
- **owner**: codex
- **claimedAt**: 2026-05-25
```

Append a closeout section:

```md
## Closeout

Completed the current-HEAD residual repairs from round4.

- CLI engine selection now affects new sessions.
- Session engine is immutable after creation and inherited by follow-up turns.
- Mounted HR/QA theme context aligns with Host shell resolved theme.
- Universal workbench cancels stale pollers on locator context changes.
- Invocation prompts include Host current date context without transcript rewriting.
- BUG-157 regressions were rechecked with focused tests and browser evidence.

Verification evidence:

- `tmp/real-e2e-round4-residual-repair-2026-05-25/`
```

Set index entries:

```md
- [x] [**BUG-158 Real E2E round4 residual repair**](BUG-158.md) `P2`
- [x] [**PLAN-415 Real E2E round4 residual repair**](PLAN-415.md) `2026-05-25`
```

- [ ] **Step 4: Update changelog**

Add this entry at the top of `docs/changelog.md`:

```md
## 2026-05-25 [fixed] Real E2E round4 residual repair

Closed the current-HEAD residuals from
`tmp/real-e2e-audit-2026-05-25-round4/` without reopening the completed
BUG-157 / PLAN-414 repair batch.

CLI `engine select` now affects new session creation, and session engine choice
is frozen after creation so follow-up turns do not drift with later Host
preference changes. Host invocation prompts now include stable current-date
context while leaving engine transcript and artifacts untouched.

Mounted HR/QA surfaces now receive aligned Host resolved theme context, and the
Soul-owned universal workbench cancels stale session polling when mounted
locator context changes. Regression evidence also rechecked session completion,
universal composer default capability, and Worker Configuration 390px behavior.
```

- [ ] **Step 5: Commit implementation**

Run:

```bash
git status --short
git add packages/core/src/worker/session-engine.ts packages/core/src/worker/runtime.ts packages/core/src/worker/runtime.test.ts apps/api/src/modes/worker.ts apps/api/src/modes/worker.local.test.ts apps/cli/src/aiworker.ts apps/cli/src/aiworker.test.ts packages/soul-app-workbench/src/universal-workbench/client-entry.tsx packages/soul-app-workbench/src/universal-workbench/client-entry.events.test.ts apps/web/src/worker/__tests__/worker-studio.test.tsx docs/task/BUG-158.md docs/task/index.md docs/plan/PLAN-415.md docs/plan/index.md docs/changelog.md
git commit -m "fix: 收口第四轮 E2E 余量修复"
```

Expected: commit succeeds.
