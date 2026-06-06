# Host Dev Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Host CLI, Host API, and Host Web into a real developer loop with no seed data and a visible `provisioning -> checked_in` path.

**Architecture:** Host API remains the source of truth for assignment creation, listing, and Worker check-in. Host CLI calls Host API over HTTP for assignment commands. Host Web uses an injected API client and existing `packages/ui` components to read/create assignments and show a one-time provision command.

**Tech Stack:** Bun, TypeScript, React 19, Vite 8, Vitest/happy-dom, Playwright, sqlite storage through `@zonease/aiworker-storage-sqlite`, Host contracts through `@zonease/aiworker-host-control`.

---

## File Structure

- Modify `apps/host-cli/src/host-server.ts`
  - Add one-time `provisionCommand` to assignment creation responses.
  - Keep list responses token-free.
- Modify `apps/host-cli/src/host-server.test.ts`
  - Cover `provisionCommand` and token redaction.
- Modify `apps/host-cli/src/aiworker-host.ts`
  - Add HTTP-backed `assignment create` and `assignment list`.
  - Keep `serve` behavior and `worker list` behavior intact.
- Modify `apps/host-cli/src/aiworker-host.test.ts`
  - Add fetch-injected CLI tests for assignment commands.
- Create `apps/host-web/src/host-api.ts`
  - Define Host Web assignment types and API client functions.
- Create `apps/host-web/src/host-api.test.ts`
  - Test API URL resolution, create/list requests, and error handling.
- Modify `apps/host-web/vite.config.ts`
  - Proxy `/api` and `/workers` to the Host API during Vite development.
- Modify `apps/host-web/src/app.tsx`
  - Replace default mock assignments with API-backed state.
  - Add create assignment form and one-time provision command display.
  - Use existing `packages/ui` components only.
- Modify `apps/host-web/src/app.test.tsx`
  - Replace static mock tests with API-backed UI tests.
- Create `scripts/dev-host.sh`
  - Start Host API on `9117` and Host Web on `5050`.
- Modify `package.json`
  - Point `dev:host` to `scripts/dev-host.sh`.
  - Add a differently named Worker daemon shortcut if preserving the old command is useful.
- Create `tests/architecture/host-dev-startup-contract.test.ts`
  - Guard ports and root script ownership.
- Create `tests/browser/host-dev-loop.spec.ts`
  - Browser proof for create assignment and check-in status update.
- Modify `docs/testing.md`
  - Record the Host dev browser proof.
- Modify `package.json`
  - Add `test:browser:host-dev` and wire it into `test:browser:phase2`.

---

### Task 1: Host API Returns One-Time Provision Command

**Files:**
- Modify: `apps/host-cli/src/host-server.test.ts`
- Modify: `apps/host-cli/src/host-server.ts`

- [ ] **Step 1: Write the failing API test**

Update `apps/host-cli/src/host-server.test.ts` in `allows an admin to create and list assignments without leaking stored token fields`:

```ts
expect(created.provisionToken).toStartWith('awp_')
expect(created.provisionCommand).toBe(`bun apps/worker-cli/src/aiworker.ts provision --host https://aiworker.zonease.org --token ${created.provisionToken}`)
expect(created.assignment.assignedEmail).toBe('bob@example.com')
expect(created.assignment.provisionTokenHash).toBeUndefined()

const listed = await json(await server.fetch(new Request('http://host/api/host/assignments')))
expect(listed.assignments).toHaveLength(1)
expect(JSON.stringify(listed)).not.toContain(created.provisionToken)
expect(JSON.stringify(listed)).not.toContain('provisionToken')
expect(JSON.stringify(listed)).not.toContain('provisionTokenHash')
expect(JSON.stringify(listed)).not.toContain('provisionCommand')
```

- [ ] **Step 2: Run the API test and verify RED**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts --timeout=15000
```

Expected: FAIL because `created.provisionCommand` is missing.

- [ ] **Step 3: Implement the provision command helper**

In `apps/host-cli/src/host-server.ts`, add:

```ts
function buildProvisionCommand(publicBaseUrl: string, provisionToken: string): string {
  return `bun apps/worker-cli/src/aiworker.ts provision --host ${publicBaseUrl} --token ${provisionToken}`
}
```

In `handleAssignments`, include the command only in the create response:

```ts
  return json({
    assignment: toAssignmentView(created.assignment),
    provisionCommand: buildProvisionCommand(options.publicBaseUrl, created.provisionToken),
    provisionToken: created.provisionToken,
  }, { status: 201 })
```

To pass `publicBaseUrl` into `handleAssignments`, change the call site:

```ts
if (url.pathname === '/api/host/assignments')
  return handleAssignments(request, authProvider, options.publicBaseUrl)
```

And update the function signature:

```ts
async function handleAssignments(
  request: Request,
  authProvider: AuthProvider,
  publicBaseUrl: string,
): Promise<Response> {
```

