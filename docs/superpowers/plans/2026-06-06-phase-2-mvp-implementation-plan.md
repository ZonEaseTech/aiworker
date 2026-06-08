# Phase 2 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 2 MVP vertical slice where Host provisions an employee Worker, the Worker checks in and opens a WebSocket reverse tunnel, and the employee reaches the Worker-owned Workbench through `https://aiworker.zonease.org/workers/:workerId`.

**Architecture:** `aiworker-host serve` becomes the server A process for `/host`, `/api/host/*`, `/api/provision/*`, and `/workers/:workerId`. Host owns assignment state and Logto-backed identity; the in-process Worker Access Adapter owns only worker access authorization and reverse-tunnel forwarding. Worker remains autonomous and owns Workbench/runtime; Host never mounts or renders Worker UI.

**Tech Stack:** Bun, TypeScript, Hono-style route patterns where already present, Bun WebSocket server APIs, Drizzle/Bun SQLite for Host assignment storage, Logto OIDC/JWT verification through a small provider adapter, React + `packages/ui` for Host Web.

---

## Scope Check

The design spec spans docs, protocol, Host storage, Host server, Worker CLI, Worker daemon, auth, access tunnel, and UI. Keep this as one vertical MVP plan because each task builds a testable piece of the same provisioning flow. Do not add Soul Builder web editing or Soul release update automation in this plan; those are follow-up specs after the access/provisioning spine is green.

## File Structure

Create or modify these files:

- Modify `docs/architecture.md`: promote the new Phase 2 check-in and Worker Access contract.
- Modify `docs/protocol.md`: replace passive-only Host-to-Worker language with provisioning/check-in/access contracts.
- Modify `docs/runtime.md`: document Worker-initiated check-in and reverse tunnel as Phase 2 distribution inputs only.
- Modify `docs/testing.md`: document new tests and acceptance gates.
- Modify `AGENTS.md`: update Phase 2 product boundary so future agents do not restore passive-only Host control language.
- Modify `scripts/check-doc-contract.ts`: update canonical doc phrase checks.
- Modify `tests/architecture/inversion-guards.test.ts`: update inversion guards for check-in/tunnel while preserving no Host runtime ownership.
- Create `packages/storage-sqlite/src/host/schema.ts`: Host assignment and provision token schema.
- Create `packages/storage-sqlite/src/host/index.ts`: Host DB lifecycle and assignment/token CRUD.
- Create `packages/storage-sqlite/src/host/index.test.ts`: storage safety and state-machine tests.
- Modify `packages/storage-sqlite/src/index.ts`: export `host`.
- Modify `packages/storage-sqlite/package.json`: export `./host` and add `db:generate:host` script if Drizzle migrations are generated.
- Create `packages/host-control/src/assignment.ts`: assignment state machine and safe model.
- Create `packages/host-control/src/provision-token.ts`: one-time token hashing and validation helpers.
- Create `packages/host-control/src/auth.ts`: provider-neutral user/auth gate contracts.
- Create `packages/host-control/src/access-adapter.ts`: in-process Worker Access registry and authorization boundary.
- Modify `packages/host-control/src/index.ts`: export new modules while keeping existing registry compatibility.
- Create `packages/host-control/src/assignment.test.ts`: assignment state and exact-email gate tests.
- Create `packages/host-control/src/access-adapter.test.ts`: access adapter boundary tests.
- Modify `packages/worker-control-protocol/src/index.ts`: add strict check-in/access schemas and status literals.
- Modify `packages/worker-control-protocol/src/index.test.ts`: protocol shape and forbidden data tests.
- Create `apps/host-cli/src/host-server.ts`: `aiworker-host serve` server A process.
- Modify `apps/host-cli/src/aiworker-host.ts`: add `serve`, `assignment list`, and `assignment create` command wiring.
- Modify `apps/host-cli/src/aiworker-host.test.ts`: CLI smoke tests for new commands.
- Create `apps/host-cli/src/host-server.test.ts`: API route tests for assignment, check-in, access authorization.
- Modify `apps/host-cli/package.json`: add server dependencies if needed.
- Modify `apps/worker-cli/src/aiworker.ts`: add `provision` command for Host-launched Workers.
- Create `apps/worker-cli/src/provision.test.ts`: provision command argument and no-secret logging tests.
- Create `packages/worker-daemon/src/modes/worker/provision-client.ts`: check-in and access tunnel client.
- Create `packages/worker-daemon/src/modes/worker/provision-client.test.ts`: check-in/tunnel client tests with fake fetch/WebSocket.
- Modify `packages/worker-daemon/src/modes/worker.ts`: optionally start provision client when provision config is present.
- Modify `apps/host-web/src/app.tsx`: replace demo card with AI Workers list and open-worker drawer.
- Modify `apps/host-web/src/app.test.tsx`: Host UI contract tests.
- Create `tests/browser/phase2-host-worker-access.spec.ts`: browser proof for Host list, ready URL, and no Host chrome inside Worker route.

## Task 1: Promote Canonical Phase 2 Contract

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/protocol.md`
- Modify: `docs/runtime.md`
- Modify: `docs/testing.md`
- Modify: `AGENTS.md`
- Modify: `scripts/check-doc-contract.ts`
- Modify: `tests/architecture/inversion-guards.test.ts`

- [ ] **Step 1: Write failing architecture guard for Worker-initiated Phase 2 signals**

Add this test to `tests/architecture/inversion-guards.test.ts` near the existing G5 tests:

```ts
test('G5 phase-2 access: Worker may initiate only provisioning check-in and access tunnel signals', () => {
  const architecture = read('docs/architecture.md')
  const protocol = read('docs/protocol.md')
  const runtime = read('docs/runtime.md')

  expect(architecture).toContain('Worker may initiate Phase 2 check-in and Worker Access tunnel connections to Host')
  expect(protocol).toContain('POST   /api/provision/check-in')
  expect(protocol).toContain('GET    /api/provision/access')
  expect(runtime).toContain('Phase 2 provisioning check-in and Worker Access tunnel signals are distribution-plane signals')

  for (const doc of [architecture, protocol, runtime]) {
    expect(doc).toContain('Host must not read Worker chat, session, invocation, projection, workspace, artifact, or native engine secret data')
    expect(doc).toContain('Host must not mount, iframe, proxy-render, or inject chrome into the Worker Workbench')
  }
})
```

- [ ] **Step 2: Run guard and verify it fails**

Run:

```bash
bun test tests/architecture/inversion-guards.test.ts --timeout=15000
```

Expected: FAIL because the new Phase 2 check-in/access phrases are not in canonical docs yet.

- [ ] **Step 3: Update canonical docs**

Edit `docs/architecture.md`, `docs/protocol.md`, and `docs/runtime.md` to replace the old passive-only Phase 2 statement with this exact contract text, adapted into each document's existing prose:

```markdown
Phase 2 Host integration has two distribution-plane directions:

- Host initiates provisioning through aissh and owns assignment/readiness records.
- Worker may initiate Phase 2 check-in and Worker Access tunnel connections to Host.

These Worker-initiated signals are not runtime hot-path ownership. Host must not
read Worker chat, session, invocation, projection, workspace, artifact, or native
engine secret data. Host must not mount, iframe, proxy-render, or inject chrome
into the Worker Workbench.
```

In `docs/protocol.md`, add the Phase 2 route block:

```text
POST   /api/provision/check-in
GET    /api/provision/access
GET    /workers/:workerId
```

In `docs/testing.md`, add these acceptance bullets:

```markdown
- Phase 2 provisioning: aissh success is not ready until Worker check-in and access ready.
- Worker access: `/workers/:workerId` is employee navigation through Worker Access Adapter, not Host-rendered UI.
- Auth: Logto proves identity; AIWorker assignment decides exact Worker access.
```

In `AGENTS.md`, replace the passive-only sentence:

```text
Phase 2 Host 不 mount / frame / render Worker Workbench，只通过控制契约做分发、授权、provisioning、readiness/lifecycle 状态。
```

with:

```text
Phase 2 Host 不 mount / frame / render Worker Workbench。Phase 2 允许 Worker 主动 check-in Host 并建立 Worker Access reverse tunnel；这些只属于分发/访问闭环，不让 Host 进入 Worker runtime 热路径。
```

- [ ] **Step 4: Update doc checker literals**

In `scripts/check-doc-contract.ts`, replace required includes that contain:

```text
The Worker is the passive control server; Host is the client. A Worker
never initiates a connection to Host.
```

with includes for:

```text
Worker may initiate Phase 2 check-in and Worker Access tunnel connections to Host
```

and:

```text
POST   /api/provision/check-in
GET    /api/provision/access
GET    /workers/:workerId
```

- [ ] **Step 5: Verify docs and architecture guards**

Run:

```bash
bun run docs:check
bun test tests/architecture/inversion-guards.test.ts --timeout=15000
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md docs/architecture.md docs/protocol.md docs/runtime.md docs/testing.md scripts/check-doc-contract.ts tests/architecture/inversion-guards.test.ts
git commit -m "docs(phase2): 推广 worker check-in 与 access 合同"
```

## Task 2: Add Host Assignment Storage

**Files:**
- Create: `packages/storage-sqlite/src/host/schema.ts`
- Create: `packages/storage-sqlite/src/host/index.ts`
- Create: `packages/storage-sqlite/src/host/index.test.ts`
- Modify: `packages/storage-sqlite/src/index.ts`
- Modify: `packages/storage-sqlite/package.json`

- [ ] **Step 1: Write failing storage tests**

Create `packages/storage-sqlite/src/host/index.test.ts`:

```ts
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  closeHostDb,
  createAssignment,
  getAssignmentByWorkerId,
  getHostDb,
  initHostDb,
  listAssignments,
  markAssignmentCheckedIn,
  markAssignmentReady,
  revokeAssignment,
  runHostMigrations,
  verifyAndConsumeProvisionToken,
} from './index'

