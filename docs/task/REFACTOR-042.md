# REFACTOR-042 Soul and Skill data model

- **status**: completed
- **priority**: P0
- **owner**: local
- **createdAt**: 2026-05-10 10:30
- **claimedAt**: 2026-05-10 10:30
- **completedAt**: 2026-05-10 10:46
- **plan**: PLAN-209
- **relatesTo**: packages/shared, packages/storage-sqlite, packages/core, apps/api, apps/cli, apps/web

## Background

The local worker loop had low-level case/run storage, but no product-level Soul
and skill/template contract shared by API, CLI, Web, runtime, and storage.

## Goal

Introduce a real shared vertical Soul and capability template model, then carry
selected Soul/skill metadata through case creation, run metadata, and generated
artifacts.

## Acceptance Criteria

- Shared model defines Soul id/name/description/domain/defaultTemplates/status.
- Shared model defines template id/name/description/outputKind/inputHints/reviewRubric.
- Built-in HR, PM, QA, and DevOps templates are data-driven, not scattered JSX.
- Case storage/API/CLI/Web carry selectedSoulId and selectedSkillId.
- Runtime artifacts preserve selected Soul/skill metadata.

## Evidence

- Shared `VerticalSoul` and `CapabilityTemplate` model now owns built-in HR, PM,
  QA, DevOps, Finance, Legal, and Ops catalog data.
- API/CLI/Web expose Soul/template selection; case creation persists
  selectedSoulId and selectedSkillId.
- Runtime and noop executor carry Soul/template metadata into generated
  artifacts.
- Full gate evidence is recorded in QA-026.
