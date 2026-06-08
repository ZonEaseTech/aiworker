# Provisioning Target Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current aissh-server-only Host provisioning surface with an environment-aware provisioning target adapter contract covering `aissh`, `docker`, and `local`.

**Architecture:** Keep Worker runtime protocol clean: Worker still only sees provision token, Host callback URL, check-in, and access connection. Host owns target listing, target validation, URL reachability, delivery receipts, and user-facing assignment summaries. For the first implementation pass, keep physical `host_assignments.server_ref` as a legacy storage column and expose new provisioning target fields through API/view types and `metadataJson`.

**Tech Stack:** Bun, TypeScript, Hono-style fetch handlers in `apps/host-cli`, React Host Web in `apps/host-web`, SQLite/Drizzle in `packages/storage-sqlite`, Vitest/Bun tests, Playwright browser proof scripts.

---

## Scope

This plan implements the provisioning target adapter slice only:

- canonical docs and architecture tests for provisioning targets and dev URL contracts;
- Host options API changes from `servers[]` to `provisioningTargets[]`;
- Host assignment request/response language from `serverRef` to provisioning target fields;
- aissh/local/docker delivery contract and command generation;
- dev URL reachability validation for local/docker/aissh;
- Host Web form/table language and tests.

This plan does not implement production Logto, full WebSocket reverse tunnel routing, hosted Docker scheduling, Cloudflare/ngrok automation, or a general gateway.

## File Structure

- `docs/architecture.md`, `docs/protocol.md`, `docs/runtime.md`, `docs/testing.md`: promote accepted provisioning target and dev URL contracts.
- `tests/architecture/inversion-guards.test.ts`: guard Host/Worker boundary and remote aissh callback constraints.
- `apps/host-cli/src/host-options.ts`: expose `HostProvisioningTargetOption[]`, parse aissh servers into production targets, add local/docker dev targets.
- `apps/host-cli/src/host-options.test.ts`: target option parsing and fallback tests.
- `apps/host-cli/src/host-url-contract.ts`: URL normalization, browser/control/callback URL resolution, loopback detection.
- `apps/host-cli/src/host-url-contract.test.ts`: local/docker/aissh URL contract tests.
- `apps/host-cli/src/provisioning-target-adapters.ts`: adapter interfaces and `aissh`/`docker`/`local` command delivery builders.
- `apps/host-cli/src/provisioning-target-adapters.test.ts`: adapter command, receipt, and reachability tests.
- `packages/storage-sqlite/src/host/index.ts`: accept provisioning target input, store metadata, expose derived row fields through helpers.
- `packages/storage-sqlite/src/host/index.test.ts`: storage safety and legacy `server_ref` compatibility tests.
- `packages/host-control/src/assignment.ts`: assignment view fields and authorization-safe projection.
- `apps/host-cli/src/host-server.ts`: create assignments with target refs, call adapter delivery, generate worker/browser URLs from the URL contract.
- `apps/host-cli/src/aiworker-host.ts`: CLI option names and JSON projection updates.
- `apps/host-web/src/host-api.ts`, `apps/host-web/src/app.tsx`: Host Web API types and UI language.
- `apps/host-web/src/host-api.test.ts`, `apps/host-web/src/app.test.tsx`: API and UI tests.
- `tests/browser/host-dev-loop.spec.ts`, `tests/browser/phase2-host-worker-access.spec.ts`: browser proof updates for local dev URL contract.

---

### Task 1: Promote Canonical Contracts

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/protocol.md`
- Modify: `docs/runtime.md`
- Modify: `docs/testing.md`
- Modify: `tests/architecture/inversion-guards.test.ts`

- [ ] **Step 1: Write failing architecture guards**

Add tests that require provisioning target language and URL separation:

```ts
test('G6 phase-2 provisioning uses target adapters instead of hard-coded aissh servers', () => {
  const architecture = readDoc('docs/architecture.md')
  const protocol = readDoc('docs/protocol.md')

  expect(architecture).toContain('Provisioning Target Adapter')
  expect(architecture).toContain('aissh production')
  expect(architecture).toContain('docker preview')
  expect(architecture).toContain('local dev')
  expect(protocol).toContain('hostBrowserBaseUrl')
  expect(protocol).toContain('hostControlBaseUrl')
  expect(protocol).toContain('adapterRuntimeControlBaseUrl')
})

test('G7 remote aissh development cannot use loopback callback URLs', () => {
  const protocol = readDoc('docs/protocol.md')
  const testing = readDoc('docs/testing.md')

  expect(protocol).toContain('remote aissh target must not use localhost, 127.0.0.1, or ::1 as its adapter runtime callback URL')
  expect(testing).toContain('remote aissh target rejects loopback callback URLs')
})
```

- [ ] **Step 2: Run guards and verify failure**

Run:

```bash
bun test tests/architecture/inversion-guards.test.ts
```

Expected: FAIL because canonical docs do not yet contain `Provisioning Target Adapter`, URL contract fields, or remote aissh loopback rejection language.

- [ ] **Step 3: Update canonical docs**

Promote the spec language:

```md
Provisioning Target Adapter is the Phase 2 Host-owned delivery boundary. Host lists and validates provisioning targets; Worker only receives a provision token and a callback URL it can reach.

