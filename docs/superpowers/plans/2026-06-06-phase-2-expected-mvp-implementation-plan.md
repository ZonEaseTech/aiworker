# Phase 2 Expected MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current Host dev loop into the Phase 2 Expected MVP control-console slice: Host API/CLI/Web share real assignment and options contracts, and administrators can visibly open a Worker assignment through employee email + aissh server + Soul release through Worker check-in.

**Architecture:** Keep the existing Host server on `apps/host-cli` and Host Web on `apps/host-web`. Add a small Host options provider for aissh server discovery and official Soul release discovery, expose it through Host API and CLI, then replace the temporary Host Web card layout with an app-shell/list/drawer console using `packages/ui` shadcn primitives.

**Tech Stack:** Bun, TypeScript, React 19, Vite, Vitest/happy-dom, Bun test, Playwright browser proof, `@zonease/aiworker-ui` shadcn-managed components, local `aissh` CLI adapter, official Soul descriptor JSON files.

---

## Scope Check

This plan deliberately excludes true Logto and Worker Access Tunnel. It still keeps their user-visible status gates so Host does not imply `ready` before those systems exist.

## File Structure

- Create `apps/host-cli/src/host-options.ts`: pure Host options provider; parses `aissh server list`, discovers official Soul descriptors, builds safe option views.
- Create `apps/host-cli/src/host-options.test.ts`: TDD tests for options parsing, descriptor discovery, and secret-safe output.
- Modify `apps/host-cli/src/host-server.ts`: add `GET /api/host/options`, dev landing HTML/text, and `aisshCommand` in assignment creation.
- Modify `apps/host-cli/src/host-server.test.ts`: API contract tests for options, dev landing, and create response.
- Modify `apps/host-cli/src/aiworker-host.ts`: add `option list`, project safe option output, preserve token redaction.
- Modify `apps/host-cli/src/aiworker-host.test.ts`: CLI option tests and updated assignment create contract.
- Modify `apps/host-web/src/host-api.ts`: add Host options types/client call and `aisshCommand`.
- Modify `apps/host-web/src/host-api.test.ts`: Host Web client contract tests.
- Modify `apps/host-web/src/app.tsx`: replace card-only surface with control-console shell, main assignment list, and right drawer.
- Modify `apps/host-web/src/app.test.tsx`: UI contract tests for shell layout, options-driven form, one-time commands, deferred gates, and no Worker open action before ready.
- Modify `tests/browser/host-dev-loop.spec.ts`: update selectors for the new Host Web shell while preserving real assignment + check-in proof.
- Modify `tests/browser/phase2-host-worker-access.spec.ts`: assert the Host shell/drawer exists and still no mount/iframe/micro-app.

## Task 1: Host Options Provider