- [ ] **Step 4: Run the API test and verify GREEN**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts --timeout=15000
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/host-cli/src/host-server.ts apps/host-cli/src/host-server.test.ts
git commit -m "feat(host): 返回一次性 provision 命令"
```

---

### Task 2: Host CLI Assignment Commands Call Host API

**Files:**
- Modify: `apps/host-cli/src/aiworker-host.test.ts`
- Modify: `apps/host-cli/src/aiworker-host.ts`

- [ ] **Step 1: Write failing CLI tests**

Append to `apps/host-cli/src/aiworker-host.test.ts`:

```ts
it('creates an assignment through the Host API', async () => {
  const requests: Request[] = []
  const code = await runHostCli([
    'assignment',
    'create',
    '--email',
    'Bob@Zonease.org',
    '--server',
    'aissh://server/ap-sg-01',
    '--soul',
    'aiworker-freeform@dev',
    '--host',
    'http://127.0.0.1:9117',
  ], {
    async fetch(input, init) {
      const request = new Request(input, init)
      requests.push(request)
      expect(request.method).toBe('POST')
      expect(request.url).toBe('http://127.0.0.1:9117/api/host/assignments')
      expect(await request.json()).toEqual({
        assignedEmail: 'Bob@Zonease.org',
        serverRef: 'aissh://server/ap-sg-01',
        soulReleaseRef: 'aiworker-freeform@dev',
      })
      return new Response(JSON.stringify({
        assignment: {
          assignedEmail: 'bob@zonease.org',
          assignmentId: 'asn_1',
          serverRef: 'aissh://server/ap-sg-01',
          soulReleaseRef: 'aiworker-freeform@dev',
          status: 'provisioning',
          workerId: null,
          workbenchUrl: null,
        },
        provisionCommand: 'bun apps/worker-cli/src/aiworker.ts provision --host http://127.0.0.1:9117 --token awp_secret',
      }), { headers: { 'content-type': 'application/json' }, status: 201 })
    },
  })

  expect(code).toBe(0)
  expect(requests).toHaveLength(1)
  const parsed = JSON.parse(output)
  expect(parsed.assignment.assignedEmail).toBe('bob@zonease.org')
  expect(parsed.provisionCommand).toContain('--token awp_secret')
})

it('lists assignments through the Host API without printing tokens', async () => {
  const code = await runHostCli([
    'assignment',
    'list',
    '--host',
    'http://127.0.0.1:9117',
  ], {
    async fetch(input, init) {
      const request = new Request(input, init)
      expect(request.method).toBe('GET')
      expect(request.url).toBe('http://127.0.0.1:9117/api/host/assignments')
      return new Response(JSON.stringify({
        assignments: [{
          assignedEmail: 'bob@zonease.org',
          assignmentId: 'asn_1',
          serverRef: 'aissh://server/ap-sg-01',
          soulReleaseRef: 'aiworker-freeform@dev',
          status: 'checked_in',
          workerId: 'wkr_82',
          workbenchUrl: null,
        }],
      }), { headers: { 'content-type': 'application/json' } })
    },
  })

  expect(code).toBe(0)
  expect(output).toContain('bob@zonease.org')
  expect(output).not.toContain('awp_')
  expect(output).not.toContain('provisionToken')
})

it('returns exit code 1 when assignment create receives a Host API error', async () => {
  const code = await runHostCli([
    'assignment',
    'create',
    '--email',
    'bad',
    '--server',
    'aissh://server/ap-sg-01',
    '--soul',
    'aiworker-freeform@dev',
  ], {
    async fetch() {
      return new Response(JSON.stringify({ error: { code: 'INVALID_ASSIGNMENT_REQUEST' } }), {
        headers: { 'content-type': 'application/json' },
        status: 400,
      })
    },
  })

  expect(code).toBe(1)
})
```

- [ ] **Step 2: Run CLI tests and verify RED**

Run:

```bash
bun test apps/host-cli/src/aiworker-host.test.ts --timeout=15000
```

Expected: FAIL because `assignment create` and `assignment list` are unknown commands.

- [ ] **Step 3: Add fetch dependency and HTTP helpers**

In `apps/host-cli/src/aiworker-host.ts`, extend `HostCliDeps`:

```ts
  fetch?: typeof fetch
```

Inside `runHostCli`, add:

```ts
const fetchImpl = deps.fetch ?? fetch
```

Add helpers below `printJson`:

```ts
function normalizeHostUrl(input: string | undefined): string {
  return (input ?? 'http://127.0.0.1:9117').replace(/\/+$/, '')
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json()
  }
  catch {
    return null
  }
}

