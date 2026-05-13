# Host Platform Locator and Capability Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge Host from a domain-data owner into a platform locator, capability broker, and shell contract while preserving Soul App standalone autonomy.

**Architecture:** Host keeps app lifecycle, identity/security, platform brokers, protocol discovery, permissioned invocation, and shell rendering. Soul Apps remain the source of truth for domain state, artifact/profile composition, review meaning, memory meaning, search semantics, and domain audit. Host consumes only protocol-exposed views/actions and may cache them only as non-authoritative platform views.

**Tech Stack:** Bun workspaces, TypeScript, Zod manifest/protocol schemas, Hono local daemon, React Worker Web shell, Soul App SDK/runtime, SQLite-backed Host metadata, bun:test, ESLint, code-review-graph.

---

## Scope Check

The approved spec touches several surfaces. Implement it as one bounded convergence plan with five independently verifiable slices:

1. Contract and PMA tracking.
2. Shared protocol descriptors for shell, views, search, and non-authoritative summaries.
3. Host runtime/API negative guards so Host cannot treat app domain state as its own.
4. Worker Web shell rendering from app-declared slots.
5. HR/QA reference app descriptors and smoke coverage.

Do not implement external Logto, S3, GCP, or a new marketplace in this plan. Those are future platform capability providers behind the same broker contract.

## File Structure

- Create `docs/task/FEAT-072.md`
  - PMA task for Host platform locator and capability shell convergence.
- Create `docs/plan/PLAN-302.md`
  - PMA plan record for this implementation.
- Modify `docs/task/index.md`, `docs/plan/index.md`, `docs/changelog.md`
  - Track and close the PMA work. Preserve any existing in-progress entries such as `REFACTOR-079` / `PLAN-301` if they are present.
- Modify `docs/architecture.md`, `docs/soul-app-developer.md`, `.agents/skills/aiworker-soul-app-dev/SKILL.md`
  - Make the new Host/Soul App boundary the active contract.
- Modify `packages/shared/src/soul-app/manifest.ts`
  - Add manifest-declared shell toolbar/search/settings descriptors.
- Modify `packages/shared/src/soul-app/protocol.ts`
  - Add protocol-exposed view/action/search descriptor result types.
- Modify `packages/shared/src/soul-app/registry.ts`
  - Project shell/view/search descriptors into hosted app metadata without adding domain meaning.
- Modify `packages/shared/src/soul-app/manifest.test.ts`, `packages/shared/src/soul-app/registry.test.ts`
  - Cover descriptor validation and registry projection.
- Modify `apps/aiworker-hr/soul-app.manifest.json`, `apps/aiworker-qa/soul-app.manifest.json`
  - Add first-party shell descriptors for HR/QA.
- Modify `apps/aiworker-hr/src/host-mounted.ts`, `apps/aiworker-qa/src/host-mounted.ts`
  - Return typed protocol descriptor surfaces.
- Modify `apps/aiworker-hr/src/index.test.ts`, `apps/aiworker-qa/src/index.test.ts`
  - Cover shell descriptor and protocol view behavior.
- Modify `apps/api/src/modes/worker.ts`, `apps/api/src/modes/worker.local.test.ts`
  - Validate mounted surface responses as protocol descriptors and prevent Host-only domain inference.
- Modify `apps/web/src/features/local-workspace/api/types.ts`, `apps/web/src/features/local-workspace/api/workspace-data.ts`
  - Carry app-declared shell descriptors to Worker Web.
- Modify `apps/web/src/worker/worker-studio.tsx`, `apps/web/src/worker/__tests__/worker-studio.test.tsx`
  - Render Host shell slots from descriptors while keeping domain action semantics in the Soul App.
- Run focused package gates, root gates, browser smoke if mounted surface UI changes are visible, and code-review-graph.

### Task 1: PMA Tracking And Contract Baseline

**Files:**
- Create: `docs/task/FEAT-072.md`
- Create: `docs/plan/PLAN-302.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/architecture.md`
- Modify: `docs/soul-app-developer.md`
- Modify: `.agents/skills/aiworker-soul-app-dev/SKILL.md`

