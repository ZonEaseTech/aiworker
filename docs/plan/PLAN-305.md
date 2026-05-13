# PLAN-305 Soul App protocol interaction closure

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-14 00:00
- **relatedTask**: FEAT-073

## Decision

Implement the local-first protocol interaction closure defined in
`docs/superpowers/specs/2026-05-14-soul-app-protocol-interaction-closure-design.md`.

Host owns lifecycle, declaration validation, scope and mounted invocation. Soul App
owns protocol action/search behavior and result meaning.

## Implementation Slices

1. Shared protocol result typing.
2. Host action/search API routes.
3. HR/QA mounted protocol handlers.
4. Worker Web action/search UX.
5. PMA closeout and verification.

## Verification Plan

- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-api' test src/modes/worker.local.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-hr' test`
- `bun run --filter '@zonease/aiworker-qa' test`
- `bun run --filter '@zonease/aiworker-hr' validate`
- `bun run --filter '@zonease/aiworker-qa' validate`
- `bun run --filter '@zonease/aiworker-hr' smoke`
- `bun run --filter '@zonease/aiworker-qa' smoke`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- browser smoke on `http://localhost:5173/`
- `git diff --check`
- `bun run crg:update`
- `bun run crg:review`

## Result

Completed. Host now exposes generic local action/search routes for app-declared
shell descriptors, validates app lifecycle and manifest declarations before
invocation, and forwards behavior to mounted Soul App protocol routes.

HR and QA implement app-owned mounted protocol handlers for action and search.
Worker Web renders shell actions and app search from descriptors without
HR/QA-specific branches. Browser smoke verified the real HR flow: primary action
returned the HR app message, and shell search returned an HR app-owned result.

`crg:review` exited 0 with static private-helper test gaps. The affected mounted
helper paths are covered through HTTP-level HR/QA mounted-service tests plus
Host/Web protocol endpoint tests.
