# HR Three Column Interactive Micro-App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the mature HR three-column workbench as an app-owned interactive mounted micro-app under `apps/aiworker-hr`.

**Architecture:** `apps/aiworker-hr` owns the interactive React client, profile lifecycle grouping, Reading Room, profile composer, candidate material upload, session submission and patch-review state. Host Web remains only the mounted container and public local API router; no HR renderer is restored under `apps/web/src/worker/souls/hr`.

**Tech Stack:** Bun workspaces, React 19, TypeScript, `@zonease/aiworker-ui` shadcn primitives, hugeicons, HR Soul App mounted local service, Host public local API, Bun tests.

---

## File Structure

- Create `docs/task/FEAT-107.md`: PMA task for this product slice.
- Create `docs/plan/PLAN-390.md`: PMA execution plan linked to FEAT-107.
- Modify `docs/task/index.md`, `docs/plan/index.md`, `docs/changelog.md`: PMA and audit trail.
- Modify `apps/aiworker-hr/package.json`: add HR client build script and direct icon dependencies.
- Modify `apps/aiworker-hr/host-adapter/web-style.ts`: serve built CSS and built client assets.
- Modify `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`: render mounted root with host-data seed and client script.
- Modify `apps/aiworker-hr/host-adapter/standalone/standalone.ts`: render standalone root with client script fallback.
- Modify `apps/aiworker-hr/host-adapter/index.test.ts`: prove mounted HTML includes the interactive client and asset route.
- Create `apps/aiworker-hr/product/web/people-workbench/host-data.ts`: normalize micro-app host data and query fallback.
- Create `apps/aiworker-hr/product/web/people-workbench/api.ts`: app-owned Host public API helpers.
- Create `apps/aiworker-hr/product/web/people-workbench/attachments.ts`: file attachment conversion, dedupe and session material metadata.
- Create `apps/aiworker-hr/product/web/people-workbench/api.test.ts`: API helper and attachment tests.
- Modify `apps/aiworker-hr/product/web/people-workbench/types.ts`: shared app state, template, host-data and attachment types.
- Modify `apps/aiworker-hr/product/web/people-workbench/copy.ts`: HR labels for lifecycle groups and composer.
- Modify `apps/aiworker-hr/product/web/people-workbench/model.ts`: always return the three lifecycle sections.
- Modify `apps/aiworker-hr/product/web/people-workbench/model.test.ts`: prove lifecycle sections stay visible.
- Create `apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx`: left column.
- Create `apps/aiworker-hr/product/web/people-workbench/columns/profile-reading-room-column.tsx`: center column.
- Create `apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx`: right column.
- Create `apps/aiworker-hr/product/web/people-workbench/profile-composer.tsx`: HR-local composer using `@zonease/aiworker-ui`.
- Create `apps/aiworker-hr/product/web/people-workbench/app.tsx`: interactive HR app shell and state orchestration.
- Create `apps/aiworker-hr/product/web/people-workbench/client-entry.tsx`: browser entry mounted into the micro-app root.
- Modify `apps/aiworker-hr/product/web/people-workbench/surface.tsx`: keep an SSR shell that matches the interactive layout.
- Modify `apps/aiworker-hr/product/web/people-workbench/index.ts`: export new shell, helpers and app entry as needed.
- Modify `apps/aiworker-hr/product/web/component-proof.test.tsx`: replace proof-level expectations with three-column app-owned expectations.
- Modify `apps/aiworker-hr/product/web/styles.css`: include app-local sources and responsive layout if Tailwind needs explicit sources.
- Modify `apps/web/scripts/smoke-mounted-surfaces.ts`: assert the mounted HR route exposes the new three-column visible content.

## Task 1: PMA Registration

**Files:**
- Create: `docs/task/FEAT-107.md`
- Create: `docs/plan/PLAN-390.md`
- Modify: `docs/task/index.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Write FEAT-107**

Create `docs/task/FEAT-107.md`:

```markdown
# FEAT-107 HR three-column interactive micro-app

- **status**: in-progress
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-20
- **relatedPlan**: PLAN-390
- **spec**: docs/superpowers/specs/2026-05-20-hr-three-column-interactive-micro-app-design.md

## Problem

The mature HR profile workbench had three default desktop columns:
Profile List, Reading Room, and Recent Sessions plus Composer. The current
app-owned mounted HR route preserves profile-first proof content but does not
restore the full interactive right-column composer flow inside the HR Soul App.

## Outcome

`apps/aiworker-hr` owns an interactive mounted micro-app that restores the
three-column desktop HR workbench, fixed lifecycle profile groups, profile
composer, multi-file candidate material upload, profile proposal session
submission and center-column patch review.

## Acceptance

- HR mounted route defaults to three visible columns on desktop.
- Profile List shows `候选人`, `在职员工`, and `离职归档` expanded by default.
- Right column shows Recent Sessions above a working profile composer.
- Composer defaults to `候选人档案草案` / `profile-update-proposal`.
- Candidate material files are written under `evidence/uploads/` and referenced in session context and metadata.
- Patch review and approval remain center-column actions.
- Host Web does not reintroduce `apps/web/src/worker/souls/hr`.
```

- [ ] **Step 2: Write PLAN-390**

Create `docs/plan/PLAN-390.md`:

```markdown
# PLAN-390 HR three-column interactive micro-app

- **status**: in-progress
- **owner**: codex
- **createdAt**: 2026-05-20
- **approvedAt**: 2026-05-20
- **relatedTask**: FEAT-107
- **spec**: docs/superpowers/specs/2026-05-20-hr-three-column-interactive-micro-app-design.md
- **implementationPlan**: docs/superpowers/plans/2026-05-20-hr-three-column-interactive-micro-app.md

## Current State

The HR Soul App product web owns `product/web/people-workbench`, profile README
parsing and revision-review helpers, but the mounted route is still primarily a
static proof surface. The right column is not the full old Recent Sessions plus
profile composer flow.

## Proposal

Add an app-owned interactive HR client entry, local Host API helpers, fixed
profile lifecycle sections, three visible desktop columns, and a right-column
profile composer that can upload candidate material files and submit
`profile-update-proposal` sessions. Keep review and approval in the center
Reading Room / Profile Patch Review path.

## Verification

- [ ] `bun run --filter '@zonease/aiworker-hr' test`
- [ ] `bun run --filter '@zonease/aiworker-hr' typecheck`
- [ ] `bun run --filter '@zonease/aiworker-hr' validate`
- [ ] `bun run --filter '@zonease/aiworker-hr' smoke`
- [ ] `bun apps/web/scripts/smoke-mounted-surfaces.ts`
- [ ] `bun run ui:check`
- [ ] Browser screenshot review for desktop and narrow HR mounted route
- [ ] `git diff --check`
- [ ] `bun run crg:update`
- [ ] `bun run crg:review`
```

- [ ] **Step 3: Update PMA indices**

Append to `docs/task/index.md`:

```markdown
- [ ] [**FEAT-107 HR three-column interactive micro-app**](FEAT-107.md) `P0`
```

Append to `docs/plan/index.md`:

```markdown
- [ ] [**PLAN-390 HR three-column interactive micro-app**](PLAN-390.md) `2026-05-20`
```

- [ ] **Step 4: Add changelog progress entry**

Append near the current 2026-05-20 entries in `docs/changelog.md`:

```markdown
## 2026-05-20 [progress] FEAT-107 / PLAN-390 - HR three-column interactive micro-app

