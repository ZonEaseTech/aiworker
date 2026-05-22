# Worker Workbench Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Codex-like worker workbench with workspace/session tree navigation, a shared composer/chat component foundation, and worker-owned runtime overlays for skills, MCP clients, and entry files.

**Architecture:** Start by hardening shared UI primitives in `packages/ui`, then adapt `apps/web` to a worker-scoped workspace/session tree. Add worker overlay contracts in `packages/shared`, Host metadata persistence in `packages/storage-sqlite`, runtime effective-asset resolution in `packages/core`, local daemon API routes in `apps/api`, and finally the Worker configuration dialog in `apps/web`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Hono/OpenAPIHono, Drizzle SQLite, Bun, shadcn-managed `packages/ui`, Hugeicons.

---

## File Structure

- Modify `packages/ui/src/components/session-composer.tsx`
  - Owns shared Codex-like composer behavior, attachment chips, submit state, and composer-attached `$` typeahead.
- Modify `packages/ui/src/components/session-composer.test.tsx`
  - Tests composer rest state, mention typeahead, upward panel placement, and no external skill picker.
- Create `packages/ui/src/components/session-thread.tsx`
  - Owns generic session thread, message rows, progress rows, and artifact cards.
- Create `packages/ui/src/components/session-thread.test.tsx`
  - Tests thread ordering and artifact-card rendering.
- Modify `packages/shared/src/local-workspace.ts`
  - Adds worker overlay zod contracts, effective asset metadata, mention metadata, and local API payload types.
- Modify `packages/storage-sqlite/src/worker/schema.ts`
  - Adds worker overlay metadata tables as Host metadata.
- Modify `packages/storage-sqlite/src/worker/index.ts`
  - Adds worker overlay repository functions.
- Modify `packages/storage-sqlite/src/worker/index.test.ts`
  - Tests overlay upsert/list/effective provenance and pending-save semantics.
- Modify `packages/core/src/worker/engine-assets.ts`
  - Resolves Soul App baseline plus worker overlay into projectable effective assets.
- Modify `packages/core/src/worker/runtime.ts`
  - Uses effective assets when creating workspaces/sessions and resolves `$skill` mention metadata before engine invocation.
- Modify `packages/core/src/worker/runtime.test.ts`
  - Tests baseline + overlay projection and existing workspace no-auto-reproject behavior.
- Modify `apps/api/src/modes/worker.ts`
  - Adds local API routes for worker overlay read/save/validate and projection receipt lookup.
- Modify `apps/api/src/modes/worker.local.test.ts`
  - Tests overlay API, validation failures, and no secret literals in MCP config.
- Modify `apps/web/src/features/local-workspace/api/types.ts`
  - Adds API response/request types for worker overlay.
- Create `apps/web/src/features/local-workspace/api/worker-overlays.ts`
  - Owns Web API calls for worker overlay load, save, validate, and projection receipt.
- Modify `apps/web/src/features/local-workspace/api/index.ts`
  - Exports worker overlay API helpers.
- Create `apps/web/src/worker/worker-workbench-tree.tsx`
  - Owns left-panel worker/workspace/session tree row actions.
- Create `apps/web/src/worker/worker-configuration-dialog.tsx`
  - Owns Worker configuration dialog UI and pending overlay draft state.
- Modify `apps/web/src/worker/worker-studio.tsx`
  - Integrates workbench tree, new-session state, shared composer/thread primitives, and configuration dialog.
- Modify `apps/web/src/worker/session-turn-composer.tsx`
  - Passes mention options and mention metadata through shared `SessionComposer`.
- Modify `apps/web/src/features/local-workspace/components/session-composer.tsx`
  - Removes required template picker from new session composer and supports `$` mention metadata.
- Modify `apps/web/src/worker/__tests__/worker-studio.test.tsx`
  - Tests worker tree, no-workspace empty state, workspace row compose, composer typeahead, and Worker configuration entry.
- No planned changes to `scripts/check-web-ui-components.ts` in the first pass.
  The existing `bun run ui:check` gate will decide whether governance updates
  are necessary after visible UI is implemented.

## Task 1: Shared Composer Typeahead

**Files:**
- Modify: `packages/ui/src/components/session-composer.tsx`
- Modify: `packages/ui/src/components/session-composer.test.tsx`

- [ ] **Step 1: Write failing tests for composer-attached `$` typeahead**

Add these tests to `packages/ui/src/components/session-composer.test.tsx`:

```tsx
it('opens a composer-attached upward typeahead when the textarea contains an active $ mention', () => {
  const { container } = render(
    <SessionComposer
      ariaLabel="Session input"
      mentionOptions={[
        { description: 'Prepare interview questions.', id: 'interview-brief', label: 'Interview brief' },
        { description: 'Create a candidate profile.', id: 'candidate-profile', label: 'Candidate profile' },
      ]}
      mentionQuery={{ active: true, query: 'inter', trigger: '$' }}
      onMentionSelect={vi.fn()}
      onSubmit={vi.fn()}
      onValueChange={vi.fn()}
      submitAriaLabel="Start"
      value="Prepare $inter"
      variant="large"
    />,
  )

  const panel = screen.getByRole('listbox', { name: 'Skill suggestions' })
  expect(panel).toBeTruthy()
  expect(panel.getAttribute('data-session-slot')).toBe('composer-typeahead')
  expect(panel.getAttribute('data-side')).toBe('top')
  expect(panel.closest('[data-session-slot="composer-field"]')).toBeTruthy()
  expect(screen.getByRole('option', { name: /Interview brief/ })).toBeTruthy()
  expect(container.querySelector('[data-session-slot="composer-action-main"] [role="combobox"]')).toBeNull()
})

it('does not render a skill picker button when mention options are available', () => {
  render(
    <SessionComposer
      ariaLabel="Session input"
      mentionOptions={[{ id: 'candidate-profile', label: 'Candidate profile' }]}
      onMentionSelect={vi.fn()}
      onSubmit={vi.fn()}
      onValueChange={vi.fn()}
      submitAriaLabel="Start"
      value=""
      variant="large"
    />,
  )

  expect(screen.queryByRole('button', { name: /\$ skill/i })).toBeNull()
  expect(screen.queryByRole('combobox')).toBeNull()
})
```

