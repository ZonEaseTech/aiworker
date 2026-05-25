# Real E2E Round 5 Repair And Harness Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the round 5 P1/P2 real E2E findings and turn the P3 mounted-surface evidence path into repeatable Playwright-backed diagnostics.

**Architecture:** Keep local engine resolution Host-owned and shared by CLI/API without making engine preference a Soul App configuration scope. Keep the composer fix inside shared UI plus the Soul-owned universal workbench catalog flow. Keep screenshot fallback and theme diagnostics in E2E tooling so product logic only exposes generic mount/theme context.

**Tech Stack:** Bun workspaces, TypeScript, React 19, Vitest, Bun test, Playwright 1.60, AIWorker local daemon, `@micro-zoe/micro-app`, shadcn-managed UI primitives from `@zonease/aiworker-ui`.

---

## Scope Source

- Approved design: `docs/superpowers/specs/2026-05-26-real-e2e-round5-repair-harness-design.md`
- Evidence ledger: `tmp/real-e2e-audit-2026-05-26-round5/findings.md`
- Final report: `tmp/real-e2e-audit-2026-05-26-round5/final-report.md`
- PMA task: `docs/task/BUG-160.md`
- PMA plan: `docs/plan/PLAN-417.md`
- Architecture contract: `docs/architecture.md#constraint-registry`
- Host skill: `.agents/skills/aiworker-host-dev/SKILL.md`
- Soul App skill: `.agents/skills/aiworker-soul-app-dev/SKILL.md`

## Scope Check

The work touches Host CLI/API/core, shared UI, Soul-owned universal workbench tests, and E2E tooling. They share one real E2E evidence source and one verification bundle, so keep them in one implementation plan. Do not add a user-visible theme debug panel, a Host-owned Soul configuration surface, raw engine command overrides, or new HR domain logic in Host.

## Component Library Preflight

Visible UI work is limited to `SessionComposer` trigger rendering and universal workbench composer regression tests. Use existing primitives only:

- `@zonease/aiworker-ui/components/session-composer`
- `@zonease/aiworker-ui/components/select`
- `@zonease/aiworker-ui/components/button`
- `@zonease/aiworker-ui/components/item`

Do not add `lucide-react`, raw SVG icons, custom focus traps, custom scroll locks, raw hex colors, arbitrary color values, or Host-rendered Soul domain panels.

## File Structure

- Create `packages/core/src/worker/local-engine-resolver.ts`
  - Own local engine catalog, PATH scan, local-cli engine id validation, and id-to-command resolution.
- Create `packages/core/src/worker/local-engine-resolver.test.ts`
  - Prove `claude-code -> claude/path`, unknown engine failure, and installed-state failure.
- Modify `packages/core/src/index.ts`
  - Export local engine resolver helpers for CLI/API.
- Modify `apps/api/src/modes/worker/settings.ts`
  - Use core `scanLocalEngines` instead of an app-local duplicate catalog.
- Modify `apps/api/src/modes/worker.ts`
  - Use core resolver for session creation, follow-up turns, and native invocation preparation.
- Modify `apps/api/src/modes/worker.local.test.ts`
  - Add fake local engine setup and assert API/Web engine resolution fails before executor for unavailable engines.
- Modify `apps/cli/src/aiworker.ts`
  - Resolve selected engine id to executable command before creating session or starting turns.
- Modify `apps/cli/src/aiworker.test.ts`
  - Add Claude Code alias regression and unknown/uninstalled engine errors.
- Modify `packages/ui/src/components/session-composer.tsx`
  - Render selected template label explicitly in the Select trigger.
- Modify `packages/ui/src/components/session-composer.test.tsx`
  - Cover managed composer selected template label, enabled Start button, and submitted `selectedTemplateId`.
- Modify `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`
  - Cover universal workbench default template visible label and enabled Start markup.
- Create `apps/web/scripts/capture-mounted-evidence.ts`
  - Playwright fallback evidence capture for mounted surfaces and theme diagnostics.
- Modify `package.json`
  - Add a root script for the evidence capture helper.
- Modify `docs/changelog.md`
  - Record the final fixed behavior and verification evidence after implementation.
- Modify `docs/task/BUG-160.md`, `docs/plan/PLAN-417.md`, `docs/task/index.md`, `docs/plan/index.md`
  - Mark implementation status and completion evidence.

## Task 1: Add Host-Owned Local Engine Resolver

**Files:**
- Create: `packages/core/src/worker/local-engine-resolver.test.ts`
- Create: `packages/core/src/worker/local-engine-resolver.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/api/src/modes/worker/settings.ts`