describe('host sqlite assignment storage', () => {
  let dir = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiworker-host-db-'))
    initHostDb(join(dir, 'host.db'))
    runHostMigrations()
  })

  afterEach(async () => {
    closeHostDb()
    await rm(dir, { recursive: true, force: true })
  })

  it('creates a pending assignment without persisting the plaintext provision token', () => {
    const created = createAssignment({
      assignedEmail: 'Bob@Zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
      now: () => '2026-06-06T00:00:00.000Z',
    })

    expect(created.assignment.assignedEmail).toBe('bob@zonease.org')
    expect(created.assignment.status).toBe('provisioning')
    expect(created.provisionToken).toMatch(/^awp_/)
    expect(JSON.stringify(listAssignments())).not.toContain(created.provisionToken)
  })

  it('consumes a provision token exactly once', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    const first = verifyAndConsumeProvisionToken(created.provisionToken)
    expect(first?.assignmentId).toBe(created.assignment.assignmentId)
    expect(verifyAndConsumeProvisionToken(created.provisionToken)).toBeNull()
  })

  it('moves through checked_in, access_ready, ready, and revoked without leaking secrets', () => {
    const created = createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })

    markAssignmentCheckedIn(created.assignment.assignmentId, {
      workerId: 'wkr_82',
      workerVersion: 'test',
      checkInAt: '2026-06-06T00:01:00.000Z',
    })
    markAssignmentReady(created.assignment.assignmentId, {
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
      accessReadyAt: '2026-06-06T00:02:00.000Z',
    })
    revokeAssignment(created.assignment.assignmentId, 'admin@zonease.org')

    const row = getAssignmentByWorkerId('wkr_82')
    expect(row?.status).toBe('revoked')
    expect(row?.workbenchUrl).toBe('https://aiworker.zonease.org/workers/wkr_82')
    expect(JSON.stringify(row)).not.toMatch(/sk-|Bearer |Logto|password|secret/i)
  })

  it('throws when assignment metadata contains literal secrets', () => {
    expect(() => createAssignment({
      assignedEmail: 'bob@zonease.org',
      metadataJson: { apiKey: 'sk-literal-secret-abcdef123456' },
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
    })).toThrow(/Literal secrets are not allowed/)
  })

  it('requires initialization before use', () => {
    closeHostDb()
    expect(() => getHostDb()).toThrow('Host database not initialized')
  })
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
bun test packages/storage-sqlite/src/host/index.test.ts --timeout=15000
```

Expected: FAIL because `packages/storage-sqlite/src/host/index.ts` does not exist.

- [ ] **Step 3: Create host schema**

Create `packages/storage-sqlite/src/host/schema.ts`:

```ts
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const nowIso = () => new Date().toISOString()

