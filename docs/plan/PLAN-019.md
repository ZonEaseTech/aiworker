# PLAN-019 Worker OTP-attended enrollment (operator-approved join, CLI-only)

- **status**: completed
- **createdAt**: 2026-04-27 02:00
- **approvedAt**: 2026-04-27 02:10
- **completedAt**: 2026-04-27 06:40
- **relatedTask**: FEAT-026

## Context

### What sparked this

PLAN-018 (FEAT-024) shipped self-enroll via shared `AIWORKER_JOIN_TOKEN`,
covering unattended scenarios (CI / k8s / docker compose). End-to-end
verified on 2026-04-27: workstation `aiw` joined the production fleet
over `wss://operator:<pwd>@gateway.example.test/ws` carrying both the
basicauth credential **and** the join token.

The user surfaced the deeper pain: **the worker side currently has to
hold operator-level credentials** (Caddy basicauth) just to reach the
gateway. For `aim`-driven manual pair we never had this issue (operator
ran the pair from inside the trust boundary); for FEAT-024 self-enroll
in production, the public-ingress topology forces the worker deployer
to have basicauth. That's a real anti-pattern when the worker deployer
is a customer / friend / CI runner who should NOT see fleet-wide secrets.

The user's proposed shape (this PLAN's scope):

> "aiw 发起配对请求 ... 此时本次配对的 code 是 KKKK PPPP，
>  在 aim 侧查看待配对 list，aim 准许 KKKK PPPP 入网。
>  这里应该还不需要 web ui."

This is precisely **GitHub Device Flow** / `gh auth login` — attended
enrollment with operator approval keyed on a short, human-readable OTP.

### Existing artefacts to reuse

- `connectFrameSchema.enroll` (PLAN-018, `packages/gateway-proto/src/messages.ts`):
  the optional block already passes `apiToken` + `displayName`. We can
  extend it with a `mode: 'otp'` discriminator instead of inventing a
  new method.
- `RegisteredWorkerOrigin` (`packages/shared`): currently
  `'manual' | 'launch-local' | 'self-enroll'` → add `'otp'`.
- `audit_events` is open-schema → add `gateway.enrollment.requested` /
  `.approved` / `.rejected` / `.expired` action values.
- `apps/gateway/src/auth/token.ts::authorizeConnection`: already has
  the three-branch split (loopback / shared-secret / self-enroll). The
  OTP submit path adds a fourth branch: "no auth required, must be
  on the dedicated `/enroll-ws` path".

### What is NEW vs PLAN-018

| Concern | PLAN-018 (self-enroll) | PLAN-019 (OTP-attended) |
|---|---|---|
| Auth at handshake | join token (fleet-shared) | none (path-based isolation) |
| Caddy ingress | shares `/ws` with operator (needs basicauth) | dedicated `/enroll-ws` (no basicauth) |
| Pending state | n/a — landed immediately | held in-memory until operator decides |
| Operator action | none | mandatory approve / reject |
| Failure modes | wrong token / quota / disabled | OTP expired / rejected / collision |
| Worker UX | env-driven, headless | shows OTP, blocks on approval |

## Proposal

### Wire change: extend `connectFrameSchema.enroll` instead of new method

```ts
// packages/gateway-proto/src/messages.ts (additive — same approach as PLAN-018)
enroll: z.object({
  apiToken: z.string().regex(WORKER_API_TOKEN_PATTERN),
  displayName: z.string().min(1).max(80).optional(),

  // NEW (PLAN-019): mode discriminator
  mode: z.enum(['join-token', 'otp']).optional().default('join-token'),

  // existing — only required when mode === 'join-token'
  joinToken: z.string().min(1).optional(),
}).optional()
```

Backwards compat: existing PLAN-018 clients without `mode` → defaults to
`join-token`, semantics unchanged.

### Two new gateway-proto methods + 1 new event

```ts
// methods.ts (additions)
enroll.list:    operator → gateway   →  { pending: [{ otp, workerId, displayName, submittedAt, expiresAt }] }
enroll.approve: operator → gateway   →  { workerId, deviceToken } (deviceToken is the worker's apiToken, encrypted into fleet.db)
enroll.reject:  operator → gateway   →  { rejected: true }

// events.ts (addition)
enrollment.approved   gateway → worker (the pending node, via its existing WS)
                      payload: { workerId, deviceToken }
```