async function requestHostJson(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetchImpl(url, init)
  const body = await readJsonResponse(response)
  if (!response.ok) {
    const code = typeof body === 'object' && body && 'error' in body
      ? JSON.stringify((body as { error: unknown }).error)
      : `HTTP ${response.status}`
    throw new Error(`Host API request failed: ${code}`)
  }
  return body
}
```

- [ ] **Step 4: Add `assignment create` and `assignment list` commands**

In `runHostCli`, before `serve`, add:

```ts
  cli
    .command('assignment create', 'create a Host assignment through the Host API')
    .requiredOption('--email <email>', 'employee email')
    .requiredOption('--server <server>', 'aissh server ref')
    .requiredOption('--soul <soul>', 'Soul release ref')
    .option('--host <url>', 'Host API base URL', { default: 'http://127.0.0.1:9117' })
    .action(async (options: { email: string, host: string, server: string, soul: string }) => {
      const host = normalizeHostUrl(options.host)
      const body = await requestHostJson(fetchImpl, `${host}/api/host/assignments`, {
        body: JSON.stringify({
          assignedEmail: options.email,
          serverRef: options.server,
          soulReleaseRef: options.soul,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      printJson(body)
    })

  cli
    .command('assignment list', 'list Host assignments through the Host API')
    .option('--host <url>', 'Host API base URL', { default: 'http://127.0.0.1:9117' })
    .action(async (options: { host: string }) => {
      const host = normalizeHostUrl(options.host)
      const body = await requestHostJson(fetchImpl, `${host}/api/host/assignments`)
      printJson(body)
    })
```

- [ ] **Step 5: Run CLI tests and verify GREEN**

Run:

```bash
bun test apps/host-cli/src/aiworker-host.test.ts --timeout=15000
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/host-cli/src/aiworker-host.ts apps/host-cli/src/aiworker-host.test.ts
git commit -m "feat(host-cli): 添加 assignment API 命令"
```

---

### Task 3: Host Web API Client

**Files:**
- Create: `apps/host-web/src/host-api.test.ts`
- Create: `apps/host-web/src/host-api.ts`
- Modify: `apps/host-web/vite.config.ts`

- [ ] **Step 1: Write failing API client tests**

Create `apps/host-web/src/host-api.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { createHostApiClient, hostApiBaseUrl } from './host-api'

describe('host api client', () => {
  it('uses same-origin API paths by default', () => {
    expect(hostApiBaseUrl({})).toBe('')
  })

  it('can use an explicit API URL and trims trailing slashes', () => {
    expect(hostApiBaseUrl({ AIWORKER_HOST_API_URL: 'http://host.test///' })).toBe('http://host.test')
  })

  it('lists assignments from Host API', async () => {
    const requests: Request[] = []
    const api = createHostApiClient({
      baseUrl: 'http://127.0.0.1:9117',
      fetch: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return new Response(JSON.stringify({
          assignments: [{
            assignedEmail: 'bob@zonease.org',
            assignmentId: 'asn_1',
            serverRef: 'aissh://server/ap-sg-01',
            soulReleaseRef: 'aiworker-freeform@dev',
            status: 'checked_in',
            workerId: 'wkr_82',
            workbenchUrl: null,
          }],
        }), { headers: { 'content-type': 'application/json' } })
      },
    })

    await expect(api.listAssignments()).resolves.toEqual([{
      assignedEmail: 'bob@zonease.org',
      assignmentId: 'asn_1',
      serverRef: 'aissh://server/ap-sg-01',
      soulReleaseRef: 'aiworker-freeform@dev',
      status: 'checked_in',
      workerId: 'wkr_82',
      workbenchUrl: null,
    }])
    expect(requests[0]?.url).toBe('http://127.0.0.1:9117/api/host/assignments')
  })

  it('creates assignments and returns the one-time provision command', async () => {
    const api = createHostApiClient({
      baseUrl: 'http://127.0.0.1:9117',
      fetch: async (input, init) => {
        const request = new Request(input, init)
        expect(request.method).toBe('POST')
        expect(await request.json()).toEqual({
          assignedEmail: 'bob@zonease.org',
          serverRef: 'aissh://server/ap-sg-01',
          soulReleaseRef: 'aiworker-freeform@dev',
        })
        return new Response(JSON.stringify({
          assignment: {
            assignedEmail: 'bob@zonease.org',
            assignmentId: 'asn_1',
            serverRef: 'aissh://server/ap-sg-01',
            soulReleaseRef: 'aiworker-freeform@dev',
            status: 'provisioning',
            workerId: null,
            workbenchUrl: null,
          },
          provisionCommand: 'bun apps/worker-cli/src/aiworker.ts provision --host http://127.0.0.1:9117 --token awp_secret',
        }), { headers: { 'content-type': 'application/json' }, status: 201 })
      },
    })

    await expect(api.createAssignment({
      assignedEmail: 'bob@zonease.org',
      serverRef: 'aissh://server/ap-sg-01',
      soulReleaseRef: 'aiworker-freeform@dev',
    })).resolves.toEqual({
      assignment: {
        assignedEmail: 'bob@zonease.org',
        assignmentId: 'asn_1',
        serverRef: 'aissh://server/ap-sg-01',
        soulReleaseRef: 'aiworker-freeform@dev',
        status: 'provisioning',
        workerId: null,
        workbenchUrl: null,
      },
      provisionCommand: 'bun apps/worker-cli/src/aiworker.ts provision --host http://127.0.0.1:9117 --token awp_secret',
    })
  })

  it('throws stable HostApiError for non-ok API responses', async () => {
    const api = createHostApiClient({
      baseUrl: 'http://127.0.0.1:9117',
      fetch: async () => new Response(JSON.stringify({ error: { code: 'FORBIDDEN' } }), {
        headers: { 'content-type': 'application/json' },
        status: 403,
      }),
    })

    await expect(api.listAssignments()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    })
  })
})
```

- [ ] **Step 2: Run API client tests and verify RED**

Run:

```bash
bun run --filter '@zonease/aiworker-host-web' test
```

Expected: FAIL because `host-api.ts` does not exist.

- [ ] **Step 3: Configure Vite proxy for same-origin Host Web API calls**

Modify `apps/host-web/vite.config.ts`:

```ts
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
  server: {
    proxy: {
      '/api': {
        changeOrigin: true,
        target: process.env.AIWORKER_HOST_API_URL ?? 'http://127.0.0.1:9117',
      },
      '/workers': {
        changeOrigin: true,
        target: process.env.AIWORKER_HOST_API_URL ?? 'http://127.0.0.1:9117',
      },
    },
  },
})
```

- [ ] **Step 4: Implement the API client**

Create `apps/host-web/src/host-api.ts`:

```ts
export type AssignmentStatus =
  | 'draft'
  | 'provisioning'
  | 'checked_in'
  | 'access_ready'
  | 'ready'
  | 'needs_attention'
  | 'revoked'
  | 'archived'

