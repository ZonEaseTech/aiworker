# FEAT-014 Three-tier ExecutorConfig and frontend picker

- **status**: pending
- **priority**: P1
- **owner**: (unassigned)
- **createdAt**: 2026-04-22 09:20

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
