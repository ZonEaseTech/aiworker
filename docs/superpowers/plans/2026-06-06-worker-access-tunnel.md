# Worker Access Tunnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 2.1 managed employee access through a Worker-initiated WebSocket tunnel while preserving local Worker autonomy.

**Architecture:** Canonical docs and guardrail tests land first. Host owns Logto/assignment authorization, access-token validation, tunnel registry, and `/workers/:workerId/*` routing. Worker owns check-in, WebSocket tunnel connection, and local Workbench request handling through the current daemon context; provisioning adapters only deliver `AIWORKER_HOST_URL` and `AIWORKER_PROVISION_TOKEN`.

**Tech Stack:** Bun, TypeScript, Hono/OpenAPIHono, Zod, SQLite/Drizzle, Playwright, existing `@zonease/aiworker-*` packages.

---

## Scope Check

This plan implements one subsystem: Worker Access Tunnel. It intentionally does not implement provisioning target adapters, production gateway hardening, HTTP long-poll fallback, token rotation, Cloudflare/Caddy proof, binary streaming, or load balancing.

## File Structure

- `docs/architecture.md`: promote managed access vs local autonomy.
- `docs/protocol.md`: define WebSocket-only tunnel route and frame contract.
- `docs/runtime.md`: state that Worker remains locally operable without Host.
- `docs/testing.md`: add Phase 2.1 guardrail coverage.
- `tests/architecture/inversion-guards.test.ts`: pin docs wording so `Host-only` cannot regress into Worker runtime dependency.
- `packages/worker-control-protocol/src/index.ts`: add strict tunnel frame schemas.
- `packages/worker-control-protocol/src/index.test.ts`: frame parser tests.
- `packages/storage-sqlite/src/host/schema.ts`: add access-token hash metadata fields.
- `packages/storage-sqlite/src/host/index.ts`: issue and verify tunnel access tokens; revoke invalidates tokens through existing revoked state.
- `packages/storage-sqlite/src/host/index.test.ts`: token issuance, verification, revoked denial, redaction tests.
- `packages/host-control/src/access-adapter.ts`: evolve registry to request/response tunnel connection interface and path mapping helper.
- `packages/host-control/src/access-adapter.test.ts`: registry, header stripping, path mapping, pending request tests.
- `apps/host-cli/src/host-server.ts`: add WebSocket upgrade seam, access endpoint, access-token validation, tunnel registration, `/workers/:workerId/*` forwarding.
- `apps/host-cli/src/host-server.test.ts`: Host route, security, tunnel lifecycle tests.
- `apps/host-cli/src/aiworker-host.ts`: pass Bun server and websocket handler to Host server.
- `apps/host-cli/src/host-lifecycle.ts`: same Bun serve integration for lifecycle start/foreground.
- `packages/worker-daemon/src/modes/worker/provision-client.ts`: add tunnel client and internal request forwarding without a local-url env.
- `packages/worker-daemon/src/modes/worker/provision-client.test.ts`: check-in-before-tunnel, no-env no-tunnel, frame handling tests.
- `packages/worker-daemon/src/modes/worker.ts`: wire tunnel client after bootstrap using the current daemon app context.
- `apps/host-web/src/app.tsx`: show access states and employee link only when managed access is reachable.
- `apps/host-web/src/app.test.tsx`: no localhost employee URL, ready/not-ready labels.
- `tests/browser/phase2-host-worker-access.spec.ts`: replace placeholder proof with real Host-to-Worker tunnel proof.

