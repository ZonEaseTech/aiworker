# PLAN-127 Governance Kernel regression harness

- **status**: completed
- **createdAt**: 2026-05-06 06:25
- **approvedAt**: 2026-05-06 06:25
- **completedAt**: 2026-05-06 06:47
- **relatedTask**: TODO-027

## Context

`TODO-027` is the only remaining open worker-side task after the retained
Governance Kernel fixes and the 0.9.1 published CLI validation were recorded.
The repository already has `.agents/skills/aiworker-validate` with explicit
`worker-source-local` and `cli-release-local` modes, plus historical deep
campaign recipes. Those runbooks describe the validation boundary, but there is
no executable repeatable harness that:

- installs or locates the product under test;
- runs a compact Brain Governance Kernel matrix across Codex and Claude Code
  when they are available;
- records command, DB, filesystem, event-stream, and REST evidence;
- separates source-backed pass/fail from environment-limited skips; and
- emits one report suitable for PMA QA filing.

Manual evidence already exists in `QA-007` and `QA-008`, but those records do
not make future regression checks reproducible by themselves.

## Proposal

1. Add `scripts/governance-kernel-harness.ts`.
2. Support `cli-release-local` as the default mode by installing
   `@zonease/aiworker-cli@<version>` into an isolated debug root. Also allow
   `worker-source-local` by pointing the harness at a built source bundle.
3. Use a compact default matrix:
   `developer + codex/default` and
   `general-assistant + claude-code/default`, with explicit environment-limited
   skips when the corresponding executor CLI is unavailable.
4. For each available pair, initialize a fresh project scope, select the
   executor, run `executor doctor`, `doctor`, `brain status`, and a same
   `chat-id` CLI sequence covering:
   decision truthfulness, file-backed artifact work, marker recall, high-risk
   refusal, admission proposal behavior, and final consistency.
5. Capture source-backed evidence:
   run event JSON counts, worker.db conversations/messages/admissions,
   Project Brain memory filesystem state, REST `/health`, auth boundary,
   `/api/worker/info`, `/api/worker/brain/summary`, OpenAPI path count, and
   SSE connection evidence.
6. Write `reports/governance-kernel-report.md` and
   `reports/governance-kernel-summary.json` under the debug root. The report
   must label each assertion as pass, fail, or skipped/environment-limited.
7. Run the harness once against the current published CLI and record results in
   one QA task.

## Risks

- Real executor behavior depends on the operator's ambient Codex / Claude Code
  authentication and network state. The harness must skip unavailable engines
  with evidence instead of treating absence as product pass or fail.
- Real LLM runs are slower and may be flaky. The harness is compact by default,
  but every pass/fail must still rely on DB, filesystem, event, or REST
  evidence instead of assistant self-report.
- Debug roots can contain local worker tokens and raw executor logs. PMA docs
  must store sanitized paths and summaries only.

## Scope

- `scripts/governance-kernel-harness.ts`
- `.agents/skills/aiworker-validate/references/*` if the canonical runbook
  needs to mention the harness.
- PMA task/plan/QA/changelog tracking.

## Alternatives

- Keep the runbook-only validation skill. Rejected because `TODO-027` asks for
  a repeatable harness, and manual QA records are not enough.
- Add a package script only around historical shell templates. Rejected because
  the harness needs structured summaries, DB queries, REST checks, and skip
  accounting.

## Validation

- `PATH="$HOME/.bun/bin:$PATH" bunx eslint scripts/governance-kernel-harness.ts`
  -> pass.
- `PATH="$HOME/.bun/bin:$PATH" bun build --target=bun
  --outfile=tmp/governance-kernel-harness-check.js
  scripts/governance-kernel-harness.ts` -> pass.
- `PATH="$HOME/.bun/bin:$PATH" bun scripts/governance-kernel-harness.ts
  --mode cli-release-local --version 0.9.1 --matrix compact --debug-root
  /home/ben/projects/debug-aiworker/qa-2026-05-06-governance-harness-0.9.1-r2
  --timeout-ms 240000 --port-base 19450` -> pass.
- Results recorded in `docs/task/QA-009.md`.

## Annotations

- 2026-05-06 06:25: Approved by the active worker Governance Kernel objective;
  implementation started without a separate approval pause because the
  objective explicitly authorizes continued PMA slices unless product boundary
  changes are required.
- 2026-05-06 06:47: Completed. The final compact `cli-release-local` harness
  run against published CLI 0.9.1 passed for developer/codex and
  general-assistant/claude-code with no skipped checks.
