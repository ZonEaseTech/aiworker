# TODO-007 Polish Worker Admin validation UX from local worker testing

- **status**: pending
- **priority**: P3
- **owner**: unassigned
- **createdAt**: 2026-05-02 20:39
- **discoveredAt**: 2026-05-02 20:34

## Description

Collect lower-priority Worker Admin UX polish items found during local
real-machine testing. These are not release-blocking by themselves, but fixing
them would make the admin surface clearer and less noisy during operator
validation.

## Scope

1. Config no-op saves: clicking `Save config` with no user-visible changes
   bumped config version and reloaded the runtime. The UI should disable the
   action or show "no changes" instead of creating a reload event.
2. Empty brain test semantics: with zero configured brain sources, `Test brain`
   returned a `healthy` row. The page should show `not configured`/empty state
   or explain aggregate health clearly.
3. Cron metadata readability: disabled cron CRUD worked, but list metadata
   rendered separators tightly around labels such as `account`/`next`/`last`.
   Add spacing or structured labels for scanability.

## ActiveForm

Pending UX polish task seeded from QA-002 findings.

## Dependencies

- **blocked by**: none
- **blocks**: none
- **relates to**: QA-002, FEAT-035

## Acceptance Criteria

1. No-op config saves do not bump config version or reload the runtime.
2. Brain test output distinguishes "no sources configured" from "healthy
   configured sources".
3. Cron list metadata remains readable at desktop and mobile widths.
4. Focused Web tests or component-level tests cover the changed UI states.

## Notes

- 2026-05-02 20:39 Secrets CRUD, disabled Cron create/delete, Approvals empty
  state, and mobile navigation smoke all passed in the local validation pass.
