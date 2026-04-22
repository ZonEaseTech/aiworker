# FEAT-014 Three-tier ExecutorConfig and frontend picker

- **status**: completed
- **priority**: P1
- **owner**: BKD subtask geb8ycbp
- **createdAt**: 2026-04-22 09:20
- **completedAt**: 2026-04-22 18:10

## Description

Formalize the `ExecutorConfig` schema into a three-tier shape modelled on
vibe-kanban's `ExecutorProfileId + ExecutorConfig`:

1. **Engine** — `'http' | 'claude-code' | 'acp' | 'codex' | 'cursor' | 'mcp' | 'cli'` (+ future).
2. **Variant** — a named preset per engine, e.g. `claude-code-default`,
   `claude-code-opus-plan`, `acp-gemini-yolo`, embedded in a frozen
   `default_profiles.ts` and overridable via the user's `worker_config`.
3. **Per-request overrides** — `modelId`, `reasoningId`, `permissionPolicy`
   flattened on top.

A universal `CmdOverrides { binary?, extraArgs?, env?, cliVersion? }` is
`Object.assign`-merged into any engine that spawns a binary. Variant bodies
are full zod-validated engine-specific configs; the user-visible worker
config stores only the diff from defaults.

Acceptance:

- `packages/shared/src/fleet/executor.ts` (new) owns the three-tier shape;
  `packages/shared/src/fleet/config.ts` keeps a re-export shim only.
- `apps/api/src/worker/executor/default-profiles.ts` embedded as code (no
  external JSON fetch).
- `worker_config.configJson` migration: existing `{type:'http',...}` entries
  are auto-upgraded to `{engine:'http', variant:'default', overrides:{}}` on
  boot; old shape retained as readable for one release then removed.
- Frontend `ExecutorSection` replaced with a two-step picker:
  engine → variant, plus per-variant form generated from the variant's zod
  schema (lean: one zod-to-form mapper, no dynamic-schema library).
- Model list for each engine is static in FEAT-014 (hard-coded in
  `default-profiles.ts`); remote discovery (vibe-kanban's `discover_options`
  stream) is not in scope.
- `handleExecutorTest` tiny-probe accepts the new shape.

## ActiveForm

Formalizing the three-tier executor configuration and rebuilding the frontend picker.

## Dependencies

- **blocked by**: FEAT-011, FEAT-012 (at least one engine variant must exist
  to give the picker meaningful content)
- **blocks**: FEAT-016 (Codex / Cursor variants are easier once variants
  exist), FEAT-015 (per-engine slot quotas need variant metadata)

## Notes

- Related plan: `docs/plan/PLAN-007.md`.
- Frontend keeps React 19 + shadcn/ui + Base UI per `CLAUDE.md` rules; no
  headless state library outside existing stack.
- Config migration is write-one-way only (config version bump tracked via
  the existing `If-Match` / version mechanism on `PUT /config`).

### Implementation notes (2026-04-22 18:10)

Landed as `bkd/geb8ycbp` commit `0a4c0a3`, merged to main in `a72472d`.
38 files, +1987 / -439. Subtask self-review passed with no P0/P1 remaining.

Key design decisions:

1. **`ExecutorProfile = {engine, variant, overrides?, modelId?, reasoningId?, permissionPolicy?}`** — three-tier shape lives in `packages/shared/src/fleet/executor.ts`; `packages/shared/src/fleet/config.ts` is now a thin re-export shim.
2. **`DEFAULT_PROFILES` embedded in api worker** — `apps/api/src/worker/executor/default-profiles.ts`. `shared` exports only types; catalog stays server-side so ops preset tweaks don't force a shared rebuild.
3. **Legacy-shape migration is reader-only** — `migrateLegacyExecutor()` runs in `bootstrap/config.ts` when reading `worker_config.configJson`; never written back. Old clients `PUT`ing flat shape get 400. Reader compatibility stays for one release then drops.
4. **Secret paths rewired to `overrides.{apiKey,token}`** — `DEFAULT_PROFILES` store empty-string placeholders for secret fields; actual values always live in `overrides` + `SecretsVault`. Redact / hydrate / secret-paths all follow the new path.
5. **`CmdOverrides` at `overrides.cmd`** — `{binary?, extraArgs?, env?, cliVersion?}`. Factory merges `cmd` into the effective engine config, so engine modules (`claude-code`, `acp`) see a merged shape and remain oblivious to the profile layer.
6. **Frontend two-step picker + lean zod→form mapper** — `executor-section.tsx` rewritten; `executor-form.tsx` handles `z.string / z.number / z.boolean / z.enum / z.array<string> / z.record<string,string>` with a JSON-textarea fallback. No new headless-UI library; stays on shadcn/ui + Base UI. Advanced panel collapses `CmdOverrides` + per-request overrides. Payload on save only ships `{engine, variant, overrides?, modelId?, reasoningId?, permissionPolicy?}` — never the full variant body.
7. **Engine switch clears `overrides`** — prevents cross-engine body keys from being merged into a new variant body by accident.
8. **`apps/web` gains `zod` dep** — needed by `executor-variants.ts` to keep a frontend-side schema catalog. A P3 note: the web catalog's zod schemas and the api-side `DEFAULT_PROFILES` TS interfaces are two sources of truth; FEAT-016 should lift them into `shared` and dedupe.

Incidental: all 6 pre-existing main-baseline lint errors were auto-fixed by the subtask (yaml plain-scalar in `.github/workflows/build-image.yml`, import order in `apps/api/src/modes/dashboard.ts`, quote style in `scripts/deploy.ts`). These are pure eslint `--fix` changes with zero semantic impact and are kept on-merge. New baseline is **0 lint errors** — future FEATs must maintain that.

Verification (coordinator-run after merge):

- `bun run typecheck` — shared / api / web all green.
- `bun test` — shared 10 / 10 (+3), api 338 / 338 (+19), web 23 / 23 (+6).
- `bun run lint` — **0 errors** (baseline cleared by subtask).