- [ ] **Step 1: Write failing resolver tests**

Create `packages/core/src/worker/local-engine-resolver.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'

import {
  LocalEngineResolutionError,
  resolveLocalCliEngine,
  scanLocalEnginesFromCommands,
} from './local-engine-resolver'

describe('local engine resolver', () => {
  it('resolves claude-code engine id to the installed claude command', () => {
    const engine = resolveLocalCliEngine({
      engineId: 'claude-code',
      engines: [{
        command: 'claude',
        id: 'claude-code',
        installed: true,
        name: 'Claude Code',
        path: '/Users/example/.local/bin/claude',
        version: '2.1.148 (Claude Code)',
      }],
    })

    expect(engine).toEqual({
      engineCommand: '/Users/example/.local/bin/claude',
      engineId: 'claude-code',
      engineName: 'Claude Code',
      executionMode: 'local-cli',
    })
  })

  it('rejects unknown engine ids before executor invocation', () => {
    expect(() => resolveLocalCliEngine({
      engineId: 'unknown-engine',
      engines: [],
    })).toThrow(LocalEngineResolutionError)
    expect(() => resolveLocalCliEngine({
      engineId: 'unknown-engine',
      engines: [],
    })).toThrow('Unknown local engine: unknown-engine')
  })

  it('rejects known but unavailable local engines before executor invocation', () => {
    expect(() => resolveLocalCliEngine({
      engineId: 'claude-code',
      engines: [{
        command: 'claude',
        id: 'claude-code',
        installed: false,
        name: 'Claude Code',
        path: null,
        version: null,
      }],
    })).toThrow('Selected local engine is not installed: Claude Code')
  })

  it('scans known command definitions into readiness rows', () => {
    const engines = scanLocalEnginesFromCommands([
      { command: 'codex', id: 'codex', name: 'Codex CLI' },
      { command: 'claude', id: 'claude-code', name: 'Claude Code' },
    ], (command) => command === 'claude'
      ? { path: '/bin/claude', version: 'Claude 1.0' }
      : null)

    expect(engines).toEqual([
      { command: 'codex', id: 'codex', installed: false, name: 'Codex CLI', path: null, version: null },
      { command: 'claude', id: 'claude-code', installed: true, name: 'Claude Code', path: '/bin/claude', version: 'Claude 1.0' },
    ])
  })
})
```

- [ ] **Step 2: Run resolver test and verify it fails**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/worker/local-engine-resolver.test.ts
```

Expected: FAIL because `packages/core/src/worker/local-engine-resolver.ts` does not exist.

- [ ] **Step 3: Implement the resolver**

Create `packages/core/src/worker/local-engine-resolver.ts`:

```ts
import type { LocalEngineStatus } from '@zonease/aiworker-shared'
import { spawnSync } from 'node:child_process'

export interface LocalEngineDefinition {
  command: string
  id: string
  name: string
}

export interface ResolvedLocalCliEngine {
  engineCommand: string
  engineId: string
  engineName: string
  executionMode: 'local-cli'
}

export class LocalEngineResolutionError extends Error {
  constructor(
    message: string,
    readonly code: 'engine-not-installed' | 'missing-engine-command' | 'unknown-engine',
  ) {
    super(message)
    this.name = 'LocalEngineResolutionError'
  }
}

