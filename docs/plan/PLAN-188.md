# PLAN-188 Fleet case summary projection

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-09 05:55
- **task**: FEAT-057

## Context

Fleet should answer which worker is doing what and whether cases need review,
without copying worker Brain payload into `fleet.db`.

## Proposal

Expose worker-owned case summaries through the existing gateway bridge and keep
Fleet state limited to worker pointers, presence, audit, and summary metadata.

## Scope

- Gateway bridge route/method for case summary.
- Fleet UI summary if required after Worker UI lands.
- No central copy of full Case File, transcript, or Brain memory.

## Risks

- Pulling full case payloads into Fleet would violate the data-plane boundary.
- Remote worker offline behavior must be explicit.

## Verification

- Gateway bridge tests.
- Fleet does not persist full Case File payload.

## Notes

- 2026-05-09 06:45：完成 worker HTTP bridge 的 Case allowlist：Fleet-hosted Worker
  Admin 可通过 `/w/:workerId/api/worker/cases*` 调用 `cases.list/show/rerun` 与
  `cases.lessons.propose`。实现只做 transit bridge，不写 `fleet.db`，也不把 full
  Case File 复制成 Fleet 控制面状态。