- [ ] **Step 2: Run the composer tests and verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/session-composer.test.tsx
```

Expected: FAIL because `mentionOptions`, `mentionQuery`, and `onMentionSelect` do not exist on `SessionComposerProps`.

- [ ] **Step 3: Add mention types and render the upward typeahead**

In `packages/ui/src/components/session-composer.tsx`, add these types near `SessionComposerOption`:

```tsx
export interface SessionComposerMentionOption {
  description?: ReactNode
  disabled?: boolean
  id: string
  label: ReactNode
}

export interface SessionComposerMentionQuery {
  active: boolean
  query: string
  trigger: '$'
}
```

Add props to `SessionComposerProps`:

```tsx
  mentionOptions?: SessionComposerMentionOption[]
  mentionQuery?: SessionComposerMentionQuery
  onMentionSelect?: (option: SessionComposerMentionOption) => void
```

Destructure with defaults in `SessionComposer`:

```tsx
  mentionOptions = [],
  mentionQuery,
  onMentionSelect,
```

Render the typeahead inside `InputGroup`, before `SessionAttachmentList`:

```tsx
        <SessionComposerTypeahead
          mentionOptions={mentionOptions}
          mentionQuery={mentionQuery}
          onMentionSelect={onMentionSelect}
        />
```

Add this component above `ComposerWarning`:

```tsx
function SessionComposerTypeahead({
  mentionOptions,
  mentionQuery,
  onMentionSelect,
}: {
  mentionOptions: SessionComposerMentionOption[]
  mentionQuery?: SessionComposerMentionQuery
  onMentionSelect?: (option: SessionComposerMentionOption) => void
}) {
  if (!mentionQuery?.active || mentionQuery.trigger !== '$')
    return null

  const query = mentionQuery.query.trim().toLowerCase()
  const filtered = mentionOptions.filter((option) => {
    const label = typeof option.label === 'string' ? option.label : option.id
    return !query || option.id.toLowerCase().includes(query) || label.toLowerCase().includes(query)
  })

  if (filtered.length === 0) {
    return (
      <InputGroupAddon
        data-session-slot="composer-typeahead"
        data-side="top"
        align="block-start"
        className="flex-col items-stretch rounded-b-none border-b bg-popover p-1 shadow-lg"
        role="listbox"
        aria-label="Skill suggestions"
      >
        <Item variant="muted" size="xs">
          <ItemContent>
            <ItemTitle>No matching skill</ItemTitle>
          </ItemContent>
        </Item>
      </InputGroupAddon>
    )
  }

  return (
    <InputGroupAddon
      data-session-slot="composer-typeahead"
      data-side="top"
      align="block-start"
      className="flex-col items-stretch rounded-b-none border-b bg-popover p-1 shadow-lg"
      role="listbox"
      aria-label="Skill suggestions"
    >
      {filtered.map(option => (
        <Button
          key={option.id}
          type="button"
          variant="ghost"
          className="h-auto justify-start px-3 py-2 text-left"
          role="option"
          aria-disabled={option.disabled ? true : undefined}
          disabled={option.disabled}
          onClick={() => onMentionSelect?.(option)}
        >
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle className="max-w-full truncate">{option.label}</ItemTitle>
            {option.description
              ? <ItemDescription className="max-w-full truncate">{option.description}</ItemDescription>
              : null}
          </ItemContent>
        </Button>
      ))}
    </InputGroupAddon>
  )
}
```

- [ ] **Step 4: Run composer tests and verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/session-composer.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/session-composer.tsx packages/ui/src/components/session-composer.test.tsx
git commit -m "feat: 增强会话输入框技能唤起"
```

## Task 2: Shared Session Thread Primitives

**Files:**
- Create: `packages/ui/src/components/session-thread.tsx`
- Create: `packages/ui/src/components/session-thread.test.tsx`

- [ ] **Step 1: Write failing tests for thread and artifact cards**

Create `packages/ui/src/components/session-thread.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { SessionThread } from './session-thread'

afterEach(() => cleanup())

describe('SessionThread', () => {
  it('renders turns, progress, and app-owned artifact cards without nested cards', () => {
    const { container } = render(
      <SessionThread
        ariaLabel="Session thread"
        messages={[
          { body: 'Review this candidate.', id: 'turn-1-user', kind: 'user', title: 'You' },
          { body: 'Running interview brief skill.', id: 'turn-1-status', kind: 'status', title: 'Running' },
          {
            artifacts: [
              {
                description: 'Interview questions and evidence gaps.',
                id: 'artifact-1',
                status: 'available',
                title: 'Interview brief',
              },
            ],
            body: 'Created an interview brief.',
            id: 'turn-1-assistant',
            kind: 'assistant',
            title: 'Recruiting worker',
          },
        ]}
      />,
    )

    expect(screen.getByRole('log', { name: 'Session thread' })).toBeTruthy()
    expect(screen.getByText('Review this candidate.')).toBeTruthy()
    expect(screen.getByText('Interview brief')).toBeTruthy()
    expect(container.querySelector('[data-session-slot="artifact-card"]')?.closest('[data-slot="card"] [data-slot="card"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the UI thread test and verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/session-thread.test.tsx
```

Expected: FAIL because `./session-thread` does not exist.

- [ ] **Step 3: Implement shared thread primitives**

Create `packages/ui/src/components/session-thread.tsx`:

