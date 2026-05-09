# PLAN-188 Fleet case summary projection

- **status**: pending
- **owner**: unassigned
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