Started restoring the mature HR profile workbench as an app-owned interactive
micro-app. The target default desktop layout is Profile List, Reading Room and
Recent Sessions plus Composer, with lifecycle groups `候选人`, `在职员工` and
`离职归档` visible by default.
```

- [ ] **Step 5: Commit PMA registration**

Run:

```bash
git add docs/task/FEAT-107.md docs/plan/PLAN-390.md docs/task/index.md docs/plan/index.md docs/changelog.md
git commit -m "docs: 登记 HR 三列 interactive micro-app"
```

Expected: commit succeeds with only PMA docs and changelog staged.

## Task 2: Interactive Asset Runtime

**Files:**
- Modify: `apps/aiworker-hr/package.json`
- Modify: `apps/aiworker-hr/host-adapter/web-style.ts`
- Modify: `apps/aiworker-hr/host-adapter/index.test.ts`

- [ ] **Step 1: Write failing mounted asset test**

In `apps/aiworker-hr/host-adapter/index.test.ts`, extend the mounted route test after the stylesheet assertions:

```ts
const clientRes = await fetch(`${baseUrl}/assets/hr-home-client.js`, {
  headers: { 'x-aiworker-mount-token': 'test-hr-mounted-token' },
})
expect([200, 503]).toContain(clientRes.status)
if (clientRes.status === 503)
  expect(await clientRes.text()).toContain('Soul App client asset has not been built')
else
  expect(clientRes.headers.get('content-type')).toContain('text/javascript')
```

- [ ] **Step 2: Run failing test**

Run:

```bash
bun test apps/aiworker-hr/host-adapter/index.test.ts
```

Expected: FAIL because the `/assets/hr-home-client.js` route does not exist yet.

- [ ] **Step 3: Add build scripts and dependencies**

Modify `apps/aiworker-hr/package.json` scripts and dependencies:

```json
{
  "scripts": {
    "build": "bun run build:styles && bun run build:client && bun build host-adapter/index.ts host-adapter/standalone/standalone.ts host-adapter/mounted/host-mounted.ts --outdir dist --target bun",
    "build:client": "bun build product/web/people-workbench/client-entry.tsx --outfile dist/web/hr-home-client.js --target browser --format esm --minify",
    "build:styles": "bunx --bun @tailwindcss/cli -i product/web/styles.css -o dist/web/styles.css --minify",
    "dev": "bun run build:styles && bun run build:client && bun host-adapter/standalone/standalone.ts --serve",
    "serve": "bun run build:styles && bun run build:client && bun host-adapter/mounted/host-mounted.ts",
    "smoke": "bun run build:styles && bun run build:client && bun ../../apps/cli/src/aiworker.ts app smoke .",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "validate": "bun ../../apps/cli/src/aiworker.ts app validate ."
  },
  "dependencies": {
    "@hugeicons/core-free-icons": "^4.1.4",
    "@hugeicons/react": "^1.1.6",
    "@zonease/aiworker-soul-app-sdk": "workspace:*",
    "@zonease/aiworker-ui": "workspace:*",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  }
}
```

- [ ] **Step 4: Serve client assets**

Modify `apps/aiworker-hr/host-adapter/web-style.ts`:

```ts
const soulAppStyleHref = '/styles.css'
const soulAppStylePath = new URL('../dist/web/styles.css', import.meta.url)
const soulAppAssetPathPrefix = '/assets/'
const soulAppClientAssets = new Map([
  ['hr-home-client.js', {
    contentType: 'text/javascript; charset=utf-8',
    path: new URL('../dist/web/hr-home-client.js', import.meta.url),
  }],
])

export function renderSoulAppClientScript(href: string): string {
  return `<script type="module" src="${escapeHtmlAttribute(href)}"></script>`
}

export async function serveSoulAppWebAsset(url: URL): Promise<Response | null> {
  const styleResponse = await serveSoulAppStyle(url)
  if (styleResponse)
    return styleResponse

  if (!url.pathname.startsWith(soulAppAssetPathPrefix))
    return null

  const assetName = url.pathname.slice(soulAppAssetPathPrefix.length)
  const asset = soulAppClientAssets.get(assetName)
  if (!asset)
    return null

  const file = Bun.file(asset.path)
  if (!(await file.exists())) {
    return new Response('Soul App client asset has not been built. Run bun run build:client.', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      status: 503,
    })
  }

  return new Response(file, {
    headers: {
      'cache-control': 'no-store',
      'content-type': asset.contentType,
    },
  })
}
```

Keep `serveSoulAppStyle`, `renderSoulAppStyleLink`, font serving and
`escapeHtmlAttribute` in the same file.

- [ ] **Step 5: Run test to verify asset route behavior**

Run:

```bash
bun test apps/aiworker-hr/host-adapter/index.test.ts
```

Expected: PASS. `/assets/hr-home-client.js` returns `503` before `build:client` has produced the bundle, or `200` with JavaScript content when a local bundle already exists.

- [ ] **Step 6: Commit runtime asset setup**

Run:

```bash
git add apps/aiworker-hr/package.json apps/aiworker-hr/host-adapter/web-style.ts apps/aiworker-hr/host-adapter/index.test.ts
git commit -m "feat: 接入 HR micro-app client asset"
```

Expected: commit succeeds after the focused test passes.

## Task 3: HR App API Helpers And Attachments

**Files:**
- Create: `apps/aiworker-hr/product/web/people-workbench/host-data.ts`
- Create: `apps/aiworker-hr/product/web/people-workbench/api.ts`
- Create: `apps/aiworker-hr/product/web/people-workbench/attachments.ts`
- Create: `apps/aiworker-hr/product/web/people-workbench/api.test.ts`
- Modify: `apps/aiworker-hr/product/web/people-workbench/types.ts`

- [ ] **Step 1: Add failing helper tests**

Create `apps/aiworker-hr/product/web/people-workbench/api.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'

import { buildCandidateMaterialContext, candidateMaterialPath, createComposerMaterial, materialMetadata } from './attachments'
import { normalizeHrMicroAppHostData } from './host-data'