export const LOCAL_ENGINE_DEFINITIONS = [
  { id: 'codex', name: 'Codex CLI', command: 'codex' },
  { id: 'claude-code', name: 'Claude Code', command: 'claude' },
  { id: 'cursor', name: 'Cursor Agent', command: 'cursor-agent' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode' },
  { id: 'qwen', name: 'Qwen Code', command: 'qwen' },
] as const satisfies readonly LocalEngineDefinition[]

export function scanLocalEngines(): LocalEngineStatus[] {
  return scanLocalEnginesFromCommands(LOCAL_ENGINE_DEFINITIONS, command => {
    const found = commandOutput('bash', ['-lc', `command -v ${command}`]).trim()
    if (!found)
      return null
    const version = commandOutput(found, ['--version']).split('\n')[0]?.trim() || 'installed'
    return { path: found, version }
  })
}

export function scanLocalEnginesFromCommands(
  definitions: readonly LocalEngineDefinition[],
  inspect: (command: string) => { path: string, version: string } | null,
): LocalEngineStatus[] {
  return definitions.map((engine) => {
    const found = inspect(engine.command)
    if (!found) {
      return {
        command: engine.command,
        id: engine.id,
        installed: false,
        name: engine.name,
        path: null,
        version: null,
      }
    }
    return {
      command: engine.command,
      id: engine.id,
      installed: true,
      name: engine.name,
      path: found.path,
      version: found.version,
    }
  })
}

export function resolveLocalCliEngine(input: {
  engineId: string
  engines: readonly LocalEngineStatus[]
}): ResolvedLocalCliEngine {
  const engineId = input.engineId.trim()
  const engine = input.engines.find(candidate => candidate.id === engineId)
    ?? scanLocalEnginesFromCommands(LOCAL_ENGINE_DEFINITIONS, () => null).find(candidate => candidate.id === engineId)
  if (!engine) {
    throw new LocalEngineResolutionError(
      `Unknown local engine: ${engineId}. Select one of: ${LOCAL_ENGINE_DEFINITIONS.map(item => item.id).join(', ')}.`,
      'unknown-engine',
    )
  }
  if (!engine.installed) {
    throw new LocalEngineResolutionError(
      `Selected local engine is not installed: ${engine.name}. Run engine readiness rescan after installing ${engine.command}.`,
      'engine-not-installed',
    )
  }
  const engineCommand = engine.path ?? engine.command
  if (!engineCommand) {
    throw new LocalEngineResolutionError(
      `Selected local engine has no executable command: ${engine.name}.`,
      'missing-engine-command',
    )
  }
  return {
    engineCommand,
    engineId: engine.id,
    engineName: engine.name,
    executionMode: 'local-cli',
  }
}

function commandOutput(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 2500 })
  if (result.status !== 0)
    return ''
  return result.stdout.toString()
}
```

- [ ] **Step 4: Export resolver helpers**

Add to `packages/core/src/index.ts` near the other worker exports:

```ts
export {
  LOCAL_ENGINE_DEFINITIONS,
  LocalEngineResolutionError,
  resolveLocalCliEngine,
  scanLocalEngines,
  scanLocalEnginesFromCommands,
  type LocalEngineDefinition,
  type ResolvedLocalCliEngine,
} from './worker/local-engine-resolver'
```

- [ ] **Step 5: Replace duplicate API engine scan**

In `apps/api/src/modes/worker/settings.ts`, remove the local `spawnSync` import, `ENGINE_COMMANDS`, `scanLocalEngines` implementation, and `commandOutput`. Add this import:

```ts
import { scanLocalEngines } from '@zonease/aiworker-core'
```

Keep the existing `scanLocalEngines()` export by re-exporting the imported function:

```ts
export { scanLocalEngines }
```

- [ ] **Step 6: Verify resolver tests pass**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/worker/local-engine-resolver.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit task 1**

```bash
git add packages/core/src/worker/local-engine-resolver.ts packages/core/src/worker/local-engine-resolver.test.ts packages/core/src/index.ts apps/api/src/modes/worker/settings.ts
git commit -m "fix: 统一本地 engine 解析"
```

## Task 2: Wire API And CLI To Resolved Engine Commands

**Files:**
- Modify: `apps/api/src/modes/worker.local.test.ts`
- Modify: `apps/api/src/modes/worker.ts`
- Modify: `apps/cli/src/aiworker.test.ts`
- Modify: `apps/cli/src/aiworker.ts`

- [ ] **Step 1: Add API fake engine setup and regression tests**

In `apps/api/src/modes/worker.local.test.ts`, add `let originalPath: string | undefined` beside `let dir: string`, set it in `beforeEach`, restore it in `afterEach`, and add a helper:

```ts
  let originalPath: string | undefined

  beforeEach(() => {
    closeWorkerDb()
    originalPath = process.env.PATH
    dir = mkdtempSync(join(tmpdir(), 'aiworker-workspace-api-'))
  })

  afterEach(async () => {
    closeWorkerDb()
    if (originalPath == null)
      delete process.env.PATH
    else
      process.env.PATH = originalPath
    await rm(dir, { recursive: true, force: true })
  })

  function writeFakeEngineCommand(command: string): string {
    const binDir = join(dir, 'bin')
    mkdirSync(binDir, { recursive: true })
    const commandPath = join(binDir, command)
    writeFileSync(commandPath, [
      '#!/usr/bin/env bash',
      'if [ "$1" = "--version" ]; then',
      `  echo "${command} test 1.0"`,
      '  exit 0',
      'fi',
      'cat >/dev/null',
      'printf \'%s\\n\' \'{"type":"assistant","message":{"id":"msg-1","content":[{"type":"text","text":"Done."}]}}\'',
      '',
    ].join('\n'))
    chmodSync(commandPath, 0o755)
    process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`
    return commandPath
  }
```

Update the existing test `freezes selected engine settings at session creation and keeps continuations immutable` so its first lines are:

```ts
    const claudePath = writeFakeEngineCommand('claude')
    const target = await app()
```

Then add after the `frozenEngineCommand` assertion:

```ts
    expect(frozenEngineCommand).toBe(claudePath)
```

Add a new test after that block:

```ts
  it('rejects unavailable selected local engines before executor invocation', async () => {
    const target = await app()
    const hrWorker = await createHrWorker(target)
    const workspaceBody = await (await target.request(`/api/local/workers/${hrWorker.id}/workspaces`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Unavailable engine workspace' }),
      headers: { 'content-type': 'application/json' },
    })).json() as { workspace: { id: string } }

    expect(await target.request('/api/local/settings', {
      method: 'PATCH',
      body: JSON.stringify({ engineId: 'claude-code', executionMode: 'local-cli' }),
      headers: { 'content-type': 'application/json' },
    })).toMatchObject({ status: 200 })

    const res = await target.request(`/api/local/workers/${hrWorker.id}/workspaces/${workspaceBody.workspace.id}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        capabilityTemplateId: HR_CANDIDATE_SCREEN,
        input: 'This should fail before executor invocation.',
        title: 'Unavailable engine',
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(res.status).toBe(500)
    expect(await res.text()).toContain('Selected local engine is not installed: Claude Code')
  })
