# PLAN-347 Headless profile promotion CLI and shared draft validation

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-17
- **approvedAt**: 2026-05-17
- **completedAt**: 2026-05-17
- **relatedTask**: TODO-046

## Context

`QA-036 / PLAN-346` proved profile promotion through
`LocalWorkerRuntime.promoteProfileRevision(...)`, but headless use still needed
a one-off runtime script. The reusable `aiworker-profile-readme` extraction
logic is currently local to Worker Web, and the core promotion path can still
fall back to full artifact markdown when callers omit `profileMarkdown`.

The active architecture boundary remains:

- Soul App owns profile meaning and artifact schemas.
- Host/CLI/runtime may provide a generic product promotion mechanism for a
  reviewed artifact into workspace `README.md`.
- Shared validation may reject proposal-state language in a generic accepted
  README draft, but it must not interpret HR facts.

## Proposal

1. Add a browser-safe shared helper in `packages/shared` that:
   - extracts `aiworker-profile-readme` fenced drafts,
   - validates accepted-profile markdown for empty content and proposal-state
     phrases such as `promotion requested` and `pending human review`,
   - prepares promotion markdown with configurable fenced-draft requirements.
2. Use the shared helper in Worker Web instead of the local fence extractor.
3. Use the shared helper in `LocalWorkerRuntime.promoteProfileRevision(...)` as
   a final safety net before writing `README.md`.
4. Add `aiworker profile promote` to the CLI:
   - default path reads the artifact and requires a clean fenced draft,
   - `--profile-markdown <path>` allows an explicitly reviewed markdown file,
   - supports `--verdict pass|warn`, `--finding`, `--risk`, and `--tag`.
5. Sync `docs/cli.md`, PMA docs, and changelog.
6. Re-run focused automated gates and several isolated debug rounds:
   - successful fenced artifact promotion,
   - missing-fence rejection,
   - pending-review language rejection,
   - explicit reviewed markdown path promotion.

## Scope

- `packages/shared/src/profile-promotion.ts`
- `packages/shared/src/profile-promotion.test.ts`
- `packages/shared/src/index.ts`
- `packages/core/src/worker/runtime.ts`
- `packages/core/src/worker/runtime.test.ts`
- `apps/cli/src/aiworker.ts`
- `apps/cli/src/aiworker.test.ts`
- `apps/web/src/worker/worker-studio.tsx`
- `apps/web/src/worker/__tests__/worker-studio.test.tsx`
- `docs/cli.md`
- PMA/changelog files

## Risks

- Tightening core validation may reject old artifacts whose accepted profile
  markdown still contains proposal-state language. This is intended for
  promotion safety, and callers can revise the profile draft before promotion.
- CLI should not become HR-specific. The command operates on a generic accepted
  profile draft and leaves domain meaning to the Soul App.
- Explicit `--profile-markdown` can bypass the fenced artifact requirement, so
  it must still run the same accepted-profile validation.

## Verification

- Shared helper tests cover extraction, missing fence, explicit markdown, and
  proposal-state rejection.
- Runtime tests prove fenced artifact promotion writes only the accepted draft
  and rejects both missing-fence artifact promotion and proposal-state markdown.
- CLI tests prove success, missing fence rejection, pending-state rejection, and
  explicit markdown promotion.
- Worker Web focused test confirms profile promotion still sends the extracted
  accepted draft.
- API focused test confirms invalid promotion drafts return
  `PROFILE_REVISION_REJECTED` rather than an internal error.
- Final debug rounds ran under isolated `AIWORKER_HOME` roots:
  - deterministic success / missing-fence / pending-state / explicit-markdown
    matrix: `tmp/hr-profile-promote-debug-20260517151429`;
  - real Codex two-turn HR profile session and promotion:
    `tmp/hr-profile-promote-real-20260517151507`.

## Outcome

The HR profile closure path now has a product-owned headless promotion command.
Native skills still only produce artifacts; promotion into the accepted
workspace `README.md` is handled by CLI/runtime/API/Web product surfaces with a
shared, generic accepted-profile README validator.
