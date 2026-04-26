# PLAN-018 Worker self-enrollment via shared join token

- **status**: implementing
- **createdAt**: 2026-04-26 17:50
- **approvedAt**: 2026-04-26 18:00
- **relatedTask**: FEAT-024

## Context

### What sparked this

On 2026-04-26 we ran an inverted-topology smoke: `aim` on the test
server (loopback to gateway), `aiw` on the dev workstation (driving the
locally logged-in claude-code). It worked, but only after we stood up
**two SSH tunnels**:

- `-L 23000:127.0.0.1:3000` so the workstation worker could dial gateway
  through loopback (avoiding the BUG-007 basic-auth on the public
  ingress).
- `-R 13001:127.0.0.1:3001` so the **server-side gateway could dial the
  workstation worker `/info`** during `aim pair`.

The reverse tunnel exists only because the current pair flow
(`packages/gateway-proto/src/methods.ts::workers.pair` →
`apps/gateway/src/router/methods/workers.ts::createWorkersPairHandler`)
issues an inbound HTTP `/info` to the worker's `baseUrl`. Once pair
finishes, all subsequent traffic goes over the worker→gateway
**outbound** WS connection (`packages/core/src/worker/gateway-client/`
+ `apps/gateway/src/server.ts::handleMessage` node branch). The pair
inbound is the only step that fails when the worker has no public
address.

This is the precise ergonomic cliff that "agent self-enrollment via
shared join token" exists to remove (kubeadm, Nomad, Datadog,
Telegraf — every agent-based fleet does it this way).

### Existing registration paths (before this plan)

```
1. aim pair (operator-pull, manual)
   ┌─────────┐     bootstrap_token        ┌──────────┐
   │ worker  │ ──── stdout ──────► op ──► │ aim CLI  │
   └─────────┘                            └────┬─────┘
                                               ▼ workers.pair
                                          ┌──────────┐
                                          │ gateway  │
                                          └────┬─────┘
                                               ▼ HTTP /info  (INBOUND to worker — fails behind NAT)
                                          ┌─────────┐
                                          │ worker  │
                                          └────┬────┘
                                               ▼ AES enc
                                          fleet.db row

2. aim workers launch (gateway-driven, docker only)
   gateway supervisor → docker run worker → scrape stdout → fleet.db
   (only works on the gateway host, requires AIWORKER_GATEWAY_CAN_LAUNCH)
```

### Existing artefacts we will reuse

- `connectFrameSchema` (`packages/gateway-proto/src/messages.ts:9-18`)
  has a `meta?: Record<string,string>` field already accepted by the
  parser — perfect injection point for enroll metadata, no breaking
  change to the schema discriminator.
- `authorizeConnection` (`apps/gateway/src/auth/token.ts`) is the
  central handshake gate; only modification needed is adding a third
  branch ("token matches join secret + presents enroll meta").
- `FleetPersistence.createRegisteredWorker`
  (`apps/gateway/src/registry/persistence.ts`) already encrypts
  `apiToken` with `masterKeyHex` — reuse verbatim.
- `RegisteredWorkerOrigin` (`packages/shared`) currently `'manual' |
  'launch-local'` — add `'self-enroll'` value.
- `audit_events.action` already accepts arbitrary strings — add
  `gateway.worker.enrolled` and `gateway.connect.rejected` extension
  reasons.

### Existing security posture

- BUG-007 (Caddy basic-auth) is at the public ingress; self-enroll
  worker traffic flows the same `:80 → :3000` path and **must still
  pass basic-auth** (`wss://operator:<pwd>@host/ws`) when public.
- `INTERNAL_SHARED_SECRET` is currently used both as the operator
  bearer (loopback bypass) and as the env value injected into
  supervisor-launched workers. We will **not** overload it — a separate
  `AIWORKER_JOIN_TOKEN` keeps the trust boundaries clean and lets
  operators rotate one without disturbing the other.

## Proposal

### Wire change: extend connect frame instead of new method

A new top-level method `workers.enroll` would require either letting
nodes send `request` frames (today nodes can only send `response` /
`event`, see `apps/gateway/src/server.ts::handleMessage`) or letting
operators enroll on behalf of workers (which is exactly what
`workers.pair` already does). Both cost more state-machine surgery
than the value justifies.

The minimal-blast-radius design extends the existing **connect** frame:

```ts
// packages/gateway-proto/src/messages.ts (additive)
export const connectFrameSchema = z.object({
  type: z.literal('connect'),
  role: roleSchema,
  agentId: z.string().min(1),
  deviceId: z.string().min(1),
  auth: z.object({ token: z.string() }),
  meta: z.record(z.string()).optional(),
  enroll: z.object({                           // ← new optional block
    joinToken: z.string().min(1),
    apiToken: z.string().regex(WORKER_API_TOKEN_PATTERN),
    displayName: z.string().min(1).max(80).optional(),
  }).optional(),
})
```

### Gateway-side handshake (`apps/gateway/src/server.ts::handleMessage`)