```

- [ ] **Step 2: Run API tests and verify the new expectation fails before implementation**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts --test-name-pattern "selected engine|unavailable selected local engines"
```

Expected: FAIL because API still uses `selectedEngineCommand()` fallback semantics and does not reject unavailable engines before executor invocation.

- [ ] **Step 3: Wire API engine metadata through the resolver**

In `apps/api/src/modes/worker.ts`, import `resolveLocalCliEngine`:

```ts
import { resolveLocalCliEngine } from '@zonease/aiworker-core'
```

Replace `selectedEngineCommand` with:

```ts
function resolvedExecutionMetadata(settings: LocalSettingsConfig, engineIdOverride?: string | null): Record<string, unknown> {
  if (settings.executionMode !== 'local-cli') {
    return {
      byok: settings.byok,
      engineCommand: null,
      engineId: settings.byok.provider,
      engineName: null,
      executionMode: 'byok',
    }
  }
  const resolved = resolveLocalCliEngine({
    engineId: engineIdOverride?.trim() || settings.engineId,
    engines: settings.engines,
  })
  return {
    byok: settings.byok,
    engineCommand: resolved.engineCommand,
    engineId: resolved.engineId,
    engineName: resolved.engineName,
    executionMode: resolved.executionMode,
  }
}
```

Update `createWorkspaceSessionResponse`, `createSessionMessageResponse`, and `prepareNativeEngineInvocation` to use `resolvedExecutionMetadata(settings, body.engineId)` or `resolvedExecutionMetadata(settings)`. For local CLI turn input, read from the returned metadata:

```ts
  const execution = resolvedExecutionMetadata(settings)
  const metadata = enrichTemplateMetadata(state, workspace.workerId, template.id, {
    ...(body.metadata ?? {}),
    ...execution,
  })
  const turnInput = {
    engineCommand: typeof execution.engineCommand === 'string' ? execution.engineCommand : null,
    engineId: String(execution.engineId),
    input: body.input,
    metadata,
  }
```

- [ ] **Step 4: Add CLI Claude Code command resolution test**

In `apps/cli/src/aiworker.test.ts`, add:

```ts
  async function writeFakeClaudeCommand(): Promise<void> {
    await writeFakeEngineCommand('claude', [
      'printf \'%s\\n\' \'{"type":"assistant","message":{"id":"msg-1","content":[{"type":"text","text":"Done."}]}}\'',
      'printf \'%s\\n\' \'{"type":"result","usage":{"input_tokens":1,"output_tokens":1}}\'',
    ])
  }
```

Then add this test after the existing engine freeze test:

```ts
  it('resolves claude-code selected engine to the installed claude command', async () => {
    await writeFakeClaudeCommand()

    expect(await runCli(argv('app', 'install', path.resolve(import.meta.dir, '..', '..', 'aiworker-hr')))).toBe(0)
    output = ''
    expect(await runCli(argv('app', 'enable', 'aiworker-hr'))).toBe(0)
    output = ''
    expect(await runCli(argv('worker', 'create', '--id', 'hr-claude', '--name', 'HR Claude', '--soul', 'aiworker-hr'))).toBe(0)
    output = ''
    expect(await runCli(argv('workspace', 'create', '--name', 'Hiring', '--type', 'role-search', '--worker', 'hr-claude'))).toBe(0)
    const workspace = (JSON.parse(output) as { workspace: { id: string } }).workspace
    output = ''

    expect(await runCli(argv('engine', 'select', 'claude-code'))).toBe(0)
    output = ''
    expect(await runCli(argv(
      'session',
      'start',
      '--worker',
      'hr-claude',
      '--workspace',
      workspace.id,
      '--skill',
      namespaceSoulAppCapabilityId('aiworker-hr', 'person-profile'),
      '--title',
      'Claude profile',
      '--input',
      'Create a short profile summary.',
    ))).toBe(0)

    const started = JSON.parse(output) as {
      invocation: { engineCommand: string | null, engineId: string }
      session: { metadataJson: Record<string, unknown> }
    }
    expect(started.session.metadataJson.engineId).toBe('claude-code')
    expect(String(started.session.metadataJson.engineCommand)).toMatch(/\/claude$/)
    expect(started.invocation.engineId).toBe('claude-code')
    expect(String(started.invocation.engineCommand)).toMatch(/\/claude$/)
  })
```

- [ ] **Step 5: Run CLI test and verify it fails before implementation**

Run:

```bash
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts --test-name-pattern "resolves claude-code"
```

Expected: FAIL because `apps/cli/src/aiworker.ts` still sets `engineCommand: selectedEngineId`.

- [ ] **Step 6: Wire CLI session commands through the resolver**

In `apps/cli/src/aiworker.ts`, import resolver helpers:

```ts
import {
  createHostRuntime,
  getWorkerEnv,
  resolveLocalCliEngine,
  scanLocalEngines,
  soulAppServiceEnv,
} from '@zonease/aiworker-core'
```

Add a helper near `selectedCliEngineId()`:

```ts
function resolveCliEngineMetadata(engineId: string): { engineCommand: string, engineId: string, engineName: string, executionMode: 'local-cli' } {
  return resolveLocalCliEngine({
    engineId,
    engines: scanLocalEngines(),
  })
}
```

Update `startSessionCommand`:

```ts
  const selectedEngineId = opts.engine?.trim() || selectedCliEngineId()
  const engineMetadata = {
    ...resolveCliEngineMetadata(selectedEngineId),
    ...cliEngineOverrideMetadata(opts),
  }
  const session = await runtime.createSession({
    workspaceId,
    capabilityTemplateId: template.id,
    title: requireText(opts.title, 'title'),
    context: opts.context ?? '',
    metadata: engineMetadata,
  })
  const input = requireText(opts.input, 'input')
  printJson(await runtime.startTurn({
    sessionId: session.id,
    input,
    engineId: engineMetadata.engineId,
    engineCommand: engineMetadata.engineCommand,
    metadata: {
      ...(session.metadataJson ?? engineMetadata),
      ...cliEngineOverrideMetadata(opts),
    },
  }))
```

Update `sendTurnCommand` so it passes a resolved request only for legacy sessions, while runtime still freezes existing session metadata:

```ts
  const selectedEngineId = selectedCliEngineId()
  const engineMetadata = resolveCliEngineMetadata(selectedEngineId)
  const metadata = {
    ...(session.metadataJson ?? {}),
    ...cliEngineOverrideMetadata(opts),
  }
  printJson(await runtime.startTurn({
    sessionId,
    input: requireText(opts.input, 'input'),
    engineId: engineMetadata.engineId,
    engineCommand: engineMetadata.engineCommand,
    metadata,
  }))
```