## Task 1: Canonical Docs And Guardrail Tests

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/protocol.md`
- Modify: `docs/runtime.md`
- Modify: `docs/testing.md`
- Modify: `tests/architecture/inversion-guards.test.ts`
- Inspect: `scripts/check-doc-contract.ts`; modify only when `bun run docs:check` reports a missing pinned canonical string from this task.

- [ ] **Step 1: Write failing architecture guard tests**

Add this test block to `tests/architecture/inversion-guards.test.ts` near the Phase 2 access tests:

```ts
test('G7 phase-2 managed access does not make Worker runtime depend on Host', () => {
  const architecture = readFileSync('docs/architecture.md', 'utf8')
  const protocol = readFileSync('docs/protocol.md', 'utf8')
  const runtime = readFileSync('docs/runtime.md', 'utf8')

  expect(architecture).toContain('Host-only applies only to managed employee remote access')
  expect(architecture).toContain('Worker Web and CLI remain locally operable without Host')
  expect(protocol).toContain('WebSocket is the only Worker Access tunnel transport in Phase 2.1')
  expect(protocol).toContain('Do not add AIWORKER_WORKER_ACCESS_LOCAL_URL')
  expect(runtime).toContain('Host or tunnel outage makes managed remote access unavailable, but does not make the Worker runtime unusable')
})
```

- [ ] **Step 2: Run the guard test and verify it fails**

Run:

```bash
bun test tests/architecture/inversion-guards.test.ts --timeout=15000
```

Expected: FAIL because the new canonical wording does not exist yet.

- [ ] **Step 3: Update canonical docs**

Add exact wording to the canonical docs.

In `docs/architecture.md`, extend `Phase 2 Product MVP` with:

````md
Phase 2.1 managed employee access uses Host as the enterprise URL and
authorization boundary, but only for managed employee remote access. Host-only
does not mean the Worker runtime depends on Host for survival.

Managed employee access goes through:

```text
employee browser -> Host /workers/:workerId -> Logto -> assignment -> Worker-initiated tunnel -> Worker-owned Workbench
```

Worker Web and CLI remain locally operable without Host. Host or tunnel outage
makes managed remote access unavailable, but does not make the Worker runtime
unusable. Localhost Worker Web is diagnostic/local-only and must not be shown as
the employee-facing product URL.
````

In `docs/protocol.md`, extend the Phase 2 route block with:

````md
Phase 2.1 Worker Access tunnel:

```text
GET /api/provision/access
Upgrade: websocket
Authorization: Bearer <worker-access-token>
```

WebSocket is the only Worker Access tunnel transport in Phase 2.1. There is no
HTTP long-poll fallback. Host performs transport-level forwarding over the
Worker-initiated tunnel; Host does not mount, iframe, proxy-render, own, or
semantically interpret the Worker Workbench.

Provisioning adapters must deliver only:

```text
AIWORKER_HOST_URL
AIWORKER_PROVISION_TOKEN
```

Do not add AIWORKER_WORKER_ACCESS_LOCAL_URL. Fleet owns worker id, worker home,
and daemon port; the Worker runtime resolves its own local handler.
````

In `docs/runtime.md`, add:

````md
Phase 2.1 tunnel signals are distribution-plane signals. Host or tunnel outage
makes managed remote access unavailable, but does not make the Worker runtime
unusable. The standalone Worker path and localhost Worker Web remain valid local
operator and break-glass paths.
````

In `docs/testing.md`, add a coverage row:

````md
| Phase 2.1 Worker Access Tunnel | `docs/architecture.md`, `docs/protocol.md`, `docs/runtime.md` | `inversion-guards`, host tunnel tests, worker tunnel tests, browser phase2 proof | docs+tests |
````

- [ ] **Step 4: Run docs and architecture tests**

Run:

```bash
bun run docs:check
bun test tests/architecture/inversion-guards.test.ts --timeout=15000
```

Expected: PASS. If `docs:check` pins exact strings, update `scripts/check-doc-contract.ts` to include the new canonical strings from Step 3 and rerun.

- [ ] **Step 5: Commit docs guardrails**

```bash
git add docs/architecture.md docs/protocol.md docs/runtime.md docs/testing.md tests/architecture/inversion-guards.test.ts scripts/check-doc-contract.ts
git commit -m "docs(phase2): 固化 worker access tunnel 边界"
```

## Task 2: Worker Control Protocol Tunnel Frames

**Files:**
- Modify: `packages/worker-control-protocol/src/index.ts`
- Modify: `packages/worker-control-protocol/src/index.test.ts`

- [ ] **Step 1: Write failing protocol tests**

Append these tests to `packages/worker-control-protocol/src/index.test.ts`:

```ts
test('worker access hello frame binds worker assignment and token without extras', () => {
  expect(parseWorkerAccessFrame({
    type: 'hello',
    assignmentId: 'asn_1',
    token: 'awt_secret',
    workerId: 'wkr_82',
  })).toEqual({
    type: 'hello',
    assignmentId: 'asn_1',
    token: 'awt_secret',
    workerId: 'wkr_82',
  })

  expect(() => parseWorkerAccessFrame({
    type: 'hello',
    assignmentId: 'asn_1',
    token: 'awt_secret',
    workerId: 'wkr_82',
    localUrl: 'http://127.0.0.1:9217',
  } as never)).toThrow()
})

test('worker access frame parser accepts request response ping pong and close only', () => {
  const request = parseWorkerAccessFrame({
    type: 'request',
    id: 'req_1',
    method: 'GET',
    path: '/api/info',
    headers: {},
    bodyText: '',
  })
  expect(request.type).toBe('request')
  expect(parseWorkerAccessFrame({ type: 'ping', id: 'ping_1' })).toEqual({ type: 'ping', id: 'ping_1' })
  expect(parseWorkerAccessFrame({ type: 'pong', id: 'ping_1' })).toEqual({ type: 'pong', id: 'ping_1' })
  expect(parseWorkerAccessFrame({ type: 'close', id: 'req_1', reason: 'client-aborted' })).toEqual({
    type: 'close',
    id: 'req_1',
    reason: 'client-aborted',
  })
  expect(() => parseWorkerAccessFrame({ type: 'long_poll', id: 'x' } as never)).toThrow()
})
```

- [ ] **Step 2: Run protocol test and verify it fails**

Run:

```bash
bun test packages/worker-control-protocol/src/index.test.ts --timeout=15000
```

Expected: FAIL with `parseWorkerAccessFrame is not defined`.

- [ ] **Step 3: Implement strict frame schemas**

Add to `packages/worker-control-protocol/src/index.ts` after `workerAccessResponseEnvelopeSchema`:

```ts
export const workerAccessHelloFrameSchema = z.object({
  type: z.literal('hello'),
  assignmentId: z.string().min(1),
  token: z.string().min(1),
  workerId: z.string().min(1),
}).strict()

export const workerAccessPingFrameSchema = z.object({
  type: z.literal('ping'),
  id: z.string().min(1),
}).strict()

export const workerAccessPongFrameSchema = z.object({
  type: z.literal('pong'),
  id: z.string().min(1),
}).strict()

export const workerAccessCloseFrameSchema = z.object({
  type: z.literal('close'),
  id: z.string().min(1),
  reason: z.string().min(1).optional(),
}).strict()

export const workerAccessFrameSchema = z.discriminatedUnion('type', [
  workerAccessHelloFrameSchema,
  workerAccessPingFrameSchema,
  workerAccessPongFrameSchema,
  workerAccessRequestEnvelopeSchema,
  workerAccessResponseEnvelopeSchema,
  workerAccessCloseFrameSchema,
])
```

Add types and parser:

```ts
export type WorkerAccessHelloFrame = z.infer<typeof workerAccessHelloFrameSchema>
export type WorkerAccessPingFrame = z.infer<typeof workerAccessPingFrameSchema>
export type WorkerAccessPongFrame = z.infer<typeof workerAccessPongFrameSchema>
export type WorkerAccessCloseFrame = z.infer<typeof workerAccessCloseFrameSchema>
export type WorkerAccessFrame = z.infer<typeof workerAccessFrameSchema>