```tsx
import type { ReactNode } from 'react'

import { Badge, BadgeLabel } from '#components/badge'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '#components/item'
import { cn } from '#lib/utils'

export interface SessionThreadArtifact {
  description?: ReactNode
  id: string
  status?: 'available' | 'missing' | 'archived' | string
  title: ReactNode
}

export interface SessionThreadMessage {
  artifacts?: SessionThreadArtifact[]
  body?: ReactNode
  id: string
  kind: 'assistant' | 'status' | 'user'
  title?: ReactNode
}

export interface SessionThreadProps {
  ariaLabel: string
  className?: string
  messages: SessionThreadMessage[]
}

export function SessionThread({ ariaLabel, className, messages }: SessionThreadProps) {
  return (
    <ItemGroup
      data-session-slot="session-thread"
      role="log"
      aria-label={ariaLabel}
      className={cn('min-w-0 gap-3', className)}
    >
      {messages.map(message => (
        <Item key={message.id} data-session-message-kind={message.kind} variant={message.kind === 'status' ? 'muted' : 'default'}>
          <ItemContent className="min-w-0 gap-2">
            {message.title ? <ItemTitle className="max-w-full">{message.title}</ItemTitle> : null}
            {message.body ? <ItemDescription className="max-w-full line-clamp-none">{message.body}</ItemDescription> : null}
            {message.artifacts?.length
              ? (
                  <div className="grid min-w-0 gap-2">
                    {message.artifacts.map(artifact => <ArtifactCard key={artifact.id} artifact={artifact} />)}
                  </div>
                )
              : null}
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  )
}

export function ArtifactCard({ artifact }: { artifact: SessionThreadArtifact }) {
  return (
    <Item data-session-slot="artifact-card" variant="muted" size="sm" className="min-w-0">
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full">{artifact.title}</ItemTitle>
        {artifact.description ? <ItemDescription className="max-w-full line-clamp-none">{artifact.description}</ItemDescription> : null}
      </ItemContent>
      {artifact.status ? (
        <Badge variant="outline">
          <BadgeLabel>{artifact.status}</BadgeLabel>
        </Badge>
      ) : null}
    </Item>
  )
}
```

- [ ] **Step 4: Run thread tests and verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test src/components/session-thread.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/session-thread.tsx packages/ui/src/components/session-thread.test.tsx
git commit -m "feat: 增加共享会话线程组件"
```

## Task 3: Worker Overlay Shared Contracts

**Files:**
- Modify: `packages/shared/src/local-workspace.ts`

- [ ] **Step 1: Add local-workspace schema tests through TypeScript compile expectations**

Create `packages/shared/src/local-workspace.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'

import { localWorkerOverlaySchema } from './local-workspace'

describe('local worker overlay schema', () => {
  it('accepts worker-owned skill, MCP, and entry overlays', () => {
    const parsed = localWorkerOverlaySchema.parse({
      assets: [
        {
          content: '# Interview brief\n',
          enabled: true,
          id: 'interview-brief',
          kind: 'skill',
          source: 'overlay',
          target: 'codex',
          updatedAt: '2026-05-21T00:00:00.000Z',
        },
        {
          content: '[mcp_servers.ats]\ncommand = "uvx"\n',
          enabled: false,
          id: 'codex-ats',
          kind: 'mcp-client',
          source: 'overlay',
          target: 'codex',
          updatedAt: '2026-05-21T00:00:00.000Z',
        },
        {
          content: '# Worker Instructions\n',
          enabled: true,
          id: 'AGENTS.md',
          kind: 'entry-file',
          source: 'overlay',
          target: 'workspace',
          updatedAt: '2026-05-21T00:00:00.000Z',
        },
      ],
      workerId: 'worker-1',
    })

    expect(parsed.assets.map(asset => asset.kind)).toEqual(['skill', 'mcp-client', 'entry-file'])
  })
})
```

- [ ] **Step 2: Run shared tests and verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-shared' test src/local-workspace.test.ts
```

Expected: FAIL because `localWorkerOverlaySchema` does not exist.

- [ ] **Step 3: Add overlay schemas**

Append to `packages/shared/src/local-workspace.ts` near other local schemas:

```ts
export const localWorkerOverlayAssetKindSchema = z.enum(['entry-file', 'mcp-client', 'skill'])
export type LocalWorkerOverlayAssetKind = z.infer<typeof localWorkerOverlayAssetKindSchema>

export const localWorkerOverlayAssetSourceSchema = z.enum(['baseline', 'overlay'])
export type LocalWorkerOverlayAssetSource = z.infer<typeof localWorkerOverlayAssetSourceSchema>

export const localWorkerOverlayAssetSchema = z.object({
  content: z.string(),
  enabled: z.boolean(),
  id: idSchema,
  kind: localWorkerOverlayAssetKindSchema,
  metadataJson: localJsonObjectSchema.optional().default({}),
  source: localWorkerOverlayAssetSourceSchema,
  target: z.string().min(1),
  updatedAt: timestampSchema,
})
export type LocalWorkerOverlayAsset = z.infer<typeof localWorkerOverlayAssetSchema>

export const localWorkerOverlaySchema = z.object({
  assets: z.array(localWorkerOverlayAssetSchema),
  workerId: idSchema,
})
export type LocalWorkerOverlay = z.infer<typeof localWorkerOverlaySchema>

export const localWorkerOverlaySaveSchema = z.object({
  assets: z.array(localWorkerOverlayAssetSchema.omit({ source: true, updatedAt: true }).extend({
    source: z.literal('overlay').optional().default('overlay'),
  })),
})
export type LocalWorkerOverlaySaveInput = z.infer<typeof localWorkerOverlaySaveSchema>

export const localComposerMentionSchema = z.object({
  id: idSchema,
  kind: z.literal('skill'),
  label: z.string().min(1),
  range: z.object({
    end: z.number().int().nonnegative(),
    start: z.number().int().nonnegative(),
  }).optional(),
})
export type LocalComposerMention = z.infer<typeof localComposerMentionSchema>
```

- [ ] **Step 4: Run shared tests and verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-shared' test src/local-workspace.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/local-workspace.ts packages/shared/src/local-workspace.test.ts
git commit -m "feat: 定义 worker 覆盖层契约"
```

## Task 4: Worker Overlay Storage

**Files:**
- Modify: `packages/storage-sqlite/src/worker/schema.ts`
- Modify: `packages/storage-sqlite/src/worker/index.ts`
- Modify: `packages/storage-sqlite/src/worker/index.test.ts`

- [ ] **Step 1: Write failing storage tests**

Add to `packages/storage-sqlite/src/worker/index.test.ts`:

```ts
it('persists worker overlay assets as Host metadata with baseline provenance', () => {
  const worker = createWorker({ id: 'worker-overlay-1', name: 'Recruiting worker', soulId: 'aiworker-hr' })

  upsertWorkerOverlayAssets(worker.id, [{
    content: '# Interview brief\n',
    enabled: true,
    id: 'interview-brief',
    kind: 'skill',
    metadataJson: { targetPath: '.agents/skills/aiworker-hr-interview-brief/SKILL.md' },
    target: 'codex',
  }])

  const overlay = listWorkerOverlayAssets(worker.id)
  expect(overlay).toHaveLength(1)
  expect(overlay[0]).toMatchObject({
    content: '# Interview brief\n',
    enabled: true,
    id: 'interview-brief',
    kind: 'skill',
    source: 'overlay',
    target: 'codex',
    workerId: worker.id,
  })
})
```

- [ ] **Step 2: Run storage test and verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts
```