**Files:**
- Create: `apps/host-cli/src/host-options.ts`
- Create: `apps/host-cli/src/host-options.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/host-cli/src/host-options.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'bun:test'

import {
  buildHostOptions,
  parseAisshServerListOutput,
} from './host-options'

describe('host options provider', () => {
  let tempDir = ''

  afterEach(() => {
    if (tempDir)
      rmSync(tempDir, { recursive: true, force: true })
    tempDir = ''
  })

  it('parses aissh server list JSON into safe server options', () => {
    const parsed = parseAisshServerListOutput(JSON.stringify({
      limits: { download_max_mb: 200 },
      servers: [{
        host: '172.105.219.50',
        id: '693660ea-3c2a-4f15-8b50-7dd9e5651877',
        name: 'aiwork',
        notes: 'aiwork项目平台服务器',
        token: 'secret',
      }],
    }))

    expect(parsed).toEqual([{
      host: '172.105.219.50',
      id: '693660ea-3c2a-4f15-8b50-7dd9e5651877',
      name: 'aiwork',
      notes: 'aiwork项目平台服务器',
      source: 'aissh',
    }])
    expect(JSON.stringify(parsed)).not.toContain('secret')
  })

  it('returns an empty list when aissh output is not parseable', () => {
    expect(() => parseAisshServerListOutput('not-json')).toThrow('Invalid aissh server list JSON')
  })

  it('discovers official Soul descriptors from a repo root', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'host-options-'))
    const soulDir = join(tempDir, 'souls', 'aiworker-freeform', 'dist')
    await mkdir(soulDir, { recursive: true })
    writeFileSync(join(soulDir, 'soul.descriptor.json'), JSON.stringify({
      protocol: 'soul/v1',
      identity: {
        description: 'Open-ended Soul for freeform local work.',
        id: 'aiworker-freeform',
        name: 'AIWorker Freeform',
      },
      engine: {},
    }))

    const options = await buildHostOptions({
      aisshServerList: async () => JSON.stringify({ servers: [] }),
      repoRoot: tempDir,
    })

    expect(options.soulReleases).toEqual([{
      descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json',
      id: 'aiworker-freeform',
      name: 'AIWorker Freeform',
      releaseRef: 'aiworker-freeform@dev',
      source: 'official',
    }])
    expect(options.auth.status).toBe('deferred-logto')
    expect(options.access.status).toBe('deferred-worker-access-tunnel')
  })

  it('captures aissh failures without throwing from buildHostOptions', async () => {
    const options = await buildHostOptions({
      aisshServerList: async () => {
        throw new Error('AISSH_DOWN')
      },
      repoRoot: mkdtempSync(join(tmpdir(), 'host-options-empty-')),
    })

    tempDir = options.repoRootForTest ?? ''
    expect(options.servers).toEqual([])
    expect(options.serverSourceError).toContain('AISSH_DOWN')
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
bun test apps/host-cli/src/host-options.test.ts --timeout=15000
```

Expected: FAIL because `host-options.ts` does not exist.

- [ ] **Step 3: Implement Host options provider**

Create `apps/host-cli/src/host-options.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export interface HostServerOption {
  host?: string
  id: string
  name?: string
  notes?: string
  source: 'aissh'
}

export interface HostSoulReleaseOption {
  descriptorPath: string
  id: string
  name: string
  releaseRef: string
  source: 'official'
}

export interface HostOptionsView {
  access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' }
  auth: { mode: 'dev-static', status: 'deferred-logto' }
  servers: HostServerOption[]
  soulReleases: HostSoulReleaseOption[]
  serverSourceError?: string
  soulSourceErrors?: string[]
  repoRootForTest?: string
}

export interface BuildHostOptionsInput {
  aisshServerList?: () => Promise<string>
  repoRoot?: string
}

const officialSoulIds = [
  'aiworker-freeform',
  'google-ads',
  'hr-manager',
  'product-manager',
  'software-support',
] as const

export async function buildHostOptions(input: BuildHostOptionsInput = {}): Promise<HostOptionsView> {
  const repoRoot = input.repoRoot ?? process.cwd()
  const soulSourceErrors: string[] = []
  let servers: HostServerOption[] = []
  let serverSourceError: string | undefined

  try {
    servers = parseAisshServerListOutput(await (input.aisshServerList ?? runAisshServerList)())
  }
  catch (error) {
    serverSourceError = error instanceof Error ? error.message : String(error)
  }

  const soulReleases = officialSoulIds.flatMap((id) => {
    const descriptorAbsPath = join(repoRoot, 'souls', id, 'dist', 'soul.descriptor.json')
    if (!existsSync(descriptorAbsPath))
      return []
    try {
      const descriptor = JSON.parse(readFileSync(descriptorAbsPath, 'utf8')) as Record<string, unknown>
      const identity = descriptor.identity as Record<string, unknown> | undefined
      if (!identity || typeof identity.id !== 'string' || typeof identity.name !== 'string')
        throw new Error(`Invalid Soul descriptor identity: ${id}`)
      return [{
        descriptorPath: relative(repoRoot, descriptorAbsPath),
        id: identity.id,
        name: identity.name,
        releaseRef: `${identity.id}@dev`,
        source: 'official' as const,
      }]
    }
    catch (error) {
      soulSourceErrors.push(error instanceof Error ? error.message : String(error))
      return []
    }
  })

  return {
    access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
    auth: { mode: 'dev-static', status: 'deferred-logto' },
    servers,
    soulReleases,
    ...(serverSourceError ? { serverSourceError } : {}),
    ...(soulSourceErrors.length > 0 ? { soulSourceErrors } : {}),
    ...(input.repoRoot ? { repoRootForTest: repoRoot } : {}),
  }
}

export function parseAisshServerListOutput(output: string): HostServerOption[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  }
  catch {
    throw new Error('Invalid aissh server list JSON')
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { servers?: unknown }).servers))
    throw new Error('Invalid aissh server list response')

  return (parsed as { servers: unknown[] }).servers.flatMap((server) => {
    if (!server || typeof server !== 'object')
      return []
    const record = server as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.trim().length === 0)
      return []
    return [{
      ...(typeof record.host === 'string' ? { host: record.host } : {}),
      id: record.id,
      ...(typeof record.name === 'string' ? { name: record.name } : {}),
      ...(typeof record.notes === 'string' ? { notes: record.notes } : {}),
      source: 'aissh' as const,
    }]
  })
}

async function runAisshServerList(): Promise<string> {
  const proc = Bun.spawn(['aissh', 'server', 'list'], {
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0)
    throw new Error(stderr.trim() || `aissh server list exited ${exitCode}`)
  return stdout
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
bun test apps/host-cli/src/host-options.test.ts --timeout=15000
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/host-cli/src/host-options.ts apps/host-cli/src/host-options.test.ts
git commit -m "feat(host): 添加 options provider"
```