export function parseWorkerAccessFrame(input: unknown): WorkerAccessFrame {
  return workerAccessFrameSchema.parse(input)
}
```

- [ ] **Step 4: Run protocol tests**

Run:

```bash
bun run --filter '@zonease/aiworker-worker-control-protocol' test
bun run --filter '@zonease/aiworker-worker-control-protocol' typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit protocol contract**

```bash
git add packages/worker-control-protocol/src/index.ts packages/worker-control-protocol/src/index.test.ts
git commit -m "feat(protocol): 添加 worker access tunnel frame"
```

## Task 3: Host Storage Access Token Contract

**Files:**
- Modify: `packages/storage-sqlite/src/host/schema.ts`
- Modify: `packages/storage-sqlite/src/host/index.ts`
- Modify: `packages/storage-sqlite/src/host/index.test.ts`

- [ ] **Step 1: Write failing storage tests**

Add imports in `packages/storage-sqlite/src/host/index.test.ts`:

```ts
  issueAssignmentAccessToken,
  verifyAssignmentAccessToken,
```

Add tests after the check-in readiness tests:

```ts
it('issues and verifies assignment access tokens only after check-in', () => {
  const created = createAssignment({
    assignedEmail: 'bob@zonease.org',
    serverRef: 'aissh:server-a',
    soulReleaseRef: 'ops-copilot@v1',
  })

  expect(issueAssignmentAccessToken(created.assignment.assignmentId)).toBeNull()
  verifyAndConsumeProvisionToken(created.provisionToken)
  markAssignmentCheckedIn(created.assignment.assignmentId, {
    workerId: 'wkr_82',
    workerVersion: 'test',
  })

  const issued = issueAssignmentAccessToken(created.assignment.assignmentId)
  expect(issued?.accessToken).toMatch(/^awt_/)
  expect(JSON.stringify(listAssignments())).not.toContain(issued!.accessToken)
  expect(verifyAssignmentAccessToken({
    assignmentId: created.assignment.assignmentId,
    token: issued!.accessToken,
    workerId: 'wkr_82',
  })?.assignmentId).toBe(created.assignment.assignmentId)
})

it('rejects access tokens for wrong worker or revoked assignment', () => {
  const created = createAssignment({
    assignedEmail: 'bob@zonease.org',
    serverRef: 'aissh:server-a',
    soulReleaseRef: 'ops-copilot@v1',
  })
  verifyAndConsumeProvisionToken(created.provisionToken)
  markAssignmentCheckedIn(created.assignment.assignmentId, {
    workerId: 'wkr_82',
    workerVersion: 'test',
  })
  const issued = issueAssignmentAccessToken(created.assignment.assignmentId)!

  expect(verifyAssignmentAccessToken({
    assignmentId: created.assignment.assignmentId,
    token: issued.accessToken,
    workerId: 'wkr_other',
  })).toBeNull()

  revokeAssignment(created.assignment.assignmentId, 'admin@zonease.org')
  expect(verifyAssignmentAccessToken({
    assignmentId: created.assignment.assignmentId,
    token: issued.accessToken,
    workerId: 'wkr_82',
  })).toBeNull()
})
```

- [ ] **Step 2: Run storage tests and verify failure**

Run:

```bash
bun test packages/storage-sqlite/src/host/index.test.ts --timeout=15000
```

Expected: FAIL because token functions do not exist.

- [ ] **Step 3: Add schema fields**

In `packages/storage-sqlite/src/host/schema.ts`, add columns:

```ts
  accessTokenHash: text('access_token_hash'),
  accessTokenIssuedAt: text('access_token_issued_at'),
  accessTokenExpiresAt: text('access_token_expires_at'),
```

In `runHostMigrations()` in `packages/storage-sqlite/src/host/index.ts`, after the `CREATE TABLE` block add idempotent ALTERs:

```ts
  addColumnIfMissing('host_assignments', 'access_token_hash', 'TEXT')
  addColumnIfMissing('host_assignments', 'access_token_issued_at', 'TEXT')
  addColumnIfMissing('host_assignments', 'access_token_expires_at', 'TEXT')
```

Add helper near `runChanges`:

```ts
function addColumnIfMissing(tableName: string, columnName: string, ddl: string): void {
  if (!sqliteHandle)
    throw new Error('host sqlite handle is not initialized')
  const columns = sqliteHandle.query<{ name: string }, []>(`PRAGMA table_info(${tableName})`).all()
  if (!columns.some(column => column.name === columnName))
    getHostDb().run(sql.raw(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${ddl}`))
}
```

- [ ] **Step 4: Implement token issue and verify**

In `packages/storage-sqlite/src/host/index.ts`, add constants:

```ts
const ACCESS_TOKEN_PREFIX = 'awt_'
const ACCESS_TOKEN_BYTES = 32
const DEFAULT_ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
```

Add functions:

```ts
export function issueAssignmentAccessToken(assignmentId: string, now: () => string = () => new Date().toISOString()): { assignment: HostAssignmentRow, accessToken: string } | null {
  const at = now()
  const accessToken = createAccessToken()
  const result = getHostDb()
    .update(schema.hostAssignments)
    .set({
      accessTokenHash: hashProvisionToken(accessToken),
      accessTokenIssuedAt: at,
      accessTokenExpiresAt: new Date(Date.parse(at) + DEFAULT_ACCESS_TOKEN_TTL_MS).toISOString(),
      updatedAt: at,
    })
    .where(and(
      eq(schema.hostAssignments.assignmentId, assignmentId),
      eq(schema.hostAssignments.status, 'checked_in'),
      isNull(schema.hostAssignments.revokedAt),
      isNotNull(schema.hostAssignments.provisionTokenConsumedAt),
      isNotNull(schema.hostAssignments.workerId),
      isNotNull(schema.hostAssignments.checkedInAt),
    ))
    .run()
  if (runChanges(result) !== 1)
    return null
  return { assignment: getAssignment(assignmentId)!, accessToken }
}