Expected: FAIL because `upsertWorkerOverlayAssets` and `listWorkerOverlayAssets` do not exist.

- [ ] **Step 3: Add worker overlay table**

In `packages/storage-sqlite/src/worker/schema.ts`, add after `workers`:

```ts
export const workerOverlayAssets = sqliteTable(
  'worker_overlay_assets',
  {
    workerId: text('worker_id').notNull().references(() => workers.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    kind: text('kind', { enum: ['entry-file', 'mcp-client', 'skill'] }).notNull(),
    target: text('target').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    content: text('content').notNull(),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
    createdAt: text('created_at').notNull().$defaultFn(nowIso),
    updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  },
  table => ({
    workerAssetUniqueIdx: uniqueIndex('worker_overlay_assets_worker_kind_target_id_idx').on(table.workerId, table.kind, table.target, table.id),
    workerKindIdx: index('worker_overlay_assets_worker_kind_idx').on(table.workerId, table.kind),
  }),
)
```

- [ ] **Step 4: Add repository functions**

In `packages/storage-sqlite/src/worker/index.ts`, import the table through existing `schema` import and add:

```ts
export interface WorkerOverlayAssetInput {
  content: string
  enabled: boolean
  id: string
  kind: 'entry-file' | 'mcp-client' | 'skill'
  metadataJson?: Record<string, unknown>
  target: string
}

export type WorkerOverlayAssetRow = typeof schema.workerOverlayAssets.$inferSelect

export function listWorkerOverlayAssets(workerId: string): (WorkerOverlayAssetRow & { source: 'overlay' })[] {
  return getWorkerDb()
    .select()
    .from(schema.workerOverlayAssets)
    .where(eq(schema.workerOverlayAssets.workerId, workerId))
    .all()
    .map(row => ({ ...row, source: 'overlay' as const }))
}

export function upsertWorkerOverlayAssets(workerId: string, assets: WorkerOverlayAssetInput[], at = new Date().toISOString()): void {
  const db = getWorkerDb()
  for (const asset of assets) {
    db.insert(schema.workerOverlayAssets)
      .values({
        content: asset.content,
        createdAt: at,
        enabled: asset.enabled,
        id: asset.id,
        kind: asset.kind,
        metadataJson: asset.metadataJson ?? {},
        target: asset.target,
        updatedAt: at,
        workerId,
      })
      .onConflictDoUpdate({
        set: {
          content: asset.content,
          enabled: asset.enabled,
          metadataJson: asset.metadataJson ?? {},
          updatedAt: at,
        },
        target: [
          schema.workerOverlayAssets.workerId,
          schema.workerOverlayAssets.kind,
          schema.workerOverlayAssets.target,
          schema.workerOverlayAssets.id,
        ],
      })
      .run()
  }
}
```

- [ ] **Step 5: Run storage tests and verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/storage-sqlite/src/worker/schema.ts packages/storage-sqlite/src/worker/index.ts packages/storage-sqlite/src/worker/index.test.ts
git commit -m "feat: 持久化 worker 覆盖层资产"
```

## Task 5: Effective Asset Resolution In Core

**Files:**
- Modify: `packages/core/src/worker/engine-assets.ts`
- Modify: `packages/core/src/worker/runtime.ts`
- Modify: `packages/core/src/worker/runtime.test.ts`

- [ ] **Step 1: Write failing runtime test for overlay projection**

Add to `packages/core/src/worker/runtime.test.ts`:

```ts
it('projects worker overlay skills over the Soul App baseline for new workspaces', async () => {
  const { appRoot, runtime, workerRuntime } = await createRuntimeFixture('overlay-skill')
  await mkdir(join(appRoot, 'engine-assets', 'skills', 'interview-brief'), { recursive: true })
  await writeFile(join(appRoot, 'engine-assets', 'skills', 'interview-brief', 'SKILL.md'), '# Baseline Interview Brief\n')

  upsertWorkerOverlayAssets(workerRuntime.workerId, [{
    content: '# Overlay Interview Brief\n',
    enabled: true,
    id: 'interview-brief',
    kind: 'skill',
    target: 'codex',
  }])

  const workspace = await workerRuntime.createWorkspace({ name: 'Candidate pool' })
  await expect(readFile(join(workspace.rootPath, '.agents', 'skills', 'aiworker-hr-interview-brief', 'SKILL.md'), 'utf8')).resolves.toContain('Overlay Interview Brief')
  await expect(readFile(join(workspace.rootPath, '.aiworker', 'projections.json'), 'utf8')).resolves.toContain('"source":"worker-overlay"')
})
```

- [ ] **Step 2: Run runtime test and verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts
```

Expected: FAIL because `projectEngineAssetsToWorkspace` does not consume worker overlay assets.

- [ ] **Step 3: Add overlay input to engine asset projection**

In `packages/core/src/worker/engine-assets.ts`, add:

```ts
export interface WorkerOverlayProjectionAsset {
  content: string
  enabled: boolean
  id: string
  kind: 'entry-file' | 'mcp-client' | 'skill'
  target: string
}
```

Extend `EngineAssetProjectionInput`:

```ts
  workerOverlayAssets?: WorkerOverlayProjectionAsset[]
```

Inside `projectNativeSkills`, after collecting baseline skill files, apply enabled overlay skill assets by target:

```ts
  for (const asset of input.workerOverlayAssets ?? []) {
    if (!asset.enabled || asset.kind !== 'skill')
      continue
    if (asset.target !== input.engineTarget)
      continue
    const skillId = `${input.appId}-${asset.id}`
    const targets = input.engineTarget === 'codex'
      ? [path.join(workspaceRoot, '.agents', 'skills', skillId, SKILL_FILE)]
      : [path.join(workspaceRoot, '.claude', 'skills', skillId, SKILL_FILE)]
    for (const target of targets) {
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, asset.content, 'utf8')
      projections.push({
        generatedAt,
        kind: 'native-skill',
        source: 'worker-overlay',
        target: path.relative(workspaceRoot, target).split(path.sep).join(path.posix.sep),
      })
    }
  }
```