export interface HostAssignmentSummary {
  assignedEmail: string
  assignmentId: string
  serverRef: string
  soulReleaseRef: string
  status: AssignmentStatus
  workerId: null | string
  workbenchUrl: null | string
}

export interface CreateAssignmentInput {
  assignedEmail: string
  serverRef: string
  soulReleaseRef: string
}

export interface CreateAssignmentResult {
  assignment: HostAssignmentSummary
  provisionCommand: string
}

export interface HostApiClient {
  createAssignment: (input: CreateAssignmentInput) => Promise<CreateAssignmentResult>
  listAssignments: () => Promise<HostAssignmentSummary[]>
}

export class HostApiError extends Error {
  code: string
  status: number

  constructor(message: string, options: { code: string, status: number }) {
    super(message)
    this.name = 'HostApiError'
    this.code = options.code
    this.status = options.status
  }
}

export function hostApiBaseUrl(env: Record<string, string | undefined> = import.meta.env): string {
  return (env.AIWORKER_HOST_API_URL ?? '').replace(/\/+$/, '')
}

export function createHostApiClient(options: { baseUrl?: string, fetch?: typeof fetch } = {}): HostApiClient {
  const baseUrl = (options.baseUrl ?? hostApiBaseUrl()).replace(/\/+$/, '')
  const fetchImpl = options.fetch ?? fetch

  return {
    async createAssignment(input) {
      const body = await requestJson(fetchImpl, `${baseUrl}/api/host/assignments`, {
        body: JSON.stringify(input),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }) as CreateAssignmentResult
      return body
    },
    async listAssignments() {
      const body = await requestJson(fetchImpl, `${baseUrl}/api/host/assignments`) as { assignments: HostAssignmentSummary[] }
      return body.assignments
    },
  }
}

async function requestJson(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetchImpl(url, init)
  const body = await safeJson(response)
  if (!response.ok) {
    const code = readErrorCode(body) ?? `HTTP_${response.status}`
    throw new HostApiError(`Host API request failed: ${code}`, { code, status: response.status })
  }
  return body
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  }
  catch {
    return null
  }
}

function readErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('error' in body))
    return null
  const error = (body as { error: unknown }).error
  if (!error || typeof error !== 'object' || !('code' in error))
    return null
  const code = (error as { code: unknown }).code
  return typeof code === 'string' ? code : null
}
```

- [ ] **Step 5: Run API client tests and verify GREEN**

Run:

```bash
bun run --filter '@zonease/aiworker-host-web' test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/host-web/src/host-api.ts apps/host-web/src/host-api.test.ts apps/host-web/vite.config.ts
git commit -m "feat(host-web): 添加 host api client"
```

---

### Task 4: Host Web Uses Real API Data and Existing UI Components

**Files:**
- Modify: `apps/host-web/src/app.test.tsx`
- Modify: `apps/host-web/src/app.tsx`

- [ ] **Step 1: Replace Host Web tests with API-backed behavior tests**

Replace `apps/host-web/src/app.test.tsx` with tests covering:

```ts
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HostControlPlane } from './app'
import type { HostApiClient, HostAssignmentSummary } from './host-api'

const checkedInAssignment: HostAssignmentSummary = {
  assignedEmail: 'lin@example.com',
  assignmentId: 'asn_1',
  serverRef: 'aissh://server/ap-sg-01',
  soulReleaseRef: 'aiworker-freeform@dev',
  status: 'checked_in',
  workerId: 'wkr_82',
  workbenchUrl: null,
}