describe('HR people workbench client helpers', () => {
  it('normalizes mounted host data with query fallback', () => {
    const data = normalizeHrMicroAppHostData({
      routePrefix: '/api/local/apps/aiworker-hr',
      theme: 'dark',
      workerId: 'worker-hr',
      workspaceId: 'workspace-stella',
    }, new URL('http://localhost/micro-app/routes/hr-home?workerId=query-worker&workspaceId=query-workspace&theme=light'))

    expect(data).toEqual({
      appId: 'aiworker-hr',
      routePrefix: '/api/local/apps/aiworker-hr',
      theme: 'dark',
      workerId: 'worker-hr',
      workspaceId: 'workspace-stella',
    })
  })

  it('builds candidate material context and metadata', async () => {
    const file = new File(['hello'], 'Stella Resume.md', { type: 'text/markdown' })
    const material = await createComposerMaterial(file)
    const path = candidateMaterialPath(material)

    expect(path).toBe('evidence/uploads/Stella-Resume.md')
    expect(material.encoding).toBe('utf8')
    expect(material.content).toBe('hello')
    expect(buildCandidateMaterialContext([{ ...material, path }])).toContain('Attached candidate material:')
    expect(materialMetadata([{ ...material, path }])).toEqual({
      attachedMaterials: [{
        mimeType: 'text/markdown',
        name: 'Stella Resume.md',
        path: 'evidence/uploads/Stella-Resume.md',
        size: 5,
      }],
      materialCount: 1,
    })
  })
})
```

- [ ] **Step 2: Run failing helper tests**

Run:

```bash
bun test apps/aiworker-hr/product/web/people-workbench/api.test.ts
```

Expected: FAIL because the helper modules do not exist.

- [ ] **Step 3: Extend shared types**

Modify `apps/aiworker-hr/product/web/people-workbench/types.ts`:

```ts
export interface HrMicroAppHostData {
  appId: string
  routePrefix: string
  theme: 'dark' | 'light'
  workerId: string | null
  workspaceId: string | null
}

export interface HrCapabilityTemplate {
  id: string
  name: string
  outputKind: string
}

export interface HrComposerMaterial {
  content: string
  encoding: 'base64' | 'utf8'
  mimeType: string
  name: string
  size: number
}

export interface HrUploadedMaterial extends HrComposerMaterial {
  path: string
}
```

- [ ] **Step 4: Implement host-data helper**

Create `apps/aiworker-hr/product/web/people-workbench/host-data.ts`:

```ts
import type { HrMicroAppHostData } from './types'

const DEFAULT_APP_ID = 'aiworker-hr'

export function normalizeHrMicroAppHostData(input: unknown, url = new URL(globalThis.location?.href ?? 'http://localhost/')): HrMicroAppHostData {
  const value = isRecord(input) ? input : {}
  return {
    appId: stringValue(value.appId) ?? DEFAULT_APP_ID,
    routePrefix: normalizeRoutePrefix(stringValue(value.routePrefix)),
    theme: themeValue(value.theme) ?? themeValue(url.searchParams.get('theme')) ?? 'light',
    workerId: stringValue(value.workerId) ?? url.searchParams.get('workerId'),
    workspaceId: stringValue(value.workspaceId) ?? url.searchParams.get('workspaceId'),
  }
}

export function readSeededHostData(documentRef: Pick<Document, 'getElementById'> = document): unknown {
  const element = documentRef.getElementById('aiworker-micro-app-host-data')
  if (!element?.textContent?.trim())
    return {}
  try {
    return JSON.parse(element.textContent)
  }
  catch {
    return {}
  }
}

function normalizeRoutePrefix(value: string | null): string {
  return value && value.startsWith('/') ? value.replace(/\/$/, '') : `/api/local/apps/${DEFAULT_APP_ID}`
}