The first adapter maturity levels are:

- `aissh` production: remote provisioning through verified `aissh exec [server_id] <command> --reason ...`.
- `docker` preview: clean container, isolated worker home / volume, release bundle verification.
- `local` dev: same-machine process with isolated `AIWORKER_HOME`.

Host URLs are environment-specific:

- `hostBrowserBaseUrl` generates `/host` and `/workers/:workerId`.
- `hostControlBaseUrl` is the Host API URL.
- `adapterRuntimeControlBaseUrl` is the URL reachable from the Worker runtime environment.

A remote aissh target must not use localhost, 127.0.0.1, or ::1 as its adapter runtime callback URL.
```

- [ ] **Step 4: Run docs and architecture checks**

Run:

```bash
bun test tests/architecture/inversion-guards.test.ts
bun run docs:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md docs/protocol.md docs/runtime.md docs/testing.md tests/architecture/inversion-guards.test.ts
git commit -m "docs: promote provisioning target contract"
```

---

### Task 2: Replace Host Options Servers With Provisioning Targets

**Files:**
- Modify: `apps/host-cli/src/host-options.ts`
- Modify: `apps/host-cli/src/host-options.test.ts`
- Modify: `apps/host-web/src/host-api.ts`
- Modify: `apps/host-web/src/host-api.test.ts`

- [ ] **Step 1: Write failing Host options tests**

Add tests:

```ts
it('maps aissh server list output into production provisioning targets', async () => {
  const options = await buildHostOptions({
    aisshServerList: async () => JSON.stringify({
      servers: [{ host: '172.105.219.50', id: 'srv-1', name: 'aiwork', notes: 'aiwork project' }],
    }),
    repoRoot: fixtureRepoRoot(),
  })

  expect(options.provisioningTargets).toContainEqual({
    adapterType: 'aissh',
    capabilities: ['remote-delivery', 'worker-check-in', 'worker-access'],
    displayName: 'aiwork',
    health: 'ready',
    id: 'aissh:srv-1',
    maturity: 'production',
    ref: 'srv-1',
    description: 'aiwork project',
  })
  expect('servers' in options).toBe(false)
})