## Task 2: Host API Options And Dev Landing

**Files:**
- Modify: `apps/host-cli/src/host-server.ts`
- Modify: `apps/host-cli/src/host-server.test.ts`

- [ ] **Step 1: Write failing API tests**

Add tests to `apps/host-cli/src/host-server.test.ts`:

```ts
it('returns a dev landing that points developers to the Host Web URL', async () => {
  const server = await createHostServer({
    authUser: adminUser,
    dbPath: dbPath(),
    publicBaseUrl: 'http://127.0.0.1:9117',
    webBaseUrl: 'http://127.0.0.1:5050',
  })

  const response = await server.fetch(new Request('http://host/'))
  const text = await response.text()

  expect(response.status).toBe(200)
  expect(text).toContain('Host API is running')
  expect(text).toContain('http://127.0.0.1:5050/host')
  expect(text).toContain('/api/host/options')
})

it('returns Host options for Web and CLI without credentials', async () => {
  const server = await createHostServer({
    authUser: adminUser,
    dbPath: dbPath(),
    optionsProvider: async () => ({
      access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
      auth: { mode: 'dev-static', status: 'deferred-logto' },
      servers: [{ id: 'srv-1', name: 'aiwork', source: 'aissh' }],
      soulReleases: [{
        descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json',
        id: 'aiworker-freeform',
        name: 'AIWorker Freeform',
        releaseRef: 'aiworker-freeform@dev',
        source: 'official',
      }],
    }),
    publicBaseUrl: 'https://aiworker.zonease.org',
  })

  const response = await server.fetch(new Request('http://host/api/host/options'))
  const body = await json(response)

  expect(response.status).toBe(200)
  expect(body.servers[0].id).toBe('srv-1')
  expect(body.soulReleases[0].releaseRef).toBe('aiworker-freeform@dev')
  expect(JSON.stringify(body)).not.toContain('token')
  expect(JSON.stringify(body)).not.toContain('secret')
})

it('includes an aissh exec command in assignment creation', async () => {
  const server = await createHostServer({
    authUser: adminUser,
    dbPath: dbPath(),
    publicBaseUrl: 'https://aiworker.zonease.org',
  })

  const created = await json(await server.fetch(new Request('http://host/api/host/assignments', {
    body: JSON.stringify({
      assignedEmail: 'bob@example.com',
      serverRef: 'srv-1',
      soulReleaseRef: 'aiworker-freeform@dev',
    }),
    method: 'POST',
  })))

  expect(created.aisshCommand).toContain('aissh exec srv-1')
  expect(created.aisshCommand).toContain(created.provisionToken)
  expect(created.aisshCommand).toContain('--reason=')
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts --timeout=15000
```