- [ ] **Step 1: Inspect existing in-progress tracking**

Run:

```bash
git status --short --untracked-files=all
tail -n 16 docs/task/index.md
tail -n 16 docs/plan/index.md
```

Expected: identify any existing in-progress entries such as `REFACTOR-079` / `PLAN-301`. Preserve them. Do not remove user or parallel-agent work.

- [ ] **Step 2: Create FEAT-072**

Create `docs/task/FEAT-072.md`:

```markdown
# FEAT-072 Host platform locator and capability shell boundary

- **status**: in_progress
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-13 20:00
- **plan**: PLAN-302
- **relatesTo**: FEAT-060, FEAT-061, FEAT-063, FEAT-066, FEAT-071, docs, packages/shared, packages/core, apps/api, apps/web, apps/aiworker-hr, apps/aiworker-qa

## 背景

Soul App 已经可以 standalone，也可以 Host mounted。Host 的职责必须收敛为平台定位、
能力 broker 和 shell contract，不能继续滑向 Soul App domain state owner。

## 目标

将 Host / Soul App 边界落成硬约束：Host 管 app lifecycle、identity/security、platform
capabilities、protocol discovery、permissioned invocation 和 shell rendering；Soul App
管 domain state、artifact/profile composition、review meaning、memory meaning、search
semantics 和 domain audit。

## 非目标

- 不接入真实 Logto。
- 不接入真实 S3/GCP provider。
- 不新增 marketplace、remote control plane、gateway 或 fleet。
- 不重做 HR/QA 业务功能。
- 不让 Host 直接读取 Soul App 内部 DB 或 app-local workspace。

## 验收标准

- 文档、skill、manifest/protocol schema、reference apps、API 和 Worker Web 都使用 Host
  platform locator / capability shell 语义。
- Host 只能消费 Soul App protocol-exposed views/actions/search/settings descriptors。
- Header actions 由 Soul App descriptor 声明，Host 只负责渲染 shell slot。
- Host 不把 artifact/review/memory/search 当作默认主数据；缓存必须标记为
  non-authoritative。
- HR/QA validate、smoke、focused tests、root gates 和 code-review-graph 通过。
```

- [ ] **Step 3: Create PLAN-302**

Create `docs/plan/PLAN-302.md`:

