---
name: aiworker-soul-e2e-sampling
description: Use only inside an AIWorker repository/worktree for the official Soul output-quality sampling loop: real Worker CLI/Codex runs over existing Soul AGENTS.md and projected skills, evidence under tmp/e2e-soul-sampling, and sampling-evidence-driven tuning/retest. Trigger when the user asks to run, continue, triage, or retest real multi-round Soul sampling, or says no fake engine for Soul calibration. Do not use for ordinary AIWorker feature work, generic E2E tests, normal Soul authoring, new skill creation, sampling harness development, or AGENTS/SKILL edits not driven by sampling evidence.
---

# AIWorker Soul E2E Sampling

Use this skill to operate the AIWorker official Soul output-quality sampling loop. This is an execution workflow for real sampling evidence, not a generic AIWorker development guide and not a skill-authoring template.

## Trigger Gate

Before using this skill, confirm all three gates:

1. **AIWorker repo identity:** Locate the git root from the current working directory. Confirm root `AGENTS.md` contains `AIWorker Agent Bootstrap`, the five canonical docs exist, `scripts/e2e-soul-sampling.ts` exists, and official Soul packages exist under `souls/*`.
2. **Sampling operation intent:** The user asks to run, continue, triage, retest, or tune the official Soul output-quality sampling loop.
3. **Official Soul or evidence target:** The request targets existing official Soul `AGENTS.md`, projected skills, or evidence under `tmp/e2e-soul-sampling/`.

If any gate fails, do not use this skill. For ambiguous prompts such as "跑 e2e" or "改 product-manager skill", ask one clarifying question to separate the Soul sampling loop from ordinary project development.

Do not use this skill for ordinary AIWorker feature work, generic E2E/contract/smoke tests, normal Soul authoring, new skill creation, sampling harness development, docs-only architecture work, or AGENTS/SKILL edits not driven by sampling evidence.

## Zero-Trust Start

After the trigger gate passes, re-read current repo truth before choosing work:

- `AGENTS.md`
- `docs/architecture.md`
- `docs/protocol.md`
- `docs/runtime.md`
- `docs/soul-authoring.md`
- `docs/testing.md`
- `scripts/e2e-soul-sampling.ts`
- `scripts/e2e-soul-sampling.test.ts`
- `git status --short`
- relevant recent commits

For execution tasks, run early:

```bash
bun run docs:check
bun run test:contracts
```

If `test:contracts` fails because a local dependency is missing, such as `Cannot find package 'zod'`, try `bun install` and rerun the gate before declaring architecture drift.

## Real Engine Rule

Unit or static tests for `scripts/e2e-soul-sampling.ts` may mock CLI behavior. E2E sampling must use real Worker CLI and real Codex invocations. Do not replace LLM-engine behavior with fake outputs, golden text, dry-run evidence, or mock-only validation.

Canonical real-run commands:

```bash
AIWORKER_E2E_RUN_ID=full-freeform AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul aiworker-freeform
AIWORKER_E2E_RUN_ID=full-google-ads AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul google-ads
AIWORKER_E2E_RUN_ID=full-hr-manager AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul hr-manager
AIWORKER_E2E_RUN_ID=full-product-manager AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul product-manager
AIWORKER_E2E_RUN_ID=full-software-support AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul software-support
```

Use unique run IDs for retests, for example `full-product-manager-agentsfix`. Prefer serial runs unless the user explicitly wants parallel sampling and the machine can support it.

## Evidence Review

Evidence lives under:

```text
tmp/e2e-soul-sampling/<runId>/
  manifest.json
  scorecards/*.json
  events/*.json
```

`scorecard.status=pass` means the invocation completed; it does not prove output quality. Always read assistant event text before judging quality:

```bash
jq -r '[.events[] | (.payloadJson.data.text // empty)] | join("")' \
  tmp/e2e-soul-sampling/<runId>/events/<caseId>.json
```

Write ignored working summaries such as `tmp/e2e-soul-sampling/<runId>/findings.md` when reviewing multiple cases. Do not commit `tmp/` evidence.

## Finding Routing

Classify before editing:

| Finding | Default owner |
| --- | --- |
| AGENTS chooses the wrong workflow, leaks temp paths, misses domain boundaries, or fails to direct asset use | `souls/*/engine/workspace/AGENTS.md` |
| One workflow invents inputs, misses clarification, lacks self-check, or has weak delivery rules | `souls/*/engine/skills/*/SKILL.md` |
| Multiple skills repeat the same missing method, benchmark, integration, or domain rule | `souls/*/engine/workspace/knowledge/*` |
| Multiple outputs miss the same delivery structure | `souls/*/engine/workspace/templates/*` |
| CLI, session, projection, timeout, or engine bridge blocks real sampling before quality can be judged | platform code, smallest blocking slice only |

Edit the smallest asset that explains the failure. Shared knowledge or template changes require repeated evidence across multiple cases.

## Fix And Retest Loop

For each verified finding:

1. Classify the failure from assistant event text.
2. Edit the smallest responsible Soul asset.
3. Build or validate the affected Soul package.
4. Confirm tracked `dist/engine-assets` output is synchronized when the package generates it.
5. Retest with real Codex using the affected Soul or the narrowest supported case.
6. Re-read assistant event text and update findings.
7. Commit the verified slice without `tmp/` evidence.

Example validation commands:

```bash
bun run --filter '@zonease/aiworker-product-manager' validate
bun run --filter '@zonease/aiworker-software-support' validate
```

## Completion Gate

Before claiming completion, run the smallest fresh verification set that proves the touched surface. Common commands:

```bash
bun run docs:check
bun run test:contracts
bun test scripts/e2e-soul-sampling.test.ts --timeout=30000
bun test packages/worker-runtime/src/worker/executor.test.ts --timeout=30000
```

For code changes, run code-review-graph unless the change is docs-only, instruction-only, or pure formatting.
