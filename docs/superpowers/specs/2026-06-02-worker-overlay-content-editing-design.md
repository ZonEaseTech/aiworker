# Worker-config overlay content editing — design (2026-06-02)

Follow-up feature after the v1 worker-owns-workbench refactor (Phase-B). Lets an
employee SEE and EDIT the full content of a Soul's projected skills and entry files
(and VIEW MCP files) from the worker Workbench, while keeping the canon
worker-config-envelope secret/storage boundary intact.

## Constraint reaffirmed (kept, user-confirmed)

The worker-config envelope (`configValueJson` in Worker metadata) must NOT contain
full skill bodies, full entry-file contents, or full native MCP files (canon,
`docs/protocol.md` Configuration). Full content lives in FILES; the envelope holds
only `sourceRef` + `checksum`. This does not block view/edit — content is read from
and written to files; the envelope just references them. It is the secret boundary
(MCP files may contain literal secrets that must never reach DB metadata).

## Section 1 — Content store + scope (APPROVED)

- Worker-overlay content files live under the worker home, sibling of `workspaces/`:
  `<aiworker-home>/workers/<workerId>/overlays/<kind>/<name>` where
  `kind ∈ { skills, mcp, entry-files }`. Worker-owned (not the Soul dist, not a
  single workspace).
- New `sourceRef` scheme `worker-overlay://<kind>/<path>` (vs the baseline
  `descriptor://engine/...`). `engine-projection` resolves by scheme:
  `descriptor://…` → from the Soul dist (baseline); `worker-overlay://…` → from the
  worker overlay store. Projection input gains an `overlayRoot`
  (= `<worker-home>/overlays`).
- Scope = WORKER-level: an overlay edit applies to ALL of the worker's workspaces
  on projection (canon worker-scoped overlays). Confirmed: edit once, applies to all
  workspaces.
- Envelope holds only `kind/target/enabled/sourceRef(worker-overlay://…)/checksum`.
  No bulk content ever.

## Section 2 — Read/Write API (APPROVED)

On top of the existing `GET /api/workers/:id/config` (lists overlay assets):

- `GET /api/workers/:id/config/:configKey/content?target=…`
  → `{ content, source: 'baseline'|'overlay', checksum, editable }`. No overlay →
  baseline (Soul dist) content; overlay present → the worker's edited content. MCP
  content is redacted on display (canon).
- `PUT /api/workers/:id/config/:configKey/content` body `{ content, target? }`:
  daemon writes `content` to `<worker-home>/overlays/<kind>/<name>`, computes the
  checksum, upserts the overlay envelope (`sourceRef=worker-overlay://…`, checksum,
  `enabled=true`, `updatedBy`), then re-projects. ADD = PUT to a new `configKey`
  (`skill-overlay:<name>` / `entry-file-overlay:<name>`) → additive overlay.
- Content travels only in the request body (transient) → written to a file; it never
  enters the envelope. Canon constraint holds.
- **MCP = Option A: view-only.** Skills + entry-files are editable (view + override +
  add). MCP is read-only (redacted view), no PUT. (Avoids the redact-then-overwrite
  secret-loss problem; revisit later if needed.)
- Reuse the existing literal-secret rejection at the settings/config layer for any
  editable content path.

## Section 3 — Editing UI (worker-web) (APPROVED)

In the existing Worker config dialog (`worker-configuration-dialog.tsx`):

- Each asset row, beside its enable toggle: skill / entry-file rows get a
  `View / Edit` action; MCP rows get `View` only.
- Content editor = a dialog built from `packages/ui` primitives (shadcn): a
  monospace `textarea` prefilled with the effective content (GET content); a
  `source: baseline / overlay` indicator; actions `Save` (PUT → write file +
  re-project + refresh) and `Reset to baseline` (delete the overlay → Soul default).
  No code editor (Monaco/CodeMirror) in v1 — a textarea is enough; upgrade later.
- MCP editor = read-only, redacted.
- `+ Add skill` / `+ Add entry-file` on the panel → name + content → new overlay.
- All UI uses `packages/ui` primitives (AGENTS.md); no ad-hoc component system.

## Section 4 — i18n "Soul Apps" wording cleanup (deferred #2)

Replace the residual retired-flow "Soul Apps" / "app-owned work" wording in the
worker-web i18n locales (en/de/ja/zh-CN) and update `local-shell-copy.test.ts` which
currently pins those strings. Mechanical; folded into this feature's implementation.

## Verification

`typecheck` / `docs:check` / `lint` / `test:contracts` / `build` / full `test` green;
new package tests for the projection scheme resolution, the content GET/PUT routes
(incl. MCP-view-only + redaction + literal-secret rejection), and the worker-web
editor; standalone smokes green.

## Status / follow-up

IMPLEMENTED + architect-APPROVED (commits d38851e5 F1, 03c80632 F2, 05f8ffbe F3,
a1f4b6cd F4). Secret boundary verified end-to-end (content only in files, never the
envelope; MCP view-only GET-redacted + PUT-rejected; literal secrets rejected;
traversal rejected; descriptor:// baseline byte-identical).

Follow-up (architect nit) — RESOLVED (commit 19d0351b): F1 had added the
`worker-overlay://` scheme resolution to `projectEngineAssets` in
`packages/engine-projection/src/index.ts` — but that function is the
projection-CONTRACT-tested one and is NOT the live runtime path (the runtime uses
`projectEngineAssetsToWorkspace` in `workspace-projection.ts`, which has its own
content-driven worker-overlay handling). So the F1 addition was a runtime-dead
duplicate. It was removed (`index.ts` is now byte-identical to its pre-F1 baseline
plus F2's re-exports) and its `worker-overlay-projection.test.ts` deleted. There is
now ONE `worker-overlay://` implementation (the live `workspace-projection.ts` path);
the shared `parseWorkerOverlaySourceRef` parser and fs-layout resolver are untouched.
(A deeper PRE-EXISTING smell remains, out of scope: the projection contract tests
exercise `projectEngineAssets` while the runtime uses `projectEngineAssetsToWorkspace`
— the two projection engines should be unified in a dedicated future effort.) Pre-existing (out of this feature's scope): the MCP literal-secret
guard asymmetry in `workspace-projection.ts` (overlay branch asserts, baseline-copy
branch does not) — the new `/content` PUT path rejects MCP entirely, so this feature
neither introduces nor widens it.