```markdown
# PLAN-302 Host platform locator and capability shell boundary

- **status**: in_progress
- **owner**: codex
- **createdAt**: 2026-05-13 20:00
- **relatedTask**: FEAT-072

## Current State

The current architecture has moved toward Host / Soul App dual autonomy, but parts of
runtime, API and Web still make artifact/review/memory feel Host-owned. The approved
design in `docs/superpowers/specs/2026-05-13-host-platform-locator-capability-shell-design.md`
defines Host as platform locator, capability broker and shell contract.

## Decision

Implement an explicit protocol-first boundary:

```text
Host platform capabilities -> permissioned protocol call -> Soul App domain result
```

Host may render or cache protocol-exposed views, but the Soul App remains authoritative
for domain state and domain meaning.

## Implementation Slices

1. Sync PMA, architecture docs and Soul App developer skill.
2. Add shared descriptor schemas for shell, protocol views, search and non-authoritative summaries.
3. Project descriptors into Host catalog without adding domain-specific semantics.
4. Render Worker Web shell slots from descriptors.
5. Update HR/QA reference apps and smoke tests.

## Verification Plan

- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `aiworker app validate apps/aiworker-hr`
- `aiworker app validate apps/aiworker-qa`
- `aiworker app smoke apps/aiworker-hr`
- `aiworker app smoke apps/aiworker-qa`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`
```

- [ ] **Step 4: Update indexes**

Append or update entries while preserving other in-progress work:

```markdown
- [-] [**FEAT-072 Host platform locator and capability shell boundary**](FEAT-072.md) `P0`
- [-] [**PLAN-302 Host platform locator and capability shell boundary**](PLAN-302.md) `2026-05-13`
```

Set headers to:

```markdown
> Updated: 2026-05-13 (FEAT-072 in progress)
> Updated: 2026-05-13 (PLAN-302 in progress)
```

- [ ] **Step 5: Sync contract docs**

Ensure the following exact rule appears in `docs/architecture.md`, `docs/soul-app-developer.md`, and `.agents/skills/aiworker-soul-app-dev/SKILL.md`:

```text
Soul App is the source of truth for domain state and domain meaning.
Host is the source of truth for platform capabilities, grants, protocol discovery and shell context.
Host may consume only protocol-exposed views/actions/search/settings descriptors, and must not infer Soul App domain meaning.
```

Run:

```bash
rg -n "Soul App is the source of truth for domain state and domain meaning|Host may consume only protocol-exposed" docs/architecture.md docs/soul-app-developer.md .agents/skills/aiworker-soul-app-dev/SKILL.md
git diff --check -- docs/task/FEAT-072.md docs/plan/PLAN-302.md docs/task/index.md docs/plan/index.md docs/architecture.md docs/soul-app-developer.md .agents/skills/aiworker-soul-app-dev/SKILL.md
```

Expected: rule appears in all three contract surfaces and diff check passes.

### Task 2: Shared Protocol Descriptors

**Files:**
- Modify: `packages/shared/src/soul-app/manifest.ts`
- Modify: `packages/shared/src/soul-app/protocol.ts`
- Modify: `packages/shared/src/soul-app/registry.ts`
- Modify: `packages/shared/src/soul-app/manifest.test.ts`
- Modify: `packages/shared/src/soul-app/registry.test.ts`

- [ ] **Step 1: Add failing manifest schema tests**

Add tests to `packages/shared/src/soul-app/manifest.test.ts`:

```ts
it('accepts app-declared shell toolbar and search descriptors', () => {
  const result = validateSoulAppManifest({
    ...hrSoulAppManifest,
    ui: {
      ...hrSoulAppManifest.ui,
      shell: {
        actions: [
          {
            id: 'refresh-profiles',
            label: 'Refresh',
            protocolAction: 'profiles.refresh',
            slot: 'action',
          },
        ],
        primaryAction: {
          id: 'create-people-profile',
          label: 'New people profile',
          protocolAction: 'profiles.create',
          slot: 'primary',
        },
        search: {
          id: 'people-profile-search',
          label: 'Search people profiles',
          protocolProvider: 'peopleProfiles.search',
          placeholder: 'Search people profiles',
        },
        settings: {
          id: 'hr-settings',
          label: 'HR settings',
          protocolAction: 'settings.open',
        },
      },
    },
  })

  expect(result.status).toBe('valid')
})

it('rejects shell descriptors without protocol actions', () => {
  const result = validateSoulAppManifest({
    ...hrSoulAppManifest,
    ui: {
      ...hrSoulAppManifest.ui,
      shell: {
        primaryAction: {
          id: 'create-people-profile',
          label: 'New people profile',
          slot: 'primary',
        },
      },
    },
  })

  expect(result.status).toBe('invalid')
  expect(result.issues.some(issue => issue.message.includes('protocolAction'))).toBe(true)
})
```

Run:

```bash
bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts
```

Expected before implementation: tests fail because `ui.shell` is not defined.

- [ ] **Step 2: Add shell descriptor schemas**

In `packages/shared/src/soul-app/manifest.ts`, add:

```ts
export const soulAppShellActionSlotSchema = zod.enum(['primary', 'action', 'drawer-toggle', 'refresh', 'settings'])
export type SoulAppShellActionSlot = z.infer<typeof soulAppShellActionSlotSchema>

export const soulAppShellActionSchema = zod.object({
  id: soulAppIdSchema,
  label: zod.string().min(1),
  protocolAction: zod.string().min(1),
  requiredPermissions: zod.array(zod.string().min(1)).readonly().optional(),
  slot: soulAppShellActionSlotSchema,
})
export type SoulAppShellAction = z.infer<typeof soulAppShellActionSchema>

