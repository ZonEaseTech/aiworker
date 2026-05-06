# PLAN-126 Record 0.9.1 `cli-release-local` validation

- **status**: completed
- **createdAt**: 2026-05-06 05:58
- **approvedAt**: 2026-05-06 05:58
- **completedAt**: 2026-05-06 05:58
- **relatedTask**: QA-008

## Context

The active validation objective was:

`aiworker-validate cli-release-local 0.9.1`

The canonical validation mode is local black-box testing of an already-published
`@zonease/aiworker-cli` package. It must not use the source checkout, source
dev servers, or workspace CLI as the product under test.

Current evidence from the completed run:

- debug root:
  `/home/ben/projects/debug-aiworker/qa-2026-05-06-cli-0.9.1`;
- published package version: `@zonease/aiworker-cli@0.9.1`;
- isolated binary version:
  `aiworker/0.9.1 linux-x64 node-v24.3.0`;
- executor availability used by the run:
  `codex-cli 0.128.0` and `claude 2.1.129`;
- repository source checkout remained clean.

## Proposal

1. Record the compact `cli-release-local` campaign as `QA-008`.
2. Link it to the release task (`REL-017` / `PLAN-124`) and the canonical
   validation skill work (`TODO-030` / `PLAN-125`).
3. Keep raw logs under the external debug root and store only sanitized paths
   and conclusions in project PMA docs.
4. Mark the task and plan completed because the validation run already
   completed and no new product defect was confirmed.

## Risks

- This compact run is not a replacement for a full governance campaign. It
  covered `developer` + `codex/default`, `general-assistant` +
  `claude-code/default`, and worker REST/SSE smoke, but not all Soul presets.
- External debug-root artifacts may contain local worker state and tokens; PMA
  docs intentionally reference sanitized paths and summaries only.
- This did not attach a worker to the shared fleet.

## Scope

- `docs/task/QA-008.md`
- `docs/task/index.md`
- `docs/plan/PLAN-126.md`
- `docs/plan/index.md`
- `docs/changelog.md`

## Non-Scope

- No source code changes.
- No package version changes.
- No release workflow changes.
- No fleet, gateway, remote worker, or deployment changes.

## Validation

- `git diff --check`.
- PMA status consistency:
  `docs/task/index.md` contains completed `QA-008`;
  `docs/task/QA-008.md` has `status: completed`;
  `docs/plan/index.md` contains completed `PLAN-126`;
  `docs/plan/PLAN-126.md` has `status: completed`.
- Evidence audit recorded in:
  `/home/ben/projects/debug-aiworker/qa-2026-05-06-cli-0.9.1/logs/completion-audit.txt`.

## Annotations

- 2026-05-06 05:58: Validation run completed and was recorded into PMA docs at
  the user's request.
