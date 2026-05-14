# Soul App mounted hardening and authoring readiness

## Goal

Complete the first five post-FEAT-066 follow-up items without publishing the
branch:

1. zero-trust review and fixes;
2. product-level Worker Web acceptance for mounted contributions;
3. SDK/runtime split;
4. mounted service security boundary hardening;
5. scaffold upgrade to the full standalone and host-mounted layout.

## Execution Plan

1. Add failing tests for the intended behavior:
   - manifest rejects remote mounted service URLs;
   - API proxy injects Host-owned app headers and token, strips caller
     credentials, and stops launched services on disable;
   - SDK package no longer declares Host runtime/DB dependencies;
   - runtime helpers are available from `@zonease/aiworker-soul-app-runtime`;
   - Worker Web shows mounted routes/panels/API prefix;
   - scaffold emits `src/standalone.ts`, `src/host-mounted.ts`, expanded
     scripts, and mounted service smoke evidence.
2. Split runtime helpers from `packages/soul-app-sdk` into
   `packages/soul-app-runtime`, leaving SDK as authoring/protocol/client only.
3. Harden manifest and Host mounted proxy:
   - loopback-only `localService.baseUrl`;
   - mount token generation and injection;
   - sensitive header stripping;
   - proxy timeout;
   - launched service cleanup on disable.
4. Update HR/QA tests and package dependencies to import runtime helpers from
   the new runtime package while app code stays on SDK.
5. Update Worker Web Soul Apps panel and focused tests for mounted contribution
   visibility.
6. Upgrade CLI scaffold and focused tests so generated apps match the app-level
   layout and smoke both modes.
7. Run focused package gates, then root gates, code-review-graph update/review,
   sync PMA completion records, and create one conventional commit.

## Constraints

- Do not publish the branch or open a PR.
- Keep the current Host / Soul App dual-autonomy semantics.
- Do not re-center the product on developer-only work orders or old governance
  control-plane concepts.
- Keep app source inside public SDK imports; runtime imports are for tests and
  local shell harnesses only.