export const soulAppShellSearchSchema = zod.object({
  id: soulAppIdSchema,
  label: zod.string().min(1),
  placeholder: zod.string().min(1),
  protocolProvider: zod.string().min(1),
  requiredPermissions: zod.array(zod.string().min(1)).readonly().optional(),
})
export type SoulAppShellSearch = z.infer<typeof soulAppShellSearchSchema>

export const soulAppShellSettingsSchema = zod.object({
  id: soulAppIdSchema,
  label: zod.string().min(1),
  protocolAction: zod.string().min(1),
  requiredPermissions: zod.array(zod.string().min(1)).readonly().optional(),
})
export type SoulAppShellSettings = z.infer<typeof soulAppShellSettingsSchema>

export const soulAppShellSchema = zod.object({
  actions: zod.array(soulAppShellActionSchema).readonly().optional(),
  primaryAction: soulAppShellActionSchema.optional(),
  search: soulAppShellSearchSchema.optional(),
  settings: soulAppShellSettingsSchema.optional(),
}).superRefine((shell, ctx) => {
  if (shell.primaryAction && shell.primaryAction.slot !== 'primary') {
    ctx.addIssue({
      code: zod.ZodIssueCode.custom,
      message: 'primaryAction slot must be primary',
      path: ['primaryAction', 'slot'],
    })
  }
})
export type SoulAppShell = z.infer<typeof soulAppShellSchema>
```

Extend `soulAppUiSchema`:

```ts
export const soulAppUiSchema = zod.object({
  artifactPreviews: zod.array(soulAppUiSlotSchema).readonly(),
  panels: zod.array(soulAppUiSlotSchema).readonly(),
  reviewPanels: zod.array(soulAppUiSlotSchema).readonly(),
  routes: zod.array(soulAppUiRouteSchema).readonly(),
  shell: soulAppShellSchema.optional(),
  workspaceWidgets: zod.array(soulAppUiSlotSchema).readonly().optional(),
})
```

- [ ] **Step 3: Add protocol view result types**

In `packages/shared/src/soul-app/protocol.ts`, add exported types:

```ts
export interface SoulAppProtocolAction {
  id: string
  input?: Record<string, unknown>
}

export interface SoulAppProtocolActionResult {
  message?: string
  ok: boolean
  redirectTo?: string
}

export interface SoulAppProtocolViewSummary {
  appId: string
  authority: 'soul-app'
  cache?: {
    cachedAt: string
    freshness: 'non-authoritative'
  }
  id: string
  kind: string
  openAction?: SoulAppProtocolAction
  permissionRequired?: string
  status?: string
  summary?: string
  title: string
  updatedAt?: string
}

export interface SoulAppSearchRequest {
  limit?: number
  query: string
}

export interface SoulAppSearchResult {
  items: readonly SoulAppProtocolViewSummary[]
  providerId: string
}
```

Extend `SoulAppProtocolHandlers` with optional protocol-facing methods:

```ts
  invokeAction?: (context: SoulAppScopedContext, action: SoulAppProtocolAction) => Promise<SoulAppProtocolActionResult>
  search?: (context: SoulAppScopedContext, request: SoulAppSearchRequest) => Promise<SoulAppSearchResult>
  views?: (context: SoulAppScopedContext, input: { kind?: string }) => Promise<readonly SoulAppProtocolViewSummary[]>