Expected: FAIL because `webBaseUrl`, `optionsProvider`, `/api/host/options`, and `aisshCommand` are not implemented.

- [ ] **Step 3: Implement API changes**

Modify `apps/host-cli/src/host-server.ts`:

```ts
import type { HostOptionsView } from './host-options'
import { buildHostOptions } from './host-options'

export interface HostServerOptions {
  accessRegistry?: WorkerAccessRegistry
  authProvider?: AuthProvider
  authUser?: AuthenticatedHostUser | null
  dbPath: string
  optionsProvider?: () => Promise<HostOptionsView>
  publicBaseUrl: string
  webBaseUrl?: string
}
```

Route additions:

```ts
if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/host'))
  return devLanding(options.publicBaseUrl, options.webBaseUrl ?? 'http://127.0.0.1:5050')

if (request.method === 'GET' && url.pathname === '/api/host/options')
  return handleOptions(authProvider, options.optionsProvider ?? buildHostOptions)
```

Handlers:

```ts
async function handleOptions(
  authProvider: AuthProvider,
  optionsProvider: () => Promise<HostOptionsView>,
): Promise<Response> {
  const user = await authProvider.authenticateRequest({ headers: new Headers() })
  if (!user || !userIsHostAdmin(user))
    return json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
  return json(await optionsProvider())
}

function buildAisshCommand(serverRef: string, assignedEmail: string, provisionCommand: string): string {
  return `aissh exec ${shellQuote(serverRef)} ${shellQuote(provisionCommand)} --reason=${shellQuote(`Provision AIWorker for ${assignedEmail}`)}`
}

function devLanding(publicBaseUrl: string, webBaseUrl: string): Response {
  return text([
    'AIWorker Host API is running.',
    `Host Web: ${webBaseUrl.replace(/\/+$/, '')}/host`,
    `Host API: ${publicBaseUrl}`,
    'Endpoints: /api/host/options, /api/host/assignments, /api/provision/check-in',
  ].join('\n'))
}
```

Creation response addition:

```ts
const provisionCommand = buildProvisionCommand(publicBaseUrl, created.provisionToken)
return json({
  aisshCommand: buildAisshCommand(created.assignment.serverRef, created.assignment.assignedEmail, provisionCommand),
  assignment: toAssignmentView(created.assignment),
  provisionCommand,
  provisionToken: created.provisionToken,
}, { status: 201 })
```

When implementing `handleOptions`, pass the real request headers, not an empty `Headers` object:

```ts
return handleOptions(request, authProvider, options.optionsProvider ?? buildHostOptions)
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts apps/host-cli/src/host-options.test.ts --timeout=15000
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/host-cli/src/host-server.ts apps/host-cli/src/host-server.test.ts
git commit -m "feat(host): 暴露 options api 和 dev landing"
```

## Task 3: Host CLI Options Contract