```
on connect frame:
  if frame.role !== 'node':
    existing operator path — unchanged
  else:
    if frame.enroll is present:
      authorize: timingSafeEqualStrings(frame.enroll.joinToken, env.AIWORKER_JOIN_TOKEN)
                 && quota check
      on success:
        upsert registered_workers row
          (id=frame.agentId, baseUrl='', apiToken=frame.enroll.apiToken,
           displayName=frame.enroll.displayName ?? frame.agentId,
           addedBy='self-enroll')
        write audit_events(action='gateway.worker.enrolled')
        register NodeRegistry as today
        broadcast worker.online as today
      on failure:
        ws.close(4401, 'auth:join_token_mismatch' | 'auth:quota_exceeded')
        write audit_events(action='gateway.connect.rejected')
    else:
      existing node path: token must equal INTERNAL_SHARED_SECRET (loopback bypass).
      Note: we do NOT yet add "token must match fleet.db apiToken" — that's
      a separate hardening (out of scope, see Risks below).
```

### Worker-side (`packages/core/src/worker/bootstrap` +
`apps/cli/src/commands/serve.ts`)

`bootstrapWorkerApp` already mints identity + apiToken on first boot
and writes them to `worker.db.worker_identity`. The new flow:

```
runServe():
  bootstrap → state with workerId, apiToken
  if workerEnv.AIWORKER_JOIN_TOKEN && options.gateway:
    startGatewayNode({
      url: options.gateway,
      token: '',                               // bearer not used — enroll path is bearer-less
      enroll: {
        joinToken: workerEnv.AIWORKER_JOIN_TOKEN,
        apiToken: state.apiTokenPlaintext,
        displayName: workerEnv.AIWORKER_DISPLAY_NAME,
      },
      ...
    })
  else if options.gateway:
    startGatewayNode({ url, token: options.gatewayToken ?? '' })  // existing path
```

`startGatewayNode` passes `enroll` through to `GatewayClient`, which
encodes it into the `connect` frame. After the first successful enroll
the worker.db `worker_identity.enrolled_at` is set; on subsequent
restarts the connect frame can omit `enroll` (gateway treats it as a
plain reconnect — fleet.db row already exists).

### Env additions (`packages/core/src/config/worker.ts`)

```
AIWORKER_GATEWAY_URL    optional  default unset    if set + JOIN_TOKEN set, aiw serve auto-enrolls
AIWORKER_JOIN_TOKEN     optional  default unset    must match gateway-side AIWORKER_JOIN_TOKEN
AIWORKER_DISPLAY_NAME   optional  default workerId
```

Gateway-side env (`apps/gateway/src/config.ts`):

```
AIWORKER_JOIN_TOKEN     optional  default unset
                                   when unset → self-enroll disabled, all enroll attempts
                                   close 4401 'auth:join_token_disabled'
```

### CLI surface (`apps/cli/src/aim`)

No new aim subcommand in this plan — `aim workers list` and
`aim workers remove` already cover the operator-side surface for a
self-enrolled worker. (Token rotation tooling is deferred to a
follow-up; manual rotation today = restart gateway with new env.)

### Migration

- Existing fleet (zero workers, fresh post-PLAN-016 deploy): no
  migration. Just set `AIWORKER_JOIN_TOKEN` on gateway env, distribute
  it to workers, restart gateway.
- For deployments with existing pair-registered workers: untouched —
  they reconnect via the existing INTERNAL_SHARED_SECRET path.

### Test plan

**Unit**:

- `packages/gateway-proto/test/parse.test.ts`: connect frame with
  enroll block parses; with malformed enroll rejects.
- `apps/gateway/test/enroll.test.ts`:
  - happy path: enroll → fleet row exists, addedBy=self-enroll, audit
    line written, ws stays open as node.
  - wrong joinToken → ws closed 4401, fleet untouched, rejected audit.
  - quota exceeded → ws closed 4401, quota_exceeded audit.
  - reconnect with same workerId (no enroll block) → not 4401, ws ok.
  - reconnect with different displayName via fresh enroll → fleet row
    updated, audit line written.
- `packages/core/src/worker/bootstrap/enroll.test.ts`:
  - `AIWORKER_JOIN_TOKEN` unset → no enroll block sent.
  - `AIWORKER_JOIN_TOKEN` set → enroll block populated correctly.

**E2E** (manual, scriptable in `tmp/`):

- Start gateway with `AIWORKER_JOIN_TOKEN=test-secret`.
- Start `aiw serve --port 3001 --gateway ws://127.0.0.1:3000/ws` with
  `AIWORKER_JOIN_TOKEN=test-secret AIWORKER_DISPLAY_NAME=smoke`.
- `aim workers list` from gateway-side returns the worker without any
  manual `aim pair`.
- `aim chat <id> '...'` round-trips via the existing chat path.
- Restart worker (new process, same worker.db) → reconnects without
  re-enrolling.
