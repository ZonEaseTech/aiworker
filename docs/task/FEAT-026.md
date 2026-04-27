# FEAT-026 Worker OTP-attended enrollment (operator-approved join)

- **status**: completed
- **priority**: P2
- **owner**: (unassigned)
- **createdAt**: 2026-04-27 02:00
- **completedAt**: 2026-04-27 06:40

## Description

Add the **fourth** worker enrollment path on top of FEAT-024 self-enroll,
specifically for the *attended* / human-approval scenario:

| # | Path | Trigger | UX | When to use |
|---|------|---------|----|-------------|
| 1 | `aim pair --bootstrap-token wtk_...` | operator pulls a started worker | 手抓 token + 命令行 | 历史 / 高安全 |
| 2 | `aim workers launch` | gateway supervisor spawns docker container | operator 一行命令 | docker fast-launch |
| 3 | self-enroll (FEAT-024) | env `AIWORKER_JOIN_TOKEN` set | unattended | CI / k8s / 自动化 |
| 4 | **(new)** OTP-attended | worker shows 8-char code, operator approves via aim | attended, GitHub-Device-Flow style | 人工给客户/朋友/同事装 worker |

The user-facing pain that motivates path 4: **worker deployer should not
have to hold operator credentials**（FEAT-024 join token still leaks
"join any future worker as anyone" capability if shared widely; the
public Caddy basicauth credential is *operator-level* and should never
be handed to a worker deployer）。

### User flow (CLI-only, no web UI in this iteration)

```
─── workstation (worker side, deployer is e.g. a friend / customer / CI op) ───
$ aiw serve            # no JOIN_TOKEN, no --gateway flag → falls into OTP mode
i [aiw serve] requesting enrollment from wss://gateway.example.test/enroll-ws
i [aiw serve] OTP issued, show this to your operator:

     ┌──────────────────┐
     │   BX7P  -  K39M  │   expires in 4:58
     └──────────────────┘

i [aiw serve] waiting for approval ... (Ctrl-C to cancel)

─── server (operator side) ───
$ aim enroll list
{
  "pending": [
    { "otp": "BX7P-K39M", "displayName": "ben-laptop", "submittedAt": ..., "expiresAt": ... }
  ]
}

$ aim enroll approve BX7P-K39M
✔ enrollment approved
{
  "workerId": "w_xxx",
  "displayName": "ben-laptop"
}

─── workstation ───
√ [aiw serve] approved as w_xxx, deviceToken cached, joining fleet
√ [gateway-client] connected, node=w_xxx
```

### Acceptance criteria

1. `aiw serve` with **no** `--gateway` flag, **no** `AIWORKER_JOIN_TOKEN`,
   but with `AIWORKER_GATEWAY_URL` set → falls into OTP mode automatically.
2. Worker stdout displays OTP in `XXXX-YYYY` form (Crockford base32-ish,
   no ambiguous chars `0/O/I/1/l`).
3. `aim enroll list` returns all currently-pending OTPs across the gateway.
4. `aim enroll approve <otp>` writes fleet.db row with `addedBy='otp'` and
   pushes deviceToken back to the waiting worker via the same WS
   connection; worker upgrades from `node-pending` to `node`.
5. `aim enroll reject <otp>` cleans up pending entry, gateway closes the
   pending WS with code `4403 enroll:rejected`.
6. OTP expires after 5 minutes (configurable via
   `AIWORKER_ENROLL_OTP_TTL_SEC`, default 300).
7. OTP collision (rare with 40 bits but possible) → gateway re-rolls
   on submit, never returns dup OTP for the same fleet.
8. Worker reconnect after approval → uses cached deviceToken (apiToken
   minted by gateway and persisted to worker.db), **no re-enroll**.
9. Caddy front:
   - `/ws` keeps basicauth (operator + reconnecting worker via deviceToken)
   - `/enroll-ws` whitelisted (no basicauth) — only accepts `connect` frames
     with `role: 'node-pending'` + enroll-meta; everything else rejected.
10. Gateway path-aware authN refuses cross-path access (a `/enroll-ws`
    connection cannot escalate to operator; a `/ws` connection cannot
    submit OTP).
11. Documentation: architecture / deployment / cli updated; CLAUDE.md
    fleet-registration paths now lists 4 instead of 3.
12. Tests: gateway 6+ unit cases (submit/expire/approve/reject/dup
    OTP/cross-path); worker bootstrap test covering OTP fallback path.

## ActiveForm

Adding OTP-attended enrollment path

## Dependencies

- **blocked by**: PLAN-018 / FEAT-024 (this builds on the same
  connect-frame extension + path-aware authN groundwork)
- **blocks**: (none)

## Notes

This is the work item delivered by **PLAN-019**. Out of scope:
- Web SPA pending-list UI（用户明确不要本轮做）
- One-off `aim enroll mint --ttl 24h` style admin token issuing
- OTP rate-limiting per source IP（防爆破，PLAN-019 §Risks 提了，留 P3 follow-up）
