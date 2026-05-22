# Local Shell + Engine Bridge Phase 3A CLI Compatibility Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove deprecated generic artifact/review/lesson/profile CLI commands so `aiworker` stays a lightweight daemon/app/worker/workspace/session/file locator.

**Architecture:** This phase removes only CLI exposure for generic Host work-object concepts. Storage rows, API routes, Web compatibility panels and Core runtime helpers remain in place for Phase 3B/3C so HR/QA and existing local workspaces are not broken by a broad schema migration in this slice.

**Tech Stack:** Bun CLI (`cac`), TypeScript, Bun test, Markdown CLI docs, code-review-graph.

---

## Scope Check

The approved lightweight design says generic `artifacts`, `review`, `lessons` and `profile promote` are deletion or app-owned migration candidates. Phase 2 marked them deprecated in CLI copy. Phase 3A actually removes them from the CLI command surface while leaving `template list` and `files list|show` as compatibility inspection commands because those still help locate app-declared templates and workspace files without interpreting domain state.

This plan intentionally does not delete:

- `/api/local/artifacts`, `/api/local/reviews`, `/api/local/lessons` or profile revision API routes.
- `packages/storage-sqlite` artifact/review/lesson tables or repository helpers.
- `packages/core/src/worker/runtime.ts` artifact/review/lesson/profile promotion behavior.
- Web panels that still consume local compatibility data.
- Soul App manifest `artifactTypes`, workflow review assets or app-owned domain confirmation content.

Those belong in later phases with storage/API/Web migration tests.

## File Structure

- Modify `apps/cli/src/aiworker.ts`: remove deprecated CLI helper functions, imports, command registrations and full-index line for generic work-object commands.
- Modify `apps/cli/src/aiworker.test.ts`: remove CLI profile promotion tests/helpers, update command index/help assertions, and add a regression test that deprecated generic work-object commands are unknown.
- Modify `docs/cli.md`: document that these commands have been removed from CLI and that app-owned confirmation/output flows should use Soul App UI/actions/files.

### Task 1: Update CLI Tests For Removed Generic Commands

**Files:**
- Modify: `apps/cli/src/aiworker.test.ts`

- [ ] **Step 1: Remove the profile promotion helper and profile-promotion-only tests**

Delete the `writeFakeCodexArtifactCommand()` helper and `createProfilePromotionArtifact()` helper from `apps/cli/src/aiworker.test.ts`.

Delete these five test cases:

```ts
it('promotes a fenced profile draft from the CLI without writing proposal notes to README', async () => {
  // delete full test body
})

it('rejects CLI profile promotion when the artifact is missing a fenced draft', async () => {
  // delete full test body
})

it('rejects CLI profile promotion when the accepted draft has proposal-state language', async () => {
  // delete full test body
})

it('rejects CLI profile promotion verdicts that cannot approve README writes', async () => {
  // delete full test body
})

it('promotes explicit reviewed markdown from the CLI without requiring an artifact fence', async () => {
  // delete full test body
})
```

Do not remove profile promotion tests from `packages/core`; this phase only removes CLI exposure.

- [ ] **Step 2: Update command index assertions**

In `shows a compact operator command index by default and full index on request`, replace:

```ts
expect(output).toContain('deprecated compatibility: artifacts list|show|open; profile promote; review list|show; lessons list|propose|accept|reject')
```

with:

```ts
expect(output).not.toContain('artifacts list|show|open')
expect(output).not.toContain('profile promote')
expect(output).not.toContain('review list|show')
expect(output).not.toContain('lessons list|propose|accept|reject')
```

In `shows compact top-level help unless all commands are requested`, remove:

```ts
expect(output).toContain('deprecated compatibility: list app output descriptors')
expect(output).toContain('deprecated HR compatibility: promote app output into a workspace README')
```

and add:

```ts
expect(output).not.toContain('deprecated compatibility: list app output descriptors')
expect(output).not.toContain('deprecated HR compatibility: promote app output into a workspace README')
expect(output).not.toContain('artifacts list')
expect(output).not.toContain('profile promote')
```

- [ ] **Step 3: Add unknown-command regression coverage**

After the `shows compact top-level help unless all commands are requested` test, add:

```ts
it('rejects removed generic work-object commands', async () => {
  for (const args of [
    ['artifacts', 'list'],
    ['artifacts', 'show', 'artifact-1'],
    ['profile', 'promote'],
    ['review', 'list'],
    ['lessons', 'list'],
    ['lessons', 'propose'],
  ]) {
    output = ''
    expect(await runCli(argv(...args))).toBe(1)
  }
})
```

This test checks command removal without depending on stderr text from `consola.error`.

- [ ] **Step 4: Run the focused CLI test and confirm it fails**

Run:

```bash
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts
```

Expected: FAIL because `apps/cli/src/aiworker.ts` still registers deprecated commands and the new unknown-command test returns `0` for at least one removed command.

### Task 2: Remove Deprecated Generic Commands From CLI

**Files:**
- Modify: `apps/cli/src/aiworker.ts`

- [ ] **Step 1: Remove unused shared imports**

In `apps/cli/src/aiworker.ts`, change:

```ts
import type { LocalReviewVerdict, SoulAppManifest } from '@zonease/aiworker-shared'
```

to:

```ts
import type { SoulAppManifest } from '@zonease/aiworker-shared'
```