```

- [ ] **Step 4: Project shell descriptors into hosted app metadata**

In `packages/shared/src/soul-app/registry.ts`, add `shell` to the hosted mounted contribution model. The projection should copy `manifest.ui.shell ?? null` without interpretation:

```ts
shell: manifest.ui.shell ?? null,
```

Add or update `packages/shared/src/soul-app/registry.test.ts`:

```ts
it('projects shell descriptors as app-owned mounted contribution metadata', () => {
  const app = hostedSoulAppFromManifest({
    ...hrSoulAppManifest,
    ui: {
      ...hrSoulAppManifest.ui,
      shell: {
        primaryAction: {
          id: 'create-people-profile',
          label: 'New people profile',
          protocolAction: 'profiles.create',
          slot: 'primary',
        },
      },
    },
  })

  expect(app.mountedContribution.shell).toMatchObject({
    primaryAction: {
      id: 'create-people-profile',
      protocolAction: 'profiles.create',
      slot: 'primary',
    },
  })
})
```

Use the local registry helper name that exists in the file; if it is not exported, test through `mountedContributionForManifest`.

- [ ] **Step 5: Run shared gates**

Run:

```bash
bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts src/soul-app/registry.test.ts
bun run --filter '@zonease/aiworker-shared' typecheck
```

Expected: tests and typecheck pass.

### Task 3: Host API Guardrails And Protocol Views

**Files:**
- Modify: `apps/api/src/modes/worker.ts`
- Modify: `apps/api/src/modes/worker.local.test.ts`
- Modify: `packages/core/src/soul-app/broker.ts`
- Modify: `packages/core/src/soul-app/broker.test.ts`

- [ ] **Step 1: Add API tests proving Host consumes protocol descriptors only**

In `apps/api/src/modes/worker.local.test.ts`, add tests near mounted surface tests:

```ts
it('treats mounted descriptor surfaces as app-owned protocol views', async () => {
  const target = await createMountedAppTestTarget()
  const response = await target.request('/api/local/apps/aiworker-hr/surfaces/hr-home')
  expect(response.status).toBe(200)
  const body = await response.json() as Record<string, unknown>

  expect(body).toMatchObject({
    appId: 'aiworker-hr',
    authority: 'soul-app',
    renderer: 'host-descriptor',
    type: 'aiworker.surface.descriptor.v1',
  })
  expect(body).not.toHaveProperty('candidateRisk')
  expect(body).not.toHaveProperty('profileCompleteness')
})
```

Use the existing test target helper already present in this file. If the helper name differs, wire the assertion into the existing mounted app test that already calls `/api/local/apps/aiworker-hr/surfaces/hr-home`.

- [ ] **Step 2: Add broker tests for non-authoritative Host memory/review behavior**

In `packages/core/src/soul-app/broker.test.ts`, add:

```ts
it('records memory proposals as app-submitted candidates instead of Host-inferred memory', () => {
  const broker = createSoulAppBroker(validHrBrokerContext())
  const result = broker.memory.propose({
    evidenceJson: [{ source: 'hr-protocol-view', profileId: 'profile-1' }],
    sourceReviewId: 'review-1',
    statement: 'HR app proposes this lesson after domain review.',
    workspaceId: 'workspace-1',
  })

  expect('decision' in result).toBe(false)
  if ('decision' in result)
    return
  expect(result.evidenceJson).toContainEqual(expect.objectContaining({
    appId: 'aiworker-hr',
    namespace: 'aiworker-hr',
    source: 'soul-app-broker',
  }))
})
```

Use the existing fixture/setup names from the file. If there is no `validHrBrokerContext`, create a local helper that matches the existing test setup.

- [ ] **Step 3: Add descriptor response guard in API**

In `apps/api/src/modes/worker.ts`, ensure mounted descriptor responses are passed through as app-owned protocol payloads. When Host augments the response, use platform-only envelope fields:

```ts
return c.json({
  ...descriptor,
  appId,
  authority: 'soul-app',
  cache: {
    cachedAt: new Date().toISOString(),
    freshness: 'non-authoritative',
  },
})
```

Do not add fields that encode HR/QA domain semantics. Do not persist descriptor contents as Host authoritative state.

- [ ] **Step 4: Run focused API/core gates**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts
bun run --filter '@zonease/aiworker-api' typecheck
bun run --filter '@zonease/aiworker-core' typecheck
```

Expected: focused tests and typechecks pass.

### Task 4: HR/QA Reference Descriptors