export function verifyAssignmentAccessToken(input: { assignmentId: string, token: string, workerId: string }, now: () => string = () => new Date().toISOString()): HostAssignmentRow | null {
  const at = now()
  const assignment = getAssignment(input.assignmentId)
  if (!assignment || assignment.status === 'revoked' || assignment.revokedAt)
    return null
  if (assignment.workerId !== input.workerId || !assignment.accessTokenHash || !assignment.accessTokenExpiresAt)
    return null
  if (assignment.accessTokenExpiresAt <= at)
    return null
  if (!verifyProvisionTokenHash(input.token, assignment.accessTokenHash))
    return null
  return assignment
}

function createAccessToken(): string {
  return `${ACCESS_TOKEN_PREFIX}${randomBytes(ACCESS_TOKEN_BYTES).toString('base64url')}`
}
```

- [ ] **Step 5: Run storage tests**

Run:

```bash
bun test packages/storage-sqlite/src/host/index.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-storage-sqlite' typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit token storage**

```bash
git add packages/storage-sqlite/src/host/schema.ts packages/storage-sqlite/src/host/index.ts packages/storage-sqlite/src/host/index.test.ts
git commit -m "feat(host): 持久化 worker access token"
```

## Task 4: Host-Control Tunnel Registry And Path Mapping

**Files:**
- Modify: `packages/host-control/src/access-adapter.ts`
- Modify: `packages/host-control/src/access-adapter.test.ts`

- [ ] **Step 1: Write failing host-control tests**

Add tests to `packages/host-control/src/access-adapter.test.ts`:

```ts
test('maps Host worker paths to Worker-local paths without exposing localhost', () => {
  expect(mapWorkerAccessPath('/workers/wkr_82', 'wkr_82')).toBe('/')
  expect(mapWorkerAccessPath('/workers/wkr_82/', 'wkr_82')).toBe('/')
  expect(mapWorkerAccessPath('/workers/wkr_82/assets/app.js?x=1', 'wkr_82')).toBe('/assets/app.js?x=1')
  expect(() => mapWorkerAccessPath('/workers/wkr_other/assets/app.js', 'wkr_82')).toThrow('worker path mismatch')
  expect(() => mapWorkerAccessPath('/workers/wkr_82//evil.com', 'wkr_82')).toThrow('invalid worker access path')
})

test('registered tunnel connection resolves matching request responses', async () => {
  const registry = createWorkerAccessRegistry()
  registry.register({
    assignmentId: 'asn_1',
    close() {},
    sendRequest: async envelope => ({
      type: 'response',
      id: envelope.id,
      status: 200,
      headers: { 'content-type': 'text/plain' },
      bodyText: `ok:${envelope.path}`,
    }),
    workerId: 'wkr_82',
  })

  const response = await registry.sendRequest('wkr_82', {
    type: 'request',
    id: 'req_test',
    method: 'GET',
    path: '/',
    headers: {},
    bodyText: '',
  })
  expect(response.bodyText).toBe('ok:/')
})
```

- [ ] **Step 2: Run host-control tests and verify failure**

Run:

```bash
bun test packages/host-control/src/access-adapter.test.ts --timeout=15000
```

Expected: FAIL because `mapWorkerAccessPath` and `sendRequest` registry method do not exist.

- [ ] **Step 3: Implement registry interface and path mapping**

In `packages/host-control/src/access-adapter.ts`, change `WorkerAccessConnection`:

```ts
export interface WorkerAccessConnection {
  assignmentId: string
  close: () => void
  sendRequest: (envelope: WorkerAccessRequestEnvelope) => Promise<WorkerAccessResponseEnvelope>
  workerId: string
}
```

Extend `WorkerAccessRegistry`:

```ts
  sendRequest: (workerId: string, envelope: WorkerAccessRequestEnvelope) => Promise<WorkerAccessResponseEnvelope | null>
```

Add implementation:

```ts
    async sendRequest(workerId, envelope) {
      return connections.get(workerId)?.sendRequest(envelope) ?? null
    },
```

Add path helper:

```ts
export function mapWorkerAccessPath(hostPathWithSearch: string, workerId: string): string {
  const url = new URL(hostPathWithSearch, 'https://host.invalid')
  const prefix = `/workers/${encodeURIComponent(workerId)}`
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`))
    throw new Error('worker path mismatch')
  const localPath = url.pathname.slice(prefix.length) || '/'
  if (!localPath.startsWith('/') || localPath.startsWith('//') || localPath.includes('/../') || localPath.endsWith('/..'))
    throw new Error('invalid worker access path')
  return `${localPath}${url.search}`
}
```

- [ ] **Step 4: Run host-control package tests**

Run:

```bash
bun run --filter '@zonease/aiworker-host-control' test
bun run --filter '@zonease/aiworker-host-control' typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit host-control access registry**

```bash
git add packages/host-control/src/access-adapter.ts packages/host-control/src/access-adapter.test.ts
git commit -m "feat(access): 支持 worker tunnel 请求路由"
```

## Task 5: Host Server WebSocket Upgrade And Forwarding

**Files:**
- Modify: `apps/host-cli/src/host-server.ts`
- Modify: `apps/host-cli/src/host-server.test.ts`
- Modify: `apps/host-cli/src/aiworker-host.ts`
- Modify: `apps/host-cli/src/aiworker-host.test.ts`
- Modify: `apps/host-cli/src/host-lifecycle.ts`
- Modify: `apps/host-cli/src/host-lifecycle.test.ts`

- [ ] **Step 1: Write failing Host server tests for access token issuance**

In `apps/host-cli/src/host-server.test.ts`, update the check-in test to assert token hash behavior:

```ts
expect(created.provisionToken).toMatch(/^awp_/)
const checkIn = await json(first)
expect(checkIn.access.token).toMatch(/^awt_/)
expect(JSON.stringify(await json(await server.fetch(new Request('http://host/api/host/assignments'))))).not.toContain(checkIn.access.token)
```