- [ ] **Step 4: Pass overlay assets from runtime**

In `packages/core/src/worker/runtime.ts`, import `listWorkerOverlayAssets` and pass enabled assets into workspace projection where `projectEngineAssetsToWorkspace` is called:

```ts
const workerOverlayAssets = listWorkerOverlayAssets(this.workerId).map(asset => ({
  content: asset.content,
  enabled: asset.enabled,
  id: asset.id,
  kind: asset.kind,
  target: asset.target,
}))
```

Then include:

```ts
workerOverlayAssets,
```

in the projection input object.

- [ ] **Step 5: Run core runtime tests and verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/worker/engine-assets.ts packages/core/src/worker/runtime.ts packages/core/src/worker/runtime.test.ts
git commit -m "feat: 应用 worker 覆盖层投影"
```

## Task 6: Overlay API Routes

**Files:**
- Modify: `apps/api/src/modes/worker.ts`
- Modify: `apps/api/src/modes/worker.local.test.ts`

- [ ] **Step 1: Write failing API tests**

Add to `apps/api/src/modes/worker.local.test.ts`:

```ts
it('saves and reads worker overlay assets through worker-scoped routes', async () => {
  const target = await app()
  const worker = createWorker({ id: 'api-worker-overlay', name: 'Recruiting worker', soulId: 'aiworker-hr' })

  const saveRes = await target.request(`/api/local/workers/${worker.id}/overlay`, {
    body: JSON.stringify({
      assets: [{
        content: '# Interview brief\n',
        enabled: true,
        id: 'interview-brief',
        kind: 'skill',
        target: 'codex',
      }],
    }),
    method: 'PUT',
  })
  expect(saveRes.status).toBe(200)

  const readRes = await target.request(`/api/local/workers/${worker.id}/overlay`)
  expect(readRes.status).toBe(200)
  const body = await readRes.json()
  expect(body.overlay.assets[0]).toMatchObject({ id: 'interview-brief', kind: 'skill', source: 'overlay' })
})

it('rejects literal MCP secrets in worker overlay assets', async () => {
  const target = await app()
  const worker = createWorker({ id: 'api-worker-secret', name: 'Recruiting worker', soulId: 'aiworker-hr' })

  const res = await target.request(`/api/local/workers/${worker.id}/overlay`, {
    body: JSON.stringify({
      assets: [{
        content: 'token = "sk-live-secret"\n',
        enabled: true,
        id: 'codex-ats',
        kind: 'mcp-client',
        target: 'codex',
      }],
    }),
    method: 'PUT',
  })

  expect(res.status).toBe(422)
})
```

- [ ] **Step 2: Run API tests and verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
```

Expected: FAIL because `/api/local/workers/:workerId/overlay` routes do not exist.

- [ ] **Step 3: Add routes and validation**

In `apps/api/src/modes/worker.ts`, import shared schema and storage helpers:

```ts
import { localWorkerOverlaySaveSchema } from '@zonease/aiworker-shared'
import { listWorkerOverlayAssets, upsertWorkerOverlayAssets } from '@zonease/aiworker-storage-sqlite/worker'
```

Add routes near worker-scoped routes:

```ts
  app.get('/api/local/workers/:workerId/overlay', (c) => {
    const worker = requireWorker(c.req.param('workerId'))
    return c.json({
      overlay: {
        assets: listWorkerOverlayAssets(worker.id),
        workerId: worker.id,
      },
    })
  })

  app.put('/api/local/workers/:workerId/overlay', async (c) => {
    const worker = requireWorker(c.req.param('workerId'))
    const body = localWorkerOverlaySaveSchema.parse(await c.req.json())
    const secretIssue = body.assets.find(asset => asset.kind === 'mcp-client' && containsLiteralSecret(asset.content))
    if (secretIssue) {
      return c.json({ error: 'literal MCP secrets are not allowed in worker overlay assets' }, 422)
    }
    upsertWorkerOverlayAssets(worker.id, body.assets.map(asset => ({
      content: asset.content,
      enabled: asset.enabled,
      id: asset.id,
      kind: asset.kind,
      metadataJson: asset.metadataJson,
      target: asset.target,
    })))
    return c.json({
      overlay: {
        assets: listWorkerOverlayAssets(worker.id),
        workerId: worker.id,
      },
    })
  })
```

Add helper near other validation helpers:

```ts
function containsLiteralSecret(content: string): boolean {
  return /\b(?:api[_-]?key|bearer|password|secret|token)\b\s*[:=]\s*["']?(?:sk-|[A-Za-z0-9_-]{16,})/i.test(content)
}
```

- [ ] **Step 4: Run API tests and verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modes/worker.ts apps/api/src/modes/worker.local.test.ts
git commit -m "feat: 增加 worker 覆盖层 API"
```

## Task 7: Web API Client For Overlays

**Files:**
- Modify: `apps/web/src/features/local-workspace/api/types.ts`
- Create: `apps/web/src/features/local-workspace/api/worker-overlays.ts`
- Modify: `apps/web/src/features/local-workspace/api/index.ts`

- [ ] **Step 1: Write API helper test**

Create `apps/web/src/features/local-workspace/api/worker-overlays.test.ts` with:

```ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { saveWorkerOverlay } from './worker-overlays'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('worker overlay API', () => {
  it('saves worker overlay assets through the worker scoped endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      overlay: {
        assets: [],
        workerId: 'worker-1',
      },
    }))))

    await saveWorkerOverlay('worker-1', {
      assets: [{
        content: '# Skill\n',
        enabled: true,
        id: 'brief',
        kind: 'skill',
        target: 'codex',
      }],
    })

    expect(fetch).toHaveBeenCalledWith('/api/local/workers/worker-1/overlay', expect.objectContaining({ method: 'PUT' }))
  })
})
```

- [ ] **Step 2: Run focused Web API tests and verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/features/local-workspace/api
```

Expected: FAIL because `saveWorkerOverlay` does not exist.

- [ ] **Step 3: Add API types**

In `apps/web/src/features/local-workspace/api/types.ts`, import and export shared types:

```ts
import type { LocalWorkerOverlay, LocalWorkerOverlaySaveInput } from '@zonease/aiworker-shared'

export type WorkerOverlayResponse = {
  overlay: LocalWorkerOverlay
}

export type WorkerOverlaySaveBody = LocalWorkerOverlaySaveInput
```

