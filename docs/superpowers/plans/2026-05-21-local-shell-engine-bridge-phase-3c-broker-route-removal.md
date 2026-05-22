# Local Shell Engine Bridge Phase 3C Broker Route Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Remove the public Host-owned `/broker/*` product surface while keeping Soul App actions/search mounted through declared protocol endpoints.

**Architecture:** Host stays a local shell, locator, mounter and engine bridge. Public daemon API no longer exposes Host broker permissions/providers/storage/search/connector/audit/engine routes, mounted context no longer advertises `brokerUrl` or `brokerGrants`, and official HR/QA mounted adapters keep draft/search state app-owned inside the mounted service. Internal descriptor permission helpers remain for a later slice so this change does not also rewrite manifest schema and permission parsing.

**Tech Stack:** Bun workspaces, TypeScript, Hono daemon API, Soul App SDK tests, official HR/QA mounted adapter tests.

---

## File Structure

- Modify `apps/api/src/modes/worker.ts`
  - Delete `/api/local/apps/:appId/broker/*` route registrations and OpenAPI entries.
  - Remove `brokerUrl` and `brokerGrants` from signed mounted context payload.
  - Keep `createSoulAppBroker` only for internal descriptor permission decisions.
- Modify `apps/api/src/modes/worker.local.test.ts`
  - Replace the positive broker route test with a negative "broker routes are no longer product API" test.
  - Update mount-context tests so they assert identity is present but broker fields are gone.
  - Update mount-token tests so the token is only for mounted app proxy context, not broker callbacks.
- Modify `packages/soul-app-sdk/src/index.ts`
  - Remove `client.broker.*`, `SoulAppBrokerContextQuery`, and broker path encoding/query helpers.
- Modify `packages/soul-app-sdk/src/index.test.ts`
  - Replace broker client route assertions with an assertion that the public SDK client has no broker surface.
- Modify `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`
  - Remove Host broker callback client usage and `/broker/permissions`.
  - Store mounted draft descriptors in app-owned memory keyed by workspace/app.
  - Return app-owned search results from `/protocol/search`.
  - Rename visible descriptor copy away from "broker".
- Modify `apps/aiworker-hr/host-adapter/index.test.ts`
  - Replace Host broker callback expectations with app-owned action/search persistence expectations.
- Modify `apps/aiworker-qa/host-adapter/mounted/host-mounted.ts`
  - Same app-owned mounted draft/search behavior for QA.
- Modify `apps/aiworker-qa/host-adapter/index.test.ts`
  - Same mounted adapter expectation updates for QA.

## Task 1: API Broker Route Removal

**Files:**
- Modify: `apps/api/src/modes/worker.local.test.ts`
- Modify: `apps/api/src/modes/worker.ts`

- [x] **Step 1: Write failing API tests**

Replace the test named `exposes only brokered Soul App storage, connector, audit, and engine-denial routes` with a negative route test:

```ts
it('does not expose Host broker routes as product API', async () => {
  const target = await app()

  const providersRes = await target.request('/api/local/apps/aiworker-hr/broker/providers')
  expect(providersRes.status).not.toBe(200)

  const storageRes = await target.request('/api/local/apps/aiworker-hr/broker/storage/profiles/ada', {
    method: 'PUT',
    body: JSON.stringify({ valueJson: { name: 'Ada' } }),
    headers: { 'content-type': 'application/json' },
  })
  expect(storageRes.status).not.toBe(200)
})
```

In the OpenAPI test, replace broker path `toContain` checks with:

```ts
expect(paths.some(path => path.includes('/broker/'))).toBe(false)
```

In mount-context tests, assert:

```ts
expect(mountContext).not.toHaveProperty('brokerGrants')
expect(mountContext).not.toHaveProperty('brokerUrl')
```