Expected existing response still has access token, but storage hashing from Task 3 prevents leaking through assignment list.

- [ ] **Step 2: Write failing forwarding route tests with fake registry**

Add test:

```ts
it('forwards employee worker paths through the registered tunnel after assignment auth', async () => {
  const accessRegistry = createWorkerAccessRegistry()
  const server = await createHostServer({
    accessRegistry,
    authUser: bobUser,
    dbPath: dbPath(),
    publicBaseUrl: 'https://aiworker.zonease.org',
  })
  const created = createAssignment({
    assignedEmail: 'bob@example.com',
    serverRef: 'host-main',
    soulReleaseRef: 'soul_release_1',
  })
  verifyAndConsumeProvisionToken(created.provisionToken)
  markAssignmentCheckedIn(created.assignment.assignmentId, { workerId: 'wkr_82', workerVersion: '1.0.0' })
  markAssignmentAccessReady(created.assignment.assignmentId)
  markAssignmentReady(created.assignment.assignmentId, { workbenchUrl: 'https://aiworker.zonease.org/workers/wkr_82' })
  accessRegistry.register({
    assignmentId: created.assignment.assignmentId,
    close() {},
    sendRequest: async envelope => ({
      type: 'response',
      id: envelope.id,
      status: 200,
      headers: { 'content-type': 'text/plain', 'set-cookie': 'sid=worker' },
      bodyText: `worker:${envelope.path}:${envelope.headers.authorization ?? 'no-auth'}`,
    }),
    workerId: 'wkr_82',
  })

  const response = await server.fetch(new Request('http://host/workers/wkr_82/assets/app.js', {
    headers: { authorization: 'Bearer employee', cookie: 'sid=employee' },
  }))

  expect(response.status).toBe(200)
  expect(response.headers.get('set-cookie')).toBeNull()
  expect(await response.text()).toBe('worker:/assets/app.js:no-auth')
})
```

Expected: FAIL because `handleWorkerRoute` still returns JSON `{ routed: true }`.

- [ ] **Step 3: Implement Host forwarding through registry**

In `apps/host-cli/src/host-server.ts`, import:

```ts
  createAccessRequestEnvelope,
  mapWorkerAccessPath,
  parseAccessResponseEnvelope,
```

from `@zonease/aiworker-host-control`.

Change worker route regex to match descendants:

```ts
const workerMatch = /^\/workers\/([^/]+)(?:\/.*)?$/.exec(url.pathname)
```

Replace the routed JSON response with:

```ts
  const localPath = mapWorkerAccessPath(`${url.pathname}${url.search}`, workerId)
  const envelope = await createAccessRequestEnvelope(new Request(new URL(localPath, request.url), request))
  const tunneled = await accessRegistry.sendRequest(workerId, envelope)
  if (!tunneled)
    return json({ error: { code: 'WORKER_ACCESS_NOT_READY' } }, { status: 503 })
  const parsed = parseAccessResponseEnvelope(tunneled)
  const headers = sanitizeWorkerResponseHeaders(parsed.headers)
  return new Response(parsed.bodyText, { headers, status: parsed.status })
```

Add helper:

```ts
function sanitizeWorkerResponseHeaders(source: Record<string, string>): Headers {
  const headers = new Headers(source)
  headers.delete('set-cookie')
  headers.delete('authorization')
  headers.delete('proxy-authorization')
  return headers
}
```

- [ ] **Step 4: Run Host server tests**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts --timeout=15000
```

Expected: PASS after updating existing "routes an assigned ready worker" expectation from JSON to forwarded body.

- [ ] **Step 5: Write failing Bun serve upgrade seam tests**

In `apps/host-cli/src/aiworker-host.test.ts`, update the `serves with no admin user by default` fake `bunServe` capture to assert the config has both `fetch` and `websocket`:

```ts
expect(calls[1]).toMatchObject({ type: 'serve' })
expect(calls[1].options.websocket).toBeDefined()
expect(typeof calls[1].options.fetch).toBe('function')
```

In `apps/host-cli/src/host-lifecycle.test.ts`, add an assertion around `Bun.serve` test doubles:

```ts
expect(serveCalls[0]?.websocket).toBeDefined()
```

Expected: FAIL because current serve config passes only fetch.

- [ ] **Step 6: Expose Host websocket config**

In `apps/host-cli/src/host-server.ts`, extend `HostServer`:

```ts
export interface HostServer {
  fetch: (request: Request, server?: Bun.Server) => Promise<Response>
  websocket: Bun.WebSocketHandler
}
```

Return `websocket` from `createHostServer()`:

```ts
    websocket: {
      close(ws) {
        const data = ws.data as { workerId?: string } | undefined
        if (data?.workerId)
          accessRegistry.remove(data.workerId)
      },
      message(ws, message) {
        handleWorkerAccessSocketMessage(ws, message).catch(() => ws.close())
      },
    },