- [ ] **Step 4: Add API helper file**

Create `apps/web/src/features/local-workspace/api/worker-overlays.ts`:

```ts
import type { WorkerOverlayResponse, WorkerOverlaySaveBody } from './types'

import { localJson } from '../../../shared/api/local-client'

export function loadWorkerOverlay(workerId: string): Promise<WorkerOverlayResponse> {
  return localJson<WorkerOverlayResponse>(`/api/local/workers/${workerId}/overlay`)
}

export function saveWorkerOverlay(workerId: string, body: WorkerOverlaySaveBody): Promise<WorkerOverlayResponse> {
  return localJson<WorkerOverlayResponse>(`/api/local/workers/${workerId}/overlay`, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  })
}
```

Export from `apps/web/src/features/local-workspace/api/index.ts`:

```ts
export * from './worker-overlays'
```

- [ ] **Step 5: Run focused Web API tests and verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/features/local-workspace/api
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/local-workspace/api/types.ts apps/web/src/features/local-workspace/api/worker-overlays.ts apps/web/src/features/local-workspace/api/index.ts
git commit -m "feat: 接入 worker 覆盖层 Web API"
```

## Task 8: Worker Tree And New Session Flow

**Files:**
- Create: `apps/web/src/worker/worker-workbench-tree.tsx`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/features/local-workspace/components/session-composer.tsx`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Write failing Worker Studio tests**

Add to `apps/web/src/worker/__tests__/worker-studio.test.tsx`:

```tsx
it('renders workspaces as groups with sessions under the selected worker', async () => {
  window.history.replaceState(null, '', '/workers/hr-worker')
  render(<WorkerStudio />)

  expect(await screen.findByText('Recruiting worker')).toBeTruthy()
  expect(screen.getByText('Candidate pool')).toBeTruthy()
  expect(screen.getByText('Candidate screen')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
})

it('opens the new session composer from the workspace row compose action without requiring a skill picker', async () => {
  window.history.replaceState(null, '', '/workers/hr-worker')
  render(<WorkerStudio />)

  const compose = await screen.findByRole('button', { name: 'Start session in Candidate pool' })
  await userEvent.click(compose)

  expect(screen.getByText('What should Recruiting worker do?')).toBeTruthy()
  expect(screen.queryByRole('combobox', { name: /capability|skill|template/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /\$ skill/i })).toBeNull()
})
```

- [ ] **Step 2: Run Worker Studio tests and verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: FAIL because the left panel does not yet render the Codex-style workspace/session tree and workspace row compose action.

- [ ] **Step 3: Create worker tree component**

Create `apps/web/src/worker/worker-workbench-tree.tsx`:

```tsx
import type { LocalSession, LocalWorker, LocalWorkspace } from '@zonease/aiworker-shared'

import { Edit02Icon, MoreHorizontalCircle01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@zonease/aiworker-ui/components/button'
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'

export function WorkerWorkbenchTree({
  onConfigureWorker,
  onSelectSession,
  onStartSession,
  sessions,
  worker,
  workspaces,
}: {
  onConfigureWorker: () => void
  onSelectSession: (session: LocalSession) => void
  onStartSession: (workspace: LocalWorkspace) => void
  sessions: LocalSession[]
  worker: LocalWorker
  workspaces: LocalWorkspace[]
}) {
  return (
    <ItemGroup data-testid="worker-workbench-tree" className="gap-3">
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>{worker.name}</ItemTitle>
        </ItemContent>
        <ItemActions>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Configure worker" onClick={onConfigureWorker}>
            <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} aria-hidden="true" />
          </Button>
        </ItemActions>
      </Item>
      {workspaces.map(workspace => (
        <ItemGroup key={workspace.id} className="gap-1">
          <Item variant="default">
            <ItemContent>
              <ItemTitle>{workspace.name}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Start session in ${workspace.name}`} onClick={() => onStartSession(workspace)}>
                <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} aria-hidden="true" />
              </Button>
            </ItemActions>
          </Item>
          {sessions.filter(session => session.workspaceId === workspace.id).map(session => (
            <Button key={session.id} type="button" variant="ghost" className="ml-6 justify-start" onClick={() => onSelectSession(session)}>
              {session.title}
            </Button>
          ))}
        </ItemGroup>
      ))}
    </ItemGroup>
  )
}
```

- [ ] **Step 4: Remove required template picker from new session composer**

In `apps/web/src/features/local-workspace/components/session-composer.tsx`, stop passing template props to `SessionComposer` for the new session path:

```tsx
        mentionOptions={templates.map(template => ({
          description: template.outputKind,
          id: template.id,
          label: displayTemplate(template, locale).name,
        }))}
        mentionQuery={resolveDollarMention(value)}
        onMentionSelect={(option) => {
          onContextChange(insertMention(value, option.id))
        }}
```

Add local helpers:

```tsx
function resolveDollarMention(value: string) {
  const match = value.match(/\$([A-Za-z0-9_-]*)$/)
  return match ? { active: true, query: match[1] ?? '', trigger: '$' as const } : undefined
}

function insertMention(value: string, id: string): string {
  return value.replace(/\$([A-Za-z0-9_-]*)$/, `$${id} `)
}
```

Remove these props from the `SessionComposer` call in the same component:

```tsx
selectedTemplateId={selectedTemplate.id}
templateLabel={copy.create.capabilityTemplate}
templateOptions={...}
onTemplateChange={onTemplateChange}
```

Keep `selectedTemplate` only as a fallback for current API compatibility until Task 10 resolves mention metadata.

- [ ] **Step 5: Integrate the tree into WorkerStudio**

In `apps/web/src/worker/worker-studio.tsx`, import:

```tsx
import { WorkerWorkbenchTree } from './worker-workbench-tree'
```

Add state:

```tsx
const [newSessionWorkspaceId, setNewSessionWorkspaceId] = useState<string | null>(null)
const [workerConfigurationOpen, setWorkerConfigurationOpen] = useState(false)
```

Wire tree callbacks:

```tsx
const newSessionWorkspace = newSessionWorkspaceId
  ? soulWorkspaces.find(workspace => workspace.id === newSessionWorkspaceId) ?? null
  : null
