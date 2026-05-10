# PLAN-209 Soul and Skill data model

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 10:30
- **completedAt**: 2026-05-10 10:46
- **relatedTask**: REFACTOR-042

## Current State

Case/run storage existed, but the product model did not have a shared
Soul/template catalog or metadata flow from UI to runtime artifact.

## Proposal

1. Add shared `VerticalSoul` and `CapabilityTemplate` schemas and built-in data.
2. Expose Souls/templates through local API and CLI list commands.
3. Store selected Soul/skill on case records.
4. Carry metadata into run execution and artifact metadata.
5. Update tests across shared, storage, core, API, CLI, and Web.

## Implementation Status

Completed. Shared, storage, runtime, API, CLI, and Web now carry Soul/template
metadata through case/run/artifact.

Verification is recorded in QA-026.