### Caddy path split

```caddy
:80 {
  encode zstd gzip

  handle /ws {
    import /etc/caddy/auth.snippet           # operator + reconnecting worker
    reverse_proxy 127.0.0.1:3000 { ... }
  }

  handle /enroll-ws {
    # NO basicauth — worker enrollment ingress
    # Gateway path-aware code refuses anything that's not OTP submit.
    reverse_proxy 127.0.0.1:3000 { ... }
  }

  log { ... }
}
```

`auth.snippet` setup unchanged from BUG-007. Gateway sees the path via
`req.url.pathname` in the `Bun.serve` `fetch` handler (already inspected
in `apps/gateway/src/server.ts`).

### Gateway state: in-memory `PendingEnrollmentRegistry`

```ts
class PendingEnrollmentRegistry {
  pending: Map<otp, { workerId, apiToken, displayName, ws, submittedAt, expiresAt, timer }>

  submit(req): { otp, expiresAt }            // generate new OTP, hold WS for later push
  list(): PendingEnrollment[]
  approve(otp): { workerId, apiToken, ws }   // returns the entry to caller
  reject(otp): boolean
  // GC: expired entries close ws with 4408 enroll:expired
}
```

**Not persisted** — restart loses pending state, worker auto re-submits.
Audit events still go to fleet.db `audit_events`.

### OTP encoding

- 40-bit entropy, displayed as `XXXX-YYYY` (8 chars + dash for readability).
- Crockford base32 alphabet **minus** ambiguous chars: drop `0/O/I/1/L/U`.
- Final alphabet: `ABCDEFGHJKMNPQRSTVWXYZ23456789` (30 chars).
- 30^8 ≈ 6.5 × 10^11 — enough for human-scale concurrent pending without
  collision; gateway re-rolls on rare collision before returning to caller.

### Path-aware authN matrix

```
                    Caddy /ws (basicauth)        Caddy /enroll-ws (no auth)
operator connect    ✓ (existing)                 ✗ (4403 wrong_path)
node connect (OTP)  ✗ (4403 wrong_path)          ✓ (must carry enroll.mode='otp')
node reconnect      ✓ (deviceToken)              ✗ (4403 wrong_path)
node self-enroll    ✓ (PLAN-018, basicauth+JOIN_TOKEN) ✗ (4403)
```

Rationale: keep the trust boundary at the path level; `/enroll-ws`
exists only to accept OTP-mode connect frames, with no privilege
escalation surface.

### Gateway-side handshake (`apps/gateway/src/server.ts::handleMessage`)

```
on connect frame, branch by Caddy path (set during fetch handler):
  if path === '/enroll-ws':
    if frame.role !== 'node' || !frame.enroll || frame.enroll.mode !== 'otp':
      close 4400 'wrong_path:expected enroll.mode=otp'
    issue OTP via PendingEnrollmentRegistry.submit({
      workerId: frame.agentId,
      apiToken: frame.enroll.apiToken,
      displayName: frame.enroll.displayName,
      ws,
    })
    push event 'enrollment.otp' { otp, expiresAt } to ws
    leave ws OPEN, do NOT register as node yet
    write audit gateway.enrollment.requested { workerId, displayName, otp:hash }
    on operator approve later:
      upsertEnrolledWorker { addedBy: 'otp', ... }
      push event 'enrollment.approved' { workerId, deviceToken } to ws
      register ws into NodeRegistry as full node
      broadcast worker.online
      audit gateway.enrollment.approved
    on reject / expire:
      ws.close(4403/4408)
      audit gateway.enrollment.rejected / .expired
  else /* path === '/ws' */:
    existing PLAN-018 + operator path, unchanged
```

### Worker side (`apps/cli/src/commands/serve.ts::runServe`)

Trigger table for `aiw serve`:

| `--gateway` | env `AIWORKER_GATEWAY_URL` | env `AIWORKER_JOIN_TOKEN` | Mode |
|---|---|---|---|
| set | (any) | (any) | legacy `--gateway-token` path |
| unset | set | set | PLAN-018 self-enroll (existing) |
| unset | set | unset | **PLAN-019 OTP enroll (new)** |
| unset | unset | (any) | gateway-client disabled (existing) |