- [ ] **Step 7: Run API and CLI focused tests**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts --test-name-pattern "selected engine|unavailable selected local engines"
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts --test-name-pattern "engine choice|resolves claude-code"
```

Expected: PASS.

- [ ] **Step 8: Commit task 2**

```bash
git add apps/api/src/modes/worker.ts apps/api/src/modes/worker.local.test.ts apps/cli/src/aiworker.ts apps/cli/src/aiworker.test.ts
git commit -m "fix: 解析 CLI Claude Code 可执行命令"
```

## Task 3: Fix Composer Default Capability Visibility

**Files:**
- Modify: `packages/ui/src/components/session-composer.test.tsx`
- Modify: `packages/ui/src/components/session-composer.tsx`
- Modify: `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`

- [ ] **Step 1: Add managed composer regression test**

In `packages/ui/src/components/session-composer.test.tsx`, add:

```tsx
  it('shows the controlled selected template label and submits its id', async () => {
    const onSubmitDraft = vi.fn()

    render(
      <ManagedSessionComposer
        ariaLabel="Session input"
        attachmentLabels={{
          add: 'Add material',
          attached: 'Attached materials',
          closePreview: name => `Close preview ${name}`,
          materialReadError: 'Could not read material',
          preview: name => `Preview ${name}`,
          remove: name => `Remove ${name}`,
        }}
        defaultValue="Create the profile"
        onSubmitDraft={onSubmitDraft}
        onTemplateChange={vi.fn()}
        selectedTemplateId="aiworker-hr.person-profile"
        submitAriaLabel="Start"
        templateLabel="Capability/template"
        templateOptions={[{
          description: 'Create a source-backed people profile snapshot.',
          label: 'Person Profile',
          value: 'aiworker-hr.person-profile',
        }]}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Capability/template' }).textContent).toContain('Person Profile')
    expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled()

    fireEvent.submit(screen.getByRole('form', { name: 'Session input' }))

    await waitFor(() => expect(onSubmitDraft).toHaveBeenCalledTimes(1))
    expect(onSubmitDraft.mock.calls[0]?.[0]).toMatchObject({
      selectedTemplateId: 'aiworker-hr.person-profile',
      text: 'Create the profile',
    })
  })
```

- [ ] **Step 2: Run UI test and verify it fails**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test -- src/components/session-composer.test.tsx -t "controlled selected template"
```

Expected: FAIL because the visible combobox label can stay empty for the controlled Radix value path.

- [ ] **Step 3: Render selected template label explicitly**

In `packages/ui/src/components/session-composer.tsx`, remove `SelectValue` from the import:

```ts
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '#components/select'
```

Replace the trigger value:

```tsx
                  <span data-slot="select-value" className="flex min-w-0 items-center gap-1.5 truncate">
                    {selectedTemplateOption?.label ?? templateLabel}
                  </span>
```

The surrounding trigger remains:

```tsx
                <SelectTrigger
                  aria-label={templateLabel}
                  className={cn('max-w-full', templateClassName)}
                  size="sm"
                >
                  <span data-slot="select-value" className="flex min-w-0 items-center gap-1.5 truncate">
                    {selectedTemplateOption?.label ?? templateLabel}
                  </span>
                </SelectTrigger>
```

- [ ] **Step 4: Add universal workbench regression test**

In `packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx`, add:

```tsx
  it('renders the default capability label in the new session composer', () => {
    const workspace = workspaceFixture()

    const html = renderToStaticMarkup(
      <UniversalWorkbenchApp
        engineReadiness={{ detail: 'Engine bridge ready', label: 'Engine bridge', ready: true }}
        events={[]}
        selectedSessionId={null}
        sessions={[]}
        templates={[{
          description: 'Create a source-backed people profile snapshot.',
          id: 'aiworker-hr.person-profile',
          name: 'Person Profile',
          outputKind: 'business-artifact',
        }]}
        turnInput=""
        turnSubmitting={false}
        turns={[]}
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

    expect(html).toContain('Person Profile')
    expect(html).toContain('aria-label="Start"')
    expect(html).not.toContain('aria-label="Start" disabled=""')
  })
```

- [ ] **Step 5: Run UI and workbench tests**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test -- src/components/session-composer.test.tsx -t "selected template|controlled selected template"
bun run --filter '@zonease/aiworker-soul-app-workbench' test src/universal-workbench/UniversalWorkbenchApp.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit task 3**

```bash
git add packages/ui/src/components/session-composer.tsx packages/ui/src/components/session-composer.test.tsx packages/soul-app-workbench/src/universal-workbench/UniversalWorkbenchApp.test.tsx
git commit -m "fix: 同步默认能力选择显示"
```

## Task 4: Add Playwright Mounted Evidence Capture

**Files:**
- Create: `apps/web/scripts/capture-mounted-evidence.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the capture script**

Create `apps/web/scripts/capture-mounted-evidence.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { chromium, type Browser, type Page } from 'playwright'

interface CliOptions {
  label: string
  out: string
  url: string
}

const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'narrow', width: 390, height: 900 },
] as const

const options = parseArgs(process.argv.slice(2))
await mkdir(options.out, { recursive: true })

