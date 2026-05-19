# FEAT-103 Session activity pipeline and composer media previews

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-19
- **claimedAt**: 2026-05-19
- **completedAt**: 2026-05-19
- **plan**: PLAN-377
- **relatesTo**: FEAT-102, FEAT-101, FEAT-100

## Background

`FEAT-102` extracted the shared Session Kit into `packages/component`, but the
session chat still renders engine/tool events too literally. Codex CLI tool use
can appear as heavy `Bash` cards with raw command output promoted above the
human-readable activity narrative. The default composer also needs the next
shared media step: file and image attachments with lightbox preview for images.

The approved design in
`docs/superpowers/specs/2026-05-19-session-activity-pipeline-design.md` defines
a parser-led Session Activity Pipeline. V1 targets Codex CLI events and keeps a
generic fallback for future engine formats.

## Acceptance Criteria

- Shared `SessionComposer` supports file rows, image thumbnail rows and image
  lightbox preview through package-owned UI.
- Default composer action bar remains minimal and does not expose settings,
  model, MCP, skill or slash controls.
- Shared session view-model helpers support parser options, including a V1
  Codex CLI activity classifier.
- Codex CLI tool/status events render as human-readable activity rows rather
  than primary `Bash Bash done` cards.
- Unknown tool or engine events render through a generic fallback and retain raw
  details.
- Assistant text in `SessionTimeline` renders through shared markdown/GFM
  preview.
- Host Web session chat opts into the Codex CLI parser without changing Host/Soul
  protocol or storage schema.
- HR right-panel material upload remains working.
- Focused component and Worker Web tests cover composer media previews,
  activity parsing/rendering and retained raw evidence.
- UI governance, browser smoke and code-review-graph review pass before closure.

## Notes

- This task does not implement Claude Code or other engine-specific activity
  parsers.
- Host remains a generic session activity renderer and must not infer HR profile
  or QA review semantics.

## Completion

Session Kit now includes the V1 Session Activity Pipeline:

- Shared composer attachment rows support image thumbnails and package-owned
  lightbox preview.
- Generic workspace session creation and the HR profile composer can attach
  source files/images through the shared composer.
- HR material prompts keep candidate-profile wording, while generic Host
  workspace sessions use source-material wording.
- `normalizeSessionEvents(events, { parser: 'codex-cli' })` classifies Codex CLI
  shell/tool events into readable activity rows.
- Unknown commands and future engine shapes fall back to generic command/tool
  activity while preserving raw evidence.
- `SessionTimeline` renders assistant text with shared markdown preview and
  renders activity rows/groups instead of primary `Bash` tool cards.
- Real browser smoke on an existing Codex-backed HR session showed `Searched
  files` activity rows with command evidence retained in details.

Verification completed:

- `bun run --filter '@zonease/aiworker-component' test src/patterns/patterns.test.tsx`
- `bun run --filter '@zonease/aiworker-component' typecheck`
- `bun run --filter '@zonease/aiworker-web' test src/worker/__tests__/worker-studio.test.tsx`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run ui:check`
- `git diff --check`
- Browser smoke with screenshot saved under `tmp/session-activity-pipeline-session-v2.png`