OTP mode:
1. Dial `wss://<gateway-host>/enroll-ws` — no basicauth, no token
2. Send connect frame with `enroll.mode='otp'` + `apiToken` + `displayName`
3. Receive `enrollment.otp` event → render `XXXX-YYYY` to stdout
   (boxed format for visibility)
4. Block on either `enrollment.approved` event (success) or `4403/4408`
   close (rejected/expired)
5. On approved: cache `deviceToken` (= apiToken just confirmed) into
   worker.db `worker_identity.enrolled_at = now`; client transparently
   reconnects to `/ws` (basicauth-free path? — see Risks); resumes as
   node

### aim CLI surface (`apps/cli/src/aim/commands/enroll.ts` new file)

```
aim enroll list                    → calls gateway enroll.list
aim enroll approve <otp>           → calls gateway enroll.approve
aim enroll reject  <otp>           → calls gateway enroll.reject
```

State file `~/.aiworker/aim.json` unchanged.

### Env additions

```
# gateway-side
AIWORKER_ENROLL_OTP_TTL_SEC   default 300

# worker-side
AIWORKER_GATEWAY_URL          (PLAN-018 already added; reused here)
AIWORKER_DISPLAY_NAME         (PLAN-018 already added; reused here)
# new:
AIWORKER_ENROLL_MODE          'auto' | 'otp'   default 'auto'
                              # auto = JOIN_TOKEN ? self-enroll : otp
                              # explicit otp forces OTP path even if JOIN_TOKEN set
```

### Test plan

**Unit** (gateway):
- happy path: submit → approve → fleet row written, audit `.approved`, ws becomes node
- expire: submit → wait TTL → 4408 close, audit `.expired`, fleet untouched
- reject: submit → operator rejects → 4403, audit `.rejected`
- collision: monkey-patch RNG to force 1 collision → registry re-rolls
- cross-path: connect to `/ws` with `enroll.mode='otp'` → 4403 `wrong_path`
- cross-path: connect to `/enroll-ws` without enroll → 4400
- list: 3 pending → all returned with hashed-OTP for audit but plain OTP for operator

**Unit** (worker bootstrap):
- env trigger table coverage (all 4 mode rows)
- OTP render to stdout buffered correctly under non-TTY (CI runs)

**E2E** (manual, scriptable):
- workstation `aiw serve` with only `AIWORKER_GATEWAY_URL` env (no
  basicauth, no JOIN_TOKEN) → OTP printed
- server `aim enroll list` shows it; `aim enroll approve XXXX-YYYY`
- worker resumes as node; `aim chat <id> 'hello'` round-trips claude-code

## Risks

- **Worker post-approval reconnect goes through `/ws` which still has
  basicauth**. Two options:
  - (a) Worker continues using `/enroll-ws` after approval — gateway
    accepts deviceToken on this path too. Trust-boundary clean
    (worker-only path).
  - (b) Worker switches to `/ws` and is given a "WS-bypass" mechanism
    in Caddy via path `/ws/<deviceToken>` (ugly).
  - **Recommended**: (a). Add `/enroll-ws` as the worker's permanent
    ingress; `/ws` is operator-only. This affects reconnect logic in
    `gateway-client/client.ts` — it remembers which path it enrolled
    on.

- **OTP enumeration / brute-force**: 40-bit entropy is large but if
  pending list is long-lived, an attacker on `/enroll-ws` could try
  random OTPs via `enroll.approve`. **However**: `enroll.approve` is on
  `/ws` (operator path, basicauth-protected), not `/enroll-ws`. So
  attacker would already need operator credentials to attempt — no new
  surface vs current. Document explicitly. Add per-IP rate-limit on
  `/enroll-ws` submit path as a P3 follow-up if abuse appears.

- **OTP shoulder-surfing**: 8-char visible code in stdout / journalctl
  is by design — operator and worker deployer both see it. Document
  that OTPs are single-use and short-lived; do not mistake for
  long-lived secrets.

- **Pending state lost on gateway restart**: by design (in-memory). UX
  acceptable — worker re-submits on reconnect. Document.