```

When rendering the left panel, place:

```tsx
{selectedWorker
  ? (
      <WorkerWorkbenchTree
        worker={selectedWorker}
        workspaces={soulWorkspaces}
        sessions={soulSessions}
        onConfigureWorker={() => setWorkerConfigurationOpen(true)}
        onStartSession={(workspace) => {
          setSelectedWorkspaceId(workspace.id)
          setNewSessionWorkspaceId(workspace.id)
          navigateWorkerRoute({ kind: 'workspace', workerId: selectedWorker.id, workspaceId: workspace.id })
        }}
        onSelectSession={session => navigateWorkerRoute({ kind: 'session', workerId: selectedWorker.id, workspaceId: session.workspaceId, sessionId: session.id })}
      />
    )
  : null}
```

In main panel selection, prefer `newSessionWorkspace` before auto-selected latest session:

```tsx
const showNewSessionComposer = Boolean(newSessionWorkspace && !selectedSession)
```

Render `WorkspaceSessionComposer` only when `showNewSessionComposer` is true.

- [ ] **Step 6: Run Worker Studio tests and verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/worker/worker-workbench-tree.tsx apps/web/src/worker/worker-studio.tsx apps/web/src/features/local-workspace/components/session-composer.tsx apps/web/src/worker/__tests__/worker-studio.test.tsx
git commit -m "feat: 重塑 worker 工作台导航"
```

## Task 9: Worker Configuration Dialog

**Files:**
- Create: `apps/web/src/worker/worker-configuration-dialog.tsx`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`

- [ ] **Step 1: Write failing dialog tests**

Add to `apps/web/src/worker/__tests__/worker-studio.test.tsx`:

```tsx
it('opens Worker configuration from the worker row without opening Host settings', async () => {
  window.history.replaceState(null, '', '/workers/hr-worker')
  render(<WorkerStudio />)

  await userEvent.click(await screen.findByRole('button', { name: 'Configure worker' }))

  expect(screen.getByRole('dialog', { name: 'Worker configuration' })).toBeTruthy()
  expect(screen.queryByRole('dialog', { name: /settings/i })).toBeNull()
  expect(screen.getByRole('tab', { name: 'Skills' })).toBeTruthy()
  expect(screen.getByTestId('worker-overlay-asset-list').getAttribute('data-orientation')).toBe('horizontal')
})
```

- [ ] **Step 2: Run Worker Studio tests and verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: FAIL because `WorkerConfigurationDialog` does not exist.

- [ ] **Step 3: Create WorkerConfigurationDialog**

Create `apps/web/src/worker/worker-configuration-dialog.tsx`:

```tsx
import type { LocalWorker, LocalWorkerOverlayAsset } from '@zonease/aiworker-shared'

