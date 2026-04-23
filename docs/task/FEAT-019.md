# FEAT-019 Model picker with known-model catalog per engine

- **status**: completed
- **priority**: P1
- **owner**: ben
- **createdAt**: 2026-04-23 06:05
- **completedAt**: 2026-04-23 06:20

## Description

Today each engine's `model` field in the variant form is a free-text input.
That makes it easy to typo a model name (`gpt-4o` vs `gpt-4o-mini`) and
gives no discoverability for operators who don't read the CLI docs.

Add a per-engine `knownModels: string[]` in `DEFAULT_PROFILES`; the
frontend form renderer picks it up and shows a `<Select>` with those
options plus a trailing "custom…" entry that falls back to the existing
text input. Engine-switch clears the selection as before.

Acceptance:

- `apps/api/src/worker/executor/default-profiles.ts` gains a
  `knownModels` array on every engine (http / claude-code / acp-gemini /
  acp-qwen / codex / cursor). Values reflect the model strings the upstream
  CLI accepts as of 2026-04. Keep the list short (top 5) — this is a
  convenience catalog, not a spec.
- `apps/web/src/features/workers/components/config-editor/executor-variants.ts`
  mirrors the catalog for the frontend zod schemas + picker metadata.
- `apps/web/src/features/workers/components/config-editor/executor-form.tsx`
  detects `knownModels` on a field's metadata and renders a `<Select>` with
  the known entries plus `custom…`. Selecting `custom…` reveals a free
  text `<Input>`; switching back to a known model clears the custom value.
- Engine-switch invalidates `modelId` as it does today.
- Tests:
  - `executor-variants.test.ts` — every engine's `knownModels` non-empty,
    strings match the format the upstream CLI expects.
  - `executor-section.test.tsx` — selecting a known model writes the right
    `modelId`; selecting "custom…" reveals the text input; custom value
    survives within the same session but clears on engine change.
- Lint baseline stays 0. Tests: shared 18, api 429, web 32 + new cases.

## ActiveForm

Adding per-engine known-model catalogues and a typed picker.

## Dependencies

- **blocked by**: (none)
- **blocks**: (none — FEAT-020..022 are independent)

## Notes

- Related plan: `docs/plan/PLAN-009.md`.
- Keep the catalogue server-side authoritative; the web catalog mirrors
  it. FEAT-014 already flagged "two sources of truth" as a P3 — this
  task does not close that gap, it grows both.
- `custom…` stays in the enum so zod parsing is one discriminated union,
  not two.