it('includes docker preview and local dev targets for development proof', async () => {
  const options = await buildHostOptions({
    aisshServerList: async () => JSON.stringify({ servers: [] }),
    repoRoot: fixtureRepoRoot(),
  })

  expect(options.provisioningTargets.map(target => target.id)).toEqual([
    'docker:local-default',
    'local:default',
  ])
})
```

In `apps/host-web/src/host-api.test.ts`, update API shape:

```ts
expect(options.provisioningTargets[0]).toMatchObject({
  adapterType: 'aissh',
  displayName: 'aiwork',
  maturity: 'production',
  ref: 'srv-1',
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun test apps/host-cli/src/host-options.test.ts apps/host-web/src/host-api.test.ts
```

Expected: FAIL because code still exposes `servers[]`.

- [ ] **Step 3: Implement target option types**

Replace `HostServerOption` with:

```ts
export type ProvisioningAdapterType = 'aissh' | 'docker' | 'local'
export type ProvisioningTargetMaturity = 'production' | 'preview' | 'dev'
export type ProvisioningTargetHealth = 'ready' | 'degraded' | 'unavailable'

export interface HostProvisioningTargetOption {
  adapterType: ProvisioningAdapterType
  capabilities: string[]
  description?: string
  displayName: string
  health: ProvisioningTargetHealth
  id: string
  maturity: ProvisioningTargetMaturity
  ref: string
}

export interface HostOptionsView {
  access: {
    mode: 'not-ready'
    status: 'deferred-worker-access-tunnel'
  }
  auth: {
    mode: 'dev-static'
    status: 'deferred-logto'
  }
  provisioningTargets: HostProvisioningTargetOption[]
  provisioningTargetSourceError?: string
  soulReleases: HostSoulReleaseOption[]
  soulSourceErrors?: string[]
}
```

Add static dev targets:

```ts
const DEV_TARGETS: HostProvisioningTargetOption[] = [
  {
    adapterType: 'docker',
    capabilities: ['clean-container', 'isolated-worker-home', 'release-bundle-proof'],
    displayName: 'Docker 预发布环境',
    health: 'ready',
    id: 'docker:local-default',
    maturity: 'preview',
    ref: 'docker://local/default',
  },
  {
    adapterType: 'local',
    capabilities: ['local-process', 'isolated-aiworker-home', 'browser-e2e-proof'],
    displayName: '本机开发环境',
    health: 'ready',
    id: 'local:default',
    maturity: 'dev',
    ref: 'local://default',
  },
]
```

Map aissh servers:

```ts
export function parseAisshServerListOutput(output: string): HostProvisioningTargetOption[] {
  const parsed = JSON.parse(output) as unknown
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { servers?: unknown }).servers))
    throw new Error('Invalid aissh server list response')

  return (parsed as { servers: unknown[] }).servers.flatMap((server) => {
    if (!server || typeof server !== 'object')
      return []
    const record = server as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.trim().length === 0)
      return []

    return [{
      adapterType: 'aissh' as const,
      capabilities: ['remote-delivery', 'worker-check-in', 'worker-access'],
      ...(typeof record.notes === 'string' ? { description: record.notes } : {}),
      displayName: typeof record.name === 'string' && record.name.trim() ? record.name : record.id,
      health: 'ready' as const,
      id: `aissh:${record.id}`,
      maturity: 'production' as const,
      ref: record.id,
    }]
  })
}
```

Return:

```ts
return {
  access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
  auth: { mode: 'dev-static', status: 'deferred-logto' },
  ...(provisioningTargetSourceError ? { provisioningTargetSourceError } : {}),
  provisioningTargets: [...aisshTargets, ...DEV_TARGETS],
  ...(soulSourceErrors.length > 0 ? { soulSourceErrors } : {}),
  soulReleases,
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
bun test apps/host-cli/src/host-options.test.ts apps/host-web/src/host-api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/host-cli/src/host-options.ts apps/host-cli/src/host-options.test.ts apps/host-web/src/host-api.ts apps/host-web/src/host-api.test.ts
git commit -m "feat(host): expose provisioning targets"
```

---

### Task 3: Add Host URL Contract Helpers

**Files:**
- Create: `apps/host-cli/src/host-url-contract.ts`
- Create: `apps/host-cli/src/host-url-contract.test.ts`
- Modify: `apps/host-cli/src/aiworker-host.ts`
- Modify: `apps/host-cli/src/aiworker-host.test.ts`

- [ ] **Step 1: Write failing URL contract tests**

Create `apps/host-cli/src/host-url-contract.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import {
  assertRemoteAisshCallbackReachable,
  isLoopbackUrl,
  normalizeBaseUrl,
  resolveAdapterRuntimeControlBaseUrl,
} from './host-url-contract'

describe('Host URL contract', () => {
  it('normalizes base URLs without trailing slashes', () => {
    expect(normalizeBaseUrl('http://127.0.0.1:9117///')).toBe('http://127.0.0.1:9117')
  })

  it('detects loopback callback URLs', () => {
    expect(isLoopbackUrl('http://localhost:9117')).toBe(true)
    expect(isLoopbackUrl('http://127.0.0.1:9117')).toBe(true)
    expect(isLoopbackUrl('http://[::1]:9117')).toBe(true)
    expect(isLoopbackUrl('https://dev-host.example.com')).toBe(false)
  })

  it('uses docker host gateway callback when adapter type is docker', () => {
    expect(resolveAdapterRuntimeControlBaseUrl({
      adapterType: 'docker',
      hostControlBaseUrl: 'http://127.0.0.1:9117',
    })).toBe('http://host.docker.internal:9117')
  })

  it('rejects remote aissh loopback callback URL', () => {
    expect(() => assertRemoteAisshCallbackReachable({
      adapterRuntimeControlBaseUrl: 'http://127.0.0.1:9117',
      targetRef: 'srv-1',
    })).toThrow('Remote aissh target cannot use a loopback Host callback URL')
  })
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
bun test apps/host-cli/src/host-url-contract.test.ts
```

Expected: FAIL because `host-url-contract.ts` does not exist.

- [ ] **Step 3: Implement URL helper**

Create `apps/host-cli/src/host-url-contract.ts`:

```ts
import type { ProvisioningAdapterType } from './host-options'

export interface ResolveAdapterRuntimeControlUrlInput {
  adapterRuntimeControlBaseUrl?: string
  adapterType: ProvisioningAdapterType
  hostControlBaseUrl: string
}

export interface RemoteAisshCallbackInput {
  adapterRuntimeControlBaseUrl: string
  targetRef: string
}

export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim()
  if (trimmed.length === 0)
    throw new Error('Host base URL cannot be empty')
  const url = new URL(trimmed)
  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}

export function isLoopbackUrl(input: string): boolean {
  const host = new URL(input).hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

export function resolveAdapterRuntimeControlBaseUrl(input: ResolveAdapterRuntimeControlUrlInput): string {
  if (input.adapterRuntimeControlBaseUrl)
    return normalizeBaseUrl(input.adapterRuntimeControlBaseUrl)

  const normalizedControl = normalizeBaseUrl(input.hostControlBaseUrl)
  if (input.adapterType === 'docker' && isLoopbackUrl(normalizedControl)) {
    const url = new URL(normalizedControl)
    url.hostname = 'host.docker.internal'
    return url.toString().replace(/\/+$/, '')
  }
  return normalizedControl
}

export function assertRemoteAisshCallbackReachable(input: RemoteAisshCallbackInput): void {
  if (isLoopbackUrl(input.adapterRuntimeControlBaseUrl)) {
    throw new Error(`Remote aissh target cannot use a loopback Host callback URL: ${input.targetRef}`)
  }
}
```

- [ ] **Step 4: Add CLI URL options**

In `apps/host-cli/src/aiworker-host.ts`, add serve/start options:

```ts
.option('--browser-base-url <url>', 'Host browser base URL for /host and /workers/:workerId')
.option('--control-base-url <url>', 'Host control/API base URL for Worker check-in')
```

Project them into Host lifecycle/server options in later tasks. For now tests only assert parsing accepts them and does not drop existing `--public-base-url` behavior.

- [ ] **Step 5: Run tests**

Run:

```bash
bun test apps/host-cli/src/host-url-contract.test.ts apps/host-cli/src/aiworker-host.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/host-cli/src/host-url-contract.ts apps/host-cli/src/host-url-contract.test.ts apps/host-cli/src/aiworker-host.ts apps/host-cli/src/aiworker-host.test.ts
git commit -m "feat(host): add URL contract helpers"
```

---

### Task 4: Add Provisioning Target Adapter Registry

**Files:**
- Create: `apps/host-cli/src/provisioning-target-adapters.ts`
- Create: `apps/host-cli/src/provisioning-target-adapters.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `apps/host-cli/src/provisioning-target-adapters.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { deliverProvisioningTarget } from './provisioning-target-adapters'

const baseInput = {
  adapterRuntimeControlBaseUrl: 'http://127.0.0.1:9117',
  assignedEmail: 'bob@zonease.org',
  assignmentId: 'asn_1',
  hostBrowserBaseUrl: 'http://127.0.0.1:5050',
  hostControlBaseUrl: 'http://127.0.0.1:9117',
  provisionToken: 'awp_secret',
  soulReleaseRef: 'aiworker-freeform@dev',
}

describe('provisioning target adapters', () => {
  it('builds verified-shape aissh command with reason', () => {
    const delivery = deliverProvisioningTarget({
      ...baseInput,
      adapterRuntimeControlBaseUrl: 'https://dev-host.example.com',
      adapterType: 'aissh',
      maturity: 'production',
      targetRef: 'srv-1',
    })

    expect(delivery.deliveryStatus).toBe('delivered')
    expect(delivery.deliveryReceipt.command).toContain('aissh exec srv-1')
    expect(delivery.deliveryReceipt.command).toContain('--reason=')
    expect(delivery.provisionCommand).toContain('--host https://dev-host.example.com')
    expect(JSON.stringify(delivery)).not.toContain('awp_secret')
  })

  it('rejects remote aissh loopback callback URL', () => {
    expect(() => deliverProvisioningTarget({
      ...baseInput,
      adapterType: 'aissh',
      maturity: 'production',
      targetRef: 'srv-1',
    })).toThrow('Remote aissh target cannot use a loopback Host callback URL')
  })

  it('builds docker delivery command with isolated volume', () => {
    const delivery = deliverProvisioningTarget({
      ...baseInput,
      adapterRuntimeControlBaseUrl: 'http://host.docker.internal:9117',
      adapterType: 'docker',
      maturity: 'preview',
      targetRef: 'docker://local/default',
    })

    expect(delivery.deliveryReceipt.command).toContain('docker run')
    expect(delivery.deliveryReceipt.command).toContain('AIWORKER_HOME=/home/aiworker/.aiworker')
    expect(delivery.deliveryReceipt.command).toContain('aiworker-worker-asn_1')
  })

  it('builds local delivery command with isolated AIWORKER_HOME', () => {
    const delivery = deliverProvisioningTarget({
      ...baseInput,
      adapterType: 'local',
      maturity: 'dev',
      targetRef: 'local://default',
    })

    expect(delivery.deliveryReceipt.command).toContain('AIWORKER_HOME=')
    expect(delivery.deliveryReceipt.command).toContain('apps/worker-cli/src/aiworker.ts provision')
  })
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
bun test apps/host-cli/src/provisioning-target-adapters.test.ts
```

Expected: FAIL because `provisioning-target-adapters.ts` does not exist.

- [ ] **Step 3: Implement adapter registry**

Create `apps/host-cli/src/provisioning-target-adapters.ts`:

```ts
import type { ProvisioningAdapterType, ProvisioningTargetMaturity } from './host-options'
import { assertRemoteAisshCallbackReachable, resolveAdapterRuntimeControlBaseUrl } from './host-url-contract'
import { redactProvisionToken } from '@zonease/aiworker-host-control'

export interface ProvisioningDeliveryInput {
  adapterRuntimeControlBaseUrl?: string
  adapterType: ProvisioningAdapterType
  assignedEmail: string
  assignmentId: string
  hostBrowserBaseUrl: string
  hostControlBaseUrl: string
  maturity: ProvisioningTargetMaturity
  provisionToken: string
  soulReleaseRef: string
  targetRef: string
}

export interface ProvisioningDeliveryResult {
  deliveryReceipt: {
    adapterType: ProvisioningAdapterType
    command: string
    targetRef: string
  }
  deliveryStatus: 'delivered'
  expectedCheckInDeadline: string
  operatorHint: string
  provisionCommand: string
}

export function deliverProvisioningTarget(input: ProvisioningDeliveryInput): ProvisioningDeliveryResult {
  const adapterRuntimeControlBaseUrl = resolveAdapterRuntimeControlBaseUrl({
    adapterRuntimeControlBaseUrl: input.adapterRuntimeControlBaseUrl,
    adapterType: input.adapterType,
    hostControlBaseUrl: input.hostControlBaseUrl,
  })
  const provisionCommand = buildProvisionCommand(adapterRuntimeControlBaseUrl, input.provisionToken)

  if (input.adapterType === 'aissh') {
    assertRemoteAisshCallbackReachable({ adapterRuntimeControlBaseUrl, targetRef: input.targetRef })
    return result(input, buildAisshCommand(input.targetRef, input.assignedEmail, provisionCommand), provisionCommand, '等待远程 Worker 回连 Host。')
  }
  if (input.adapterType === 'docker') {
    return result(input, buildDockerCommand(input.assignmentId, provisionCommand), provisionCommand, '等待 Docker container 内 Worker 回连 Host。')
  }
  return result(input, buildLocalCommand(input.assignmentId, provisionCommand), provisionCommand, '等待本机 Worker 回连 Host。')
}

function result(
  input: ProvisioningDeliveryInput,
  command: string,
  provisionCommand: string,
  operatorHint: string,
): ProvisioningDeliveryResult {
  return {
    deliveryReceipt: {
      adapterType: input.adapterType,
      command: redactProvisionToken(command),
      targetRef: input.targetRef,
    },
    deliveryStatus: 'delivered',
    expectedCheckInDeadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    operatorHint,
    provisionCommand: redactProvisionToken(provisionCommand),
  }
}

function buildProvisionCommand(callbackBaseUrl: string, provisionToken: string): string {
  return `bun apps/worker-cli/src/aiworker.ts provision --host ${shellQuote(callbackBaseUrl)} --token ${shellQuote(provisionToken)}`
}

function buildAisshCommand(targetRef: string, assignedEmail: string, provisionCommand: string): string {
  return `aissh exec ${shellQuote(targetRef)} ${shellQuote(provisionCommand)} --reason=${shellQuote(`Provision AIWorker for ${assignedEmail}`)}`
}

function buildDockerCommand(assignmentId: string, provisionCommand: string): string {
  const volume = `aiworker-worker-${assignmentId}`
  return `docker run --name ${shellQuote(volume)} --volume ${shellQuote(`${volume}:/home/aiworker/.aiworker`)} --env AIWORKER_HOME=/home/aiworker/.aiworker aiworker/worker:dev ${shellQuote(provisionCommand)}`
}

function buildLocalCommand(assignmentId: string, provisionCommand: string): string {
  return `AIWORKER_HOME=${shellQuote(`${process.env.HOME ?? '.'}/.aiworker-dev/provisioned/${assignmentId}`)} ${provisionCommand}`
}

function shellQuote(value: string): string {
  if (/^[\w/:=.,@%+-]+$/.test(value))
    return value
  return `'${value.replaceAll(/'/g, String.raw`'\''`)}'`
}
```

- [ ] **Step 4: Run adapter tests**

Run:

```bash
bun test apps/host-cli/src/provisioning-target-adapters.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/host-cli/src/provisioning-target-adapters.ts apps/host-cli/src/provisioning-target-adapters.test.ts
git commit -m "feat(host): add provisioning target adapters"
```

---

### Task 5: Expose Provisioning Target Fields In Assignment Storage

**Files:**
- Modify: `packages/storage-sqlite/src/host/index.ts`
- Modify: `packages/storage-sqlite/src/host/index.test.ts`

- [ ] **Step 1: Write failing storage tests**

Add tests:

```ts
it('stores provisioning target metadata while preserving legacy server_ref', () => {
  const created = createAssignment({
    assignedEmail: 'bob@zonease.org',
    provisioningTarget: {
      adapterType: 'docker',
      maturity: 'preview',
      ref: 'docker://local/default',
    },
    soulReleaseRef: 'aiworker-freeform@dev',
  })

  expect(created.assignment.serverRef).toBe('docker://local/default')
  expect(created.assignment.metadataJson).toMatchObject({
    provisioningAdapterType: 'docker',
    provisioningTargetMaturity: 'preview',
    provisioningTargetRef: 'docker://local/default',
  })
})