- **Multiple operator approving simultaneously**: race within
  `PendingEnrollmentRegistry.approve` resolved by single-threaded JS
  + atomic `Map.delete` before fleet.db write.

- **OTP reuse after restart**: not possible — pending OTPs are wiped on
  restart, deviceToken (= worker's apiToken) is what's persisted.

## Scope

- **Files touched**: ~12-14
  - `packages/gateway-proto/src/messages.ts` (extend enroll block + 3 method defs + 1 event def)
  - `packages/gateway-proto/test/parse.test.ts` (cases)
  - `packages/shared/src/fleet/registered-worker.ts` ('otp' origin)
  - `apps/gateway/src/registry/pending.ts` (new — PendingEnrollmentRegistry)
  - `apps/gateway/src/server.ts` (path-aware connect handler)
  - `apps/gateway/src/router/methods/enroll.ts` (new — list/approve/reject)
  - `apps/gateway/src/router/dispatch.ts` (wire new methods)
  - `apps/gateway/src/config.ts` (TTL env)
  - `apps/gateway/test/enroll-otp.test.ts` (new — 6 cases)
  - `packages/core/src/config/worker.ts` (ENROLL_MODE env)
  - `packages/core/src/worker/gateway-client/client.ts` (OTP-mode connect, event handling, post-approve reconnect path)
  - `apps/cli/src/aim/commands/enroll.ts` (new file — list/approve/reject)
  - `apps/cli/src/aim.ts` (register subcommands)
  - `ops/caddy/Caddyfile.tmpl` (path split)
  - `docs/{architecture,deployment,cli}.md` + `CLAUDE.md` + `changelog`
- **Approx LOC**: ~700-900 + ~200 docs
- **DB schema**: none (pending is in-memory)
- **Protocol**: additive (new methods, new event, enroll block discriminator)
- **Production migration**: append `AIWORKER_ENROLL_OTP_TTL_SEC` to gateway env
  optionally; Caddy config update once

## Alternatives

### A1 — Persisted pending list (sqlite)

- Pros: gateway restart preserves pending state.
- Cons: extra schema; complicates failure modes; pending OTP is
  short-lived anyway. Rejected — keep ephemeral.

### A2 — Approve in `/enroll-ws` path (worker self-confirms via push)

- Pros: no operator action needed.
- Cons: defeats the entire purpose (operator approval). Rejected.

### A3 — Reuse FEAT-024 self-enroll, just hide the join token

- Pros: zero new code.
- Cons: still requires the deployer to have *some* secret
  (join_token); doesn't address the "deployer is a stranger" case;
  no audit trail per worker join. Rejected.

### A4 — Use full UUID instead of OTP

- Pros: zero collision concern.
- Cons: too long to read aloud / type. Rejected — 8-char OTP is the UX point.

### A5 — Add web SPA pending-list UI in this iteration

- Pros: nicer for operators.
- Cons: user explicitly excluded ("应该还不需要 web ui"). Defer to
  separate plan. Rejected for v1.

## Annotations

### 2026-04-27 02:10 — user `proceed`

Plan approved. Entering Phase 3. BKD orchestration: 1 coordinator + 5
worktree subtasks split by file boundary.

- **S1 proto**: `enroll.mode` discriminator + new methods/events + `RegisteredWorkerOrigin='otp'`. Independent.
- **S2 gateway-pending**: `PendingEnrollmentRegistry` + enroll list/approve/reject handlers + dispatch wire + TTL env. Depends on S1 wire.
- **S3 gateway-handshake**: server.ts path-aware connect + auth matrix + audit events. Depends on S1 wire; uses S2's registry (rebased after S2 merges).
- **S4 worker+aim**: `aiw serve` OTP trigger + client OTP-mode connect + console OTP render + `aim enroll list/approve/reject` CLI. Depends on S1 wire only.
- **S5 docs+ops**: docs / CLAUDE.md / Caddyfile.tmpl path split + changelog. Coordinator stages last after S1-S4 reach review (docs match actual implementation).

Merge order: S1 → S2 → S3 → S4 → S5. Coordinator runs typecheck + focused tests after each merge; full E2E (workstation aiw OTP → server aim approve → chat round-trip) after S5 lands.