**Files:**
- Modify: `apps/host-cli/src/aiworker-host.ts`
- Modify: `apps/host-cli/src/aiworker-host.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Add tests:

```ts
it('lists Host options through the Host API', async () => {
  const code = await runHostCli(['option', 'list', '--host', 'http://127.0.0.1:9117'], {
    fetch: testFetch(async (input, init) => {
      const request = new Request(input, init)
      expect(request.method).toBe('GET')
      expect(request.url).toBe('http://127.0.0.1:9117/api/host/options')
      return new Response(JSON.stringify({
        access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
        auth: { mode: 'dev-static', status: 'deferred-logto' },
        servers: [{ id: 'srv-1', name: 'aiwork', source: 'aissh', token: 'secret' }],
        soulReleases: [{
          descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json',
          id: 'aiworker-freeform',
          name: 'AIWorker Freeform',
          releaseRef: 'aiworker-freeform@dev',
          source: 'official',
        }],
      }), { headers: { 'content-type': 'application/json' } })
    }),
  })

  expect(code).toBe(0)
  const parsed = JSON.parse(output)
  expect(parsed.servers[0].id).toBe('srv-1')
  expect(parsed.soulReleases[0].releaseRef).toBe('aiworker-freeform@dev')
  expect(output).not.toContain('secret')
})