it('rejects literal secrets inside provisioning target metadata', () => {
  expect(() => createAssignment({
    assignedEmail: 'bob@zonease.org',
    provisioningTarget: {
      adapterType: 'aissh',
      maturity: 'production',
      ref: 'srv-1 token=literal-secret',
    },
    soulReleaseRef: 'aiworker-freeform@dev',
  })).toThrow(/Literal secrets are not allowed/)
})
```

- [ ] **Step 2: Run storage tests and verify failure**

Run:

```bash
bun test packages/storage-sqlite/src/host/index.test.ts
```

Expected: FAIL because `CreateAssignmentInput` does not accept `provisioningTarget`.

- [ ] **Step 3: Implement storage input compatibility**

Update types:

```ts
export interface CreateAssignmentInput {
  assignedEmail: string
  provisioningTarget?: {
    adapterType: 'aissh' | 'docker' | 'local'
    maturity: 'production' | 'preview' | 'dev'
    ref: string
  }
  serverRef?: string
  soulReleaseRef: string
  metadataJson?: Record<string, unknown>
  expiresAt?: string
  now?: () => string
}
```

Inside `createAssignment`:

```ts
const targetRef = input.provisioningTarget?.ref ?? input.serverRef
if (!targetRef)
  throw new Error('createAssignment requires provisioningTarget.ref')