function themeValue(value: unknown): 'dark' | 'light' | null {
  return value === 'dark' || value === 'light' ? value : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
```

- [ ] **Step 5: Implement attachment helpers**

Create `apps/aiworker-hr/product/web/people-workbench/attachments.ts`:

```ts
import type { HrComposerMaterial, HrUploadedMaterial } from './types'

export async function createComposerMaterial(file: File): Promise<HrComposerMaterial> {
  if (isUtf8Text(file)) {
    return {
      content: await file.text(),
      encoding: 'utf8',
      mimeType: file.type || 'text/plain',
      name: file.name,
      size: file.size,
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  return {
    content: bytesToBase64(bytes),
    encoding: 'base64',
    mimeType: file.type || 'application/octet-stream',
    name: file.name,
    size: file.size,
  }
}

export function candidateMaterialPath(material: Pick<HrComposerMaterial, 'name'>): string {
  const safeName = material.name
    .trim()
    .replace(/[^\w. -]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `evidence/uploads/${safeName || 'candidate-material.txt'}`
}

export function buildCandidateMaterialContext(materials: HrUploadedMaterial[]): string {
  if (materials.length === 0)
    return ''
  return [
    'Attached candidate material:',
    ...materials.map(material => `- ${material.path} (${material.name}, ${material.mimeType}, ${material.size} bytes)`),
  ].join('\n')
}

export function materialMetadata(materials: HrUploadedMaterial[]) {
  return {
    attachedMaterials: materials.map(material => ({
      mimeType: material.mimeType,
      name: material.name,
      path: material.path,
      size: material.size,
    })),
    materialCount: materials.length,
  }
}

export function attachmentFileKey(file: Pick<File, 'name' | 'size' | 'type'>): string {
  return `${file.name}:${file.size}:${file.type}`
}

function isUtf8Text(file: File): boolean {
  return file.type.startsWith('text/') || /\.(csv|md|txt|json)$/i.test(file.name)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return btoa(binary)
}
```

- [ ] **Step 6: Implement API helper**

Create `apps/aiworker-hr/product/web/people-workbench/api.ts`:

```ts
import type { HrMicroAppHostData, HrUploadedMaterial, LocalArtifact, LocalLesson, LocalReview, LocalSession, LocalWorkspace } from './types'

export interface HrWorkbenchSnapshot {
  artifacts: LocalArtifact[]
  lessons: LocalLesson[]
  reviews: LocalReview[]
  sessions: LocalSession[]
  workspaces: LocalWorkspace[]
}

export interface HrSessionInput {
  capabilityTemplateId: string
  context: string
  input: string
  metadata: Record<string, unknown>
  title: string
}

export class HrLocalApiClient {
  constructor(
    private readonly hostData: HrMicroAppHostData,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async loadSnapshot(): Promise<HrWorkbenchSnapshot> {
    const [workspaces, sessions, artifacts, reviews, lessons] = await Promise.all([
      this.getJson<{ workspaces: LocalWorkspace[] }>('/api/local/workspaces'),
      this.hostData.workspaceId
        ? this.getJson<{ sessions: LocalSession[] }(`/api/local/workspaces/${this.hostData.workspaceId}/sessions`)
        : Promise.resolve({ sessions: [] }),
      this.hostData.workspaceId
        ? this.getJson<{ artifacts: LocalArtifact[] }(`/api/local/workspaces/${this.hostData.workspaceId}/artifacts`)
        : Promise.resolve({ artifacts: [] }),
      this.getJson<{ reviews: LocalReview[] }>('/api/local/reviews'),
      this.getJson<{ lessons: LocalLesson[] }>('/api/local/lessons'),
    ])

    return {
      artifacts: artifacts.artifacts,
      lessons: lessons.lessons,
      reviews: reviews.reviews,
      sessions: sessions.sessions,
      workspaces: workspaces.workspaces,
    }
  }

  async readProfile(workspaceId: string): Promise<string> {
    return await this.getText(`/api/local/workspaces/${workspaceId}/profile`)
  }

  async writeMaterial(workspaceId: string, material: HrUploadedMaterial): Promise<void> {
    await this.putText(`/api/local/workspaces/${workspaceId}/files/raw/${encodePath(material.path)}`, material.content)
  }

  async createSession(workspaceId: string, input: HrSessionInput): Promise<void> {
    await this.postJson(`/api/local/workspaces/${workspaceId}/sessions`, input)
  }

  async promoteProfileRevision(workspaceId: string, body: Record<string, unknown>): Promise<void> {
    await this.postJson(`/api/local/workspaces/${workspaceId}/profile-revisions`, body)
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetcher(path)
    if (!response.ok)
      throw new Error(`Local API ${response.status}: ${path}`)
    return await response.json() as T
  }

  private async getText(path: string): Promise<string> {
    const response = await this.fetcher(path)
    if (!response.ok)
      throw new Error(`Local API ${response.status}: ${path}`)
    return await response.text()
  }

  private async postJson(path: string, body: unknown): Promise<void> {
    const response = await this.fetcher(path, {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    if (!response.ok)
      throw new Error(`Local API ${response.status}: ${path}`)
  }

  private async putText(path: string, body: string): Promise<void> {
    const response = await this.fetcher(path, { body, method: 'PUT' })
    if (!response.ok)
      throw new Error(`Local API ${response.status}: ${path}`)
  }
}

function encodePath(path: string): string {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/')
}
```

- [ ] **Step 7: Run helper tests**

Run:

```bash
bun test apps/aiworker-hr/product/web/people-workbench/api.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit helpers**

Run:

```bash
git add apps/aiworker-hr/product/web/people-workbench/host-data.ts apps/aiworker-hr/product/web/people-workbench/api.ts apps/aiworker-hr/product/web/people-workbench/attachments.ts apps/aiworker-hr/product/web/people-workbench/api.test.ts apps/aiworker-hr/product/web/people-workbench/types.ts
git commit -m "feat: 增加 HR micro-app 数据 helper"
```

Expected: commit succeeds.

## Task 4: Lifecycle Profile List Groups

**Files:**
- Modify: `apps/aiworker-hr/product/web/people-workbench/copy.ts`
- Modify: `apps/aiworker-hr/product/web/people-workbench/model.ts`
- Modify: `apps/aiworker-hr/product/web/people-workbench/model.test.ts`

- [ ] **Step 1: Add failing lifecycle section test**

Append to `apps/aiworker-hr/product/web/people-workbench/model.test.ts`:

```ts
it('keeps the three HR lifecycle groups visible even when groups are empty', () => {
  const sections = buildProfileListSections(
    buildPersonProfiles(
      [workspace({ id: 'candidate', name: 'Candidate intake' })],
      [],
      [],
      [],
      [],
      getHrPeopleWorkbenchCopy('zh-CN'),
      'zh-CN',
    ),
    getHrPeopleWorkbenchCopy('zh-CN'),
  )

  expect(sections.map(section => [section.id, section.label, section.profiles.length])).toEqual([
    ['candidate', '候选人', 1],
    ['employee', '在职员工', 0],
    ['alumni', '离职归档', 0],
  ])
})
```

- [ ] **Step 2: Run failing model test**

Run:

```bash
bun test apps/aiworker-hr/product/web/people-workbench/model.test.ts
```

Expected: FAIL because current zh labels and empty section behavior do not match.

- [ ] **Step 3: Update zh lifecycle labels**

Modify `zhHrCopy.lifecycleFilters` and `zhHrCopy.lifecycleLabels` in `copy.ts`:

```ts
lifecycleFilters: {
  all: '全部人员',
  alumni: '离职归档',
  attention: '需要关注',
  candidate: '候选人',
  employee: '在职员工',
},
lifecycleLabels: {
  alumni: '离职归档',
  candidate: '候选人',
  employee: '在职员工',
},
```

- [ ] **Step 4: Ensure fixed section output**

Modify `buildProfileListSections` in `model.ts`:

```ts
export function buildProfileListSections(profiles: PersonProfile[], labels: HrWorkbenchCopy): ProfileListSection[] {
  return [
    {
      id: 'candidate',
      label: labels.lifecycleFilters.candidate,
      profiles: profiles.filter(profile => profile.lifecycle === 'candidate'),
    },
    {
      id: 'employee',
      label: labels.lifecycleFilters.employee,
      profiles: profiles.filter(profile => profile.lifecycle === 'employee'),
    },
    {
      id: 'alumni',
      label: labels.lifecycleFilters.alumni,
      profiles: profiles.filter(profile => profile.lifecycle === 'alumni'),
    },
  ]
}
```

- [ ] **Step 5: Run model tests**

Run:

```bash
bun test apps/aiworker-hr/product/web/people-workbench/model.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit lifecycle groups**

Run:

```bash
git add apps/aiworker-hr/product/web/people-workbench/copy.ts apps/aiworker-hr/product/web/people-workbench/model.ts apps/aiworker-hr/product/web/people-workbench/model.test.ts
git commit -m "feat: 固定 HR profile lifecycle 分组"
```

Expected: commit succeeds.

## Task 5: Three Column Presentational Surface

**Files:**
- Create: `apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx`
- Create: `apps/aiworker-hr/product/web/people-workbench/columns/profile-reading-room-column.tsx`
- Create: `apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx`
- Modify: `apps/aiworker-hr/product/web/people-workbench/surface.tsx`
- Modify: `apps/aiworker-hr/product/web/component-proof.test.tsx`

- [ ] **Step 1: Add failing render test for three columns**

In `apps/aiworker-hr/product/web/component-proof.test.tsx`, add:

```ts
it('renders the restored HR three-column workbench by default', () => {
  const html = renderToStaticMarkup(<HrHomeRouteSurface locale="zh-CN" />)

  expect(html).toContain('data-slot="hr-profile-list-column"')
  expect(html).toContain('data-slot="hr-reading-room-column"')
  expect(html).toContain('data-slot="hr-profile-composer-column"')
  expect(html).toContain('候选人')
  expect(html).toContain('在职员工')
  expect(html).toContain('离职归档')
  expect(html).toContain('Recent Sessions')
  expect(html).toContain('候选人档案草案')
  expect(html).not.toContain('xl:grid-cols-4')
})
```

- [ ] **Step 2: Run failing render test**

Run:

```bash
bun test apps/aiworker-hr/product/web/component-proof.test.tsx
```

Expected: FAIL because the current route does not expose all three named columns by default.

- [ ] **Step 3: Create profile list column**

Create `apps/aiworker-hr/product/web/people-workbench/columns/profile-list-column.tsx`:

```tsx
import type { HrRouteProfile } from '../surface'
import type { ProfileListSection } from '../types'

import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@zonease/aiworker-ui/components/card'
import { Input } from '@zonease/aiworker-ui/components/input'
import { ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'

import { getHrPeopleWorkbenchCopy } from '../copy'

export function ProfileListColumn({
  activeProfileId,
  labels,
  onProfileQueryChange,
  onSelectProfile,
  profileQuery,
  routeProfilesBySection,
  showProfileFilter,
  visibleCount,
}: {
  activeProfileId: string
  labels: ReturnType<typeof getHrPeopleWorkbenchCopy>
  onProfileQueryChange: (value: string) => void
  onSelectProfile: (profile: HrRouteProfile) => void
  profileQuery: string
  routeProfilesBySection: Array<ProfileListSection & { routeProfiles: HrRouteProfile[] }>
  showProfileFilter: boolean
  visibleCount: number
}) {
  return (
    <Card data-slot="hr-profile-list-column" size="sm" className="h-full min-h-0">
      <CardHeader>
        <ItemContent className="min-w-0">
          <CardTitle>{labels.profileBoardTitle}</CardTitle>
          <CardDescription>{labels.profileBoardDetail(visibleCount)}</CardDescription>
        </ItemContent>
        <CardAction>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={labels.newProfile}>+</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {showProfileFilter
          ? (
              <Input
                aria-label={labels.profileListFilterLabel}
                value={profileQuery}
                placeholder={labels.profileListFilterPlaceholder}
                onChange={event => onProfileQueryChange(event.currentTarget.value)}
              />
            )
          : null}
        <ItemGroup className="min-h-0 gap-3 overflow-y-auto">
          {routeProfilesBySection.map(section => (
            <ItemGroup key={section.id} className="gap-2">
              <ItemActions className="min-w-0 justify-between gap-2">
                <ItemTitle className="max-w-full">{section.label}</ItemTitle>
                <Badge variant="secondary">{section.routeProfiles.length}</Badge>
              </ItemActions>
              {section.routeProfiles.length > 0
                ? section.routeProfiles.map(profile => (
                    <Button
                      key={profile.id}
                      type="button"
                      aria-label={labels.openProfile(profile.name)}
                      variant={profile.id === activeProfileId ? 'secondary' : 'ghost'}
                      size="lg"
                      className="h-auto w-full justify-start px-3 py-2 whitespace-normal"
                      onClick={() => onSelectProfile(profile)}
                    >
                      <ItemContent className="min-w-0 gap-1">
                        <ItemActions className="min-w-0 justify-between gap-2">
                          <ItemTitle className="max-w-full">{profile.name}</ItemTitle>
                          <Badge variant="outline">{profile.stage}</Badge>
                        </ItemActions>
                        <ItemDescription className="max-w-full">{profile.summary}</ItemDescription>
                      </ItemContent>
                    </Button>
                  ))
                : <ItemDescription>{labels.noProfilesInSection}</ItemDescription>}
            </ItemGroup>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Create reading room column**

Create `apps/aiworker-hr/product/web/people-workbench/columns/profile-reading-room-column.tsx` by moving the existing center `Card` content from `surface.tsx` into a component named `ProfileReadingRoomColumn`. Keep these exact data slots in the returned card:

```tsx
<Card data-slot="hr-reading-room-column" size="sm" className="h-full min-h-0">
```

Keep existing `ProfilePatchStrip`, `ProfilePatchReviewPanel`, `ProfileSection`,
`MarkdownBlock` and `MarkdownTable` behavior in this component or colocated helper files. Preserve center-column `Review` and `Approve into README` actions.

- [ ] **Step 5: Create composer column shell**

Create `apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx`:

```tsx
import type { HrRouteProfile } from '../surface'
import type { LocalSession } from '../types'

import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@zonease/aiworker-ui/components/card'
import { ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { Separator } from '@zonease/aiworker-ui/components/separator'

import { getHrPeopleWorkbenchCopy } from '../copy'

export function ProfileComposerColumn({
  labels,
  selectedProfile,
  sessions,
}: {
  labels: ReturnType<typeof getHrPeopleWorkbenchCopy>
  selectedProfile: HrRouteProfile
  sessions: LocalSession[]
}) {
  const recentSessions = sessions.slice(0, 4)
  return (
    <Card data-slot="hr-profile-composer-column" size="sm" className="h-full min-h-0">
      <CardHeader>
        <ItemContent className="min-w-0">
          <CardTitle>{labels.recentSessionsTitle}</CardTitle>
          <CardDescription>{labels.recentSessionsDetail(recentSessions.length)}</CardDescription>
        </ItemContent>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        <ItemGroup className="max-h-36 min-h-0 gap-2 overflow-y-auto">
          {recentSessions.length > 0
            ? recentSessions.map(session => (
                <Button key={session.id} type="button" variant="ghost" size="lg" className="h-auto w-full justify-start px-3 py-2 whitespace-normal">
                  <ItemContent className="min-w-0 gap-1">
                    <ItemTitle className="max-w-full">{session.title || session.capabilityTemplateId}</ItemTitle>
                    <ItemDescription>{session.status}</ItemDescription>
                  </ItemContent>
                </Button>
              ))
            : <ItemDescription>{labels.noRecentSessions}</ItemDescription>}
        </ItemGroup>
        <Separator />
        <ItemGroup className="min-h-0 flex-1 gap-2">
          <ItemTitle>{labels.profileComposerTitle(selectedProfile.name)}</ItemTitle>
          <ItemDescription>{labels.composerSafetyDetail}</ItemDescription>
          <Badge variant="secondary">{labels.proposalTypeLabel('profile-update-proposal', 'profile-update-proposal', 'Profile Update Proposal')}</Badge>
        </ItemGroup>
      </CardContent>
    </Card>
  )
}
```

The full working composer replaces the badge in Task 7.

- [ ] **Step 6: Wire three columns in surface**

Modify `apps/aiworker-hr/product/web/people-workbench/surface.tsx` to render:

```tsx
return (
  <section data-slot="hr-route-surface" className="grid h-full max-h-full min-h-0 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[minmax(220px,320px)_minmax(0,1fr)_minmax(340px,420px)]">
    <ProfileListColumn
      activeProfileId={selectedProfile.id}
      labels={labels}
      profileQuery={profileQuery}
      routeProfilesBySection={routeProfilesBySection}
      showProfileFilter={showProfileFilter}
      visibleCount={visibleProfiles.length}
      onProfileQueryChange={setProfileQuery}
      onSelectProfile={selectProfile}
    />
    <ProfileReadingRoomColumn
      labels={labels}
      parsedProfile={parsedProfile}
      selectedProfile={selectedProfile}
      sourceCards={sourceCards}
      onOpenSectionAction={openSectionAction}
    />
    <ProfileComposerColumn
      labels={labels}
      selectedProfile={selectedProfile}
      sessions={sessions}
    />
  </section>
)
```

Build `routeProfilesBySection` from `buildProfileListSections` and the existing `HrRouteProfile` projection. Do not keep `profileToolsExpanded` as the default gate for the right column.

- [ ] **Step 7: Run render tests**

Run:

```bash
bun test apps/aiworker-hr/product/web/component-proof.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit three-column surface**

Run:

```bash
git add apps/aiworker-hr/product/web/people-workbench apps/aiworker-hr/product/web/component-proof.test.tsx
git commit -m "feat: 还原 HR 三列 workbench surface"
```

Expected: commit succeeds.

## Task 6: Interactive App Shell

**Files:**
- Create: `apps/aiworker-hr/product/web/people-workbench/app.tsx`
- Create: `apps/aiworker-hr/product/web/people-workbench/client-entry.tsx`
- Modify: `apps/aiworker-hr/product/web/people-workbench/index.ts`
- Modify: `apps/aiworker-hr/product/web/component-proof.test.tsx`

- [ ] **Step 1: Add app shell export test**

In `component-proof.test.tsx`, add:

```ts
import { HrPeopleWorkbenchApp } from './people-workbench'

it('exports an app-owned interactive workbench app entry', () => {
  const html = renderToStaticMarkup(
    <HrPeopleWorkbenchApp
      initialHostData={{
        appId: 'aiworker-hr',
        routePrefix: '/api/local/apps/aiworker-hr',
        theme: 'light',
        workerId: 'hr-worker',
        workspaceId: 'profile-ben',
      }}
    />,
  )

  expect(html).toContain('data-slot="hr-route-surface"')
  expect(html).toContain('data-slot="hr-profile-composer-column"')
  expect(html).toContain('候选人档案草案')
})
```

- [ ] **Step 2: Run failing app shell test**

Run:

```bash
bun test apps/aiworker-hr/product/web/component-proof.test.tsx
```

Expected: FAIL because `HrPeopleWorkbenchApp` does not exist.

- [ ] **Step 3: Implement app shell**

Create `apps/aiworker-hr/product/web/people-workbench/app.tsx`:

```tsx
import type { HrMicroAppHostData } from './types'

import { useEffect, useMemo, useState } from 'react'

import { HrLocalApiClient } from './api'
import { normalizeHrMicroAppHostData } from './host-data'
import { HrPeopleWorkbenchSurface } from './surface'

export function HrPeopleWorkbenchApp({
  initialHostData,
}: {
  initialHostData?: Partial<HrMicroAppHostData>
}) {
  const hostData = useMemo(() => normalizeHrMicroAppHostData(initialHostData ?? {}), [initialHostData])
  const [error, setError] = useState<string | null>(null)
  const [profileReadmes, setProfileReadmes] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!hostData.workspaceId)
      return
    const client = new HrLocalApiClient(hostData)
    client.readProfile(hostData.workspaceId)
      .then(profile => setProfileReadmes({ [hostData.workspaceId!]: profile }))
      .catch(issue => setError(issue instanceof Error ? issue.message : String(issue)))
  }, [hostData])

  return (
    <HrPeopleWorkbenchSurface
      locale="zh-CN"
      profileReadmes={profileReadmes}
      selectedProfileId={hostData.workspaceId ?? undefined}
      title={error ?? 'HR People Workbench'}
    />
  )
}
```

This is the minimal app shell. Task 7 fills in snapshot loading and submit behavior.

- [ ] **Step 4: Implement client entry**

Create `apps/aiworker-hr/product/web/people-workbench/client-entry.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { HrPeopleWorkbenchApp } from './app'
import { readSeededHostData } from './host-data'

const root = document.getElementById('aiworker-hr-root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <HrPeopleWorkbenchApp initialHostData={readSeededHostData()} />
    </StrictMode>,
  )
}
```

- [ ] **Step 5: Export app shell**

Modify `index.ts`:

```ts
export {
  HrPeopleWorkbenchApp,
} from './app'
```

Keep existing exports.

- [ ] **Step 6: Run app shell tests**

Run:

```bash
bun test apps/aiworker-hr/product/web/component-proof.test.tsx
bun run --filter '@zonease/aiworker-hr' build:client
```

Expected: tests PASS and `dist/web/hr-home-client.js` is generated.

- [ ] **Step 7: Commit app shell**

Run:

```bash
git add apps/aiworker-hr/product/web/people-workbench/app.tsx apps/aiworker-hr/product/web/people-workbench/client-entry.tsx apps/aiworker-hr/product/web/people-workbench/index.ts apps/aiworker-hr/product/web/component-proof.test.tsx
git commit -m "feat: 增加 HR interactive micro-app shell"
```

Expected: commit succeeds.

## Task 7: Composer Submission Wiring

**Files:**
- Create: `apps/aiworker-hr/product/web/people-workbench/profile-composer.tsx`
- Modify: `apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx`
- Modify: `apps/aiworker-hr/product/web/people-workbench/app.tsx`
- Modify: `apps/aiworker-hr/product/web/people-workbench/api.test.ts`

- [ ] **Step 1: Add payload test**

Append to `api.test.ts`:

```ts
import { createProfileDraftSessionInput } from './profile-composer'

it('builds a profile-update-proposal session input from composer state', () => {
  const input = createProfileDraftSessionInput({
    context: 'Focus on role fit.',
    materials: [{
      content: 'resume',
      encoding: 'utf8',
      mimeType: 'text/plain',
      name: 'resume.txt',
      path: 'evidence/uploads/resume.txt',
      size: 6,
    }],
    profileName: 'Stella',
    templateId: 'profile-update-proposal',
  })

  expect(input.capabilityTemplateId).toBe('profile-update-proposal')
  expect(input.title).toBe('Stella 候选人档案草案')
  expect(input.context).toContain('Attached candidate material:')
  expect(input.metadata).toMatchObject({
    materialCount: 1,
    profileName: 'Stella',
    proposalType: 'profile-update-proposal',
  })
})
```

- [ ] **Step 2: Run failing payload test**

Run:

```bash
bun test apps/aiworker-hr/product/web/people-workbench/api.test.ts
```

Expected: FAIL because `profile-composer.tsx` does not exist.

- [ ] **Step 3: Implement profile composer payload and component**

Create `apps/aiworker-hr/product/web/people-workbench/profile-composer.tsx`:

```tsx
import type { FormEvent } from 'react'
import type { HrUploadedMaterial } from './types'

import { Add01Icon, MailSend02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@zonease/aiworker-ui/components/input-group'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@zonease/aiworker-ui/components/item'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@zonease/aiworker-ui/components/select'
import { useRef, useState } from 'react'

import { buildCandidateMaterialContext, createComposerMaterial, materialMetadata } from './attachments'

export function createProfileDraftSessionInput(input: {
  context: string
  materials: HrUploadedMaterial[]
  profileName: string
  templateId: string
}) {
  const materialContext = buildCandidateMaterialContext(input.materials)
  return {
    capabilityTemplateId: input.templateId,
    context: [input.context.trim(), materialContext].filter(Boolean).join('\n\n'),
    input: [input.context.trim(), materialContext].filter(Boolean).join('\n\n'),
    metadata: {
      ...materialMetadata(input.materials),
      profileName: input.profileName,
      proposalType: input.templateId,
    },
    title: `${input.profileName} 候选人档案草案`,
  }
}

export function HrProfileComposer({
  disabled,
  error,
  onSubmitDraft,
  profileName,
  submitting,
}: {
  disabled?: boolean
  error?: string | null
  onSubmitDraft: (input: { context: string, files: File[], templateId: string }) => Promise<void>
  profileName: string
  submitting?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [value, setValue] = useState('')
  const [templateId, setTemplateId] = useState('profile-update-proposal')

  function addFiles(nextFiles: FileList | File[] | null) {
    const selected = Array.from(nextFiles ?? [])
    if (selected.length === 0)
      return
    setFiles(current => [...current, ...selected])
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || submitting || (!value.trim() && files.length === 0))
      return
    await onSubmitDraft({ context: value, files, templateId })
    setFiles([])
    setValue('')
  }

  return (
    <form data-slot="hr-profile-composer" className="flex min-h-0 flex-1 flex-col gap-3" onSubmit={handleSubmit}>
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        multiple
        aria-hidden="true"
        tabIndex={-1}
        onChange={event => addFiles(event.currentTarget.files)}
      />
      <Item size="xs" className="px-0 py-0">
        <ItemContent className="min-w-0">
          <ItemTitle>{`补全 ${profileName} 的候选人档案`}</ItemTitle>
          <ItemDescription>生成可 review 的档案草案，不会直接修改正式档案。</ItemDescription>
        </ItemContent>
      </Item>
      <InputGroup className="min-h-0 flex-1 flex-col items-stretch overflow-hidden">
        <InputGroupTextarea
          aria-label="候选人材料"
          className="min-h-32 flex-1"
          disabled={disabled || submitting}
          placeholder="粘贴简历、ATS 摘要、目标岗位、面试记录、证据链接或开放问题..."
          value={value}
          onChange={event => setValue(event.currentTarget.value)}
          onPaste={event => addFiles(event.clipboardData.files)}
        />
        {files.length > 0
          ? (
              <InputGroupAddon align="block-end" className="max-h-32 flex-col items-stretch overflow-y-auto">
                {files.map(file => (
                  <Item key={`${file.name}:${file.size}:${file.type}`} size="xs">
                    <ItemContent className="min-w-0">
                      <ItemTitle>{file.name}</ItemTitle>
                      <ItemDescription>{`${file.type || 'file'} / ${file.size} bytes`}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`移除 ${file.name}`} onClick={() => setFiles(current => current.filter(item => item !== file))}>x</Button>
                    </ItemActions>
                  </Item>
                ))}
              </InputGroupAddon>
            )
          : null}
        {error ? <InputGroupAddon align="block-end">{error}</InputGroupAddon> : null}
        <InputGroupAddon align="block-end" className="justify-between">
          <InputGroupButton type="button" aria-label="添加候选人材料" onClick={() => fileInputRef.current?.click()}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
            {files.length > 0 ? <Badge variant="secondary">{files.length}</Badge> : null}
          </InputGroupButton>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger aria-label="提案类型" size="sm">
              <SelectValue placeholder="候选人档案草案" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="profile-update-proposal">候选人档案草案</SelectItem>
              <SelectItem value="evidence-matrix">证据整理</SelectItem>
              <SelectItem value="interview-brief">面试提纲</SelectItem>
              <SelectItem value="hiring-risk">风险检查</SelectItem>
            </SelectContent>
          </Select>
          <InputGroupButton type="submit" aria-label={submitting ? '正在生成档案草案' : '生成档案草案'} disabled={disabled || submitting || (!value.trim() && files.length === 0)}>
            <HugeiconsIcon icon={MailSend02Icon} strokeWidth={2} aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
```

- [ ] **Step 4: Wire composer column props**

Modify `ProfileComposerColumn` to accept:

```ts
onSubmitDraft: (input: { context: string, files: File[], templateId: string }) => Promise<void>
submitError: string | null
submitting: boolean
```

Replace the temporary proposal-type badge with:

```tsx
<HrProfileComposer
  error={submitError}
  profileName={selectedProfile.name}
  submitting={submitting}
  onSubmitDraft={onSubmitDraft}
/>
```

- [ ] **Step 5: Wire upload and session creation in app shell**

In `app.tsx`, add:

```tsx
async function submitProfileDraft(input: { context: string, files: File[], templateId: string }) {
  if (!hostData.workspaceId)
    return

  setSubmitting(true)
  setSubmitError(null)
  try {
    const client = new HrLocalApiClient(hostData)
    const materials = await Promise.all(input.files.map(async (file) => {
      const material = await createComposerMaterial(file)
      const uploaded = { ...material, path: candidateMaterialPath(material) }
      await client.writeMaterial(hostData.workspaceId!, uploaded)
      return uploaded
    }))
    await client.createSession(hostData.workspaceId, createProfileDraftSessionInput({
      context: input.context,
      materials,
      profileName: selectedProfileName,
      templateId: input.templateId,
    }))
    await refresh()
  }
  catch (issue) {
    setSubmitError(issue instanceof Error ? issue.message : String(issue))
  }
  finally {
    setSubmitting(false)
  }
}
```

Use `selectedProfileName` from the current selected profile or fallback to `labels.headerFallback`.

- [ ] **Step 6: Run payload and build tests**

Run:

```bash
bun test apps/aiworker-hr/product/web/people-workbench/api.test.ts
bun run --filter '@zonease/aiworker-hr' build:client
```

Expected: PASS.

- [ ] **Step 7: Commit composer wiring**

Run:

```bash
git add apps/aiworker-hr/product/web/people-workbench/profile-composer.tsx apps/aiworker-hr/product/web/people-workbench/columns/profile-composer-column.tsx apps/aiworker-hr/product/web/people-workbench/app.tsx apps/aiworker-hr/product/web/people-workbench/api.test.ts
git commit -m "feat: 接通 HR profile composer submit"
```

Expected: commit succeeds.

## Task 8: Mounted And Standalone HTML Integration

**Files:**
- Modify: `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`
- Modify: `apps/aiworker-hr/host-adapter/standalone/standalone.ts`
- Modify: `apps/aiworker-hr/host-adapter/index.test.ts`

- [ ] **Step 1: Update mounted HTML**

Modify imports in `host-mounted.ts`:

```ts
import { renderSoulAppClientScript, renderSoulAppStyleLink, serveSoulAppWebAsset } from '../web-style'
```

Replace `serveSoulAppStyle(url)` usage with:

```ts
const assetResponse = await serveSoulAppWebAsset(url)
if (assetResponse)
  return assetResponse
```

Update `hrRouteMicroAppHtml` body root:

```ts
const routeMarkup = renderToStaticMarkup(HrHomeRouteSurface({
  badgeLabel: 'Mounted',
  description: 'Host-mounted HR app-owned people workbench.',
  locale: 'zh-CN',
  selectedProfileId: context?.workspaceId ?? undefined,
}))
```

Render:

```ts
`<main id="aiworker-hr-root" class="h-full min-h-0" data-soul-app-id="${escapeHtmlAttribute(hrSoulAppManifest.id)}" data-surface-id="${escapeHtmlAttribute(surfaceId)}">`,
routeMarkup,
'</main>',
`<script id="aiworker-micro-app-host-data" type="application/json" data-slot="micro-app-host-data">${jsonScriptValue({
  appId: hrSoulAppManifest.id,
  routePrefix: `/api/local/apps/${hrSoulAppManifest.id}`,
  theme,
  workerId: context?.workerId ?? null,
  workspaceId: context?.workspaceId ?? null,
})}</script>`,
`<script>${microAppBridgeScript(hrSoulAppManifest.id, surfaceId)}</script>`,
renderSoulAppClientScript(`/api/local/apps/${hrSoulAppManifest.id}/assets/hr-home-client.js`),
```

Adjust `jsonScriptValue` to accept `unknown`:

```ts
function jsonScriptValue(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003C').replaceAll('>', '\\u003E').replaceAll('&', '\\u0026')
}
```

- [ ] **Step 2: Update standalone HTML**

Modify `standalone.ts` imports:

```ts
import { renderSoulAppClientScript, renderSoulAppStyleLink, serveSoulAppWebAsset } from '../web-style'
```

Use `serveSoulAppWebAsset(url)` in `serveStandalone`.

Render the same root id and script:

```ts
`<main id="aiworker-hr-root" class="h-full min-h-0">`,
appMarkup,
'</main>',
`<script id="aiworker-micro-app-host-data" type="application/json" data-slot="micro-app-host-data">{}</script>`,
renderSoulAppClientScript('/assets/hr-home-client.js'),
```

- [ ] **Step 3: Run mounted HTML tests**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' build:client
bun test apps/aiworker-hr/host-adapter/index.test.ts
```

Expected: PASS. Add the mounted script-tag assertion while keeping the direct asset assertion tolerant of both `503` before a local build and `200` after `build:client`:

```ts
expect(routeMicroAppHtml).toContain('<script type="module" src="/api/local/apps/aiworker-hr/assets/hr-home-client.js"></script>')
```

- [ ] **Step 4: Commit HTML integration**

Run:

```bash
git add apps/aiworker-hr/host-adapter/mounted/host-mounted.ts apps/aiworker-hr/host-adapter/standalone/standalone.ts apps/aiworker-hr/host-adapter/index.test.ts
git commit -m "feat: 挂载 HR interactive micro-app"
```

Expected: commit succeeds.

## Task 9: Smoke, UI Audit And Closeout

**Files:**
- Modify: `apps/web/scripts/smoke-mounted-surfaces.ts`
- Modify: `docs/plan/PLAN-390.md`
- Modify: `docs/task/FEAT-107.md`
- Modify: `docs/plan/index.md`
- Modify: `docs/task/index.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Update mounted smoke assertions**

In `apps/web/scripts/smoke-mounted-surfaces.ts`, update HR route assertions so the smoke requires:

```ts
assertIncludes(html, 'data-slot="hr-profile-list-column"', 'HR profile list column')
assertIncludes(html, 'data-slot="hr-reading-room-column"', 'HR reading room column')
assertIncludes(html, 'data-slot="hr-profile-composer-column"', 'HR composer column')
assertIncludes(html, '候选人', 'HR candidate lifecycle group')
assertIncludes(html, '在职员工', 'HR employee lifecycle group')
assertIncludes(html, '离职归档', 'HR archived lifecycle group')
assertIncludes(html, '候选人档案草案', 'HR default profile proposal')
```

Use the existing helper style in the file; do not introduce a new assertion utility if one already exists.

- [ ] **Step 2: Run focused gates**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-hr' typecheck
bun run --filter '@zonease/aiworker-hr' validate
bun run --filter '@zonease/aiworker-hr' smoke
bun apps/web/scripts/smoke-mounted-surfaces.ts
```

Expected: all PASS.

- [ ] **Step 3: Run UI governance gates**

Run:

```bash
bun run ui:check
bun scripts/check-web-ui-components.ts --all --audit
```

Expected: PASS or only pre-existing accepted debt unrelated to HR. Any HR app product web issue must be fixed before continuing.

- [ ] **Step 4: Browser visual verification**

Start local dev if not already running:

```bash
bun run dev:clean
bun run dev:apps
bun run dev
```

Open the mounted HR route in the browser through the Host Web app. Capture at least:

- desktop light screenshot showing all three HR columns;
- desktop dark screenshot showing all three HR columns;
- narrow viewport screenshot showing readable stacked or adapted layout.

Expected: no text overlap, no clipped right composer controls, all lifecycle groups visible, Recent Sessions above composer, no Host-owned HR renderer nodes.

- [ ] **Step 5: Run final diff and code review graph**

Run:

```bash
git diff --check
bun run crg:update
bun run crg:review
```

Expected: `git diff --check` exits 0 and `crg:review` exits 0 with no blocking findings.

- [ ] **Step 6: Close PMA docs**

Update `docs/task/FEAT-107.md`:

```markdown
- **status**: completed
```

Update `docs/plan/PLAN-390.md`:

```markdown
- **status**: completed
```

Mark FEAT-107 and PLAN-390 as `[x]` in their index files.

Append to `docs/changelog.md`:

```markdown
## 2026-05-20 [completed] FEAT-107 / PLAN-390 - HR three-column interactive micro-app

Restored the mature HR People Workbench as an app-owned interactive mounted
micro-app. The desktop mounted route now defaults to three visible columns:
Profile List, Reading Room / Profile Patch Review, and Recent Sessions plus
Composer. The Profile List keeps `候选人`, `在职员工`, and `离职归档` expanded by
default, and the right-column composer can submit reviewable candidate profile
draft sessions with candidate material files written under `evidence/uploads/`.

The approval surface remains in the center Profile Patch Review path, and Host
Web continues to mount the HR route without restoring a Host-owned
`apps/web/src/worker/souls/hr` renderer.

Verification: `bun run --filter '@zonease/aiworker-hr' test`, typecheck,
validate, smoke, mounted-surface smoke, UI audit, browser screenshots,
`git diff --check`, `bun run crg:update`, and `bun run crg:review`.
```

- [ ] **Step 7: Commit closeout**

Run:

```bash
git add apps/web/scripts/smoke-mounted-surfaces.ts docs/task/FEAT-107.md docs/plan/PLAN-390.md docs/task/index.md docs/plan/index.md docs/changelog.md
git commit -m "test: 验收 HR 三列 interactive micro-app"
```

Expected: commit succeeds.

## Spec Coverage Self-Review

- Three visible desktop columns: Task 5 and Task 9.
- App-owned interactive client entry: Task 2, Task 6 and Task 8.
- Fixed lifecycle groups `候选人`, `在职员工`, `离职归档`: Task 4 and Task 5.
- Recent Sessions plus profile composer: Task 5 and Task 7.
- Multi-file material upload and session metadata/context: Task 3 and Task 7.
- Center-only patch review/approval: Task 5 and Task 9.
- No Host HR renderer restoration: Task 1, Task 8 and Task 9.
- shadcn/hugeicons/component-library constraints: Task 2, Task 5, Task 7 and UI audit in Task 9.
- PMA docs and changelog sync: Task 1 and Task 9.