export const hostAssignments = sqliteTable('host_assignments', {
  assignmentId: text('assignment_id').primaryKey(),
  assignedEmail: text('assigned_email').notNull(),
  serverRef: text('server_ref').notNull(),
  soulReleaseRef: text('soul_release_ref').notNull(),
  workerId: text('worker_id'),
  workerVersion: text('worker_version'),
  workbenchUrl: text('workbench_url'),
  status: text('status', {
    enum: ['draft', 'provisioning', 'checked_in', 'access_ready', 'ready', 'needs_attention', 'revoked', 'archived'],
  }).notNull().default('provisioning'),
  provisionTokenHash: text('provision_token_hash').notNull(),
  provisionTokenExpiresAt: text('provision_token_expires_at').notNull(),
  provisionTokenConsumedAt: text('provision_token_consumed_at'),
  metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull().$defaultFn(() => ({})),
  createdAt: text('created_at').notNull().$defaultFn(nowIso),
  updatedAt: text('updated_at').notNull().$defaultFn(nowIso),
  checkedInAt: text('checked_in_at'),
  accessReadyAt: text('access_ready_at'),
  revokedAt: text('revoked_at'),
  revokedBy: text('revoked_by'),
}, table => ({
  assignedEmailIdx: index('host_assignments_assigned_email_idx').on(table.assignedEmail),
  statusUpdatedAtIdx: index('host_assignments_status_updated_at_idx').on(table.status, table.updatedAt),
  workerIdUniqueIdx: uniqueIndex('host_assignments_worker_id_unique_idx').on(table.workerId),
}))
```

- [ ] **Step 4: Create host storage implementation**

Create `packages/storage-sqlite/src/host/index.ts`:

```ts
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { Database } from 'bun:sqlite'
import { eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import * as schema from './schema'

const LITERAL_SECRET_RE = /Bearer\s+[\w.~+/-]{12,}|sk-[\w-]{8,}|ghp_\w{20,}|AKIA[0-9A-Z]{16}|AIza[\w-]{35,}|eyJ[\w-]+\.[\w-]+\.[\w-]+|["']?(?:api[_-]?key|authorization|password|secret|token)["']?\s*[:=]\s*["'][^"'\n]+["']/gi

type HostDb = ReturnType<typeof createDb>
let db: HostDb | null = null
let sqliteHandle: Database | null = null

export type HostAssignmentStatus = 'draft' | 'provisioning' | 'checked_in' | 'access_ready' | 'ready' | 'needs_attention' | 'revoked' | 'archived'

export interface HostAssignmentRow {
  accessReadyAt: null | string
  assignedEmail: string
  assignmentId: string
  checkedInAt: null | string
  createdAt: string
  metadataJson: Record<string, unknown>
  provisionTokenConsumedAt: null | string
  provisionTokenExpiresAt: string
  provisionTokenHash: string
  revokedAt: null | string
  revokedBy: null | string
  serverRef: string
  soulReleaseRef: string
  status: HostAssignmentStatus
  updatedAt: string
  workerId: null | string
  workerVersion: null | string
  workbenchUrl: null | string
}

export interface CreateAssignmentInput {
  assignedEmail: string
  metadataJson?: Record<string, unknown>
  now?: () => string
  provisionTokenTtlMs?: number
  serverRef: string
  soulReleaseRef: string
}

function createDb(dbPath: string) {
  const sqlite = new Database(dbPath, { create: true })
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA busy_timeout = 5000')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqliteHandle = sqlite
  return drizzle(sqlite, { schema })
}

export function initHostDb(dbPath: string) {
  closeHostDb()
  db = createDb(dbPath)
  return db
}

export function getHostDb() {
  if (!db)
    throw new Error('Host database not initialized. Call initHostDb() first.')
  return db
}

export function closeHostDb() {
  if (sqliteHandle) {
    sqliteHandle.close(false)
    sqliteHandle = null
  }
  db = null
}

export function runHostMigrations() {
  getHostDb().run(`
    CREATE TABLE IF NOT EXISTS host_assignments (
      assignment_id TEXT PRIMARY KEY,
      assigned_email TEXT NOT NULL,
      server_ref TEXT NOT NULL,
      soul_release_ref TEXT NOT NULL,
      worker_id TEXT,
      worker_version TEXT,
      workbench_url TEXT,
      status TEXT NOT NULL DEFAULT 'provisioning',
      provision_token_hash TEXT NOT NULL,
      provision_token_expires_at TEXT NOT NULL,
      provision_token_consumed_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      checked_in_at TEXT,
      access_ready_at TEXT,
      revoked_at TEXT,
      revoked_by TEXT
    )
  `)
  getHostDb().run('CREATE INDEX IF NOT EXISTS host_assignments_assigned_email_idx ON host_assignments (assigned_email)')
  getHostDb().run('CREATE INDEX IF NOT EXISTS host_assignments_status_updated_at_idx ON host_assignments (status, updated_at)')
  getHostDb().run('CREATE UNIQUE INDEX IF NOT EXISTS host_assignments_worker_id_unique_idx ON host_assignments (worker_id)')
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function assertNoLiteralSecrets(value: unknown, context: string): void {
  if (typeof value === 'string') {
    if (LITERAL_SECRET_RE.test(value))
      throw new Error(`Literal secrets are not allowed in Host assignment metadata: ${context}`)
    return
  }
  if (!value || typeof value !== 'object')
    return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoLiteralSecrets(item, `${context}[${index}]`))
    return
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (/api[_-]?key|authorization|password|secret|token/i.test(key) && typeof nested === 'string')
      throw new Error(`Literal secrets are not allowed in Host assignment metadata: ${context}.${key}`)
    assertNoLiteralSecrets(nested, `${context}.${key}`)
  }
}

function hashProvisionToken(token: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(token, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

function verifyProvisionTokenHash(token: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash)
    return false
  const candidate = scryptSync(token, salt, 32)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

function rowToAssignment(row: typeof schema.hostAssignments.$inferSelect): HostAssignmentRow {
  return row as HostAssignmentRow
}

export function createAssignment(input: CreateAssignmentInput): { assignment: HostAssignmentRow, provisionToken: string } {
  const now = input.now?.() ?? new Date().toISOString()
  const ttlMs = input.provisionTokenTtlMs ?? 15 * 60 * 1000
  const provisionToken = `awp_${randomBytes(32).toString('base64url')}`
  const assignment = {
    assignmentId: `asg_${randomUUID()}`,
    assignedEmail: normalizeEmail(input.assignedEmail),
    createdAt: now,
    metadataJson: input.metadataJson ?? {},
    provisionTokenExpiresAt: new Date(new Date(now).getTime() + ttlMs).toISOString(),
    provisionTokenHash: hashProvisionToken(provisionToken),
    serverRef: input.serverRef,
    soulReleaseRef: input.soulReleaseRef,
    status: 'provisioning' as const,
    updatedAt: now,
  }
  assertNoLiteralSecrets(assignment.metadataJson, 'assignment.metadataJson')
  getHostDb().insert(schema.hostAssignments).values(assignment).run()
  return { assignment: rowToAssignment(getAssignment(assignment.assignmentId)!), provisionToken }
}

export function getAssignment(assignmentId: string): HostAssignmentRow | null {
  const row = getHostDb().query.hostAssignments.findFirst({ where: eq(schema.hostAssignments.assignmentId, assignmentId) })
  return row ? rowToAssignment(row) : null
}

export function getAssignmentByWorkerId(workerId: string): HostAssignmentRow | null {
  const row = getHostDb().query.hostAssignments.findFirst({ where: eq(schema.hostAssignments.workerId, workerId) })
  return row ? rowToAssignment(row) : null
}

export function listAssignments(): HostAssignmentRow[] {
  return getHostDb().select().from(schema.hostAssignments).all().map(rowToAssignment)
}

export function verifyAndConsumeProvisionToken(token: string): { assignmentId: string } | null {
  const now = new Date().toISOString()
  for (const row of getHostDb().select().from(schema.hostAssignments).where(isNull(schema.hostAssignments.provisionTokenConsumedAt)).all()) {
    if (row.provisionTokenExpiresAt <= now)
      continue
    if (!verifyProvisionTokenHash(token, row.provisionTokenHash))
      continue
    getHostDb().update(schema.hostAssignments)
      .set({ provisionTokenConsumedAt: now, updatedAt: now })
      .where(eq(schema.hostAssignments.assignmentId, row.assignmentId))
      .run()
    return { assignmentId: row.assignmentId }
  }
  return null
}

export function markAssignmentCheckedIn(assignmentId: string, input: { checkInAt?: string, workerId: string, workerVersion: string }): HostAssignmentRow {
  const now = input.checkInAt ?? new Date().toISOString()
  getHostDb().update(schema.hostAssignments)
    .set({ checkedInAt: now, status: 'checked_in', updatedAt: now, workerId: input.workerId, workerVersion: input.workerVersion })
    .where(eq(schema.hostAssignments.assignmentId, assignmentId))
    .run()
  return getAssignment(assignmentId)!
}

export function markAssignmentReady(assignmentId: string, input: { accessReadyAt?: string, workbenchUrl: string }): HostAssignmentRow {
  const now = input.accessReadyAt ?? new Date().toISOString()
  getHostDb().update(schema.hostAssignments)
    .set({ accessReadyAt: now, status: 'ready', updatedAt: now, workbenchUrl: input.workbenchUrl })
    .where(eq(schema.hostAssignments.assignmentId, assignmentId))
    .run()
  return getAssignment(assignmentId)!
}

export function revokeAssignment(assignmentId: string, revokedBy: string): HostAssignmentRow {
  const now = new Date().toISOString()
  getHostDb().update(schema.hostAssignments)
    .set({ revokedAt: now, revokedBy, status: 'revoked', updatedAt: now })
    .where(eq(schema.hostAssignments.assignmentId, assignmentId))
    .run()
  return getAssignment(assignmentId)!
}
```

- [ ] **Step 5: Export host storage**

Update `packages/storage-sqlite/src/index.ts`:

```ts
/**
 * `@zonease/aiworker-storage-sqlite` stores Host-local and Worker-local metadata.
 * Business files remain in workspace folders; the DB stores indexes and provenance.
 */
export * as host from './host'
export * as worker from './worker'
```

Update `packages/storage-sqlite/package.json` `exports`:

```json
"./host": {
  "types": "./src/host/index.ts",
  "import": "./src/host/index.ts"
}
```

- [ ] **Step 6: Verify storage tests**

Run:

```bash
bun test packages/storage-sqlite/src/host/index.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-storage-sqlite' typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/storage-sqlite/src/host packages/storage-sqlite/src/index.ts packages/storage-sqlite/package.json
git commit -m "feat(host): 添加 assignment 存储"
```

## Task 3: Define Assignment, Auth, and Access Boundary in host-control

**Files:**
- Create: `packages/host-control/src/assignment.ts`
- Create: `packages/host-control/src/provision-token.ts`
- Create: `packages/host-control/src/auth.ts`
- Create: `packages/host-control/src/access-adapter.ts`
- Create: `packages/host-control/src/assignment.test.ts`
- Create: `packages/host-control/src/access-adapter.test.ts`
- Modify: `packages/host-control/src/index.ts`

- [ ] **Step 1: Write failing host-control tests**

Create `packages/host-control/src/assignment.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'

import {
  canAdvanceAssignment,
  createAssignmentView,
  normalizeAssignedEmail,
  userCanOpenWorker,
} from './assignment'

describe('host-control assignment boundary', () => {
  it('normalizes exact assigned email', () => {
    expect(normalizeAssignedEmail(' Bob@Zonease.Org ')).toBe('bob@zonease.org')
  })

  it('allows only exact assigned email to open a worker', () => {
    const assignment = createAssignmentView({
      assignedEmail: 'bob@zonease.org',
      assignmentId: 'asg_1',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
      status: 'ready',
      workerId: 'wkr_82',
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    })

    expect(userCanOpenWorker({ email: 'bob@zonease.org' }, assignment)).toBe(true)
    expect(userCanOpenWorker({ email: 'alice@zonease.org' }, assignment)).toBe(false)
    expect(userCanOpenWorker({ email: 'bob@other.test' }, assignment)).toBe(false)
  })

  it('does not allow revoked assignments to open', () => {
    const assignment = createAssignmentView({
      assignedEmail: 'bob@zonease.org',
      assignmentId: 'asg_1',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
      status: 'revoked',
      workerId: 'wkr_82',
    })
    expect(userCanOpenWorker({ email: 'bob@zonease.org' }, assignment)).toBe(false)
  })

  it('restricts state transitions', () => {
    expect(canAdvanceAssignment('provisioning', 'checked_in')).toBe(true)
    expect(canAdvanceAssignment('checked_in', 'access_ready')).toBe(true)
    expect(canAdvanceAssignment('access_ready', 'ready')).toBe(true)
    expect(canAdvanceAssignment('ready', 'provisioning')).toBe(false)
    expect(canAdvanceAssignment('revoked', 'ready')).toBe(false)
  })
})
```

Create `packages/host-control/src/access-adapter.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'

import { createWorkerAccessRegistry, sanitizeForwardHeaders } from './access-adapter'

describe('worker access adapter boundary', () => {
  it('registers and removes worker access connections by worker id', () => {
    const registry = createWorkerAccessRegistry()
    registry.register({ close: () => {}, workerId: 'wkr_82' })
    expect(registry.has('wkr_82')).toBe(true)
    registry.remove('wkr_82')
    expect(registry.has('wkr_82')).toBe(false)
  })

  it('replaces duplicate worker access connection', () => {
    let closed = 0
    const registry = createWorkerAccessRegistry()
    registry.register({ close: () => { closed += 1 }, workerId: 'wkr_82' })
    registry.register({ close: () => {}, workerId: 'wkr_82' })
    expect(closed).toBe(1)
  })

  it('strips host and logto credentials before forwarding to worker', () => {
    const headers = sanitizeForwardHeaders(new Headers({
      authorization: 'Bearer host-token',
      cookie: 'aiworker_session=host',
      'x-aiworker-user-email': 'bob@zonease.org',
      accept: 'text/html',
    }))

    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('x-aiworker-user-email')).toBe('bob@zonease.org')
    expect(headers.get('accept')).toBe('text/html')
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
bun test packages/host-control/src/assignment.test.ts packages/host-control/src/access-adapter.test.ts --timeout=15000
```

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement assignment helpers**

Create `packages/host-control/src/assignment.ts`:

```ts
export type AssignmentStatus = 'draft' | 'provisioning' | 'checked_in' | 'access_ready' | 'ready' | 'needs_attention' | 'revoked' | 'archived'

export interface AssignmentView {
  assignedEmail: string
  assignmentId: string
  serverRef: string
  soulReleaseRef: string
  status: AssignmentStatus
  workerId?: string | null
  workbenchUrl?: string | null
}

export interface AuthenticatedUser {
  email: string
}

const allowedTransitions: Record<AssignmentStatus, AssignmentStatus[]> = {
  access_ready: ['ready', 'needs_attention', 'revoked', 'archived'],
  archived: [],
  checked_in: ['access_ready', 'needs_attention', 'revoked', 'archived'],
  draft: ['provisioning', 'archived'],
  needs_attention: ['provisioning', 'revoked', 'archived'],
  provisioning: ['checked_in', 'needs_attention', 'revoked', 'archived'],
  ready: ['needs_attention', 'revoked', 'archived'],
  revoked: ['archived'],
}

export function normalizeAssignedEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function createAssignmentView(input: AssignmentView): AssignmentView {
  return {
    ...input,
    assignedEmail: normalizeAssignedEmail(input.assignedEmail),
  }
}

export function canAdvanceAssignment(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return allowedTransitions[from].includes(to)
}

export function userCanOpenWorker(user: AuthenticatedUser, assignment: AssignmentView): boolean {
  if (assignment.status !== 'ready')
    return false
  return normalizeAssignedEmail(user.email) === assignment.assignedEmail
}
```

- [ ] **Step 4: Implement auth contract**

Create `packages/host-control/src/auth.ts`:

```ts
export interface AuthenticatedHostUser {
  email: string
  roles: string[]
  subject: string
}

export interface AuthProvider {
  authenticateRequest: (input: { headers: Headers }) => Promise<AuthenticatedHostUser | null>
}

export function userIsHostAdmin(user: AuthenticatedHostUser): boolean {
  return user.roles.includes('host:admin')
}

export function createStaticAuthProvider(user: AuthenticatedHostUser | null): AuthProvider {
  return {
    async authenticateRequest() {
      return user
    },
  }
}
```

- [ ] **Step 5: Implement access adapter helpers**

Create `packages/host-control/src/access-adapter.ts`:

```ts
export interface WorkerAccessConnection {
  close: () => void
  workerId: string
}

export interface WorkerAccessRegistry {
  get: (workerId: string) => WorkerAccessConnection | undefined
  has: (workerId: string) => boolean
  register: (connection: WorkerAccessConnection) => void
  remove: (workerId: string) => void
}

export function createWorkerAccessRegistry(): WorkerAccessRegistry {
  const connections = new Map<string, WorkerAccessConnection>()
  return {
    get(workerId) {
      return connections.get(workerId)
    },
    has(workerId) {
      return connections.has(workerId)
    },
    register(connection) {
      connections.get(connection.workerId)?.close()
      connections.set(connection.workerId, connection)
    },
    remove(workerId) {
      connections.delete(workerId)
    },
  }
}

export function sanitizeForwardHeaders(source: Headers): Headers {
  const next = new Headers(source)
  next.delete('authorization')
  next.delete('cookie')
  next.delete('set-cookie')
  return next
}
```

- [ ] **Step 6: Export new modules**

Modify `packages/host-control/src/index.ts` by adding these exports at the top or bottom:

```ts
export * from './access-adapter'
export * from './assignment'
export * from './auth'
```

Keep the existing `createWorkerRegistry` export intact for compatibility.

- [ ] **Step 7: Verify host-control**

Run:

```bash
bun run --filter '@zonease/aiworker-host-control' test
bun run --filter '@zonease/aiworker-host-control' typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/host-control/src
git commit -m "feat(host): 定义 assignment 与 access 边界"
```

## Task 4: Add Provision Protocol Schemas

**Files:**
- Modify: `packages/worker-control-protocol/src/index.ts`
- Modify: `packages/worker-control-protocol/src/index.test.ts`

- [ ] **Step 1: Write failing protocol tests**

Append these tests to `packages/worker-control-protocol/src/index.test.ts`:

```ts
import {
  parseWorkerAccessHello,
  parseWorkerCheckInRequest,
  parseWorkerCheckInResponse,
} from './index'

test('check-in request accepts only provision token and worker description', () => {
  const request = parseWorkerCheckInRequest({
    provisionToken: 'awp_token',
    worker: {
      health: { ready: true },
      id: 'ops-copilot',
      version: 'test',
      workerId: 'wkr_82',
      workbenchUrl: '/',
    },
  })
  expect(request.worker.workerId).toBe('wkr_82')
})

test('check-in request rejects runtime data and secrets', () => {
  expect(() => parseWorkerCheckInRequest({
    provisionToken: 'awp_token',
    sessionId: 'leak',
    worker: {
      health: { ready: true },
      id: 'ops-copilot',
      version: 'test',
      workerId: 'wkr_82',
      workbenchUrl: '/',
    },
  } as never)).toThrow()
})

test('check-in response returns assignment receipt and access URL only', () => {
  const response = parseWorkerCheckInResponse({
    access: { url: 'wss://aiworker.zonease.org/api/provision/access' },
    assignment: {
      assignedEmail: 'bob@zonease.org',
      assignmentId: 'asg_1',
      soulReleaseRef: 'ops-copilot@v1',
      workerId: 'wkr_82',
    },
  })
  expect(response.assignment.assignedEmail).toBe('bob@zonease.org')
})

test('access hello binds tunnel to worker id and assignment id', () => {
  const hello = parseWorkerAccessHello({
    assignmentId: 'asg_1',
    token: 'awt_tunnel',
    workerId: 'wkr_82',
  })
  expect(hello.workerId).toBe('wkr_82')
})

test('access request and response frames are strict protocol objects', () => {
  const request = parseWorkerAccessRequestEnvelope({
    bodyText: '',
    headers: { accept: 'text/html' },
    id: 'req_1',
    method: 'GET',
    path: '/workers/wkr_82',
    type: 'request',
  })
  expect(request.id).toBe('req_1')

  const response = parseWorkerAccessResponseEnvelope({
    bodyText: '<html></html>',
    headers: { 'content-type': 'text/html' },
    id: 'req_1',
    status: 200,
    type: 'response',
  })
  expect(response.status).toBe(200)
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun test packages/worker-control-protocol/src/index.test.ts --timeout=15000
```

Expected: FAIL because parser functions do not exist.

- [ ] **Step 3: Add schemas**

Add to `packages/worker-control-protocol/src/index.ts` after existing schemas:

```ts
export const workerCheckInRequestSchema = z.object({
  provisionToken: z.string().min(1),
  worker: workerDescribeSchema,
}).strict()

export const workerAssignmentReceiptSchema = z.object({
  assignedEmail: z.string().email(),
  assignmentId: z.string().min(1),
  soulReleaseRef: z.string().min(1),
  workerId: z.string().min(1),
}).strict()

export const workerCheckInResponseSchema = z.object({
  access: z.object({
    url: z.string().min(1),
  }).strict(),
  assignment: workerAssignmentReceiptSchema,
}).strict()

export const workerAccessHelloSchema = z.object({
  assignmentId: z.string().min(1),
  token: z.string().min(1),
  workerId: z.string().min(1),
}).strict()

export const workerAccessRequestEnvelopeSchema = z.object({
  bodyText: z.string(),
  headers: z.record(z.string()),
  id: z.string().min(1),
  method: z.string().min(1),
  path: z.string().min(1),
  type: z.literal('request'),
}).strict()

export const workerAccessResponseEnvelopeSchema = z.object({
  bodyText: z.string(),
  headers: z.record(z.string()),
  id: z.string().min(1),
  status: z.number().int().min(100).max(599),
  type: z.literal('response'),
}).strict()

export type WorkerAccessHello = z.infer<typeof workerAccessHelloSchema>
export type WorkerAccessRequestEnvelope = z.infer<typeof workerAccessRequestEnvelopeSchema>
export type WorkerAccessResponseEnvelope = z.infer<typeof workerAccessResponseEnvelopeSchema>
export type WorkerAssignmentReceipt = z.infer<typeof workerAssignmentReceiptSchema>
export type WorkerCheckInRequest = z.infer<typeof workerCheckInRequestSchema>
export type WorkerCheckInResponse = z.infer<typeof workerCheckInResponseSchema>

export function parseWorkerCheckInRequest(input: unknown): WorkerCheckInRequest {
  return workerCheckInRequestSchema.parse(input)
}

export function parseWorkerCheckInResponse(input: unknown): WorkerCheckInResponse {
  return workerCheckInResponseSchema.parse(input)
}

export function parseWorkerAccessHello(input: unknown): WorkerAccessHello {
  return workerAccessHelloSchema.parse(input)
}

export function parseWorkerAccessRequestEnvelope(input: unknown): WorkerAccessRequestEnvelope {
  return workerAccessRequestEnvelopeSchema.parse(input)
}

export function parseWorkerAccessResponseEnvelope(input: unknown): WorkerAccessResponseEnvelope {
  return workerAccessResponseEnvelopeSchema.parse(input)
}
```

- [ ] **Step 4: Verify protocol**

Run:

```bash
bun run --filter '@zonease/aiworker-worker-control-protocol' test
bun run --filter '@zonease/aiworker-worker-control-protocol' typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/worker-control-protocol/src/index.ts packages/worker-control-protocol/src/index.test.ts
git commit -m "feat(protocol): 添加 worker check-in 合同"
```

## Task 5: Build Host Server and Provision Routes

**Files:**
- Create: `apps/host-cli/src/host-server.ts`
- Create: `apps/host-cli/src/host-server.test.ts`
- Modify: `apps/host-cli/src/aiworker-host.ts`
- Modify: `apps/host-cli/src/aiworker-host.test.ts`
- Modify: `apps/host-cli/package.json`

- [ ] **Step 1: Add storage dependency to host-cli**

Modify `apps/host-cli/package.json` dependencies:

```json
"@zonease/aiworker-storage-sqlite": "workspace:*",
"@zonease/aiworker-worker-control-protocol": "workspace:*"
```

Keep existing dependencies.

- [ ] **Step 2: Write failing host server tests**

Create `apps/host-cli/src/host-server.test.ts`:

```ts
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeHostDb } from '@zonease/aiworker-storage-sqlite/host'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { createHostServer } from './host-server'

describe('aiworker-host server', () => {
  let dir = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiworker-host-server-'))
  })

  afterEach(async () => {
    closeHostDb()
    await rm(dir, { recursive: true, force: true })
  })

  it('creates assignment and does not return plaintext token in list response', async () => {
    const server = await createHostServer({
      authUser: { email: 'admin@zonease.org', roles: ['host:admin'], subject: 'admin' },
      dbPath: join(dir, 'host.db'),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })

    const createRes = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({
        assignedEmail: 'bob@zonease.org',
        serverRef: 'aissh:server-a',
        soulReleaseRef: 'ops-copilot@v1',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))
    expect(createRes.status).toBe(201)
    const created = await createRes.json() as { assignment: { assignedEmail: string }, provisionToken: string }
    expect(created.assignment.assignedEmail).toBe('bob@zonease.org')
    expect(created.provisionToken).toMatch(/^awp_/)

    const listRes = await server.fetch(new Request('http://host/api/host/assignments'))
    expect(listRes.status).toBe(200)
    expect(await listRes.text()).not.toContain(created.provisionToken)
  })

  it('check-in consumes token and returns access URL', async () => {
    const server = await createHostServer({
      authUser: { email: 'admin@zonease.org', roles: ['host:admin'], subject: 'admin' },
      dbPath: join(dir, 'host.db'),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })
    const createRes = await server.fetch(new Request('http://host/api/host/assignments', {
      body: JSON.stringify({ assignedEmail: 'bob@zonease.org', serverRef: 'aissh:server-a', soulReleaseRef: 'ops-copilot@v1' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))
    const created = await createRes.json() as { provisionToken: string }

    const checkInRes = await server.fetch(new Request('http://host/api/provision/check-in', {
      body: JSON.stringify({
        provisionToken: created.provisionToken,
        worker: {
          health: { ready: true },
          id: 'ops-copilot',
          version: 'test',
          workerId: 'wkr_82',
          workbenchUrl: '/',
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }))

    expect(checkInRes.status).toBe(200)
    expect(await checkInRes.json()).toMatchObject({
      access: { url: 'wss://aiworker.zonease.org/api/provision/access' },
      assignment: { assignedEmail: 'bob@zonease.org', workerId: 'wkr_82' },
    })
  })

  it('blocks worker route for non-assigned email', async () => {
    const server = await createHostServer({
      authUser: { email: 'alice@zonease.org', roles: ['aiworker:access'], subject: 'alice' },
      dbPath: join(dir, 'host.db'),
      publicBaseUrl: 'https://aiworker.zonease.org',
    })
    const res = await server.fetch(new Request('http://host/workers/wkr_missing'))
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts --timeout=15000
```

Expected: FAIL because `host-server.ts` does not exist.

- [ ] **Step 4: Implement host server**

Create `apps/host-cli/src/host-server.ts`:

```ts
import type { AuthenticatedHostUser } from '@zonease/aiworker-host-control'
import {
  createStaticAuthProvider,
  createWorkerAccessRegistry,
  userCanOpenWorker,
  userIsHostAdmin,
} from '@zonease/aiworker-host-control'
import {
  closeHostDb,
  createAssignment,
  getAssignmentByWorkerId,
  initHostDb,
  listAssignments,
  markAssignmentCheckedIn,
  runHostMigrations,
  verifyAndConsumeProvisionToken,
} from '@zonease/aiworker-storage-sqlite/host'
import {
  parseWorkerCheckInRequest,
} from '@zonease/aiworker-worker-control-protocol'

export interface HostServerOptions {
  authUser?: AuthenticatedHostUser | null
  dbPath: string
  publicBaseUrl: string
}

function json(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
}

function toWsUrl(baseUrl: string, path: string): string {
  const url = new URL(path, baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function toAssignmentView(row: NonNullable<ReturnType<typeof getAssignmentByWorkerId>>) {
  return {
    assignedEmail: row.assignedEmail,
    assignmentId: row.assignmentId,
    serverRef: row.serverRef,
    soulReleaseRef: row.soulReleaseRef,
    status: row.status,
    workerId: row.workerId,
    workbenchUrl: row.workbenchUrl,
  }
}

export async function createHostServer(options: HostServerOptions): Promise<{ fetch: (request: Request) => Promise<Response> }> {
  initHostDb(options.dbPath)
  runHostMigrations()
  const auth = createStaticAuthProvider(options.authUser ?? null)
  const access = createWorkerAccessRegistry()

  async function currentUser(request: Request): Promise<AuthenticatedHostUser | null> {
    return auth.authenticateRequest({ headers: request.headers })
  }

  return {
    async fetch(request: Request) {
      const url = new URL(request.url)

      if (url.pathname === '/api/host/assignments' && request.method === 'GET') {
        const user = await currentUser(request)
        if (!user || !userIsHostAdmin(user))
          return json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
        return json({ assignments: listAssignments().map(({ provisionTokenHash, ...row }) => row) })
      }

      if (url.pathname === '/api/host/assignments' && request.method === 'POST') {
        const user = await currentUser(request)
        if (!user || !userIsHostAdmin(user))
          return json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
        const body = await request.json() as { assignedEmail?: string, serverRef?: string, soulReleaseRef?: string }
        if (!body.assignedEmail || !body.serverRef || !body.soulReleaseRef)
          return json({ error: { code: 'ASSIGNMENT_INVALID' } }, { status: 400 })
        const created = createAssignment({
          assignedEmail: body.assignedEmail,
          serverRef: body.serverRef,
          soulReleaseRef: body.soulReleaseRef,
        })
        const { provisionTokenHash, ...assignment } = created.assignment
        return json({ assignment, provisionToken: created.provisionToken }, { status: 201 })
      }

      if (url.pathname === '/api/provision/check-in' && request.method === 'POST') {
        try {
          const input = parseWorkerCheckInRequest(await request.json())
          const token = verifyAndConsumeProvisionToken(input.provisionToken)
          if (!token)
            return json({ error: { code: 'PROVISION_TOKEN_INVALID' } }, { status: 401 })
          const row = markAssignmentCheckedIn(token.assignmentId, {
            workerId: input.worker.workerId,
            workerVersion: input.worker.version,
          })
          return json({
            access: { url: toWsUrl(options.publicBaseUrl, '/api/provision/access') },
            assignment: {
              assignedEmail: row.assignedEmail,
              assignmentId: row.assignmentId,
              soulReleaseRef: row.soulReleaseRef,
              workerId: input.worker.workerId,
            },
          })
        }
        catch (error) {
          return json({ error: { code: 'CHECK_IN_INVALID', message: error instanceof Error ? error.message : String(error) } }, { status: 400 })
        }
      }

      if (url.pathname.startsWith('/workers/') && request.method === 'GET') {
        const workerId = decodeURIComponent(url.pathname.split('/')[2] ?? '')
        const assignment = getAssignmentByWorkerId(workerId)
        if (!assignment)
          return json({ error: { code: 'WORKER_NOT_FOUND' } }, { status: 404 })
        const user = await currentUser(request)
        if (!user || !userCanOpenWorker({ email: user.email }, toAssignmentView(assignment)))
          return json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
        if (!access.has(workerId))
          return json({ error: { code: 'WORKER_ACCESS_NOT_READY' } }, { status: 503 })
        return json({ workerId, routed: true })
      }

      if (url.pathname === '/' || url.pathname === '/host')
        return new Response('AIWorker Host', { headers: { 'content-type': 'text/plain' } })

      return json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
    },
  }
}
```

- [ ] **Step 5: Add CLI command**

Modify `apps/host-cli/src/aiworker-host.ts`:

Add imports:

```ts
import { createHostServer } from './host-server'
```

Extend `HostCliDeps`:

```ts
export interface HostCliDeps {
  registry?: WorkerRegistry
  serverFactory?: typeof createHostServer
}
```

Add command before `cli.help()`:

```ts
cli
  .command('serve', 'start the AIWorker Host server')
  .option('--db <path>', 'Host sqlite DB path', { default: `${process.cwd()}/host.db` })
  .option('--public-base-url <url>', 'Public base URL', { default: 'https://aiworker.zonease.org' })
  .option('--port <port>', 'Port', { default: '9230' })
  .action(async (options: { db: string, port: string, publicBaseUrl: string }) => {
    const server = await (deps.serverFactory ?? createHostServer)({
      authUser: { email: 'admin@zonease.org', roles: ['host:admin'], subject: 'dev-admin' },
      dbPath: options.db,
      publicBaseUrl: options.publicBaseUrl,
    })
    const port = Number(options.port)
    Bun.serve({ fetch: server.fetch, port })
    printJson({ listening: true, port, publicBaseUrl: options.publicBaseUrl })
  })
```

- [ ] **Step 6: Add CLI serve test**

Append to `apps/host-cli/src/aiworker-host.test.ts`:

```ts
it('wires serve command through injected server factory', async () => {
  let called = false
  const code = await runHostCli(['serve', '--db', '/tmp/host.db', '--port', '9230'], {
    serverFactory: async () => {
      called = true
      return { fetch: async () => new Response('ok') }
    },
  })
  expect(code).toBe(0)
  expect(called).toBe(true)
})
```

If the test hangs because `Bun.serve` keeps a listener open, refactor `serve` command to accept `deps.bunServe`:

```ts
bunServe?: typeof Bun.serve
```

and use:

```ts
(deps.bunServe ?? Bun.serve)({ fetch: server.fetch, port })
```

In the test pass:

```ts
bunServe: (() => ({ stop: () => {} })) as never
```

- [ ] **Step 7: Verify host-cli**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts apps/host-cli/src/aiworker-host.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-host-cli' typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/host-cli/src apps/host-cli/package.json
git commit -m "feat(host): 添加 provisioning server"
```

## Task 6: Add Worker Provision Command and Check-in Client

**Files:**
- Modify: `apps/worker-cli/src/aiworker.ts`
- Create: `apps/worker-cli/src/provision.test.ts`
- Create: `packages/worker-daemon/src/modes/worker/provision-client.ts`
- Create: `packages/worker-daemon/src/modes/worker/provision-client.test.ts`
- Modify: `packages/worker-daemon/src/modes/worker.ts`

- [ ] **Step 1: Write failing provision client tests**

Create `packages/worker-daemon/src/modes/worker/provision-client.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'

import { buildCheckInBody, checkInToHost } from './provision-client'

describe('worker provision client', () => {
  it('builds check-in body without session or runtime data', () => {
    const body = buildCheckInBody({
      id: 'ops-copilot',
      provisionToken: 'awp_token',
      version: 'test',
      workerId: 'wkr_82',
      workbenchUrl: '/',
    })
    expect(body).toEqual({
      provisionToken: 'awp_token',
      worker: {
        health: { ready: true },
        id: 'ops-copilot',
        version: 'test',
        workerId: 'wkr_82',
        workbenchUrl: '/',
      },
    })
    expect(body).not.toHaveProperty('sessionId')
  })

  it('posts check-in to Host and parses response', async () => {
    const response = await checkInToHost({
      fetcher: async (url, init) => {
        expect(String(url)).toBe('https://aiworker.zonease.org/api/provision/check-in')
        expect(init?.method).toBe('POST')
        return new Response(JSON.stringify({
          access: { url: 'wss://aiworker.zonease.org/api/provision/access' },
          assignment: {
            assignedEmail: 'bob@zonease.org',
            assignmentId: 'asg_1',
            soulReleaseRef: 'ops-copilot@v1',
            workerId: 'wkr_82',
          },
        }), { headers: { 'content-type': 'application/json' } })
      },
      host: 'https://aiworker.zonease.org',
      id: 'ops-copilot',
      provisionToken: 'awp_token',
      version: 'test',
      workerId: 'wkr_82',
      workbenchUrl: '/',
    })

    expect(response.assignment.assignedEmail).toBe('bob@zonease.org')
  })
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
bun test packages/worker-daemon/src/modes/worker/provision-client.test.ts --timeout=15000
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement provision client**

Create `packages/worker-daemon/src/modes/worker/provision-client.ts`:

```ts
import {
  parseWorkerCheckInResponse,
  type WorkerCheckInRequest,
  type WorkerCheckInResponse,
} from '@zonease/aiworker-worker-control-protocol'

export interface BuildCheckInInput {
  id: string
  provisionToken: string
  version: string
  workerId: string
  workbenchUrl: string
}

export interface CheckInInput extends BuildCheckInInput {
  fetcher?: typeof fetch
  host: string
}

export function buildCheckInBody(input: BuildCheckInInput): WorkerCheckInRequest {
  return {
    provisionToken: input.provisionToken,
    worker: {
      health: { ready: true },
      id: input.id,
      version: input.version,
      workerId: input.workerId,
      workbenchUrl: input.workbenchUrl,
    },
  }
}

export async function checkInToHost(input: CheckInInput): Promise<WorkerCheckInResponse> {
  const fetcher = input.fetcher ?? fetch
  const url = new URL('/api/provision/check-in', input.host)
  const res = await fetcher(url, {
    body: JSON.stringify(buildCheckInBody(input)),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!res.ok)
    throw new Error(`Worker check-in failed: ${res.status}`)
  return parseWorkerCheckInResponse(await res.json())
}
```

- [ ] **Step 4: Write failing worker CLI provision test**

Create `apps/worker-cli/src/provision.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'

import { buildProvisionEnv, redactProvisionCommandForLog } from './aiworker'

describe('aiworker provision command helpers', () => {
  it('builds provision env without logging token', () => {
    const env = buildProvisionEnv({
      host: 'https://aiworker.zonease.org',
      token: 'awp_secret',
    })
    expect(env.AIWORKER_HOST_URL).toBe('https://aiworker.zonease.org')
    expect(env.AIWORKER_PROVISION_TOKEN).toBe('awp_secret')
  })

  it('redacts provision token in log output', () => {
    expect(redactProvisionCommandForLog('aiworker provision --host https://aiworker.zonease.org --token awp_secret'))
      .toBe('aiworker provision --host https://aiworker.zonease.org --token [REDACTED]')
  })
})
```

- [ ] **Step 5: Add CLI provision helpers**

In `apps/worker-cli/src/aiworker.ts`, export helpers near other exported test seams:

```ts
export interface ProvisionCommandInput {
  host: string
  token: string
}

export function buildProvisionEnv(input: ProvisionCommandInput): Record<string, string> {
  return {
    AIWORKER_HOST_URL: input.host,
    AIWORKER_PROVISION_TOKEN: input.token,
  }
}

export function redactProvisionCommandForLog(value: string): string {
  return value.replace(/(--token\s+)(\S+)/g, '$1[REDACTED]')
}
```

Add CLI command near daemon/start commands:

```ts
cli
  .command('provision', 'start this Worker with a Host assignment')
  .requiredOption('--host <url>', 'Host public URL')
  .requiredOption('--token <token>', 'One-time provision token')
  .action(async (options: { host: string, token: string }) => {
    const env = buildProvisionEnv({ host: options.host, token: options.token })
    for (const [key, value] of Object.entries(env))
      process.env[key] = value
    consola.info(redactProvisionCommandForLog(`aiworker provision --host ${options.host} --token ${options.token}`))
    await daemonForeground({})
  })
```

`daemonForeground` already exists in `apps/worker-cli/src/aiworker.ts`, so the provision command can call it directly from the same module. Do not duplicate daemon startup logic.

- [ ] **Step 6: Wire worker daemon bootstrap to provision env**

In `packages/worker-daemon/src/modes/worker.ts`, after active worker resolution succeeds and before returning the app, check env:

```ts
const provisionHost = process.env.AIWORKER_HOST_URL
const provisionToken = process.env.AIWORKER_PROVISION_TOKEN
if (provisionHost && provisionToken && activeResolution.kind === 'single') {
  await checkInToHost({
    host: provisionHost,
    id: activeResolution.worker.appId,
    provisionToken,
    version: state.runtimeVersion,
    workerId: activeResolution.worker.id,
    workbenchUrl: '/',
  })
}
```

Add import:

```ts
import { checkInToHost } from './worker/provision-client'
```

If tests become flaky due to real network, extend `BootstrapWorkerAppOptions` with:

```ts
provisionCheckIn?: typeof checkInToHost
```

and call `options.provisionCheckIn ?? checkInToHost`.

- [ ] **Step 7: Verify provision pieces**

Run:

```bash
bun test packages/worker-daemon/src/modes/worker/provision-client.test.ts apps/worker-cli/src/provision.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-worker-daemon' typecheck
bun run --filter '@zonease/aiworker-cli' typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/worker-cli/src packages/worker-daemon/src/modes/worker.ts packages/worker-daemon/src/modes/worker/provision-client.ts packages/worker-daemon/src/modes/worker/provision-client.test.ts
git commit -m "feat(worker): 添加 provision check-in"
```

## Task 7: Add Reverse Tunnel Skeleton

**Files:**
- Modify: `apps/host-cli/src/host-server.ts`
- Modify: `apps/host-cli/src/host-server.test.ts`
- Modify: `packages/worker-daemon/src/modes/worker/provision-client.ts`
- Modify: `packages/worker-daemon/src/modes/worker/provision-client.test.ts`

- [ ] **Step 1: Add access hello tests**

Append to `packages/worker-daemon/src/modes/worker/provision-client.test.ts`:

```ts
import { buildAccessHello } from './provision-client'

it('builds access hello for WebSocket reverse tunnel', () => {
  expect(buildAccessHello({
    assignmentId: 'asg_1',
    token: 'awt_token',
    workerId: 'wkr_82',
  })).toEqual({
    assignmentId: 'asg_1',
    token: 'awt_token',
    workerId: 'wkr_82',
  })
})
```

- [ ] **Step 2: Implement access hello helper**

Add to `packages/worker-daemon/src/modes/worker/provision-client.ts`:

```ts
import { type WorkerAccessHello } from '@zonease/aiworker-worker-control-protocol'

export function buildAccessHello(input: WorkerAccessHello): WorkerAccessHello {
  return {
    assignmentId: input.assignmentId,
    token: input.token,
    workerId: input.workerId,
  }
}
```

- [ ] **Step 3: Add Host access route test**

Append to `apps/host-cli/src/host-server.test.ts`:

```ts
it('returns 426 for access route without websocket upgrade', async () => {
  const server = await createHostServer({
    authUser: { email: 'admin@zonease.org', roles: ['host:admin'], subject: 'admin' },
    dbPath: join(dir, 'host.db'),
    publicBaseUrl: 'https://aiworker.zonease.org',
  })
  const res = await server.fetch(new Request('http://host/api/provision/access'))
  expect(res.status).toBe(426)
})
```

- [ ] **Step 4: Add route skeleton**

In `apps/host-cli/src/host-server.ts`, add before the 404:

```ts
if (url.pathname === '/api/provision/access')
  return json({ error: { code: 'WEBSOCKET_REQUIRED' } }, { status: 426 })
```

Do not implement full byte-level HTTP multiplexing in this task. This task establishes the route contract and worker hello builder; full tunnel forwarding is Task 8.

- [ ] **Step 5: Verify tunnel skeleton**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts packages/worker-daemon/src/modes/worker/provision-client.test.ts --timeout=15000
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/host-cli/src/host-server.ts apps/host-cli/src/host-server.test.ts packages/worker-daemon/src/modes/worker/provision-client.ts packages/worker-daemon/src/modes/worker/provision-client.test.ts
git commit -m "feat(access): 建立 reverse tunnel 合同"
```

## Task 8: Implement Worker Access Streaming Forwarding

**Files:**
- Modify: `apps/host-cli/src/host-server.ts`
- Modify: `apps/host-cli/src/host-server.test.ts`
- Modify: `packages/host-control/src/access-adapter.ts`
- Modify: `packages/host-control/src/access-adapter.test.ts`
- Modify: `packages/worker-daemon/src/modes/worker/provision-client.ts`
- Modify: `packages/worker-daemon/src/modes/worker/provision-client.test.ts`

- [ ] **Step 1: Write request envelope tests**

Append to `packages/host-control/src/access-adapter.test.ts`:

```ts
import { createAccessRequestEnvelope, parseAccessResponseEnvelope } from './access-adapter'

  it('creates minimal access request frame', () => {
    expect(createAccessRequestEnvelope({
      bodyText: '',
      headers: new Headers({ accept: 'text/html' }),
      method: 'GET',
      path: '/workers/wkr_82',
    })).toEqual({
      bodyText: '',
      headers: { accept: 'text/html' },
      id: 'req_1',
      method: 'GET',
      path: '/workers/wkr_82',
      type: 'request',
    })
  })

  it('parses access response frames', () => {
    expect(parseAccessResponseEnvelope({
      bodyText: '<html></html>',
      headers: { 'content-type': 'text/html' },
      id: 'req_1',
      status: 200,
      type: 'response',
    })).toEqual({
      bodyText: '<html></html>',
      headers: { 'content-type': 'text/html' },
      id: 'req_1',
      status: 200,
      type: 'response',
    })
  })
```

- [ ] **Step 2: Implement framed envelope helpers**

Add to `packages/host-control/src/access-adapter.ts`:

```ts
import {
  parseWorkerAccessResponseEnvelope,
  type WorkerAccessRequestEnvelope,
  type WorkerAccessResponseEnvelope,
} from '@zonease/aiworker-worker-control-protocol'

export function createAccessRequestEnvelope(input: { bodyText: string, headers: Headers, method: string, path: string }): WorkerAccessRequestEnvelope {
  return {
    bodyText: input.bodyText,
    headers: Object.fromEntries(sanitizeForwardHeaders(input.headers).entries()),
    id: 'req_1',
    method: input.method,
    path: input.path,
    type: 'request',
  }
}

export function parseAccessResponseEnvelope(input: unknown): WorkerAccessResponseEnvelope {
  return parseWorkerAccessResponseEnvelope(input)
}
```

- [ ] **Step 3: Add host forwarding test seam**

Append to `apps/host-cli/src/host-server.test.ts`:

```ts
it('worker route refuses ready assignment when access connection is missing', async () => {
  const server = await createHostServer({
    authUser: { email: 'bob@zonease.org', roles: ['aiworker:access'], subject: 'bob' },
    dbPath: join(dir, 'host.db'),
    publicBaseUrl: 'https://aiworker.zonease.org',
  })
  const admin = await createHostServer({
    authUser: { email: 'admin@zonease.org', roles: ['host:admin'], subject: 'admin' },
    dbPath: join(dir, 'host.db'),
    publicBaseUrl: 'https://aiworker.zonease.org',
  })
  const created = await (await admin.fetch(new Request('http://host/api/host/assignments', {
    body: JSON.stringify({ assignedEmail: 'bob@zonease.org', serverRef: 'aissh:server-a', soulReleaseRef: 'ops-copilot@v1' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }))).json() as { provisionToken: string }
  await admin.fetch(new Request('http://host/api/provision/check-in', {
    body: JSON.stringify({
      provisionToken: created.provisionToken,
      worker: { health: { ready: true }, id: 'ops-copilot', version: 'test', workerId: 'wkr_82', workbenchUrl: '/' },
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }))

  const res = await server.fetch(new Request('http://host/workers/wkr_82'))
  expect(res.status).toBe(503)
})
```

- [ ] **Step 4: Add Worker-side local forwarding helper**

Append to `packages/worker-daemon/src/modes/worker/provision-client.test.ts`:

```ts
import { handleAccessRequestEnvelope } from './provision-client'

it('forwards access request envelope to local Worker web', async () => {
  const response = await handleAccessRequestEnvelope({
    envelope: {
      bodyText: '',
      headers: { accept: 'text/html' },
      id: 'req_1',
      method: 'GET',
      path: '/workers/wkr_82',
      type: 'request',
    },
    fetcher: async (url) => {
      expect(String(url)).toBe('http://127.0.0.1:9217/workers/wkr_82')
      return new Response('<html>worker</html>', { headers: { 'content-type': 'text/html' }, status: 200 })
    },
    localBaseUrl: 'http://127.0.0.1:9217',
  })

  expect(response).toEqual({
    bodyText: '<html>worker</html>',
    headers: { 'content-type': 'text/html' },
    id: 'req_1',
    status: 200,
    type: 'response',
  })
})
```

Add to `packages/worker-daemon/src/modes/worker/provision-client.ts`:

```ts
import {
  type WorkerAccessRequestEnvelope,
  type WorkerAccessResponseEnvelope,
} from '@zonease/aiworker-worker-control-protocol'

export async function handleAccessRequestEnvelope(input: {
  envelope: WorkerAccessRequestEnvelope
  fetcher?: typeof fetch
  localBaseUrl: string
}): Promise<WorkerAccessResponseEnvelope> {
  const fetcher = input.fetcher ?? fetch
  const localUrl = new URL(input.envelope.path, input.localBaseUrl)
  const res = await fetcher(localUrl, {
    body: input.envelope.method === 'GET' || input.envelope.method === 'HEAD' ? undefined : input.envelope.bodyText,
    headers: input.envelope.headers,
    method: input.envelope.method,
  })
  return {
    bodyText: await res.text(),
    headers: Object.fromEntries(res.headers.entries()),
    id: input.envelope.id,
    status: res.status,
    type: 'response',
  }
}
```

- [ ] **Step 5: Keep not-ready behavior explicit until a connection registers**

In `apps/host-cli/src/host-server.ts`, keep this behavior:

```ts
if (!access.has(workerId))
  return json({ error: { code: 'WORKER_ACCESS_NOT_READY' } }, { status: 503 })
```

Add this comment above the branch:

```ts
// Until a Worker access connection is registered, the employee URL is not ready
// and Host must not pretend it is. aissh success and check-in are not enough.
```

- [ ] **Step 6: Verify**

Run:

```bash
bun test packages/host-control/src/access-adapter.test.ts apps/host-cli/src/host-server.test.ts packages/worker-daemon/src/modes/worker/provision-client.test.ts --timeout=15000
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/host-control/src/access-adapter.ts packages/host-control/src/access-adapter.test.ts apps/host-cli/src/host-server.ts apps/host-cli/src/host-server.test.ts packages/worker-daemon/src/modes/worker/provision-client.ts packages/worker-daemon/src/modes/worker/provision-client.test.ts
git commit -m "feat(access): 添加 worker access 转发帧"
```

## Task 9: Add Logto Provider Adapter Boundary

**Files:**
- Create: `apps/host-cli/src/logto-auth.ts`
- Create: `apps/host-cli/src/logto-auth.test.ts`
- Modify: `apps/host-cli/src/host-server.ts`
- Modify: `apps/host-cli/package.json`

- [ ] **Step 1: Add dependency**

Add to `apps/host-cli/package.json` dependencies:

```json
"jose": "^6.1.0"
```

- [ ] **Step 2: Write failing Logto tests**

Create `apps/host-cli/src/logto-auth.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'

import { extractBearerToken, mapLogtoClaimsToUser } from './logto-auth'

describe('logto auth adapter', () => {
  it('extracts bearer token', () => {
    expect(extractBearerToken(new Headers({ authorization: 'Bearer abc.def' }))).toBe('abc.def')
    expect(extractBearerToken(new Headers({ authorization: 'Basic no' }))).toBeNull()
  })

  it('maps logto claims to host user without worker permissions', () => {
    const user = mapLogtoClaimsToUser({
      email: 'Bob@Zonease.org',
      email_verified: true,
      roles: ['host:admin'],
      sub: 'logto-user',
    })
    expect(user).toEqual({
      email: 'bob@zonease.org',
      roles: ['host:admin'],
      subject: 'logto-user',
    })
  })

  it('rejects unverified email', () => {
    expect(() => mapLogtoClaimsToUser({
      email: 'bob@zonease.org',
      email_verified: false,
      sub: 'logto-user',
    })).toThrow('email is not verified')
  })
})
```

- [ ] **Step 3: Implement Logto adapter**

Create `apps/host-cli/src/logto-auth.ts`:

```ts
import type { AuthProvider, AuthenticatedHostUser } from '@zonease/aiworker-host-control'
import { createRemoteJWKSet, jwtVerify } from 'jose'

export interface LogtoClaims {
  email?: unknown
  email_verified?: unknown
  roles?: unknown
  sub?: unknown
}

export interface LogtoAuthOptions {
  audience: string
  issuer: string
}

export function extractBearerToken(headers: Headers): string | null {
  const auth = headers.get('authorization')
  const match = auth?.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

export function mapLogtoClaimsToUser(claims: LogtoClaims): AuthenticatedHostUser {
  if (typeof claims.sub !== 'string' || claims.sub.length === 0)
    throw new Error('missing subject')
  if (typeof claims.email !== 'string' || claims.email.length === 0)
    throw new Error('missing email')
  if (claims.email_verified !== true)
    throw new Error('email is not verified')
  const roles = Array.isArray(claims.roles)
    ? claims.roles.filter((role): role is string => typeof role === 'string')
    : []
  return {
    email: claims.email.trim().toLowerCase(),
    roles,
    subject: claims.sub,
  }
}

export function createLogtoAuthProvider(options: LogtoAuthOptions): AuthProvider {
  const jwks = createRemoteJWKSet(new URL('/oidc/jwks', options.issuer))
  return {
    async authenticateRequest(input) {
      const token = extractBearerToken(input.headers)
      if (!token)
        return null
      const result = await jwtVerify(token, jwks, {
        audience: options.audience,
        issuer: options.issuer,
      })
      return mapLogtoClaimsToUser(result.payload as LogtoClaims)
    },
  }
}
```

- [ ] **Step 4: Wire auth provider into host server options**

In `apps/host-cli/src/host-server.ts`, update options:

```ts
import type { AuthProvider } from '@zonease/aiworker-host-control'

export interface HostServerOptions {
  authProvider?: AuthProvider
  authUser?: AuthenticatedHostUser | null
  dbPath: string
  publicBaseUrl: string
}
```

Replace:

```ts
const auth = createStaticAuthProvider(options.authUser ?? null)
```

with:

```ts
const auth = options.authProvider ?? createStaticAuthProvider(options.authUser ?? null)
```

- [ ] **Step 5: Verify auth**

Run:

```bash
bun test apps/host-cli/src/logto-auth.test.ts apps/host-cli/src/host-server.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-host-cli' typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/host-cli/src/logto-auth.ts apps/host-cli/src/logto-auth.test.ts apps/host-cli/src/host-server.ts apps/host-cli/package.json bun.lock
git commit -m "feat(host): 添加 logto 鉴权适配器"
```

## Task 10: Host Web MVP Flow

**Files:**
- Modify: `apps/host-web/src/app.tsx`
- Modify: `apps/host-web/src/app.test.tsx`

- [ ] **Step 1: Replace Host Web tests with MVP flow tests**

Update `apps/host-web/src/app.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HostControlPlane } from './app'

describe('host-web phase 2 MVP control plane', () => {
  it('renders worker assignment list without micro-app or iframe', () => {
    const { container } = render(<HostControlPlane />)
    expect(container.querySelector('micro-app')).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
    expect(screen.getByText('AI Workers')).toBeTruthy()
    expect(screen.getByText('开通 AI Worker')).toBeTruthy()
  })

  it('shows exact employee, server, soul release, and readiness', () => {
    render(<HostControlPlane assignments={[{
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
      status: 'ready',
      workerId: 'wkr_82',
      workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82',
    }]} />)
    expect(screen.getByText('bob@zonease.org')).toBeTruthy()
    expect(screen.getByText('aissh:server-a')).toBeTruthy()
    expect(screen.getByText('ops-copilot@v1')).toBeTruthy()
    expect(screen.getByText('已可用')).toBeTruthy()
  })

  it('does not mark provisioning assignment as ready', () => {
    render(<HostControlPlane assignments={[{
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh:server-a',
      soulReleaseRef: 'ops-copilot@v1',
      status: 'provisioning',
      workerId: null,
      workbenchUrl: null,
    }]} />)
    expect(screen.getByText('开通中')).toBeTruthy()
    expect(screen.queryByText('打开 Worker')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-host-web' test
```

Expected: FAIL because `HostControlPlane` props are not implemented.

- [ ] **Step 3: Implement Host Web MVP**

Replace `apps/host-web/src/app.tsx` with:

```tsx
import { Badge } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@zonease/aiworker-ui/components/card'

type AssignmentStatus = 'draft' | 'provisioning' | 'checked_in' | 'access_ready' | 'ready' | 'needs_attention' | 'revoked' | 'archived'

export interface HostAssignmentSummary {
  assignedEmail: string
  serverRef: string
  soulReleaseRef: string
  status: AssignmentStatus
  workerId: null | string
  workbenchUrl: null | string
}

const defaultAssignments: HostAssignmentSummary[] = [
  {
    assignedEmail: 'alice@zonease.org',
    serverRef: 'aissh:server-a',
    soulReleaseRef: 'review-assistant@v3',
    status: 'ready',
    workerId: 'wkr_alice',
    workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_alice',
  },
  {
    assignedEmail: 'bob@zonease.org',
    serverRef: 'aissh:server-b',
    soulReleaseRef: 'ops-copilot@v1',
    status: 'provisioning',
    workerId: null,
    workbenchUrl: null,
  },
]

function statusLabel(status: AssignmentStatus): string {
  if (status === 'ready')
    return '已可用'
  if (status === 'needs_attention')
    return '需处理'
  if (status === 'revoked')
    return '已撤销'
  if (status === 'archived')
    return '已归档'
  return '开通中'
}

export interface HostControlPlaneProps {
  assignments?: HostAssignmentSummary[]
}

export function HostControlPlane({ assignments = defaultAssignments }: HostControlPlaneProps = {}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col gap-4 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">AI Workers</h1>
          <p className="text-muted-foreground text-sm">
            给员工开通专属 Worker，并等待 check-in 与访问入口 ready。
          </p>
        </div>
        <Button>开通 AI Worker</Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>员工 Worker</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {assignments.map(assignment => (
              <div
                className="grid grid-cols-[1.2fr_1fr_1fr_auto] items-center gap-3 border-b py-3 text-sm last:border-b-0"
                key={assignment.assignedEmail}
              >
                <div>
                  <div className="font-medium">{assignment.assignedEmail}</div>
                  <div className="text-muted-foreground text-xs">{assignment.workerId ?? '等待 Worker check-in'}</div>
                </div>
                <div>{assignment.soulReleaseRef}</div>
                <div>{assignment.serverRef}</div>
                <div className="flex items-center gap-2">
                  <Badge variant={assignment.status === 'ready' ? 'default' : 'secondary'}>{statusLabel(assignment.status)}</Badge>
                  {assignment.status === 'ready' && assignment.workbenchUrl
                    ? <a className="text-primary text-sm font-medium underline-offset-4 hover:underline" href={assignment.workbenchUrl}>打开 Worker</a>
                    : null}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
```

- [ ] **Step 4: Verify UI**

Run:

```bash
bun run --filter '@zonease/aiworker-host-web' test
bun run --filter '@zonease/aiworker-host-web' typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/host-web/src/app.tsx apps/host-web/src/app.test.tsx
git commit -m "feat(host-web): 展示 phase2 worker 开通清单"
```

## Task 11: Browser Proof and Release Gates

**Files:**
- Create: `tests/browser/phase2-host-worker-access.spec.ts`
- Modify: `docs/testing.md`
- Modify: `package.json`

- [ ] **Step 1: Add browser proof script**

Create `tests/browser/phase2-host-worker-access.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('Host route is not Worker route and Worker URL has no Host chrome', async ({ page }) => {
  await page.goto(process.env.AIWORKER_PHASE2_URL ?? 'http://127.0.0.1:9230/host')
  await expect(page.getByText('AI Workers')).toBeVisible()
  await expect(page.getByText('开通 AI Worker')).toBeVisible()

  await page.goto(process.env.AIWORKER_PHASE2_WORKER_URL ?? 'http://127.0.0.1:9230/workers/wkr_82')
  await expect(page.locator('micro-app')).toHaveCount(0)
  await expect(page.locator('iframe')).toHaveCount(0)
})
```

- [ ] **Step 2: Add package script**

Add to root `package.json` scripts:

```json
"test:browser:phase2": "bun run --filter '@zonease/aiworker-host-web' build && bun tests/browser/phase2-host-worker-access.spec.ts"
```

- [ ] **Step 3: Document gate**

Add to `docs/testing.md` Current Release Gates or Phase 2 section:

```text
bun run test:browser:phase2
```

Add this explanation:

```markdown
The Phase 2 browser proof verifies that `/host` is the administrator control
plane and `/workers/:workerId` is not a Host-mounted Worker UI. It must find no
`micro-app` or `iframe` on the Worker route.
```

- [ ] **Step 4: Verify docs and package contract**

Run:

```bash
bun run docs:check
bun run test:contracts
```

Expected: PASS.

- [ ] **Step 5: Run focused package tests**

Run:

```bash
bun run --filter '@zonease/aiworker-host-control' test
bun run --filter '@zonease/aiworker-host-cli' test
bun run --filter '@zonease/aiworker-host-web' test
bun run --filter '@zonease/aiworker-worker-control-protocol' test
bun run --filter '@zonease/aiworker-worker-daemon' test
bun run --filter '@zonease/aiworker-cli' test
```

Expected: PASS.

- [ ] **Step 6: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/browser/phase2-host-worker-access.spec.ts docs/testing.md package.json
git commit -m "test(phase2): 添加 host worker access 浏览器证明"
```

## Task 12: Final Verification and Review

**Files:**
- No new files expected.

- [ ] **Step 1: Run release-adjacent focused verification**

Run:

```bash
bun run docs:check
bun run test:contracts
bun run --filter '@zonease/aiworker-host-control' test
bun run --filter '@zonease/aiworker-host-cli' test
bun run --filter '@zonease/aiworker-host-web' test
bun run --filter '@zonease/aiworker-worker-control-protocol' test
bun run --filter '@zonease/aiworker-worker-daemon' test
bun run --filter '@zonease/aiworker-cli' test
bun run typecheck
```

Expected: all PASS.

- [ ] **Step 2: Run code-review-graph**

Run:

```bash
bun run crg:review
```

Expected: code-review-graph returns a change summary without blocker findings. If it reports likely issues, fix them before completion.

- [ ] **Step 3: Inspect git history and status**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: working tree clean; recent commits show docs promotion, storage, host-control, protocol, host server, worker provision, access, auth, UI, browser proof.

- [ ] **Step 4: Summarize implementation result**

Report:

```text
Implemented Phase 2 MVP vertical spine:
- canonical docs promoted
- Host assignments and provision token storage
- Worker check-in protocol
- Host server provisioning API
- Worker provision command and check-in client
- Worker Access Adapter boundary
- Logto auth adapter
- Host Web MVP list
- focused contract/browser tests
```

Do not claim production-ready WebSocket browser-upgrade forwarding unless a real Worker route has proven it. Claim only the verified HTTP/SSE-style request/response access path that the tests cover.

## Self-Review

Spec coverage:

- Product flow: Tasks 5, 6, 10.
- URL contract: Tasks 1, 5, 11.
- Assignment security: Tasks 2, 3, 5.
- Access Adapter boundary: Tasks 3, 7, 8.
- Logto boundary: Task 9.
- State machine: Tasks 2, 3, 10.
- Non-goals and no-mount guardrails: Tasks 1, 10, 11.
- Canonical docs impact: Task 1.

Known implementation boundary:

- This plan creates a safe Phase 2 MVP spine and a framed request/response access path. Direct browser WebSocket upgrade forwarding is intentionally not claimed unless a later test proves it with the real Worker route.

Placeholder scan:

- No placeholder markers or unspecified test commands are intentionally left.

Type consistency:

- Assignment status names match the design spec.
- `workerId`, `assignedEmail`, `soulReleaseRef`, `serverRef`, and `workbenchUrl` are used consistently across storage, host-control, protocol, server, and UI.