```

For `/api/provision/access`, keep pure-fetch behavior:

```ts
if (request.method === 'GET' && url.pathname === '/api/provision/access') {
  if (!server)
    return json({ error: { code: 'WORKER_ACCESS_UPGRADE_REQUIRED' } }, { status: 426 })
  const upgraded = server.upgrade(request, { data: { kind: 'worker-access' } })
  return upgraded ? new Response(null, { status: 101 }) : json({ error: { code: 'WORKER_ACCESS_UPGRADE_REQUIRED' } }, { status: 426 })
}
```

Wire `Bun.serve` in `apps/host-cli/src/aiworker-host.ts` and `apps/host-cli/src/host-lifecycle.ts`:

```ts
bunServe({
  fetch: (request, bunServer) => server.fetch(request, bunServer),
  hostname: options.host,
  port,
  websocket: server.websocket,
})
```

Use the same pattern in lifecycle.

- [ ] **Step 7: Implement socket hello and request dispatch**

In `apps/host-cli/src/host-server.ts`, import `parseWorkerAccessFrame` and `verifyAssignmentAccessToken`. Add a pending map inside `createHostServer()`:

```ts
const pending = new Map<string, { reject: (error: Error) => void, resolve: (response: WorkerAccessResponseEnvelope) => void }>()
```

Define this helper inside the `createHostServer()` closure so it can use `accessRegistry`, `pending`, and `options.publicBaseUrl`:

```ts
async function handleWorkerAccessSocketMessage(
  ws: Bun.ServerWebSocket<unknown>,
  message: string | Buffer,
): Promise<void> {
  const frame = parseWorkerAccessFrame(JSON.parse(String(message)))
  if (frame.type === 'hello') {
    const assignment = verifyAssignmentAccessToken({
      assignmentId: frame.assignmentId,
      token: frame.token,
      workerId: frame.workerId,
    })
    if (!assignment) {
      ws.close()
      return
    }
    accessRegistry.register({
      assignmentId: assignment.assignmentId,
      close: () => ws.close(),
      sendRequest: envelope => sendSocketRequest(ws, envelope),
      workerId: frame.workerId,
    })
    markAssignmentAccessReady(assignment.assignmentId)
    markAssignmentReady(assignment.assignmentId, { workbenchUrl: `${options.publicBaseUrl}/workers/${encodeURIComponent(frame.workerId)}` })
    ;(ws as Bun.ServerWebSocket<{ workerId?: string }>).data.workerId = frame.workerId
    return
  }
  if (frame.type === 'response') {
    pending.get(frame.id)?.resolve(frame)
    pending.delete(frame.id)
  }
}
```

Add `sendSocketRequest` in the same closure:

```ts
function sendSocketRequest(ws: Bun.ServerWebSocket<unknown>, envelope: WorkerAccessRequestEnvelope): Promise<WorkerAccessResponseEnvelope> {
  return new Promise((resolve, reject) => {
    pending.set(envelope.id, { reject, resolve })
    ws.send(JSON.stringify(envelope))
    setTimeout(() => {
      if (pending.delete(envelope.id))
        reject(new Error('worker access request timed out'))
    }, 15000)
  })
}
```

- [ ] **Step 8: Run Host CLI tests**

Run:

```bash
bun run --filter '@zonease/aiworker-host-cli' test
bun run --filter '@zonease/aiworker-host-cli' typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit Host tunnel server**

```bash
git add apps/host-cli/src/host-server.ts apps/host-cli/src/host-server.test.ts apps/host-cli/src/aiworker-host.ts apps/host-cli/src/aiworker-host.test.ts apps/host-cli/src/host-lifecycle.ts apps/host-cli/src/host-lifecycle.test.ts
git commit -m "feat(host): 接入 worker access websocket tunnel"
```

## Task 6: Worker Tunnel Client Without Local URL Env

**Files:**
- Modify: `packages/worker-daemon/src/modes/worker/provision-client.ts`
- Modify: `packages/worker-daemon/src/modes/worker/provision-client.test.ts`
- Modify: `packages/worker-daemon/src/modes/worker.ts`
- Modify: `packages/worker-daemon/src/modes/worker.local.test.ts`

- [ ] **Step 1: Write failing provision-client tests**

Add tests to `packages/worker-daemon/src/modes/worker/provision-client.test.ts`:

```ts
it('does not require or read a worker access local url env', async () => {
  const env = {
    AIWORKER_HOST_URL: 'https://host.example',
    AIWORKER_PROVISION_TOKEN: 'awp_secret',
    AIWORKER_WORKER_ACCESS_LOCAL_URL: 'http://wrong.example',
  }
  const frames: unknown[] = []
  await connectWorkerAccessTunnel({
    assignment: { assignmentId: 'asn_1', assignedEmail: 'bob@example.com', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
    access: { mode: 'worker_access', token: 'awt_secret' },
    createWebSocket: (url) => fakeWebSocket(url, frames),
    env,
    localFetch: async request => new Response(`local:${new URL(request.url).pathname}`),
  })

  expect(frames[0]).toEqual({
    type: 'hello',
    assignmentId: 'asn_1',
    token: 'awt_secret',
    workerId: 'wkr_82',
  })
})

it('forwards tunnel request frames to the injected local runtime handler', async () => {
  const sent: unknown[] = []
  const socket = fakeWebSocket(new URL('wss://host.example/api/provision/access'), sent)
  await connectWorkerAccessTunnel({
    assignment: { assignmentId: 'asn_1', assignedEmail: 'bob@example.com', soulReleaseRef: 'soul_1', workerId: 'wkr_82' },
    access: { mode: 'worker_access', token: 'awt_secret' },
    createWebSocket: () => socket,
    env: { AIWORKER_HOST_URL: 'https://host.example' },
    localFetch: async request => new Response(`ok:${new URL(request.url).pathname}`, { status: 201 }),
  })

  socket.dispatchMessage({
    type: 'request',
    id: 'req_1',
    method: 'GET',
    path: '/api/info',
    headers: {},
    bodyText: '',
  })

  expect(sent.at(-1)).toEqual({
    type: 'response',
    id: 'req_1',
    status: 201,
    headers: {},
    bodyText: 'ok:/api/info',
  })
})
```

In the same test file, define a local fake socket:

```ts
function fakeWebSocket(url: URL, sent: unknown[]) {
  let onmessage: ((event: { data: string }) => void) | null = null
  return {
    dispatchMessage(frame: unknown) {
      onmessage?.({ data: JSON.stringify(frame) })
    },
    send(value: string) {
      sent.push(JSON.parse(value))
    },
    set onmessage(handler: ((event: { data: string }) => void) | null) {
      onmessage = handler
    },
    get url() {
      return url.toString()
    },
  }
}
```

- [ ] **Step 2: Run provision-client tests and verify failure**