it('prints aisshCommand from assignment create but still omits provisionToken field', async () => {
  const code = await runHostCli(['assignment', 'create', '--email', 'bob@zonease.org', '--server', 'srv-1', '--soul', 'aiworker-freeform@dev'], {
    fetch: testFetch(async () => {
      return new Response(JSON.stringify({
        aisshCommand: 'aissh exec srv-1 "bun aiworker provision --token awp_secret" --reason=test',
        assignment: {
          assignedEmail: 'bob@zonease.org',
          assignmentId: 'asn_1',
          serverRef: 'srv-1',
          soulReleaseRef: 'aiworker-freeform@dev',
          status: 'provisioning',
          workerId: null,
          workbenchUrl: null,
        },
        provisionCommand: 'bun aiworker provision --token awp_secret',
        provisionToken: 'awp_secret',
      }), { headers: { 'content-type': 'application/json' }, status: 201 })
    }),
  })

  expect(code).toBe(0)
  const parsed = JSON.parse(output)
  expect(parsed.aisshCommand).toContain('aissh exec srv-1')
  expect(parsed.provisionCommand).toContain('awp_secret')
  expect(parsed.provisionToken).toBeUndefined()
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
bun test apps/host-cli/src/aiworker-host.test.ts --timeout=15000
```

Expected: FAIL because `option list` and `aisshCommand` projection are missing.

- [ ] **Step 3: Implement CLI command**

In `apps/host-cli/src/aiworker-host.ts`:

```ts
function projectHostOptions(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, 'host options')
  return {
    access: record.access,
    auth: record.auth,
    serverSourceError: record.serverSourceError,
    servers: Array.isArray(record.servers)
      ? record.servers.map(server => projectAllowedFields(server, ['id', 'name', 'host', 'notes', 'source']))
      : [],
    soulReleases: Array.isArray(record.soulReleases)
      ? record.soulReleases.map(soul => projectAllowedFields(soul, ['id', 'name', 'releaseRef', 'descriptorPath', 'source']))
      : [],
    soulSourceErrors: record.soulSourceErrors,
  }
}

function projectAllowedFields(value: unknown, fields: string[]): Record<string, unknown> {
  const record = requireRecord(value, 'projected value')
  const view: Record<string, unknown> = {}
  for (const field of fields) {
    if (field in record)
      view[field] = record[field]
  }
  return view
}
```

Add `aisshCommand` to `projectAssignmentCreateResponse`:

```ts
return {
  aisshCommand: typeof record.aisshCommand === 'string' ? record.aisshCommand : undefined,
  assignment: projectAssignmentView(record.assignment),
  provisionCommand: record.provisionCommand,
}
```

Add command:

```ts
cli
  .command('option list', 'list aissh servers and Soul releases through the Host API')
  .option('--host <url>', 'Host API base URL', { default: 'http://127.0.0.1:9117' })
  .action(async (options: { host?: string }) => {
    const host = normalizeHostUrl(options.host)
    const result = await requestHostJson(fetchImpl, `${host}/api/host/options`)
    printJson(projectHostOptions(result))
  })
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
bun test apps/host-cli/src/aiworker-host.test.ts --timeout=15000
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/host-cli/src/aiworker-host.ts apps/host-cli/src/aiworker-host.test.ts
git commit -m "feat(host-cli): 添加 option list"
```

## Task 4: Host Web API Client

**Files:**
- Modify: `apps/host-web/src/host-api.ts`
- Modify: `apps/host-web/src/host-api.test.ts`

- [ ] **Step 1: Write failing client tests**

Add to `apps/host-web/src/host-api.test.ts`:

```ts
it('loads Host options from the configured API base URL', async () => {
  const fetchImpl = createFetch(jsonResponse({
    access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
    auth: { mode: 'dev-static', status: 'deferred-logto' },
    servers: [{ id: 'srv-1', name: 'aiwork', source: 'aissh' }],
    soulReleases: [{
      descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json',
      id: 'aiworker-freeform',
      name: 'AIWorker Freeform',
      releaseRef: 'aiworker-freeform@dev',
      source: 'official',
    }],
  }))
  const client = createHostApiClient({ baseUrl: 'http://host.test', fetch: fetchImpl })

  const options = await client.getOptions()

  expect(fetchImpl.calls[0]?.input).toBe('http://host.test/api/host/options')
  expect(options.servers[0]?.id).toBe('srv-1')
  expect(options.soulReleases[0]?.releaseRef).toBe('aiworker-freeform@dev')
})

it('creates assignments and preserves aisshCommand from the creation response', async () => {
  const fetchImpl = createFetch(jsonResponse({
    aisshCommand: 'aissh exec srv-1 "bun aiworker provision --token awp_secret" --reason=test',
    assignment: readyAssignment,
    provisionCommand: 'bun aiworker provision --token awp_secret',
  }, { status: 201 }))
  const client = createHostApiClient({ fetch: fetchImpl })

  await expect(client.createAssignment({
    assignedEmail: 'mei@example.com',
    serverRef: 'srv-1',
    soulReleaseRef: 'aiworker-freeform@dev',
  })).resolves.toMatchObject({
    aisshCommand: expect.stringContaining('aissh exec srv-1'),
  })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
bun run --filter '@zonease/aiworker-host-web' test -- src/host-api.test.ts
```

Expected: FAIL because `getOptions` and `aisshCommand` are missing.

- [ ] **Step 3: Implement client types**

In `apps/host-web/src/host-api.ts`, add:

```ts
export interface HostServerOption {
  host?: string
  id: string
  name?: string
  notes?: string
  source: 'aissh'
}

export interface HostSoulReleaseOption {
  descriptorPath: string
  id: string
  name: string
  releaseRef: string
  source: 'official'
}

export interface HostOptionsSummary {
  access: { mode: string, status: string }
  auth: { mode: string, status: string }
  servers: HostServerOption[]
  soulReleases: HostSoulReleaseOption[]
  serverSourceError?: string
  soulSourceErrors?: string[]
}
```

Extend:

```ts
export interface CreateHostAssignmentResult {
  aisshCommand?: string
  assignment: HostAssignmentSummary
  provisionCommand: string
}

export interface HostApiClient {
  createAssignment: (input: CreateHostAssignmentInput) => Promise<CreateHostAssignmentResult>
  getOptions: () => Promise<HostOptionsSummary>
  listAssignments: () => Promise<HostAssignmentSummary[]>
}
```

Add `optionsUrl` and method:

```ts
const optionsUrl = `${baseUrl}/api/host/options`

async getOptions() {
  return requestJson<HostOptionsSummary>(fetchImpl, optionsUrl)
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
bun run --filter '@zonease/aiworker-host-web' test -- src/host-api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/host-web/src/host-api.ts apps/host-web/src/host-api.test.ts
git commit -m "feat(host-web): 接入 host options api"
```

## Task 5: Host Web Control Console

**Files:**
- Modify: `apps/host-web/src/app.tsx`
- Modify: `apps/host-web/src/app.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Update `apps/host-web/src/app.test.tsx` expectations:

```ts
const options = {
  access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
  auth: { mode: 'dev-static', status: 'deferred-logto' },
  servers: [{ id: 'srv-1', name: 'aiwork', host: '172.105.219.50', source: 'aissh' as const }],
  soulReleases: [{
    descriptorPath: 'souls/aiworker-freeform/dist/soul.descriptor.json',
    id: 'aiworker-freeform',
    name: 'AIWorker Freeform',
    releaseRef: 'aiworker-freeform@dev',
    source: 'official' as const,
  }],
}

it('renders the Phase 2 Host console shell with nav, list, and right drawer', async () => {
  const api = createApi({
    getOptions: vi.fn().mockResolvedValue(options),
    listAssignments: vi.fn().mockResolvedValue([checkedInAssignment]),
  })

  const { container } = render(<HostControlPlane api={api} />)

  expect(await screen.findByRole('heading', { name: 'AI Workers' })).not.toBeNull()
  expect(screen.getByRole('navigation', { name: 'Host navigation' })).not.toBeNull()
  expect(screen.getByRole('complementary', { name: 'Worker assignment drawer' })).not.toBeNull()
  expect(screen.getByText('开通 AI Worker')).not.toBeNull()
  expect(screen.getByText('Logto 未接入')).not.toBeNull()
  expect(screen.getByText('Worker Access Tunnel 未接入')).not.toBeNull()
  expect(container.querySelector('iframe')).toBeNull()
  expect(container.querySelector('micro-app')).toBeNull()
})

it('uses options for server and Soul selection when creating an assignment', async () => {
  const createAssignment = vi.fn().mockResolvedValue({
    aisshCommand: 'aissh exec srv-1 "bun aiworker provision --token awp_secret" --reason=test',
    assignment: {
      assignedEmail: 'mei@example.com',
      assignmentId: 'asn_new',
      serverRef: 'srv-1',
      soulReleaseRef: 'aiworker-freeform@dev',
      status: 'provisioning',
      workerId: null,
      workbenchUrl: null,
    },
    provisionCommand: 'bun aiworker provision --token awp_secret',
  })
  const api = createApi({
    createAssignment,
    getOptions: vi.fn().mockResolvedValue(options),
    listAssignments: vi.fn().mockResolvedValue([]),
  })

  render(<HostControlPlane api={api} />)

  await screen.findByText('aiwork')
  fireEvent.change(screen.getByLabelText('员工邮箱'), { target: { value: 'mei@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: '创建开通' }))

  await waitFor(() => {
    expect(createAssignment).toHaveBeenCalledWith({
      assignedEmail: 'mei@example.com',
      serverRef: 'srv-1',
      soulReleaseRef: 'aiworker-freeform@dev',
    })
  })
  expect(await screen.findByText('Provision command')).not.toBeNull()
  expect(screen.getByText('aissh exec command')).not.toBeNull()
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
bun run --filter '@zonease/aiworker-host-web' test -- src/app.test.tsx
```

Expected: FAIL because the current UI has no console shell/options/drawer.

- [ ] **Step 3: Implement console shell**

Replace `apps/host-web/src/app.tsx` with a focused component that:

- loads assignments and options in parallel on mount;
- renders `<nav aria-label="Host navigation">`;
- renders `<main>` with the AI Workers list;
- renders `<aside aria-label="Worker assignment drawer">`;
- uses `Button`, `Badge`, `Alert`, `Empty`, `Input`, `Select`, `Separator`, `ScrollArea`, and existing semantic tokens;
- keeps a manual fallback `<Input>` for server/soul only when options lists are empty;
- shows one-time command blocks after assignment creation;
- does not render `iframe`, `micro-app`, or an enabled Worker link unless assignment status is `ready`.

Core create input rule:

```ts
const input = {
  assignedEmail: formState.assignedEmail.trim(),
  serverRef: selectedServerRef(),
  soulReleaseRef: selectedSoulReleaseRef(),
}
```

Status timeline copy:

```ts
const timeline = [
  ['Assignment 已创建', true],
  ['等待执行 provision command', assignment.status === 'provisioning'],
  ['Worker 已报到', ['checked_in', 'access_ready', 'ready'].includes(assignment.status)],
  ['Worker Access Tunnel 未接入', assignment.status !== 'ready'],
  ['Logto 未接入', true],
]
```

- [ ] **Step 4: Run UI tests**

Run:

```bash
bun run --filter '@zonease/aiworker-host-web' test -- src/app.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/host-web/src/app.tsx apps/host-web/src/app.test.tsx
git commit -m "feat(host-web): 升级 phase2 控制台布局"
```

## Task 6: Browser Proof Update

**Files:**
- Modify: `tests/browser/host-dev-loop.spec.ts`
- Modify: `tests/browser/phase2-host-worker-access.spec.ts`

- [ ] **Step 1: Write/update browser assertions**

In `tests/browser/host-dev-loop.spec.ts`, after navigation assert:

```ts
await page.getByRole('navigation', { name: 'Host navigation' }).waitFor({ state: 'visible', timeout: 10000 })
await page.getByRole('complementary', { name: 'Worker assignment drawer' }).waitFor({ state: 'visible', timeout: 10000 })
await page.getByText('Worker Access Tunnel 未接入').waitFor({ state: 'visible', timeout: 10000 })
await page.getByText('Logto 未接入').waitFor({ state: 'visible', timeout: 10000 })
```

Update form interaction to:

```ts
await page.getByLabel('员工邮箱').fill('browser.employee@zonease.org')
const serverInputCount = await page.getByLabel('aissh server').count()
if (serverInputCount > 0)
  await page.getByLabel('aissh server').fill('aissh://browser-proof')
const soulInputCount = await page.getByLabel('Soul release').count()
if (soulInputCount > 0)
  await page.getByLabel('Soul release').fill('aiworker-freeform@browser-proof')
await page.getByRole('button', { name: '创建开通' }).click()
```

In `tests/browser/phase2-host-worker-access.spec.ts`, assert shell and drawer rather than only the old button:

```ts
await page.getByRole('navigation', { name: 'Host navigation' }).waitFor({ state: 'visible', timeout: 10000 })
await page.getByRole('complementary', { name: 'Worker assignment drawer' }).waitFor({ state: 'visible', timeout: 10000 })
```

- [ ] **Step 2: Run browser proof and verify failures before implementation if not already green**

Run:

```bash
bun run test:browser:host-dev
```

Expected before Task 5: FAIL. Expected after Task 5 and this task implementation: PASS.

- [ ] **Step 3: Commit browser proof changes**

```bash
git add tests/browser/host-dev-loop.spec.ts tests/browser/phase2-host-worker-access.spec.ts
git commit -m "test(host): 更新 phase2 控制台浏览器证明"
```

## Task 7: Final Verification

**Files:**
- No planned edits unless verification finds a defect.

- [ ] **Step 1: Focused Host API/CLI tests**

Run:

```bash
bun test apps/host-cli/src/host-options.test.ts apps/host-cli/src/host-server.test.ts apps/host-cli/src/aiworker-host.test.ts --timeout=15000
```

Expected: PASS.

- [ ] **Step 2: Host Web tests**

Run:

```bash
bun run --filter '@zonease/aiworker-host-web' test
bun run --filter '@zonease/aiworker-host-web' typecheck
```

Expected: PASS.

- [ ] **Step 3: Architecture/contracts**

Run:

```bash
bun run docs:check
bun run test:contracts
```

Expected: PASS.

- [ ] **Step 4: Browser proof**

Run:

```bash
bun run test:browser:host-dev
```

Expected: PASS and evidence written under `tmp/host-dev-loop-*`.

- [ ] **Step 5: Code review graph**

Run:

```bash
bun run crg:review
```

Expected: no high-risk unreviewed findings, or findings are addressed.

- [ ] **Step 6: Final status**

Run:

```bash
git status --short
git log --oneline --max-count=8
```

Expected: only intentional tracked changes remain, preferably committed.