const metadataJson = {
  ...(input.metadataJson ?? {}),
  ...(input.provisioningTarget
    ? {
        provisioningAdapterType: input.provisioningTarget.adapterType,
        provisioningTargetMaturity: input.provisioningTarget.maturity,
        provisioningTargetRef: input.provisioningTarget.ref,
      }
    : {}),
}
assertNoLiteralSecrets(targetRef, 'host_assignments.serverRef')
assertNoLiteralSecrets(metadataJson, 'host_assignments.metadataJson')
```

Write `serverRef: targetRef` to preserve the existing physical column.

- [ ] **Step 4: Run storage tests**

Run:

```bash
bun test packages/storage-sqlite/src/host/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storage-sqlite/src/host/index.ts packages/storage-sqlite/src/host/index.test.ts
git commit -m "feat(host): store provisioning target metadata"
```

---

### Task 6: Update Host Server Assignment API

**Files:**
- Modify: `apps/host-cli/src/host-server.ts`
- Modify: `apps/host-cli/src/host-server.test.ts`
- Modify: `packages/host-control/src/assignment.ts`
- Modify: `packages/host-control/src/assignment.test.ts`

- [ ] **Step 1: Write failing API tests**

In `apps/host-cli/src/host-server.test.ts`, add:

```ts
it('creates assignment through provisioning target and URL contract', async () => {
  const server = await createHostServer({
    authUser: { email: 'admin@zonease.org', roles: ['host:admin'] },
    dbPath: ':memory:',
    hostBrowserBaseUrl: 'http://127.0.0.1:5050',
    hostControlBaseUrl: 'http://127.0.0.1:9117',
  })

  const response = await server.fetch(new Request('http://host/api/host/assignments', {
    body: JSON.stringify({
      assignedEmail: 'bob@zonease.org',
      provisioningTarget: {
        adapterType: 'local',
        maturity: 'dev',
        ref: 'local://default',
      },
      soulReleaseRef: 'aiworker-freeform@dev',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }))
  const body = await response.json()

  expect(response.status).toBe(201)
  expect(body.assignment.provisioningTargetRef).toBe('local://default')
  expect(body.assignment.provisioningAdapterType).toBe('local')
  expect(body.assignment.provisioningTargetMaturity).toBe('dev')
  expect(body.provisionCommand).toContain('--host http://127.0.0.1:9117')
  expect(body.deliveryReceipt.command).not.toContain(body.provisionToken)
})
```

Add aissh loopback rejection:

```ts
it('rejects remote aissh assignment when callback URL is loopback', async () => {
  const server = await createHostServer({
    authUser: { email: 'admin@zonease.org', roles: ['host:admin'] },
    dbPath: ':memory:',
    hostBrowserBaseUrl: 'http://127.0.0.1:5050',
    hostControlBaseUrl: 'http://127.0.0.1:9117',
  })

  const response = await server.fetch(new Request('http://host/api/host/assignments', {
    body: JSON.stringify({
      assignedEmail: 'bob@zonease.org',
      provisioningTarget: {
        adapterType: 'aissh',
        maturity: 'production',
        ref: 'srv-1',
      },
      soulReleaseRef: 'aiworker-freeform@dev',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }))

  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: { code: 'PROVISIONING_TARGET_UNREACHABLE' } })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts packages/host-control/src/assignment.test.ts
```

Expected: FAIL because Host server still accepts `serverRef` only.

- [ ] **Step 3: Implement Host server options and request parsing**

Change `HostServerOptions`:

```ts
export interface HostServerOptions {
  accessRegistry?: WorkerAccessRegistry
  authProvider?: AuthProvider
  authUser?: AuthenticatedHostUser | null
  dbPath: string
  hostBrowserBaseUrl: string
  hostControlBaseUrl: string
  optionsProvider?: () => Promise<HostOptionsView>
  webBaseUrl?: string
  webStaticDir?: string
}
```

Change request shape:

```ts
interface CreateAssignmentRequest {
  assignedEmail?: unknown
  adapterRuntimeControlBaseUrl?: unknown
  provisioningTarget?: unknown
  soulReleaseRef?: unknown
}

function parseProvisioningTarget(value: unknown) {
  if (!value || typeof value !== 'object')
    return null
  const record = value as Record<string, unknown>
  if (record.adapterType !== 'aissh' && record.adapterType !== 'docker' && record.adapterType !== 'local')
    return null
  if (record.maturity !== 'production' && record.maturity !== 'preview' && record.maturity !== 'dev')
    return null
  if (typeof record.ref !== 'string' || record.ref.trim().length === 0)
    return null
  return {
    adapterType: record.adapterType,
    maturity: record.maturity,
    ref: record.ref,
  }
}
```

Call `deliverProvisioningTarget` and `createAssignment`.

- [ ] **Step 4: Update assignment view**

In `packages/host-control/src/assignment.ts`, project derived fields:

```ts
provisioningAdapterType: metadata.provisioningAdapterType,
provisioningTargetMaturity: metadata.provisioningTargetMaturity,
provisioningTargetRef: metadata.provisioningTargetRef ?? row.serverRef,
```

Keep `serverRef` in returned assignment views for one compatibility release, but Host Web must stop reading it once `provisioningTargetRef` is present.

- [ ] **Step 5: Run tests**

Run:

```bash
bun test apps/host-cli/src/host-server.test.ts packages/host-control/src/assignment.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/host-cli/src/host-server.ts apps/host-cli/src/host-server.test.ts packages/host-control/src/assignment.ts packages/host-control/src/assignment.test.ts
git commit -m "feat(host): create assignments by provisioning target"
```

---

### Task 7: Update Host CLI Projections

**Files:**
- Modify: `apps/host-cli/src/aiworker-host.ts`
- Modify: `apps/host-cli/src/aiworker-host.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Add tests:

```ts
it('projects provisioning targets from option list', async () => {
  const code = await runHostCli(['option', 'list', '--host', 'http://host.test'], {
    fetch: async () => new Response(JSON.stringify({
      access: { mode: 'not-ready', status: 'deferred-worker-access-tunnel' },
      auth: { mode: 'dev-static', status: 'deferred-logto' },
      provisioningTargets: [{
        adapterType: 'docker',
        capabilities: ['clean-container'],
        displayName: 'Docker 预发布环境',
        health: 'ready',
        id: 'docker:local-default',
        maturity: 'preview',
        ref: 'docker://local/default',
      }],
      soulReleases: [],
    })),
  })

  expect(code).toBe(0)
  const parsed = JSON.parse(output)
  expect(parsed.provisioningTargets[0]).toMatchObject({
    adapterType: 'docker',
    displayName: 'Docker 预发布环境',
    maturity: 'preview',
  })
  expect('servers' in parsed).toBe(false)
})
```

Add assignment create target flags:

```ts
expect(fetchBody).toMatchObject({
  assignedEmail: 'bob@zonease.org',
  provisioningTarget: {
    adapterType: 'docker',
    maturity: 'preview',
    ref: 'docker://local/default',
  },
  soulReleaseRef: 'aiworker-freeform@dev',
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun test apps/host-cli/src/aiworker-host.test.ts
```

Expected: FAIL because CLI still projects `servers` and uses `--server`.

- [ ] **Step 3: Update CLI**

Change option list projection:

```ts
provisioningTargets: Array.isArray(record.provisioningTargets)
  ? record.provisioningTargets.map(target => projectAllowedFields(target, [
      'id',
      'displayName',
      'adapterType',
      'maturity',
      'ref',
      'description',
      'capabilities',
      'health',
    ]))
  : [],
```

Change assignment command options:

```ts
.option('--target <ref>', 'provisioning target reference')
.option('--adapter <type>', 'provisioning adapter type: aissh, docker, local')
.option('--maturity <level>', 'target maturity: production, preview, dev')
.option('--callback-url <url>', 'Worker-reachable Host control URL for this target')
```

Send body:

```ts
body: JSON.stringify({
  assignedEmail: options.email,
  ...(options.callbackUrl ? { adapterRuntimeControlBaseUrl: options.callbackUrl } : {}),
  provisioningTarget: {
    adapterType: options.adapter,
    maturity: options.maturity,
    ref: options.target,
  },
  soulReleaseRef: options.soul,
})
```

- [ ] **Step 4: Run CLI tests**

Run:

```bash
bun test apps/host-cli/src/aiworker-host.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/host-cli/src/aiworker-host.ts apps/host-cli/src/aiworker-host.test.ts
git commit -m "feat(host-cli): use provisioning target options"
```

---

### Task 8: Update Host Web API And UI

**Files:**
- Modify: `apps/host-web/src/host-api.ts`
- Modify: `apps/host-web/src/host-api.test.ts`
- Modify: `apps/host-web/src/app.tsx`
- Modify: `apps/host-web/src/app.test.tsx`

- [ ] **Step 1: Write failing Web tests**

In `apps/host-web/src/app.test.tsx`, assert labels:

```tsx
expect(screen.getByLabelText('provisioning target')).toBeInTheDocument()
expect(screen.queryByLabelText('aissh server')).not.toBeInTheDocument()
expect(screen.getByText('docker · preview')).toBeInTheDocument()
expect(screen.getByText('local · dev')).toBeInTheDocument()
```

In API tests:

```ts
await client.createAssignment({
  assignedEmail: 'bob@zonease.org',
  provisioningTarget: {
    adapterType: 'docker',
    maturity: 'preview',
    ref: 'docker://local/default',
  },
  soulReleaseRef: 'aiworker-freeform@dev',
})

expect(JSON.parse(fetchImpl.calls[0]?.init?.body as string)).toMatchObject({
  provisioningTarget: {
    adapterType: 'docker',
    maturity: 'preview',
    ref: 'docker://local/default',
  },
})
```

- [ ] **Step 2: Run Web tests and verify failure**

Run:

```bash
bun test apps/host-web/src/host-api.test.ts apps/host-web/src/app.test.tsx
```

Expected: FAIL because UI still says `aissh server` and API still sends `serverRef`.

- [ ] **Step 3: Update Host Web types**

Use:

```ts
export interface HostProvisioningTargetOption {
  adapterType: 'aissh' | 'docker' | 'local'
  capabilities: string[]
  description?: string
  displayName: string
  health: 'ready' | 'degraded' | 'unavailable'
  id: string
  maturity: 'production' | 'preview' | 'dev'
  ref: string
}

export interface CreateHostAssignmentInput {
  adapterRuntimeControlBaseUrl?: string
  assignedEmail: string
  provisioningTarget: {
    adapterType: HostProvisioningTargetOption['adapterType']
    maturity: HostProvisioningTargetOption['maturity']
    ref: string
  }
  soulReleaseRef: string
}
```

- [ ] **Step 4: Update Host Web UI**

Use target label:

```tsx
function targetLabel(target: HostProvisioningTargetOption): string {
  return `${target.displayName} · ${target.adapterType} · ${target.maturity}`
}
```

Warning text:

```tsx
{selectedTarget && selectedTarget.maturity !== 'production'
  ? <FieldDescription>此目标用于测试开通链路，不建议作为员工长期生产 Worker。</FieldDescription>
  : null}
```

For remote aissh callback input:

```tsx
{selectedTarget?.adapterType === 'aissh'
  ? (
      <Field>
        <FieldLabel htmlFor="adapterRuntimeControlBaseUrl">Worker callback URL</FieldLabel>
        <Input
          id="adapterRuntimeControlBaseUrl"
          value={formState.adapterRuntimeControlBaseUrl}
          onChange={event => setFormState(current => ({ ...current, adapterRuntimeControlBaseUrl: event.target.value }))}
        />
        <FieldDescription>远程 aissh 目标必须能访问这个 Host API URL；不能使用本机 localhost。</FieldDescription>
      </Field>
    )
  : null}
```

- [ ] **Step 5: Run Web tests**

Run:

```bash
bun test apps/host-web/src/host-api.test.ts apps/host-web/src/app.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/host-web/src/host-api.ts apps/host-web/src/host-api.test.ts apps/host-web/src/app.tsx apps/host-web/src/app.test.tsx
git commit -m "feat(host-web): select provisioning targets"
```

---

### Task 9: Update Browser Proofs And Focused Verification

**Files:**
- Modify: `tests/browser/host-dev-loop.spec.ts`
- Modify: `tests/browser/phase2-host-worker-access.spec.ts`
- Modify: `tests/browser/host-single-serve.spec.ts`

- [ ] **Step 1: Update browser assertions**

Change Host dev proof to assert:

```ts
await page.getByLabel('provisioning target').waitFor({ state: 'visible', timeout: 10000 })
await expect(page.getByText('本机开发环境')).toBeVisible()
await expect(page.getByText('local · dev')).toBeVisible()
```

When extracting the provision command, assert local callback:

```ts
expect(command).toContain('--host http://127.0.0.1:9117')
```

Add negative remote-aissh loopback API proof:

```ts
const response = await fetch(new URL('/api/host/assignments', apiUrl), {
  body: JSON.stringify({
    assignedEmail: 'bob@zonease.org',
    provisioningTarget: {
      adapterType: 'aissh',
      maturity: 'production',
      ref: 'srv-1',
    },
    soulReleaseRef: 'aiworker-freeform@dev',
  }),
  headers: { 'content-type': 'application/json', 'x-aiworker-dev-admin': 'admin@zonease.org' },
  method: 'POST',
})
expect(response.status).toBe(400)
```

- [ ] **Step 2: Run browser host dev proof**

Run:

```bash
bun run test:browser:host-dev
```

Expected: PASS.

- [ ] **Step 3: Run phase2 browser proof**

Run:

```bash
bun run test:browser:phase2
```

Expected: PASS.

- [ ] **Step 4: Run typecheck and docs check**

Run:

```bash
bun run docs:check
bun run --filter '@zonease/aiworker-host-web' typecheck
bun run --filter '@zonease/aiworker-host-cli' typecheck
bun run --filter '@zonease/aiworker-storage-sqlite' test
```

Expected: PASS.

- [ ] **Step 5: Run code-review-graph**

Run:

```bash
bun run crg:review
```

Expected: command completes and reports no blocker-level issues for changed files.

- [ ] **Step 6: Commit**

```bash
git add tests/browser/host-dev-loop.spec.ts tests/browser/phase2-host-worker-access.spec.ts tests/browser/host-single-serve.spec.ts
git commit -m "test(host): prove provisioning target dev flow"
```

---

## Final Verification

Run after all tasks:

```bash
bun test apps/host-cli/src/host-options.test.ts apps/host-cli/src/host-url-contract.test.ts apps/host-cli/src/provisioning-target-adapters.test.ts apps/host-cli/src/host-server.test.ts apps/host-cli/src/aiworker-host.test.ts
bun test apps/host-web/src/host-api.test.ts apps/host-web/src/app.test.tsx
bun test packages/storage-sqlite/src/host/index.test.ts packages/host-control/src/assignment.test.ts
bun test tests/architecture/inversion-guards.test.ts
bun run docs:check
bun run test:browser:phase2
bun run crg:review
```

Expected: all commands pass. If `test:browser:phase2` fails because a dev service is stale, run `bun run dev:host:clean`, then rerun the browser test once with a fresh dev Host.

## Risk Notes

- Keep physical `server_ref` until a separate storage migration plan removes it. This plan only removes the user/API/UI dependency on the term.
- Do not execute real remote `aissh` commands in unit tests. Unit tests verify command shape and URL reachability; live aissh validation belongs in an operator-driven smoke test with a real allowed server.
- Do not auto-create cloudflared/ngrok tunnels. Remote aissh dev requires the caller to provide a reachable callback URL.
- Docker command generation proves the contract first. If the image name or release bundle packaging is not ready, keep the adapter as preview and fail with `target_unavailable` rather than marking it production-ready.
