# PLAN-304 Host platform locator and capability shell boundary

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-13 20:00
- **relatedTask**: FEAT-072

## Current State

The current architecture has moved toward Host / Soul App dual autonomy, but parts of
runtime, API and Web still make artifact/review/memory feel Host-owned. The approved
design in `docs/superpowers/specs/2026-05-13-host-platform-locator-capability-shell-design.md`
defines Host as platform locator, capability broker and shell contract.

## Decision

Implement an explicit protocol-first boundary:

```text
Host platform capabilities -> permissioned protocol call -> Soul App domain result
```

Host may render or cache protocol-exposed views, but the Soul App remains authoritative
for domain state and domain meaning.

## Implementation Slices

1. Sync PMA, architecture docs and Soul App developer skill.
2. Add shared descriptor schemas for shell, protocol views, search and non-authoritative summaries.
3. Project descriptors into Host catalog without adding domain-specific semantics.
4. Render Worker Web shell slots from descriptors.
5. Update HR/QA reference apps and smoke tests.

## Verification Plan

- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `aiworker app validate apps/aiworker-hr`
- `aiworker app validate apps/aiworker-qa`
- `aiworker app smoke apps/aiworker-hr`
- `aiworker app smoke apps/aiworker-qa`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

Implemented Host as platform locator and capability shell for the current Soul App
contract. Manifest and protocol descriptors now carry app-owned shell actions,
search providers and protocol view summaries; Host catalog projection copies those
descriptors without domain interpretation. HR and QA declare their own shell
intent, mounted descriptors identify `authority: soul-app`, and Worker Web renders
declared shell slots without owning HR/QA action semantics.

`aiworker app validate/smoke` was not available on the PATH in this shell, so the
equivalent repository package scripts were used: `bun run --filter
'@zonease/aiworker-hr' validate/smoke` and `bun run --filter
'@zonease/aiworker-qa' validate/smoke`.

Verification passed: focused shared/core/API/Web/HR/QA tests and typechecks,
HR/QA validate and smoke, root typecheck/lint/test/build, `git diff --check`,
browser smoke on `http://localhost:5173/`, and code-review-graph.
