# FEAT-024 Worker self-enrollment via shared join token

- **status**: pending
- **priority**: P2
- **owner**: (unassigned)
- **createdAt**: 2026-04-26 17:50

## Description

Add a third worker registration path alongside the existing two:

| # | Path | Trigger | Inbound to worker required? |
|---|------|---------|----------------------------|
| 1 | `aim pair --bootstrap-token wtk_...` | operator pulls a started worker into fleet | **yes** (gateway → worker `/info`) |
| 2 | `aim workers launch` (supervisor overlay) | gateway's docker supervisor spawns worker locally | n/a (same host) |
| 3 | **(new)** worker self-enroll | worker dials gateway with `AIWORKER_JOIN_TOKEN`, gateway accepts and writes fleet.db | **no** |

Path 3 unblocks the inverted topology validated on 2026-04-26: worker on
the workstation, operator (`aim`) on the server. Today that scenario
needs an SSH reverse tunnel so gateway can dial worker `/info` for path
1. With self-enroll the worker only needs **outbound** WS access — the
common shape for any worker behind NAT, firewall, or a residential
network.

This pattern (agent self-enroll via shared join token) is the standard
in `kubeadm join`, Nomad client join, Datadog agent, Telegraf, etc. The
existing operator-pull pair stays available for high-security flows
that require explicit operator approval per worker.

### Acceptance criteria

1. A worker started with these env vars and **no** further operator
   action joins fleet automatically:
   ```
   AIWORKER_GATEWAY_URL=ws://gateway-host:3000/ws  # or wss://...
   AIWORKER_JOIN_TOKEN=<shared secret matching gateway side>
   AIWORKER_DISPLAY_NAME=prod-1                    # optional
   ```
2. `aim workers list` shows the new worker as `online: true`,
   `displayName: prod-1`, `addedBy: self-enroll` within 5 s of `aiw serve`
   start.
3. Wrong / missing `AIWORKER_JOIN_TOKEN` → gateway closes WS with
   `4401 auth:join_token_mismatch`, fleet.db unchanged, `audit_events`
   records `gateway.connect.rejected` with `reason='join_token_mismatch'`.
4. Re-enrolling the **same** workerId (e.g. worker restart) → idempotent;
   fleet.db row updated (lastSeenAt) not duplicated; no
   `already_registered` error in this code path.
5. Quota check (`AIWORKER_MAX_WORKERS`) still enforced; over quota →
   `4401 auth:quota_exceeded`.
6. The existing `workers.pair` and `workers.launch` flows continue to
   work unchanged.
7. The new code path emits `gateway.worker.enrolled` audit row with
   `detail.workerId` / `detail.displayName` / `detail.deviceId`.
8. `aim workers remove` invalidates the joined worker (close WS +
   delete fleet row), as today.
9. Documentation:
   - `docs/architecture.md` § "身份与配置自举" lists the third path.
   - `docs/deployment.md` adds a "Worker self-enroll quick start" snippet.
   - `docs/cli.md` mentions the new env trio for `aiw serve`.
   - CLAUDE.md hard-rule for fleet registration paths is updated to
     include self-enroll.
10. Tests:
    - `apps/gateway/test/`: new `enroll.test.ts` covering happy path,
      wrong token, quota exceeded, reconnect (idempotent).
    - `packages/core/src/worker/bootstrap/`: a unit test that asserts
      self-enroll is attempted iff `AIWORKER_JOIN_TOKEN` is set.

## ActiveForm

Adding worker self-enrollment via shared join token

## Dependencies

- **blocked by**: (none — purely additive feature)
- **blocks**: future "join token rotation" / "one-off OTP" tasks (see
  PLAN-018 alternatives)

## Notes

This is the work item delivered by **PLAN-018**. Keep this task scoped
to the minimum viable self-enroll; rotation, OTP TTL, and reconnect
apiToken hardening are explicitly out of scope and tracked separately
when the time comes.