Run:

```bash
bun test packages/worker-daemon/src/modes/worker/provision-client.test.ts --timeout=15000
```

Expected: FAIL because `connectWorkerAccessTunnel` does not exist.

- [ ] **Step 3: Implement tunnel client**

In `packages/worker-daemon/src/modes/worker/provision-client.ts`, add imports:

```ts
  parseWorkerAccessFrame,
  parseWorkerAccessResponseEnvelope,
  type WorkerAccessFrame,
```

Add types:

```ts
export type WorkerAccessLocalFetch = (request: Request) => Promise<Response>
export type WorkerAccessWebSocket = Pick<WebSocket, 'send'> & {
  onmessage: ((event: { data: string }) => void) | null
}

export interface ConnectWorkerAccessTunnelInput {
  access: WorkerCheckInResponse['access']
  assignment: WorkerCheckInResponse['assignment']
  createWebSocket?: (url: URL) => WorkerAccessWebSocket
  env: Record<string, string | undefined>
  localFetch: WorkerAccessLocalFetch
}
```

Add function:

```ts
export async function connectWorkerAccessTunnel(input: ConnectWorkerAccessTunnelInput): Promise<void> {
  const host = input.env.AIWORKER_HOST_URL
  if (!host || input.access.mode !== 'worker_access')
    return
  const url = new URL('/api/provision/access', host)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = input.createWebSocket?.(url) ?? new WebSocket(url, {
    headers: { authorization: `Bearer ${input.access.token}` },
  } as never)
  socket.onmessage = async (event) => {
    const frame = parseWorkerAccessFrame(JSON.parse(event.data))
    if (frame.type === 'request') {
      const response = await handleAccessRequestEnvelope({
        envelope: frame,
        localFetch: input.localFetch,
      })
      socket.send(JSON.stringify(response))
    }
    if (frame.type === 'ping')
      socket.send(JSON.stringify({ type: 'pong', id: frame.id }))
  }
  socket.send(JSON.stringify({
    type: 'hello',
    assignmentId: input.assignment.assignmentId,
    token: input.access.token,
    workerId: input.assignment.workerId,
  }))
}
```

Replace `HandleAccessRequestEnvelopeInput` with local fetch:

```ts
export interface HandleAccessRequestEnvelopeInput {
  envelope: WorkerAccessRequestEnvelope
  localFetch: WorkerAccessLocalFetch
}
```

Update `handleAccessRequestEnvelope()` to create a local URL from the frame path only for the injected handler:

```ts
const url = resolveLocalAccessPath('http://aiworker.local', input.envelope.path)
const response = await input.localFetch(new Request(url, init))
```

- [ ] **Step 4: Wire worker bootstrap after check-in**

In `packages/worker-daemon/src/modes/worker.ts`, import `connectWorkerAccessTunnel`. Replace the current `await maybeProvisionCheckIn(...)` call with:

```ts
    const checkIn = await maybeProvisionCheckIn({
      activeResolution,
      checkIn: options.provisionCheckIn,
      env: process.env,
      runtimeVersion: state.runtimeVersion,
    })
    if (checkIn) {
      await connectWorkerAccessTunnel({
        access: checkIn.access,
        assignment: checkIn.assignment,
        env: process.env,
        localFetch: request => app.fetch(request),
      })
    }
```

Change `maybeProvisionCheckIn()` in `provision-client.ts` to return `Promise<WorkerCheckInResponse | null>` and return `null` when no check-in is attempted.

- [ ] **Step 5: Write worker bootstrap test**

In `packages/worker-daemon/src/modes/worker.local.test.ts`, add a test near provision tests:

```ts
it('keeps standalone Worker app bootable when Host provision env is absent', async () => {
  delete process.env.AIWORKER_HOST_URL
  delete process.env.AIWORKER_PROVISION_TOKEN
  const { app, state } = await bootstrapWorkerApp({ dbPath: testDbPath() })
  const response = await app.request('/health')
  expect(response.status).toBe(200)
  state.shutdown()
})
```

Expected: PASS after bootstrap return behavior is preserved.

- [ ] **Step 6: Run worker daemon tests**

Run:

```bash
bun run --filter '@zonease/aiworker-worker-daemon' test
bun run --filter '@zonease/aiworker-worker-daemon' typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit worker tunnel client**

```bash
git add packages/worker-daemon/src/modes/worker/provision-client.ts packages/worker-daemon/src/modes/worker/provision-client.test.ts packages/worker-daemon/src/modes/worker.ts packages/worker-daemon/src/modes/worker.local.test.ts
git commit -m "feat(worker): 建立 worker access tunnel client"
```

## Task 7: Host Web Product State

**Files:**
- Modify: `apps/host-web/src/app.tsx`
- Modify: `apps/host-web/src/app.test.tsx`

- [ ] **Step 1: Write failing Host Web tests**

Add tests to `apps/host-web/src/app.test.tsx`:

```tsx
it('does not expose localhost as the employee Worker URL', () => {
  render(<HostControlPlane assignments={[{
    assignedEmail: 'bob@example.com',
    assignmentId: 'asn_1',
    provisioningTargetRef: 'local:dev',
    serverRef: 'local:dev',
    soulReleaseRef: 'freeform@v1',
    status: 'ready',
    workerId: 'wkr_82',
    workbenchUrl: 'http://127.0.0.1:9217',
  }]} />)

  expect(screen.queryByRole('link', { name: /127\.0\.0\.1/ })).toBeNull()
  expect(screen.getByRole('link', { name: /打开 Worker/ })).toHaveAttribute('href', '/workers/wkr_82')
})