**Files:**
- Modify: `apps/aiworker-hr/soul-app.manifest.json`
- Modify: `apps/aiworker-qa/soul-app.manifest.json`
- Modify: `apps/aiworker-hr/src/host-mounted.ts`
- Modify: `apps/aiworker-qa/src/host-mounted.ts`
- Modify: `apps/aiworker-hr/src/index.test.ts`
- Modify: `apps/aiworker-qa/src/index.test.ts`

- [ ] **Step 1: Add HR shell descriptor**

In `apps/aiworker-hr/soul-app.manifest.json`, under `ui`, add:

```json
"shell": {
  "actions": [
    {
      "id": "refresh-people",
      "label": "Refresh",
      "protocolAction": "people.refresh",
      "slot": "refresh"
    },
    {
      "id": "toggle-evidence-drawer",
      "label": "Evidence",
      "protocolAction": "drawers.evidence.toggle",
      "slot": "drawer-toggle"
    }
  ],
  "primaryAction": {
    "id": "create-people-profile",
    "label": "New people profile",
    "protocolAction": "peopleProfiles.create",
    "slot": "primary"
  },
  "search": {
    "id": "people-profile-search",
    "label": "Search people profiles",
    "placeholder": "Search people profiles",
    "protocolProvider": "peopleProfiles.search"
  },
  "settings": {
    "id": "hr-settings",
    "label": "HR settings",
    "protocolAction": "settings.open"
  }
}
```

- [ ] **Step 2: Add QA shell descriptor**

In `apps/aiworker-qa/soul-app.manifest.json`, under `ui`, add:

```json
"shell": {
  "actions": [
    {
      "id": "refresh-release",
      "label": "Refresh",
      "protocolAction": "release.refresh",
      "slot": "refresh"
    }
  ],
  "primaryAction": {
    "id": "create-release-gate",
    "label": "New release gate",
    "protocolAction": "releaseGates.create",
    "slot": "primary"
  },
  "search": {
    "id": "release-search",
    "label": "Search releases",
    "placeholder": "Search releases",
    "protocolProvider": "releases.search"
  },
  "settings": {
    "id": "qa-settings",
    "label": "QA settings",
    "protocolAction": "settings.open"
  }
}
```

- [ ] **Step 3: Mark descriptor surfaces as app-owned**

In both `host-mounted.ts` files, add these fields to descriptor responses:

```ts
authority: 'soul-app',
cache: {
  freshness: 'non-authoritative',
},
```

Keep existing domain-specific labels inside the app response; that is allowed because the app owns the descriptor.

- [ ] **Step 4: Add app tests**

In each app test file, assert manifest shell descriptors and descriptor authority:

```ts
expect(hrSoulAppManifest.ui.shell?.primaryAction?.protocolAction).toBe('peopleProfiles.create')
```

For QA:

```ts
expect(qaSoulAppManifest.ui.shell?.primaryAction?.protocolAction).toBe('releaseGates.create')
```

In mounted fetch assertions:

```ts
expect(await surfaceRes.json()).toMatchObject({
  authority: 'soul-app',
  cache: { freshness: 'non-authoritative' },
})
```

- [ ] **Step 5: Run app gates**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-qa' test
bun run --filter '@zonease/aiworker-hr' typecheck
bun run --filter '@zonease/aiworker-qa' typecheck
aiworker app validate apps/aiworker-hr
aiworker app validate apps/aiworker-qa
aiworker app smoke apps/aiworker-hr
aiworker app smoke apps/aiworker-qa
```

Expected: HR/QA app tests, typechecks, validate and smoke pass.

### Task 5: Worker Web Shell Slots

**Files:**
- Modify: `apps/web/src/features/local-workspace/api/types.ts`
- Modify: `apps/web/src/features/local-workspace/api/workspace-data.ts`
- Modify: `apps/web/src/worker/worker-studio.tsx`
- Modify: `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- Modify: `apps/web/src/features/i18n/types.ts`
- Modify: `apps/web/src/features/i18n/locales/en.ts`
- Modify: `apps/web/src/features/i18n/locales/zh-CN.ts`
- Modify: `apps/web/src/features/i18n/locales/ja.ts`
- Modify: `apps/web/src/features/i18n/locales/de.ts`