- Stop gateway, change `AIWORKER_JOIN_TOKEN` to a new value, restart
  gateway → existing worker reconnects fine; a fresh worker with the
  old join token fails 4401.

## Risks

- **Trust boundary widening**: `AIWORKER_JOIN_TOKEN` is fleet-level
  shared. Anyone who can read it can join an arbitrary `workerId` into
  the fleet. Mitigations:
  - Existing `AIWORKER_MAX_WORKERS` quota caps the blast radius.
  - Self-enroll only triggers when both env vars are present and the
    socket is non-loopback — internal supervisor flows aren't affected.
  - Operator can `aim workers remove` to evict bad rows.
- **No reconnect token verification**: Today (and after this plan)
  gateway accepts any node connect that passes `INTERNAL_SHARED_SECRET`,
  trusting the `agentId` claim. Self-enroll doesn't make this worse,
  but it doesn't fix it either. Track as a separate hardening BUG; do
  NOT roll into this plan.
- **Frame parser compatibility**: Adding the optional `enroll` block to
  `connectFrameSchema` is additive-safe (existing producers don't send
  it). Need to verify that older clients on a newer gateway, and newer
  clients on an older gateway, both behave gracefully. Older gateways
  ignoring `enroll` would treat the connect as a normal node attempt
  with empty token — fine for loopback, **rejected** for remote, which
  is the expected fail-closed behaviour.
- **Audit volume**: Self-enroll workers may reconnect frequently
  (network blips, rolling restarts). Each reconnect that contains
  `enroll` writes an `gateway.worker.enrolled` audit row. Mitigation:
  emit the audit only when the fleet row actually changes (insert OR
  detected displayName change), not on every idempotent reconnect.

## Scope

- **Files touched**: ~9
  - `packages/gateway-proto/src/messages.ts` (extend schema + 1 test)
  - `apps/gateway/src/server.ts` (connect handler branch)
  - `apps/gateway/src/auth/token.ts` (new join_token authorize path)
  - `apps/gateway/src/config.ts` (env)
  - `apps/gateway/src/registry/persistence.ts` (upsertEnrolledWorker)
  - `apps/gateway/test/enroll.test.ts` (new)
  - `packages/core/src/config/worker.ts` (env)
  - `packages/core/src/worker/bootstrap/index.ts` (read enroll env)
  - `apps/cli/src/commands/serve.ts` (wire enroll into startGatewayNode)
  - `packages/core/src/worker/gateway-client/{client,index}.ts` (forward
    enroll into connect frame)
  - `packages/shared/src/fleet/registered-worker.ts` (add 'self-enroll'
    origin)
- **Approx LOC**: ~400-550 + ~150 docs.
- **Migration / DB schema**: none. `addedBy` is plain text; no fleet.db
  migration required.
- **Protocol break**: none (additive-only).

## Alternatives

### A1 — New `workers.enroll` method instead of connect-frame extension

- Pros: clear method-level boundary, easier to audit per-call.
- Cons: requires letting nodes send `request` frames (today they only
  send `response` / `event`). Significantly more invasive in
  `server.ts` and `dispatcher.ts`. Rejected.

### A2 — One-off TTL'd OTP join tokens (kubeadm style)

- Adds gateway-side persistence of `(token_hash, expires_at, max_uses)`,
  `aim gateway join-token mint --ttl=24h --max-uses=1`.
- Pros: tighter security; token leak is bounded.
- Cons: meaningful schema + UX additions; out of scope for "make it
  work end-to-end". Track as **future** PLAN, not in PLAN-018.

### A3 — Use `INTERNAL_SHARED_SECRET` as the join token (zero new env)

- Pros: minimal env surface.
- Cons: collapses two trust roles (operator bearer + worker enrollment)
  into one secret. Rotating one rotates both. Rejected.

### A4 — Worker-side public-key registration (cert-based)

- Pros: enroll doesn't need a shared secret at all; worker proves
  identity via signed CSR.
- Cons: requires PKI ops the project explicitly avoids today
  (no Caddy auto-https, no per-worker cert distribution). Out of scope.

## Annotations

### 2026-04-26 18:00 — user `proceed`

Plan approved. Entering Phase 3. BKD orchestration: 1 coordinator + 4
worktree subtasks split by file boundary to avoid merge conflicts.

- **S1 proto**: `connectFrameSchema.enroll` + `RegisteredWorkerOrigin` extension. Independent.
- **S2 gateway**: `authorizeConnection` 第三分支 + `handleMessage` enroll path + persistence upsert + 9 tests. Depends on S1 wire.
- **S3 worker**: `bootstrap` enroll trigger + `startGatewayNode` 转发 + env schema. Depends on S1 wire.
- **S4 docs**: architecture / deployment / cli / changelog / CLAUDE.md. Coordinator stages this last after S1-3 all reach review (ensures docs match actual implementation, not the spec).

Merge order: S1 → S2 → S3 → S4. Coordinator runs typecheck + focused
tests after each merge; full E2E (local gateway + worker self-enroll
round-trip) after S4 lands.