In the shared import block, remove these names:

```ts
formatProfilePromotionIssues,
prepareProfileMarkdownForPromotion,
```

- [ ] **Step 2: Remove unused storage imports**

In the `@zonease/aiworker-storage-sqlite/worker` import block, remove these names:

```ts
createLesson,
getArtifact,
getReview,
listArtifacts,
listLessons,
listReviews,
updateLesson,
```

Keep `listFiles`, `getWorkspace`, `listSessions`, `listTurns`, `listSettings`, worker and workspace helpers.

- [ ] **Step 3: Delete CLI-only helper functions**

Delete these functions from `apps/cli/src/aiworker.ts`:

```ts
async function openArtifact(id: string, opts: { worker?: string }): Promise<void> {
  // delete full function
}

async function promoteProfileCommand(opts: {
  artifact?: string
  finding?: string | string[]
  profileMarkdown?: string
  risk?: string | string[]
  tag?: string
  verdict?: string
  worker?: string
  workspace?: string
}): Promise<void> {
  // delete full function
}

function requirePromotionVerdict(value: string | undefined): Extract<LocalReviewVerdict, 'pass' | 'warn'> {
  // delete full function
}

function profilePromotionMessages(value: string | string[] | undefined): Array<Record<string, unknown>> | undefined {
  // delete full function
}

async function listArtifactsCommand(opts: { workspace?: string }): Promise<void> {
  // delete full function
}

async function listReviewsCommand(opts: { workspace?: string }): Promise<void> {
  // delete full function
}

async function proposeLesson(opts: { review?: string, statement?: string, workspace?: string }): Promise<void> {
  // delete full function
}
```

- [ ] **Step 4: Delete command registrations**

In `registerCommands()`, delete the command registrations for:

```ts
cli.command('artifacts list', ...)
cli.command('artifacts show <id>', ...)
cli.command('artifacts open <id>', ...)
cli.command('profile promote', ...)
cli.command('review list', ...)
cli.command('review show <id>', ...)
cli.command('lessons list', ...)
cli.command('lessons propose', ...)
cli.command('lessons accept <id>', ...)
cli.command('lessons reject <id>', ...)
```

Do not delete `template list`, `files list` or `files show <path>`.

- [ ] **Step 5: Remove the full-index deprecated line**

In `FULL_COMMAND_INDEX`, remove:

```ts
'deprecated compatibility: artifacts list|show|open; profile promote; review list|show; lessons list|propose|accept|reject',
```

Keep:

```ts
'compatibility inspection: template list; files list|show',
```

- [ ] **Step 6: Run CLI test**

Run:

```bash
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run CLI typecheck**

Run:

```bash
bun run --filter '@zonease/aiworker-cli' typecheck
```

Expected: PASS with no unused imports.

### Task 3: Update CLI Documentation And Verify

**Files:**
- Modify: `docs/cli.md`

- [ ] **Step 1: Rewrite Work Objects compatibility bullets**

In `docs/cli.md`, replace:

```markdown
- `template list` and `files list|show` are compatibility inspection commands
  for app-declared templates and workspace files. They are available through
  `aiworker commands --all`, not the default operator surface.
- `artifacts list|show|open`, `profile promote`, `review list|show` and
  `lessons list|propose|accept|reject` are deprecated compatibility commands.
  They remain callable only to inspect or repair existing local workspaces while
  Phase 3 migrates these generic Host records into app-owned output,
  confirmation and note surfaces. Do not design new Host flows around them.
- HR profile updates, QA release decisions and similar domain confirmations
  should be exposed by the owning Soul App through mounted UI, app-owned actions
  or app-owned files. Host CLI should locate workspace/session context and open
  the app surface instead of promoting generic artifacts.
```

with:

```markdown
- `template list` and `files list|show` remain compatibility inspection commands
  for app-declared templates and workspace files. They are available through
  `aiworker commands --all`, not the default operator surface.
- Generic `artifacts *`, `profile promote`, `review *` and `lessons *` commands
  have been removed from the CLI. Existing local metadata is still readable by
  the daemon/API while the runtime compatibility layer is migrated, but new
  operator workflows should go through Soul App mounted UI, app-owned actions or
  app-owned workspace files.
- HR profile updates, QA release decisions and similar domain confirmations
  belong to the owning Soul App. Host CLI should locate worker/workspace/session
  context and open the app surface instead of promoting generic Host records.
```

- [ ] **Step 2: Run docs check**

Run:

```bash
bun run docs:check
```

Expected: PASS with `docs contract ok`.

- [ ] **Step 3: Run final focused verification**

Run:

```bash
bun run --filter '@zonease/aiworker-cli' test src/aiworker.test.ts
bun run --filter '@zonease/aiworker-cli' typecheck
bun run docs:check
git diff --check
```

Expected: all PASS.

- [ ] **Step 4: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: no Critical findings. Important findings must be fixed or explicitly justified.

- [ ] **Step 5: Commit**

Stage only Phase 3A files:

```bash
git add apps/cli/src/aiworker.ts apps/cli/src/aiworker.test.ts docs/cli.md docs/superpowers/plans/2026-05-21-local-shell-engine-bridge-phase-3a-cli-compat-removal.md
git commit -m "refactor: 移除 CLI 通用工作对象命令"
```