let browser: Browser | null = null
try {
  browser = await chromium.launch({ args: ['--no-sandbox'], headless: true })
  for (const viewport of viewports) {
    const page = await browser.newPage({
      colorScheme: viewport.name === 'desktop' ? 'light' : 'dark',
      viewport,
    })
    const consoleMessages: Array<{ text: string, type: string }> = []
    page.on('console', message => consoleMessages.push({ type: message.type(), text: message.text() }))
    await page.goto(options.url, { waitUntil: 'networkidle' })
    await page.locator('micro-app').first().waitFor({ timeout: 15_000 }).catch(() => undefined)
    const diagnostics = await collectDiagnostics(page)
    const prefix = `${options.label}-${viewport.name}`
    await page.screenshot({ fullPage: true, path: path.join(options.out, `${prefix}.png`) })
    await writeFile(path.join(options.out, `${prefix}.json`), `${JSON.stringify({
      consoleMessages,
      diagnostics,
      url: page.url(),
      viewport,
    }, null, 2)}\n`)
    await page.close()
  }
}
finally {
  await browser?.close().catch(() => undefined)
}

function parseArgs(args: string[]): CliOptions {
  const out = readFlag(args, '--out')
  const url = readFlag(args, '--url')
  const label = readFlag(args, '--label') ?? 'mounted-surface'
  if (!out || !url) {
    console.error('Usage: bun apps/web/scripts/capture-mounted-evidence.ts --url <url> --out <dir> --label <name>')
    process.exit(2)
  }
  return { label, out, url }
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index < 0)
    return undefined
  return args[index + 1]
}

async function collectDiagnostics(page: Page) {
  return page.evaluate(() => {
    const mounted = Array.from(document.querySelectorAll('micro-app')).map((element) => {
      const appElement = element as HTMLElement & { data?: Record<string, unknown> }
      return {
        data: appElement.data ?? null,
        name: element.getAttribute('name'),
        url: element.getAttribute('url'),
      }
    })
    return {
      bodyClass: document.body.className,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      dataTheme: document.querySelector('[data-testid="worker-studio-shell"]')?.getAttribute('data-theme') ?? null,
      htmlClass: document.documentElement.className,
      mounted,
      prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      sessionStorageThemeKeys: Object.fromEntries(Object.entries(sessionStorage).filter(([key]) => key.toLowerCase().includes('theme'))),
      localStorageThemeKeys: Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.toLowerCase().includes('theme'))),
    }
  })
}
```

- [ ] **Step 2: Add root script**

In `package.json`, add this script after `web:smoke:mounted-surfaces`:

```json
"web:e2e:capture-mounted-evidence": "bun apps/web/scripts/capture-mounted-evidence.ts",
```

- [ ] **Step 3: Typecheck Web**

Run:

```bash
bun run --filter '@zonease/aiworker-web' typecheck
```

Expected: PASS.

- [ ] **Step 4: Run the helper against the active dev Web after implementation**

When `bun run dev` is running on `http://127.0.0.1:5173`, run:

```bash
mkdir -p tmp/real-e2e-round5-repair-2026-05-26/browser
bun run web:e2e:capture-mounted-evidence --url http://127.0.0.1:5173 --out tmp/real-e2e-round5-repair-2026-05-26/browser --label worker-web
```

Expected: `worker-web-desktop.png`, `worker-web-desktop.json`, `worker-web-narrow.png`, and `worker-web-narrow.json` exist. JSON contains `diagnostics.mounted[*].url`, `diagnostics.mounted[*].data.theme`, `diagnostics.dataTheme`, `diagnostics.prefersDark`, and console messages.

- [ ] **Step 5: Commit task 4**

```bash
git add apps/web/scripts/capture-mounted-evidence.ts package.json
git commit -m "test: 增加 mounted 证据采集脚本"
```

## Task 5: Run Focused Gates And Browser Evidence

**Files:**
- Modify: `docs/changelog.md`
- Modify: `docs/task/BUG-160.md`
- Modify: `docs/plan/PLAN-417.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`

- [ ] **Step 1: Run focused package tests**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test
bun run --filter '@zonease/aiworker-core' typecheck
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-api' typecheck
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts
bun run --filter '@zonease/aiworker-cli' typecheck
bun run --filter '@zonease/aiworker-ui' test
bun run --filter '@zonease/aiworker-ui' typecheck
bun run --filter '@zonease/aiworker-soul-app-workbench' test
bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck
bun run --filter '@zonease/aiworker-web' typecheck
```

Expected: all commands PASS.

- [ ] **Step 2: Run governance and boundary gates**

Run:

```bash
bun run ui:check
bun scripts/check-soul-app-boundaries.ts --completion-audit
```

Expected: both commands PASS.

- [ ] **Step 3: Rebuild mounted client bundles**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' build:client
bun run --filter '@zonease/aiworker-qa' build:client
```