it('shows tunnel connection states in plain product language', () => {
  render(<HostControlPlane assignments={[
    { ...readyAssignment, status: 'checked_in', workerId: 'wkr_82', workbenchUrl: null },
    { ...readyAssignment, assignmentId: 'asn_2', status: 'needs_attention', workerId: 'wkr_83', workbenchUrl: null },
  ]} />)

  expect(screen.getByText('连接中')).toBeVisible()
  expect(screen.getByText('需处理')).toBeVisible()
})
```

- [ ] **Step 2: Run Host Web tests and verify failure**

Run:

```bash
bun run --filter '@zonease/aiworker-host-web' test
```

Expected: FAIL if current UI links to `workbenchUrl` directly or does not label `checked_in` as `连接中`.

- [ ] **Step 3: Update Host Web link and labels**

In `apps/host-web/src/app.tsx`, compute employee URL from worker id:

```tsx
const workerUrl = assignment.status === 'ready' && assignment.workerId
  ? `/workers/${encodeURIComponent(assignment.workerId)}`
  : null
```

Update status label:

```ts
function statusLabel(status: HostAssignmentSummary['status']) {
  if (status === 'ready')
    return '可访问'
  if (status === 'checked_in' || status === 'access_ready')
    return '连接中'
  if (status === 'needs_attention')
    return '需处理'
  if (status === 'revoked')
    return '已撤销'
  if (status === 'archived')
    return '已归档'
  return '开通中'
}
```

- [ ] **Step 4: Run Host Web tests**

Run:

```bash
bun run --filter '@zonease/aiworker-host-web' test
bun run --filter '@zonease/aiworker-host-web' typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Host Web state**

```bash
git add apps/host-web/src/app.tsx apps/host-web/src/app.test.tsx
git commit -m "fix(host-web): 展示 worker tunnel 访问状态"
```

## Task 8: Browser Proof For Real Tunnel Access

**Files:**
- Modify: `tests/browser/phase2-host-worker-access.spec.ts`
- Inspect: `package.json`; verify the existing `test:browser:phase2` script is present before running it.

- [ ] **Step 1: Replace placeholder browser proof with failing real proof**

In `tests/browser/phase2-host-worker-access.spec.ts`, add a local Worker Web server and Host server pair. The key assertion must prove Host `/workers/wkr_82` reaches Worker content:

```ts
const workerServer = Bun.serve({
  fetch: request => new Response(`<main data-worker-web="wkr_82">Worker via tunnel ${new URL(request.url).pathname}</main>`, {
    headers: { 'content-type': 'text/html' },
  }),
  hostname: '127.0.0.1',
  port: 0,
})

await page.goto(`${hostBaseUrl}/workers/wkr_82`)
await page.locator('[data-worker-web="wkr_82"]').waitFor({ state: 'visible', timeout: 10000 })
expect(await page.locator('[data-worker-web="wkr_82"]').textContent()).toContain('Worker via tunnel')
```

Capture the connected Worker tunnel client in a `workerSocket` variable, then assert tunnel-down behavior:

```ts
workerSocket.close()
const down = await page.goto(`${hostBaseUrl}/workers/wkr_82`)
if (down?.status() !== 503)
  throw new Error(`expected tunnel down to return 503, got ${down?.status()}`)
```

Expected: FAIL before full tunnel implementation.

- [ ] **Step 2: Run browser proof and verify failure**

Run:

```bash
bun run test:browser:phase2
```

Expected: FAIL if the tunnel is not fully wired.

- [ ] **Step 3: Finish browser harness wiring**

Use the real `createHostServer()` and a real Worker tunnel client. Seed assignment through the Host API:

```ts
const createResponse = await fetch(`${hostBaseUrl}/api/host/assignments`, {
  body: JSON.stringify({
    assignedEmail: 'bob@example.com',
    provisioningTarget: { adapterType: 'local', maturity: 'dev', ref: 'browser-proof' },
    soulReleaseRef: 'freeform@v1',
  }),
  headers: { 'content-type': 'application/json' },
  method: 'POST',
})
```

Check in with the returned provision token, connect the Worker WebSocket tunnel, then open `/workers/wkr_82` in Playwright. The proof must fail if content comes from Host static HTML rather than Worker content.

- [ ] **Step 4: Run browser proof**

Run:

```bash
bun run test:browser:phase2
```

Expected: PASS and evidence JSON includes `workerViaTunnel: true`, `tunnelDownStatus: 503`, and no browser console/page errors.

- [ ] **Step 5: Commit browser proof**

```bash
git add tests/browser/phase2-host-worker-access.spec.ts
git commit -m "test(phase2): 证明 worker access tunnel 浏览器链路"
```

## Task 9: Final Verification And Review

**Files:**
- No planned source edits.

- [ ] **Step 1: Run focused package tests**

Run:

```bash
bun run docs:check
bun run test:contracts
bun run --filter '@zonease/aiworker-worker-control-protocol' test
bun run --filter '@zonease/aiworker-storage-sqlite' test
bun run --filter '@zonease/aiworker-host-control' test
bun run --filter '@zonease/aiworker-host-cli' test
bun run --filter '@zonease/aiworker-host-web' test
bun run --filter '@zonease/aiworker-worker-daemon' test
```

Expected: all commands exit 0.

- [ ] **Step 2: Run browser and typecheck gates**

Run:

```bash
bun run test:browser:phase2
bun run typecheck
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run code-review graph**

Run:

```bash
bun run crg:review
```

Expected: command exits 0. If unrelated dirty files are present, note them and run a scoped code-review-graph context for the files touched by this plan.

- [ ] **Step 4: Final status check**

Run:

```bash
git status --short
git log --oneline -n 12
```

Expected: only unrelated pre-existing changes remain unstaged; plan commits appear at the top.

- [ ] **Step 5: Final implementation summary**

Report:

- managed employee access path works through Host URL and Worker-initiated WebSocket tunnel;
- local Worker autonomy remains intact;
- `AIWORKER_WORKER_ACCESS_LOCAL_URL` was not introduced;
- Host Web does not expose localhost as employee URL;
- tests and browser proof passed;
- any unrelated dirty files left untouched.