- [ ] **Step 1: Add Web types for shell descriptors**

In `apps/web/src/features/local-workspace/api/types.ts`, add:

```ts
export interface LocalSoulAppShellAction {
  id: string
  label: string
  protocolAction: string
  requiredPermissions?: string[]
  slot: 'primary' | 'action' | 'drawer-toggle' | 'refresh' | 'settings'
}

export interface LocalSoulAppShellSearch {
  id: string
  label: string
  placeholder: string
  protocolProvider: string
  requiredPermissions?: string[]
}

export interface LocalSoulAppShellDescriptor {
  actions?: LocalSoulAppShellAction[]
  primaryAction?: LocalSoulAppShellAction
  search?: LocalSoulAppShellSearch
  settings?: {
    id: string
    label: string
    protocolAction: string
    requiredPermissions?: string[]
  }
}
```

Extend the hosted app type with:

```ts
shell?: LocalSoulAppShellDescriptor | null
```

Use the actual hosted app interface name in that file.

- [ ] **Step 2: Render Host shell from app descriptor**

In `apps/web/src/worker/worker-studio.tsx`, locate the app/worker toolbar. Render descriptor slots when the selected app has a shell descriptor:

```tsx
{selectedApp?.mountedContribution.shell?.primaryAction ? (
  <button
    className="btn-primary"
    disabled
    title="Provided by the Soul App protocol"
    type="button"
  >
    {selectedApp.mountedContribution.shell.primaryAction.label}
  </button>
) : null}
```

Keep these buttons disabled in this plan because the current API does not yet expose a dedicated shell action invocation endpoint. Do not invent an `actions/...` surface path and do not implement HR/QA-specific click handlers in Worker Web. A follow-up plan may add a generic `POST /api/local/apps/:appId/actions/:actionId` protocol endpoint.

- [ ] **Step 3: Render app search placeholder without Host search semantics**

If `selectedApp.mountedContribution.shell.search` exists, use its placeholder in the shell search input. Do not filter Host records with HR-specific fields.

```tsx
const shellSearch = selectedApp?.mountedContribution.shell?.search
const searchPlaceholder = shellSearch?.placeholder ?? copy.worker.searchPlaceholder
```

- [ ] **Step 4: Add Worker Web test**

In `apps/web/src/worker/__tests__/worker-studio.test.tsx`, extend the mounted app fixture:

```ts
mountedContribution: {
  ...existingMountedContribution,
  shell: {
    primaryAction: {
      id: 'create-people-profile',
      label: 'New people profile',
      protocolAction: 'peopleProfiles.create',
      slot: 'primary',
    },
    search: {
      id: 'people-profile-search',
      label: 'Search people profiles',
      placeholder: 'Search people profiles',
      protocolProvider: 'peopleProfiles.search',
    },
  },
}
```

Add assertion:

```ts
expect(await screen.findByRole('button', { name: 'New people profile' })).toBeInTheDocument()
expect(screen.getByPlaceholderText('Search people profiles')).toBeInTheDocument()
```

- [ ] **Step 5: Run Web gates**

Run:

```bash
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-web' typecheck
bun run --filter '@zonease/aiworker-web' build
```

Expected: focused Worker Studio test, Web typecheck and build pass.

### Task 6: Closeout And Regression Gates

**Files:**
- Modify: `docs/task/FEAT-072.md`
- Modify: `docs/plan/PLAN-302.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
bun run --filter '@zonease/aiworker-shared' test src/soul-app/manifest.test.ts src/soul-app/registry.test.ts
bun run --filter '@zonease/aiworker-core' test src/soul-app/broker.test.ts
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-qa' test
bun run --filter '@zonease/aiworker-hr' typecheck
bun run --filter '@zonease/aiworker-qa' typecheck
aiworker app validate apps/aiworker-hr
aiworker app validate apps/aiworker-qa
aiworker app smoke apps/aiworker-hr
aiworker app smoke apps/aiworker-qa
bun run typecheck
bun run lint
bun run test
bun run build
git diff --check
bun run crg:update
bun run crg:review
```