function apiStub(overrides: Partial<HostApiClient> = {}): HostApiClient {
  return {
    async createAssignment() {
      return {
        assignment: {
          assignedEmail: 'mei@example.com',
          assignmentId: 'asn_2',
          serverRef: 'aissh://server/ap-sg-02',
          soulReleaseRef: 'support@dev',
          status: 'provisioning',
          workerId: null,
          workbenchUrl: null,
        },
        provisionCommand: 'bun apps/worker-cli/src/aiworker.ts provision --host http://127.0.0.1:9117 --token awp_secret',
      }
    },
    async listAssignments() {
      return [checkedInAssignment]
    },
    ...overrides,
  }
}

describe('HostControlPlane', () => {
  it('loads assignments from Host API and avoids mounted Worker UI', async () => {
    const { container } = render(<HostControlPlane api={apiStub()} />)

    expect(container.querySelector('micro-app')).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
    expect(await screen.findByText('lin@example.com')).toBeTruthy()
    expect(screen.getByText('Worker 已报到')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '打开 Worker' })).toBeNull()
  })

  it('renders an empty state from the real API shape', async () => {
    render(<HostControlPlane api={apiStub({ listAssignments: async () => [] })} />)

    expect(await screen.findByText('暂无开通记录')).toBeTruthy()
  })

  it('creates an assignment, refreshes list, and shows one-time provision command', async () => {
    const created: HostAssignmentSummary = {
      assignedEmail: 'mei@example.com',
      assignmentId: 'asn_2',
      serverRef: 'aissh://server/ap-sg-02',
      soulReleaseRef: 'support@dev',
      status: 'provisioning',
      workerId: null,
      workbenchUrl: null,
    }
    const calls: unknown[] = []
    const api = apiStub({
      async createAssignment(input) {
        calls.push(input)
        return {
          assignment: created,
          provisionCommand: 'bun apps/worker-cli/src/aiworker.ts provision --host http://127.0.0.1:9117 --token awp_secret',
        }
      },
      async listAssignments() {
        return calls.length === 0 ? [] : [created]
      },
    })

    render(<HostControlPlane api={api} />)

    fireEvent.change(await screen.findByLabelText('员工邮箱'), { target: { value: 'mei@example.com' } })
    fireEvent.change(screen.getByLabelText('aissh server'), { target: { value: 'aissh://server/ap-sg-02' } })
    fireEvent.change(screen.getByLabelText('Soul release'), { target: { value: 'support@dev' } })
    fireEvent.click(screen.getByRole('button', { name: '创建 assignment' }))

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(await screen.findByText('mei@example.com')).toBeTruthy()
    expect(screen.getByText(/awp_secret/)).toBeTruthy()
    expect(screen.getByText('token 只显示一次')).toBeTruthy()
  })

  it('shows API errors and can retry list loading', async () => {
    render(<HostControlPlane api={apiStub({
      async listAssignments() {
        throw Object.assign(new Error('Host API request failed: FORBIDDEN'), { code: 'FORBIDDEN' })
      },
    })} />)

    expect(await screen.findByText(/FORBIDDEN/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run Host Web tests and verify RED**

Run:

```bash
bun run --filter '@zonease/aiworker-host-web' test
```

Expected: FAIL because `HostControlPlane` does not accept `api`, does not load API data, and has no form.

- [ ] **Step 3: Implement Host Web API-backed state**

Modify `apps/host-web/src/app.tsx`:

- import `type FormEvent` from React;
- import `useEffect`, `useMemo`, `useState`;
- import existing UI components only from `@zonease/aiworker-ui/components/*`;
- import `createHostApiClient` and Host API types from `./host-api`;
- remove `defaultAssignments` from the normal runtime path;
- keep test injection through `HostControlPlaneProps.api`.

Core implementation shape:

```tsx
export interface HostControlPlaneProps {
  api?: HostApiClient
}

export function HostControlPlane({ api: injectedApi }: HostControlPlaneProps = {}) {
  const api = useMemo(() => injectedApi ?? createHostApiClient(), [injectedApi])
  const [assignments, setAssignments] = useState<HostAssignmentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [lastProvisionCommand, setLastProvisionCommand] = useState<string | null>(null)
  const [form, setForm] = useState({ assignedEmail: '', serverRef: '', soulReleaseRef: '' })

  async function refreshAssignments() {
    setLoading(true)
    setError(null)
    try {
      setAssignments(await api.listAssignments())
    }
    catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
    finally {
      setLoading(false)
    }
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)
    setLastProvisionCommand(null)
    try {
      const created = await api.createAssignment(form)
      setLastProvisionCommand(created.provisionCommand)
      await refreshAssignments()
    }
    catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    void refreshAssignments()
  }, [api])
```

Use existing components:

```tsx
import { Alert, AlertDescription } from '@zonease/aiworker-ui/components/alert'
import { Badge, BadgeLabel } from '@zonease/aiworker-ui/components/badge'
import { Button } from '@zonease/aiworker-ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@zonease/aiworker-ui/components/card'
import { Input } from '@zonease/aiworker-ui/components/input'
import { Label } from '@zonease/aiworker-ui/components/label'
```

Status labels:

```ts
function statusLabel(status: AssignmentStatus) {
  switch (status) {
    case 'ready':
      return '可打开 Worker'
    case 'access_ready':
      return '访问通道已就绪'
    case 'checked_in':
      return 'Worker 已报到'
    case 'provisioning':
      return '等待 Worker check-in'
    case 'needs_attention':
      return '需处理'
    case 'revoked':
      return '已撤销'
    case 'archived':
      return '已归档'
    default:
      return '开通中'
  }
}
```

- [ ] **Step 4: Run Host Web tests and verify GREEN**

Run:

```bash
bun run --filter '@zonease/aiworker-host-web' test
bun run --filter '@zonease/aiworker-host-web' typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/host-web/src/app.tsx apps/host-web/src/app.test.tsx
git commit -m "feat(host-web): 接入真实 host api"
```

---

### Task 5: Host Dev Startup Script

**Files:**
- Create: `tests/architecture/host-dev-startup-contract.test.ts`
- Create: `scripts/dev-host.sh`
- Modify: `package.json`

- [ ] **Step 1: Write contract tests for root script and defaults**

Create `tests/architecture/host-dev-startup-contract.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

const repoRoot = join(import.meta.dir, '..', '..')

describe('Host dev startup contract', () => {
  it('routes root dev:host to the Host dev script instead of the Worker daemon', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> }

    expect(pkg.scripts['dev:host']).toBe('bash scripts/dev-host.sh')
    expect(pkg.scripts['dev:host']).not.toContain('apps/worker-cli/src/aiworker.ts daemon foreground')
  })

  it('keeps Host dev default ports stable and away from Worker dev ports', () => {
    const script = readFileSync(join(repoRoot, 'scripts/dev-host.sh'), 'utf8')

    expect(script).toContain('AIWORKER_HOST_API_PORT="${AIWORKER_HOST_API_PORT:-9117}"')
    expect(script).toContain('AIWORKER_HOST_WEB_PORT="${AIWORKER_HOST_WEB_PORT:-5050}"')
    expect(script).not.toContain('PORT="${PORT:-9217}"')
    expect(script).not.toContain('AIWORKER_WEB_PORT="${AIWORKER_WEB_PORT:-5173}"')
  })
})
```

- [ ] **Step 2: Run contract test and verify RED**

Run:

```bash
bun test tests/architecture/host-dev-startup-contract.test.ts
```

Expected: FAIL because `scripts/dev-host.sh` does not exist and root `dev:host` still points at Worker daemon.

- [ ] **Step 3: Add `scripts/dev-host.sh`**

Create `scripts/dev-host.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

AIWORKER_HOST="${AIWORKER_HOST:-127.0.0.1}"
AIWORKER_HOST_API_PORT="${AIWORKER_HOST_API_PORT:-9117}"
AIWORKER_HOST_WEB_PORT="${AIWORKER_HOST_WEB_PORT:-5050}"
AIWORKER_HOST_DB="${AIWORKER_HOST_DB:-$HOME/.aiworker-dev/host.db}"
AIWORKER_HOST_DEV_ADMIN_EMAIL="${AIWORKER_HOST_DEV_ADMIN_EMAIL:-admin@zonease.org}"
AIWORKER_HOST_API_URL="${AIWORKER_HOST_API_URL:-http://${AIWORKER_HOST}:${AIWORKER_HOST_API_PORT}}"

API_PID=""
WEB_PID=""

listener_for_port() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

ensure_port_free() {
  local label="$1"
  local port="$2"
  local listener
  listener="$(listener_for_port "$port")"
  if [[ -n "$listener" ]]; then
    echo "[dev:host] ${label} port ${port} is already in use:"
    echo "$listener"
    exit 1
  fi
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM

  for pid in "$WEB_PID" "$API_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done

  for pid in "$WEB_PID" "$API_PID"; do
    if [[ -n "$pid" ]]; then
      wait "$pid" 2>/dev/null || true
    fi
  done

  exit "$status"
}

wait_for_api() {
  local url="${AIWORKER_HOST_API_URL}/host"
  local attempts=60

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    if [[ -n "$API_PID" ]] && ! kill -0 "$API_PID" 2>/dev/null; then
      echo "[dev:host] Host API exited before becoming reachable"
      wait "$API_PID" || true
      return 1
    fi
    sleep 0.5
  done

  echo "[dev:host] Host API healthcheck timed out: $url"
  return 1
}

mkdir -p "$(dirname "$AIWORKER_HOST_DB")"
ensure_port_free "Host API" "$AIWORKER_HOST_API_PORT"
ensure_port_free "Host Web" "$AIWORKER_HOST_WEB_PORT"

trap cleanup EXIT INT TERM

echo "[dev:host] Host DB: $AIWORKER_HOST_DB"
echo "[dev:host] Dev admin: $AIWORKER_HOST_DEV_ADMIN_EMAIL"
echo "[dev:host] starting Host API on $AIWORKER_HOST_API_URL"
(
  cd "$ROOT_DIR"
  bun apps/host-cli/src/aiworker-host.ts serve \
    --db "$AIWORKER_HOST_DB" \
    --dev-admin-email "$AIWORKER_HOST_DEV_ADMIN_EMAIL" \
    --public-base-url "$AIWORKER_HOST_API_URL" \
    --port "$AIWORKER_HOST_API_PORT"
) &
API_PID=$!

wait_for_api

echo "[dev:host] starting Host Web on http://${AIWORKER_HOST}:${AIWORKER_HOST_WEB_PORT}/host"
(
  cd "$ROOT_DIR/apps/host-web"
  AIWORKER_HOST_API_URL="$AIWORKER_HOST_API_URL" \
    bun run dev --host "$AIWORKER_HOST" --port "$AIWORKER_HOST_WEB_PORT"
) &
WEB_PID=$!

echo
echo "[dev:host] web: http://${AIWORKER_HOST}:${AIWORKER_HOST_WEB_PORT}/host"
echo "[dev:host] api: $AIWORKER_HOST_API_URL"
echo "[dev:host] db: $AIWORKER_HOST_DB"
echo "[dev:host] admin: $AIWORKER_HOST_DEV_ADMIN_EMAIL"
echo "[dev:host] stop: Ctrl-C"
echo

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 1
done

status=0
if ! kill -0 "$API_PID" 2>/dev/null; then
  wait "$API_PID" 2>/dev/null || true
  status=1
elif ! kill -0 "$WEB_PID" 2>/dev/null; then
  wait "$WEB_PID" || status=$?
fi

exit "$status"
```

- [ ] **Step 4: Update root scripts**

In `package.json`, set:

```json
"dev:host": "bash scripts/dev-host.sh",
"dev:worker-daemon": "AIWORKER_HOME=${AIWORKER_HOME:-$HOME/.aiworker-dev} AIWORKER_WORKER_HOST=${AIWORKER_WORKER_HOST:-127.0.0.1} PORT=${PORT:-9217} bun apps/worker-cli/src/aiworker.ts daemon foreground --host ${AIWORKER_WORKER_HOST:-127.0.0.1} --port ${PORT:-9217}"
```

Keep existing `dev`, `dev:web`, `dev:apps`, `dev:status`, and `dev:clean`.

- [ ] **Step 5: Run contract tests and verify GREEN**

Run:

```bash
bun test tests/architecture/host-dev-startup-contract.test.ts
bun run test:contracts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/dev-host.sh tests/architecture/host-dev-startup-contract.test.ts
git commit -m "feat(host): 添加开发启动脚本"
```

---

### Task 6: Browser Proof for Real Host Dev Loop

**Files:**
- Create: `tests/browser/host-dev-loop.spec.ts`
- Modify: `package.json`
- Modify: `docs/testing.md`

- [ ] **Step 1: Write browser proof**

Create `tests/browser/host-dev-loop.spec.ts`.

Key behavior:

- start Host API on an ephemeral port through `aiworker-host serve`;
- start Host Web Vite dev server on an ephemeral port with `AIWORKER_HOST_API_URL`;
- visit `/host`;
- create an assignment through the form;
- read the one-time provision command from the page;
- extract the token;
- call `POST /api/provision/check-in` with a real check-in body;
- click refresh;
- assert `Worker 已报到`;
- assert no enabled `打开 Worker` link exists.

Use this structure:

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const repoRoot = join(import.meta.dir, '..', '..')
const evidenceRoot = join(repoRoot, 'tmp', `host-dev-loop-${new Date().toISOString().replace(/[:.]/g, '-')}`)

let api: ReturnType<typeof Bun.spawn> | null = null
let web: ReturnType<typeof Bun.spawn> | null = null
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

await mkdir(evidenceRoot, { recursive: true })

try {
  const apiPort = reservePort()
  const webPort = reservePort()
  const apiUrl = `http://127.0.0.1:${apiPort}`
  const webUrl = `http://127.0.0.1:${webPort}/host`

  api = Bun.spawn({
    cmd: [
      process.execPath,
      'apps/host-cli/src/aiworker-host.ts',
      'serve',
      '--db',
      join(evidenceRoot, 'host.db'),
      '--dev-admin-email',
      'admin@zonease.org',
      '--public-base-url',
      apiUrl,
      '--port',
      String(apiPort),
    ],
    cwd: repoRoot,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  await waitForDocument(`${apiUrl}/host`)

  web = Bun.spawn({
    cmd: [
      process.execPath,
      'run',
      '--filter',
      '@zonease/aiworker-host-web',
      'dev',
      '--',
      '--host',
      '127.0.0.1',
      '--port',
      String(webPort),
    ],
    cwd: repoRoot,
    env: { ...process.env, AIWORKER_HOST_API_URL: apiUrl },
    stderr: 'pipe',
    stdout: 'pipe',
  })
  await waitForDocument(webUrl)

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { height: 900, width: 1440 } })
  await page.goto(webUrl, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'AI Workers' }).waitFor()
  await page.getByLabel('员工邮箱').fill('bob@zonease.org')
  await page.getByLabel('aissh server').fill('aissh://server/ap-sg-01')
  await page.getByLabel('Soul release').fill('aiworker-freeform@dev')
  await page.getByRole('button', { name: '创建 assignment' }).click()

  const command = await page.getByText(/bun apps\/worker-cli\/src\/aiworker\.ts provision/).textContent()
  const token = /--token\s+(\S+)/.exec(command ?? '')?.[1]
  if (!token)
    throw new Error(`Provision token was not present in command: ${command}`)

  const checkInResponse = await fetch(`${apiUrl}/api/provision/check-in`, {
    body: JSON.stringify({
      provisionToken: token,
      worker: {
        health: { ready: true },
        id: 'aiworker-freeform',
        version: '1.0.0',
        workerId: 'wkr_browser',
        workbenchUrl: 'http://127.0.0.1:9217/workers/wkr_browser',
      },
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!checkInResponse.ok)
    throw new Error(`Check-in failed with HTTP ${checkInResponse.status}: ${await checkInResponse.text()}`)

  await page.getByRole('button', { name: '刷新' }).click()
  await page.getByText('Worker 已报到').waitFor()
  if (await page.getByRole('link', { name: '打开 Worker' }).count() !== 0)
    throw new Error('Host Web exposed open Worker before ready.')
}
finally {
  await browser?.close()
  for (const child of [web, api]) {
    child?.kill('SIGTERM')
    await child?.exited.catch(() => undefined)
  }
  if (api) {
    await writeFile(join(evidenceRoot, 'api-stdout.log'), await new Response(api.stdout).text())
    await writeFile(join(evidenceRoot, 'api-stderr.log'), await new Response(api.stderr).text())
  }
  if (web) {
    await writeFile(join(evidenceRoot, 'web-stdout.log'), await new Response(web.stdout).text())
    await writeFile(join(evidenceRoot, 'web-stderr.log'), await new Response(web.stderr).text())
  }
}

function reservePort(): number {
  const probe = Bun.serve({
    fetch: () => new Response('ok'),
    hostname: '127.0.0.1',
    port: 0,
  })
  const port = probe.port
  probe.stop(true)
  return port
}

async function waitForDocument(url: string): Promise<void> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok)
        return
      lastError = new Error(`HTTP ${response.status}`)
    }
    catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`${url} did not become reachable: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}
```

- [ ] **Step 2: Add package script**

In `package.json`, add:

```json
"test:browser:host-dev": "bun run --filter '@zonease/aiworker-host-web' build && bun tests/browser/host-dev-loop.spec.ts"
```

Then update `test:browser:phase2` to include both the existing boundary proof and the new dev-loop proof:

```json
"test:browser:phase2": "bun run --filter '@zonease/aiworker-host-web' build && bun tests/browser/phase2-host-worker-access.spec.ts && bun tests/browser/host-dev-loop.spec.ts"
```

- [ ] **Step 3: Update testing docs**

In `docs/testing.md`, add a Host dev loop browser proof note near the Phase 2 browser testing section:

```md
- `bun run test:browser:host-dev` proves the Host developer loop: Host Web creates a real assignment through Host API, a real check-in request moves it to `checked_in`, and Host Web refreshes to show `Worker 已报到`. It does not claim Worker Access `ready` or opening a Worker URL.
```

- [ ] **Step 4: Run browser proof and verify GREEN**

Run:

```bash
bun run test:browser:host-dev
bun run test:browser:phase2
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json docs/testing.md tests/browser/host-dev-loop.spec.ts
git commit -m "test(host): 添加开发闭环浏览器证明"
```

---

### Task 7: Final Verification

**Files:**
- No new source files unless earlier tasks exposed a scoped issue.

- [ ] **Step 1: Run focused Host checks**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts apps/host-cli/src/aiworker-host.test.ts tests/architecture/host-dev-startup-contract.test.ts --timeout=15000
bun run --filter '@zonease/aiworker-host-cli' test
bun run --filter '@zonease/aiworker-host-web' test
bun run --filter '@zonease/aiworker-host-cli' typecheck
bun run --filter '@zonease/aiworker-host-web' typecheck
```

Expected: PASS.

- [ ] **Step 2: Run contract and browser checks**

Run:

```bash
bun run docs:check
bun run test:contracts
bun run test:browser:phase2
```

Expected: PASS.

- [ ] **Step 3: Run repo-level checks**

Run:

```bash
bun run typecheck
git diff --check
bun run crg:review
```

Expected:

- `typecheck`: PASS;
- `git diff --check`: no output;
- `crg:review`: inspect output and address real changed-file risks. If unrelated dirty files appear, document the pollution and run focused review context for changed Host files.

- [ ] **Step 4: Commit any final test/doc adjustments**

Only if Step 1-3 required changes:

```bash
git add <changed-files>
git commit -m "fix(host): 完成开发闭环验证"
```

- [ ] **Step 5: Report completion**

Final report must include:

- final commit range;
- `bun run dev:host` URLs and ports;
- proof that Host Web uses real API data;
- proof that Web/CLI create assignment through Host API;
- proof that real check-in reaches `checked_in`;
- explicit non-goal: no Worker Access `ready` or opening Worker in this loop.