Expected: both commands PASS. Do this before browser evidence because mounted services serve built client assets.

- [ ] **Step 4: Capture browser evidence**

Start or reuse the dev stack on `/Users/ben/.aiworker-dev`, then run:

```bash
mkdir -p tmp/real-e2e-round5-repair-2026-05-26/browser
bun run web:e2e:capture-mounted-evidence --url http://127.0.0.1:5173 --out tmp/real-e2e-round5-repair-2026-05-26/browser --label round5-repair
```

Then manually verify the HR mounted composer path in Playwright or the in-app Browser:

```text
1. Open http://127.0.0.1:5173.
2. Select worker e2e-r5-hr-codex-20260526 or e2e-r5-hr-web-claude-20260526.
3. Select an HR workspace.
4. Type text into New Session.
5. Confirm the capability combobox says Person Profile without opening the dropdown.
6. Confirm Start is enabled.
7. Save a screenshot and JSON state under tmp/real-e2e-round5-repair-2026-05-26/browser.
```

Expected: default capability label and Start readiness match the fixed state; theme diagnostics JSON is present for desktop and 390px.

- [ ] **Step 5: Run code-review-graph and diff check**

Run:

```bash
bun run crg:update
bun run crg:review
git diff --check
```

Expected: code-review-graph reports no blocking findings; `git diff --check` exits 0.

- [ ] **Step 6: Update PMA and changelog**

Update `docs/task/BUG-160.md`:

```md
- **status**: completed
- **owner**: Codex
- **completedAt**: 2026-05-26
```

Append a completion section:

```md
## Completion Notes

- CLI/API local engine resolution now maps `claude-code` to the installed `claude` executable before session creation.
- Unknown or unavailable local engines fail before executor invocation.
- HR universal composer default capability now shows the selected label and enables Start when valid input exists.
- Mounted-surface evidence capture now produces Playwright screenshots and theme diagnostics for desktop and 390px.

## Verification

- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-ui' test`
- `bun run --filter '@zonease/aiworker-ui' typecheck`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' test`
- `bun run --filter '@zonease/aiworker-soul-app-workbench' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run ui:check`
- `bun scripts/check-soul-app-boundaries.ts --completion-audit`
- `bun run --filter '@zonease/aiworker-hr' build:client`
- `bun run --filter '@zonease/aiworker-qa' build:client`
- Browser evidence: `tmp/real-e2e-round5-repair-2026-05-26/`
- `bun run crg:update`
- `bun run crg:review`
- `git diff --check`
```

Update `docs/plan/PLAN-417.md` status to `completed`, set `owner: Codex`, and add a short verification summary. Update `docs/task/index.md` and `docs/plan/index.md` markers from `[ ]` to `[x]` for `BUG-160` and `PLAN-417`.

Add a changelog entry at the top of `docs/changelog.md`:

```md
## 2026-05-26 [fixed] BUG-160 / PLAN-417 — Real E2E round5 repair and harness hardening

- Fixed CLI/API local engine resolution so `claude-code` remains the engine id while the invocation command resolves to the installed `claude` executable.
- Fixed universal composer default capability visibility/readiness so HR mounted sessions can start without reopening the capability dropdown.
- Added Playwright mounted-surface evidence capture with desktop/390px screenshots, console logs and theme diagnostics.
- Verification evidence is under `tmp/real-e2e-round5-repair-2026-05-26/`.
```

- [ ] **Step 7: Commit closeout**

```bash
git add docs/changelog.md docs/task/BUG-160.md docs/plan/PLAN-417.md docs/task/index.md docs/plan/index.md
git commit -m "docs: 记录第五轮 E2E 修复收口"
```

## Self-Review

- Spec coverage: P1 engine resolution is covered by Tasks 1 and 2; P2 composer readiness is covered by Task 3; P3 Playwright fallback and theme diagnostics are covered by Task 4 and browser evidence in Task 5.
- Boundary check: Host changes are limited to local engine resolution, API/CLI session metadata and evidence tooling; Soul App domain meaning remains in app-owned surfaces.
- Type consistency: resolver outputs `engineId`, `engineCommand`, `engineName` and `executionMode`; API/CLI metadata uses those names consistently.
- Verification coverage: focused tests, typechecks, UI governance, boundary audit, mounted client rebuilds, browser evidence, code-review-graph and diff check are all explicit.
