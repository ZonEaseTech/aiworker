# TODO-008 Create repeatable Soul brain executor validation harness

- **status**: pending
- **priority**: P2
- **owner**: unassigned
- **createdAt**: 2026-05-03 23:33
- **plan**: PLAN-080

## Description

The 2026-05-03 local validation generated useful Soul / brain / executor
samples, but the matrix was run as one-off shell commands under
`/Users/ben/projects/aiben/tmp`. Future Soul tuning and executor capability
changes need a repeatable, sanitized harness that can be run before releases
without copying raw secrets, prompts, or credential-bearing state into the
repository.

## Scope

1. Provide a local-only validation script or documented runbook for fresh
   project-scope initialization across all built-in Soul presets.
2. Collect sanitized artifacts for:
   - generated Soul/persona/capability drafts;
   - runtime brain status, skills, and memories;
   - executor selection/readiness;
   - executor-native MCP dry-run projection;
   - optional real Codex-backed one-turn identity samples.
3. Preserve real user `HOME` for Codex-backed tests while isolating only
   `AIWORKER_HOME`, worker db, logs, and temporary files.
4. Keep secrets out of artifacts and final docs.

## Acceptance Criteria

1. A maintainer can run the harness against `/Users/ben/projects/aiben` or a
   supplied project directory.
2. The harness supports a dry-run/static mode that does not call a live model.
3. The optional live mode records per-Soul JSON identity replies and validates
   they parse.
4. The output manifest maps each explicit validation requirement to artifact
   paths and command exit codes.
5. The harness is covered by at least focused smoke tests or script-level
   checks for redaction and exit-code handling.

## ActiveForm

Creating a repeatable local Soul / brain / executor validation harness.

## Dependencies

- **blocked by**: none
- **blocks**: future Soul tuning release gates
- **relates to**: QA-003, FEAT-046, FEAT-047, PLAN-080

## Notes

- Keep this harness local-worker only. Fleet/gateway validation remains in the
  separate fleet validation workflow.
- Prefer `tmp/` for generated artifacts and redact bootstrap tokens, API keys,
  bearer tokens, cookies, and raw system prompt text.
