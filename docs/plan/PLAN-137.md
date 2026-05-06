# PLAN-137 Accept approved OTP worker reconnects without reopening public /ws

- **status**: completed
- **createdAt**: 2026-05-06 13:31
- **approvedAt**: 2026-05-06 13:34
- **completedAt**: 2026-05-06 13:46
- **relatedTask**: BUG-080

## Context

`BUG-079` restored the missing public Caddy `/w*` route. During validation,
`w_8jbcm249cxn4` was no longer blocked by Caddy 404s, but its direct gateway
bridge returned `node_offline`.

Production evidence:

1. Fleet row exists for `w_8jbcm249cxn4`, `added_by='otp'`.
2. Caddy logs show repeated `/enroll-ws` WebSocket upgrades after reload.
3. Gateway audit repeatedly records `gateway.connect.rejected` with
   `wrong_path:expected_enroll_otp`, `role='node'`, and
   `path='/enroll-ws'`.

Code evidence:

1. `GatewayClient` sets `enrolledViaOtp=true` after `enrollment.approved` and
   omits the `enroll` block on reconnect.
2. The client keeps using its configured URL, which is `/enroll-ws` in OTP
   mode.
3. `authorizeConnection()` rejects all non-OTP frames on `/enroll-ws` before
   normal auth handling.

## Proposal

Allow `/enroll-ws` to serve two narrow cases:

1. New OTP submit: connect frame has `enroll.mode='otp'`; current behavior
   remains unchanged.
2. Existing OTP-approved node reconnect: connect frame has no `enroll` block,
   `role='node'`, the worker exists in `registered_workers`, and
   `auth.token` matches the encrypted stored worker token.

The second path must not use loopback bypass, because Caddy forwards
`/enroll-ws` from public traffic to gateway loopback. It must validate the
registered worker token explicitly before entering `NodeRegistry`.

## Risks

1. Accidentally allowing arbitrary node connect on `/enroll-ws` would let an
   unauthenticated public caller impersonate workers. Token validation against
   `registered_workers` is mandatory.
2. Reusing `AIWORKER_MASTER_KEY` for token validation must avoid logging or
   exposing decrypted tokens.

## Scope

- Gateway path/auth handling for `/enroll-ws` registered node reconnect.
- Focused gateway tests for accepted registered reconnect and wrong-token
  rejection.
- Gateway-client test updates only if the URL transition contract changes.

## Non-Goals

- Do not require worker deployers to hold Caddy Basic Auth.
- Do not remove `/enroll-ws` OTP submit behavior.
- Do not loosen `/ws` external auth.

## Verification

- Focused gateway auth/enroll tests.
- Focused local gateway-client OTP reconnect test if needed.
- Remote smoke: `w_8jbcm249cxn4` reconnects and
  `/w/w_8jbcm249cxn4/api/worker/info` returns 200.

## Progress

- 2026-05-06 13:34: User approved fixing BUG-080.
- 2026-05-06 13:41: Implemented gateway registered OTP reconnect auth with
  focused handshake regressions.
- 2026-05-06 13:44: Deployed fixed CLI bundle to `aiwork` gateway host and
  restarted `aiworker-gateway.service`.
- 2026-05-06 13:44: Fleet audit records `gateway.connect.accepted` for
  `w_8jbcm249cxn4` via `registered-worker-token`.
- 2026-05-06 13:44: Direct gateway bridge `/w/w_8jbcm249cxn4/api/worker/info`
  returns `200`.