import { MoreHorizontalCircle01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@zonease/aiworker-ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@zonease/aiworker-ui/components/dialog'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { Switch } from '@zonease/aiworker-ui/components/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@zonease/aiworker-ui/components/tabs'
import { Textarea } from '@zonease/aiworker-ui/components/textarea'
import { useMemo, useState } from 'react'

type OverlayCategory = 'entry-file' | 'mcp-client' | 'skill'

const categories: { label: string, value: OverlayCategory }[] = [
  { label: 'Skills', value: 'skill' },
  { label: 'MCP clients', value: 'mcp-client' },
  { label: 'Entry files', value: 'entry-file' },
]

export function WorkerConfigurationDialog({
  assets,
  onOpenChange,
  open,
  worker,
}: {
  assets: LocalWorkerOverlayAsset[]
  onOpenChange: (open: boolean) => void
  open: boolean
  worker: LocalWorker | null
}) {
  const [category, setCategory] = useState<OverlayCategory>('skill')
  const selectedAssets = useMemo(() => assets.filter(asset => asset.kind === category), [assets, category])
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const selectedAsset = selectedAssets.find(asset => asset.id === selectedAssetId) ?? selectedAssets[0] ?? null
  const [mode, setMode] = useState<'editor' | 'preview'>('editor')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogTitle>Worker configuration</DialogTitle>
        <DialogDescription>{worker ? `${worker.name} worker overlay` : 'Worker overlay'}</DialogDescription>
        <Tabs value={category} onValueChange={value => setCategory(value as OverlayCategory)}>
          <TabsList>
            {categories.map(item => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}
            <TabsTrigger value="projection">Projection</TabsTrigger>
          </TabsList>
          {categories.map(item => (
            <TabsContent key={item.value} value={item.value} className="grid gap-4">
              <div data-testid="worker-overlay-asset-list" data-orientation="horizontal" className="flex min-w-0 gap-2 overflow-x-auto">
                {selectedAssets.map(asset => (
                  <Button key={asset.id} type="button" variant={selectedAsset?.id === asset.id ? 'secondary' : 'ghost'} onClick={() => setSelectedAssetId(asset.id)}>
                    {asset.id}
                  </Button>
                ))}
              </div>
              {selectedAsset ? (
                <ItemGroup className="gap-3">
                  <Item variant="muted">
                    <ItemContent>
                      <ItemTitle>{selectedAsset.id}</ItemTitle>
                      <ItemDescription>{selectedAsset.source} · {selectedAsset.target}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Switch checked={selectedAsset.enabled} aria-label={`Enable ${selectedAsset.id}`} />
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`More actions for ${selectedAsset.id}`}>
                        <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} aria-hidden="true" />
                      </Button>
                    </ItemActions>
                  </Item>
                  <Tabs value={mode} onValueChange={value => setMode(value as 'editor' | 'preview')}>
                    <TabsList>
                      <TabsTrigger value="editor">Editor</TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                    <TabsContent value="editor">
                      <Textarea value={selectedAsset.content} readOnly aria-label={`${selectedAsset.id} editor`} />
                    </TabsContent>
                    <TabsContent value="preview">
                      <Item variant="default">
                        <ItemContent>
                          <ItemTitle>{selectedAsset.id}</ItemTitle>
                          <ItemDescription className="line-clamp-none">{selectedAsset.content}</ItemDescription>
                        </ItemContent>
                      </Item>
                    </TabsContent>
                  </Tabs>
                </ItemGroup>
              ) : null}
            </TabsContent>
          ))}
          <TabsContent value="projection">Projection receipts are shown here.</TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Integrate dialog into WorkerStudio**

Import:

```tsx
import { WorkerConfigurationDialog } from './worker-configuration-dialog'
```

Load overlay with the API helper from Task 7 when selected worker changes:

```tsx
const [workerOverlayAssets, setWorkerOverlayAssets] = useState<LocalWorkerOverlayAsset[]>([])

useEffect(() => {
  if (!selectedWorker)
    return
  loadWorkerOverlay(selectedWorker.id)
    .then(result => setWorkerOverlayAssets(result.overlay.assets))
    .catch(() => setWorkerOverlayAssets([]))
}, [selectedWorker?.id])
```

Render near other dialogs:

```tsx
<WorkerConfigurationDialog
  assets={workerOverlayAssets}
  open={workerConfigurationOpen}
  worker={selectedWorker}
  onOpenChange={setWorkerConfigurationOpen}
/>
```

- [ ] **Step 5: Run Worker Studio tests and verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/worker/worker-configuration-dialog.tsx apps/web/src/worker/worker-studio.tsx apps/web/src/worker/__tests__/worker-studio.test.tsx
git commit -m "feat: 增加 worker 配置对话框"
```

## Task 10: `$skill` Mention Resolution For Session Invocation

**Files:**
- Modify: `apps/web/src/features/local-workspace/components/session-composer.tsx`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `packages/core/src/worker/runtime.ts`
- Modify: `packages/core/src/worker/runtime.test.ts`

- [ ] **Step 1: Write failing test for mention metadata**

Add to `packages/core/src/worker/runtime.test.ts`:

```ts
it('records explicit skill mention metadata while preserving natural language input', async () => {
  const { workerRuntime } = await createRuntimeFixture('skill-mention')
  const workspace = await workerRuntime.createWorkspace({ name: 'Candidate pool' })
  const session = await workerRuntime.createSession({
    capabilityTemplateId: 'candidate-profile',
    context: 'Use $interview-brief for this resume.',
    metadata: {
      mentions: [{ id: 'interview-brief', kind: 'skill', label: 'Interview brief' }],
    },
    title: 'Candidate pool',
    workspaceId: workspace.id,
  })

  await workerRuntime.runTurn({
    input: 'Use $interview-brief for this resume.',
    metadata: {
      mentions: [{ id: 'interview-brief', kind: 'skill', label: 'Interview brief' }],
    },
    sessionId: session.id,
  })

  const snapshot = workerRuntime.snapshot()
  expect(snapshot.turns[0]?.metadataJson).toMatchObject({
    mentions: [{ id: 'interview-brief', kind: 'skill' }],
  })
})
```

- [ ] **Step 2: Run runtime tests and verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts
```

Expected: FAIL if `runTurn` metadata does not preserve mentions or invocation context ignores them.

- [ ] **Step 3: Preserve mention metadata in runtime**

In `packages/core/src/worker/runtime.ts`, ensure `runTurn` merges metadata into turn metadata:

```ts
const turn = createTurn({
  id: this.#ids.turn(),
  input: input.input,
  metadataJson: {
    ...(input.metadata ?? {}),
    capabilityTemplateId: session.capabilityTemplateId,
  },
  sessionId: session.id,
  seq,
  status: 'running',
})
```

In `buildInvocationPrompt`, include explicit skill mentions when present:

```ts
const mentions = Array.isArray(metadata.mentions)
  ? metadata.mentions.filter((mention): mention is { id: string, kind: string } => typeof mention === 'object' && mention !== null && 'id' in mention)
  : []
const mentionLines = mentions.length > 0
  ? ['Explicit skill mentions:', ...mentions.map(mention => `- ${mention.kind}: ${mention.id}`)]
  : []
```

Add `...mentionLines` to the prompt parts before user input.

- [ ] **Step 4: Pass mentions from Web composer**

In `apps/web/src/features/local-workspace/components/session-composer.tsx`, extend `WorkspaceSessionDraft`:

```ts
  mentions?: { id: string, kind: 'skill', label: string }[]
```

In `apps/web/src/worker/worker-studio.tsx`, include mentions in session metadata:

```ts
mentions: draft?.mentions ?? [],
```

and follow-up turn metadata:

```ts
mentions: draft?.mentions ?? [],
```

- [ ] **Step 5: Run focused tests and verify pass**

Run:

```bash
bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/worker/runtime.ts packages/core/src/worker/runtime.test.ts apps/web/src/features/local-workspace/components/session-composer.tsx apps/web/src/worker/worker-studio.tsx
git commit -m "feat: 解析会话输入中的技能提及"
```

## Task 11: Visual And Governance Verification

**Files:**
- Modify only files needed to fix issues found by checks.

- [ ] **Step 1: Run shared UI tests**

Run:

```bash
bun run --filter '@zonease/aiworker-ui' test
```

Expected: PASS.

- [ ] **Step 2: Run Web focused tests**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run API and core focused tests**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts
bun run --filter '@zonease/aiworker-storage-sqlite' test src/worker/index.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run UI governance**

Run:

```bash
bun run ui:check
```

Expected: PASS. If it flags app-local composer/chat styles, move reusable styling into `packages/ui` or document a temporary migration debt in the implementation closeout.

- [ ] **Step 5: Run browser visual checks**

Start the local dev server:

```bash
bun run dev
```

Open the Worker Web route and verify:

- Clicking a worker opens the worker-scoped workspace/session tree.
- New worker with no workspace shows create-first-workspace state.
- Workspace row compose opens a clean Codex-like composer.
- Typing `$` opens the composer-attached upward typeahead.
- Worker row `...` opens Worker configuration, not Host Settings.
- Worker configuration has category tabs, horizontal asset list, editor/preview toggle, enable switch, narrow `More` menu.

- [ ] **Step 6: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: review completes with no blocking issues.

- [ ] **Step 7: Confirm no unstaged verification fixes remain**

Run:

```bash
git status --short
```

Expected: clean except for user-owned unrelated files that were present before
this implementation began. If verification exposed a new defect, return to the
task that introduced it, add a focused failing test there, fix it, rerun that
task's verification, and commit from that task instead of creating a broad
catch-all verification commit.

## Final Closeout

- Run:

```bash
git status --short
```

- Confirm only expected user-owned unrelated changes remain.
- Summarize:
  - changed packages,
  - verification commands,
  - any skipped gates and why,
  - whether code-review-graph passed,
  - whether existing workspaces are untouched unless manual Projection was used.
