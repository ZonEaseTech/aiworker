# PLAN-216 Production-grade Worker Web localization

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 11:54
- **relatedTask**: FEAT-059

## Current State

Worker Web is a focused React/Vite app under `apps/web/src/worker`. It already
loads `settings.language` from `/api/local/settings` and persists language
changes through the same settings endpoint. The current implementation does not
use an i18n provider or locale catalog. Static interface copy is embedded inside
`worker-studio.tsx`, while built-in Soul and capability-template records come
from `packages/shared/src/vertical-soul.ts`.

Important constraints from the current product direction:

- the first screen must stay a vertical Soul workspace, not a developer
  dashboard or Open Design clone;
- Settings language belongs to local workspace configuration;
- external executor, MCP, connector, and BYOK boundaries must remain explicit;
- this is pre-1.0, so unpublished compatibility aliases are not required.

## Proposal

1. Add a small typed Worker Web localization layer in `apps/web/src/worker`
   rather than introducing a global dependency-heavy framework for one app
   surface.
2. Create complete locale catalogs for `en`, `zh-CN`, `ja`, and `de`, covering
   the Worker Studio shell, Settings, form labels, empty states, status labels,
   accessibility labels, and language names.
3. Route UI shell text through a translator derived from `data.settings.language`;
   update `document.documentElement.lang` and fall back to English for unknown
   saved values.
4. Keep domain records from the local API as product data, but localize known
   built-in Soul/template display fields through stable ids where needed for the
   visible catalog and cards.
5. Update focused tests so they verify English default rendering, Simplified
   Chinese switching through Settings, fallback behavior for an unknown locale,
   and rejection of stale import/work-order/Open Design copy.

## Scope

- `apps/web/src/worker`: localization module, Worker Studio text routing, tests.
- `packages/shared`: only if stable locale enums/types are needed for safer
  settings validation.
- `apps/api`: only if settings validation needs to reject or normalize unknown
  locale values; otherwise keep the current settings persistence contract.
- PMA docs and changelog updates for the delivered change.

## Out of Scope

- Translating generated artifacts, user project content, run output, connector
  names returned from team systems, or executor messages.
- Adding fleet/gateway localization.
- Replacing the current Worker Web layout or introducing a full app router.

## Risks

- A large in-component string replacement can make `worker-studio.tsx` harder to
  review if done mechanically. Keep the catalog typed and move text out in
  coherent groups.
- API-provided built-in records are currently English. Localizing them in the Web
  by id is acceptable for built-ins, but user-defined future pack content should
  remain data-driven.
- Japanese and German copy can expose text-length problems in compact controls.
  Browser validation must include the Settings dialog and core workspace layout.

## Verification

- `bun run --filter '@zonease/aiworker-web' test` passed.
- `bun run --filter '@zonease/aiworker-web' typecheck` passed.
- `bun run --filter '@zonease/aiworker-web' lint` passed with 0 errors and the
  existing five Worker Studio effect-setState warnings.
- `bun run --filter '@zonease/aiworker-web' build` passed, including
  `check:studio-css`.
- `bun run check` passed across all workspaces with 0 errors and the existing
  five Worker Studio effect-setState warnings.
- `bun run build` passed for API, Web, and CLI bundle.
- Browser validation passed for English, Simplified Chinese, Japanese, and
  German page states with matching `html lang` values, and Settings UI switching
  from German to Simplified Chinese updated the dialog and CTA immediately.
- `git diff --check` passed.
- code-review-graph update passed. CLI `crg:review` reported 0 affected flows,
  risk 0.55, and test gaps around helper/test symbols. MCP review context over
  the Worker Web files reported high risk due the central Worker Studio surface;
  focused tests and browser validation cover the localization behavior added in
  this plan.

## Implementation Status

Completed. Worker Web now has production-grade localized shell copy for the four
supported settings languages, uses the saved workspace language as the UI source
of truth, and preserves English fallback for unknown persisted language values.
