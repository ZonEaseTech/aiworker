# REFACTOR-043 Settings full implementation

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 10:30
- **claimedAt**: 2026-05-10 10:30
- **completedAt**: 2026-05-10 10:46
- **plan**: PLAN-210
- **relatesTo**: Open Design settings reference, apps/api, apps/web

## Background

Settings needed Open Design-level information architecture and interaction
completeness without copying Open Design product copy, visual shell, or design
domain.

## Goal

Ship a real AIWorker configuration dialog with persisted execution mode,
engines, connector entries, MCP entries, language, appearance, autosave, close
and reopen behavior, plus engine Test and Rescan actions.

## Acceptance Criteria

- Settings is opened by an explicit settings button and is not shown by default.
- Local CLI and BYOK execution modes are selectable and saved.
- Engine/provider selection shows installed/uninstalled state.
- Test and Rescan actions call real local API endpoints.
- Connectors, external MCP, local MCP, language, and appearance settings save.
- UI copy is AIWorker-specific and contains no Open Design/Nexu/design generation text.

## Evidence

- Settings opens only from the explicit settings button.
- Settings persists Local CLI / BYOK, engine selection/status, connectors,
  external/local MCP, language, appearance, and autosave state.
- Engine Rescan and Test call local daemon endpoints; browser/API validation
  confirmed Codex CLI test response.
- Full gate evidence is recorded in QA-026.