Expected: all commands pass. If `aiworker` is not available on PATH, run the equivalent local CLI command used by this repo and record the exact fallback.

- [ ] **Step 2: Close PMA records**

Mark `docs/task/FEAT-072.md` and `docs/plan/PLAN-302.md` as completed. Append verification records with the exact commands that passed. Mark index entries `[x]` and set headers:

```markdown
> Updated: 2026-05-13 (FEAT-072 completed)
> Updated: 2026-05-13 (PLAN-302 completed)
```

- [ ] **Step 3: Add changelog entry**

Add after `# AIWorker Changelog`:

```markdown
## 2026-05-13 20:00 [completed] FEAT-072 / PLAN-302 — Host platform locator and capability shell boundary

Converged Host toward a platform locator, capability broker and shell contract while keeping Soul Apps authoritative for domain state.

- Added shell/action/search descriptors to the Soul App protocol and manifest contract.
- Projected app-declared shell descriptors through Host catalog without adding domain semantics.
- Kept HR/QA people profile and release gate meaning inside their apps while exposing only protocol-owned descriptor views to Host.
- Rendered Worker Web shell slots from app descriptors instead of Host-owned HR/QA actions.
- Recorded Host metadata as platform grant/cache/shell state, not authoritative app domain state.

Verification passed: shared/core/API/Web/HR/QA focused tests and typechecks, HR/QA app validate and smoke, root typecheck/lint/test/build, git diff check and code-review-graph.
```

- [ ] **Step 4: Final status and commit**

Run:

```bash
git status --short --untracked-files=all
git diff --stat
```

Expected: only files in this plan plus any pre-existing unrelated dirty files remain. Stage only this plan's files and commit:

```bash
git add \
  docs/task/FEAT-072.md \
  docs/plan/PLAN-302.md \
  docs/task/index.md \
  docs/plan/index.md \
  docs/changelog.md \
  docs/architecture.md \
  docs/soul-app-developer.md \
  .agents/skills/aiworker-soul-app-dev/SKILL.md \
  packages/shared/src/soul-app/manifest.ts \
  packages/shared/src/soul-app/protocol.ts \
  packages/shared/src/soul-app/registry.ts \
  packages/shared/src/soul-app/manifest.test.ts \
  packages/shared/src/soul-app/registry.test.ts \
  packages/core/src/soul-app/broker.ts \
  packages/core/src/soul-app/broker.test.ts \
  apps/api/src/modes/worker.ts \
  apps/api/src/modes/worker.local.test.ts \
  apps/aiworker-hr/soul-app.manifest.json \
  apps/aiworker-hr/src/host-mounted.ts \
  apps/aiworker-hr/src/index.test.ts \
  apps/aiworker-qa/soul-app.manifest.json \
  apps/aiworker-qa/src/host-mounted.ts \
  apps/aiworker-qa/src/index.test.ts \
  apps/web/src/features/local-workspace/api/types.ts \
  apps/web/src/features/local-workspace/api/workspace-data.ts \
  apps/web/src/worker/worker-studio.tsx \
  apps/web/src/worker/__tests__/worker-studio.test.tsx \
  apps/web/src/features/i18n/types.ts \
  apps/web/src/features/i18n/locales/en.ts \
  apps/web/src/features/i18n/locales/zh-CN.ts \
  apps/web/src/features/i18n/locales/ja.ts \
  apps/web/src/features/i18n/locales/de.ts \
  docs/superpowers/plans/2026-05-13-host-platform-locator-capability-shell.md
git commit -m "feat: 收敛 Host 平台定位与能力边界"
```

Expected: commit succeeds and excludes unrelated dirty files.