- [x] **Step 2: Verify API tests fail before implementation**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
```

Expected: failures because broker routes still return `200`, OpenAPI still lists `/broker/*`, and mount context still contains broker fields.

- [x] **Step 3: Remove public API route registrations**

Delete the explicit route block for:

```ts
/api/local/apps/:appId/broker/permissions
/api/local/apps/:appId/broker/providers
/api/local/apps/:appId/broker/search
/api/local/apps/:appId/broker/search/:itemId
/api/local/apps/:appId/broker/storage
/api/local/apps/:appId/broker/storage/:key
/api/local/apps/:appId/broker/connectors/:connectorId/evidence
/api/local/apps/:appId/broker/audit
/api/local/apps/:appId/broker/engine/invocations
```

Delete OpenAPI entries containing `/broker/`.

Delete now-unused helpers:

```ts
brokerResponse()
searchIndexInputFromRecord()
searchIndexReferenceFromRecord()
```

Remove `brokerGrants` and `brokerUrl` from `applyMountedProxyContextHeaders()`.

- [x] **Step 4: Verify API passes**

Run:

```bash
bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts
bun run --filter '@zonease/aiworker-api' typecheck
```

Expected: both commands pass.

## Task 2: SDK Public Client Cleanup

**Files:**
- Modify: `packages/soul-app-sdk/src/index.test.ts`
- Modify: `packages/soul-app-sdk/src/index.ts`

- [x] **Step 1: Write failing SDK test**

Delete the broker route tests and add:

```ts
it('does not expose a Host broker client surface', () => {
  const client = createSoulAppClient({ appId: 'demo-soul-app' })
  expect(client).not.toHaveProperty('broker')
})
```

- [x] **Step 2: Verify SDK test fails before implementation**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-sdk' test src/index.test.ts
```

Expected: failure because `client.broker` still exists.

- [x] **Step 3: Remove broker client implementation**

Remove `SoulAppBrokerContextQuery`, `client.broker`, `encodeBrokerPath()`, and `queryString()` from `packages/soul-app-sdk/src/index.ts`.

- [x] **Step 4: Verify SDK passes**

Run:

```bash
bun run --filter '@zonease/aiworker-soul-app-sdk' test src/index.test.ts
bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck
```

Expected: both commands pass.

## Task 3: Official Mounted Apps Use App-Owned Draft/Search

**Files:**
- Modify: `apps/aiworker-hr/host-adapter/index.test.ts`
- Modify: `apps/aiworker-hr/host-adapter/mounted/host-mounted.ts`
- Modify: `apps/aiworker-qa/host-adapter/index.test.ts`
- Modify: `apps/aiworker-qa/host-adapter/mounted/host-mounted.ts`

- [x] **Step 1: Write failing HR/QA adapter tests**

For HR, replace the Host broker persistence test with a mounted action/search test that does not start a fake Host broker server:

```ts
it('keeps people profile drafts app-owned in mounted mode', async () => {
  const previousToken = Bun.env.AIWORKER_MOUNT_TOKEN
  Bun.env.AIWORKER_MOUNT_TOKEN = 'test-hr-mounted-token'
  const server = serveHostMounted(0)
  const baseUrl = `http://127.0.0.1:${server.port}`
  const mountContext = Buffer.from(JSON.stringify({
    operatorId: 'operator-local',
    sessionId: 'session-hr',
    workerId: 'worker-hr',
    workspaceId: 'workspace-hr',
  })).toString('base64url')

  try {
    const actionRes = await fetch(`${baseUrl}/protocol/actions`, {
      body: JSON.stringify({ input: {}, protocolAction: 'peopleProfiles.create' }),
      headers: {
        'content-type': 'application/json',
        'x-aiworker-mount-context': mountContext,
        'x-aiworker-mount-token': 'test-hr-mounted-token',
      },
      method: 'POST',
    })
    expect(actionRes.status).toBe(200)
    expect(await actionRes.json()).toMatchObject({ ok: true, refresh: true })

    const searchRes = await fetch(`${baseUrl}/protocol/search?providerId=peopleProfiles.search&query=people&limit=2`, {
      headers: {
        'x-aiworker-mount-context': mountContext,
        'x-aiworker-mount-token': 'test-hr-mounted-token',
      },
    })
    expect(searchRes.status).toBe(200)
    expect(await searchRes.json()).toMatchObject({
      items: [expect.objectContaining({
        id: 'drafts/people-profile/workspace-hr',
        title: 'People profile draft',
      })],
      providerId: 'peopleProfiles.search',
    })
  }
  finally {
    server.stop()
    if (previousToken === undefined)
      delete Bun.env.AIWORKER_MOUNT_TOKEN
    else
      Bun.env.AIWORKER_MOUNT_TOKEN = previousToken
  }
})
```

For QA, use `releaseGates.create`, `releases.search`, `drafts/release-gate/workspace-qa`, and `Release gate draft`.

- [x] **Step 2: Verify official app tests fail before implementation**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test host-adapter/index.test.ts
bun run --filter '@zonease/aiworker-qa' test host-adapter/index.test.ts
```

Expected: failures because the mounted adapters only persist/query through Host broker callbacks today.

- [x] **Step 3: Implement app-owned mounted draft stores**

In each mounted adapter:

- remove `createSoulAppClient` import;
- remove `/broker/permissions`;
- remove `brokerUrl` from `MountContext`;
- replace descriptor action target `/broker/reviews` with a non-broker app-owned action target or remove the action list;
- rename `Evidence broker` field to `Evidence inputs`;
- add a module-level `Map<string, Record<string, unknown>>`;
- in `persist*Draft()`, write the draft descriptor to the map and do not call Host;
- in `*ProtocolSearch()`, return matching map records before the generic fallback;
- remove `queryBroker*Search()` and `brokerScope()`.

- [x] **Step 4: Verify official app tests pass**

Run:

```bash
bun run --filter '@zonease/aiworker-hr' test host-adapter/index.test.ts
bun run --filter '@zonease/aiworker-qa' test host-adapter/index.test.ts
bun run --filter '@zonease/aiworker-hr' typecheck
bun run --filter '@zonease/aiworker-qa' typecheck
```

Expected: all commands pass.

## Task 4: Cross-Surface Cleanup, Review and Commit

**Files:**
- All files touched in Tasks 1-3.

- [x] **Step 1: Search for public broker leftovers**

Run:

```bash
rg -n "broker/|brokerUrl|brokerGrants|client\\.broker|Host broker|Evidence broker" apps/api/src packages/soul-app-sdk/src apps/aiworker-hr apps/aiworker-qa
```

Expected: no public route/client/mounted-copy leftovers. Internal core broker references may remain outside this search scope for the next slice.

- [x] **Step 2: Run hygiene checks**

Run:

```bash
bun run docs:check
git diff --check
```

Expected: both pass.

- [x] **Step 3: Run code-review-graph**

Run:

```bash
bun run crg:update
bun run crg:review
```

Expected: no blocking findings for this slice.

- [x] **Step 4: Commit only this slice**

Run:

```bash
git status --short
git add docs/superpowers/plans/2026-05-21-local-shell-engine-bridge-phase-3c-broker-route-removal.md apps/api/src/modes/worker.ts apps/api/src/modes/worker.local.test.ts packages/soul-app-sdk/src/index.ts packages/soul-app-sdk/src/index.test.ts apps/aiworker-hr/host-adapter/mounted/host-mounted.ts apps/aiworker-hr/host-adapter/index.test.ts apps/aiworker-qa/host-adapter/mounted/host-mounted.ts apps/aiworker-qa/host-adapter/index.test.ts
git commit -m "refactor: 移除 Host broker 产品入口"
```

Expected: commit succeeds without staging unrelated dirty PMA/doc files already present in the workspace.

## Self-Review

- Spec coverage: public Host broker API, SDK broker client, mounted context broker hints and official app broker callbacks are removed.
- Intentional gap: internal core permission helper still has broker naming and remains for the next slice.
- Placeholder scan: no TBD/TODO/fill-in steps.
- Type consistency: `brokerUrl`, `brokerGrants`, `client.broker`, and `/broker/*` route expectations are removed consistently from the touched product surfaces.
