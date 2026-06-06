# AIWorker Soul E2E Sampling Skill Design

## Context

This spec designs a repo-local Codex skill for repeating the AIWorker Soul
AGENTS.md and skill real-E2E tuning workflow.

The workflow is specific to `/Users/ben/projects/aiworker`. It depends on the
AIWorker canonical docs, official Soul package layout, `scripts/e2e-soul-sampling.ts`,
real Worker CLI/Codex execution, ignored evidence under `tmp/e2e-soul-sampling/`,
and source/dist Soul asset synchronization.

The skill will live at:

```text
.agents/skills/aiworker-soul-e2e-sampling/SKILL.md
```

It is not a generic skill-authoring guide and not a generic audit template. Its
purpose is to make future agents execute the same long-running, evidence-backed
sampling loop without reducing it to a status report.

## Goals

1. Make AIWorker agents run real Codex-engine Soul sampling when the user asks to
   test or tune official Souls, AGENTS.md, or projected skills.
2. Preserve the "no fake LLM engine" rule: tests may mock CLI behavior, but E2E
   sampling must use real Worker CLI and real Codex invocations.
3. Force quality judgment to read assistant event text, not only scorecard
   `status=pass`.
4. Encode the fix loop: classify findings, edit the smallest responsible asset,
   rebuild/validate dist, retest with real Codex, review, and commit by slice.
5. Provide lightweight eval prompts that verify the skill's behavior without
   rerunning the full 52-case sampling matrix during skill creation.

## Non-Goals

1. Do not build a new sampling harness in the skill. The existing script remains
   the execution tool.
2. Do not make the skill portable to unrelated repos.
3. Do not require every future run to repeat all 52 cases when a narrower
   evidence-backed retest is sufficient.
4. Do not commit `tmp/` evidence.
5. Do not turn scorecards into automatic quality grades in this skill. That is a
   future harness feature, not a skill requirement.

## Triggering

The skill should trigger for AIWorker repo requests such as:

- "继续 Soul 真实采样"
- "多轮采样这些 souls/skills"
- "不要 fake engine，真实 Codex 跑"
- "调教 AGENTS.md 和 skill 到真实可用"
- "复测 full-* evidence 里的失败"
- "AIWorker Soul E2E sampling loop"

The description should be explicit and pushy enough to trigger when the user
mentions AIWorker Souls, AGENTS.md, skill tuning, real Codex sampling, or
`tmp/e2e-soul-sampling`.

## Skill Behavior

### 1. Start With Zero-Trust Context

On trigger, the agent reads current repo truth before choosing work:

- `AGENTS.md`
- `docs/architecture.md`
- `docs/protocol.md`
- `docs/runtime.md`
- `docs/soul-authoring.md`
- `docs/testing.md`
- `scripts/e2e-soul-sampling.ts`
- `scripts/e2e-soul-sampling.test.ts`
- relevant recent commits and `git status --short`

Run early gates when the task is execution, not just design:

```bash
bun run docs:check
bun run test:contracts
```

If `test:contracts` fails for local dependency drift such as missing `zod`, the
skill should direct the agent to try `bun install` before declaring architecture
drift.

### 2. Use Real Sampling for E2E

The skill must distinguish two categories:

- Unit/static tests for the harness may mock CLI behavior.
- E2E sampling must use real Worker CLI and real Codex.

Canonical full-run commands are:

```bash
AIWORKER_E2E_RUN_ID=full-freeform AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul aiworker-freeform
AIWORKER_E2E_RUN_ID=full-google-ads AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul google-ads
AIWORKER_E2E_RUN_ID=full-hr-manager AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul hr-manager
AIWORKER_E2E_RUN_ID=full-product-manager AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul product-manager
AIWORKER_E2E_RUN_ID=full-software-support AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul software-support
```

Run IDs should be unique for retests, for example
`full-product-manager-agentsfix`.

Long runs should be executed serially unless there is a clear reason to
parallelize. Serial execution keeps Codex resource use and evidence review
tractable.

### 3. Read Evidence Correctly

Evidence lives under:

```text
tmp/e2e-soul-sampling/<runId>/
  manifest.json
  scorecards/*.json
  events/*.json
```

`scorecard.status=pass` means the invocation succeeded. It does not prove output
quality.

For quality review, extract assistant text from events:

```bash
jq -r '[.events[] | (.payloadJson.data.text // empty)] | join("")' \
  tmp/e2e-soul-sampling/<runId>/events/<caseId>.json
```

The agent should create a concise ignored evidence summary such as:

```text
tmp/e2e-soul-sampling/<runId>/findings.md
tmp/e2e-soul-sampling/full-summary/findings.md
```

### 4. Classify Findings Before Editing

Use these remediation buckets:

| Finding | Default owner |
| --- | --- |
| AGENTS selects the wrong workflow, exposes temp paths, misses domain boundary, or fails to direct asset use | `souls/*/engine/workspace/AGENTS.md` |
| One workflow invents inputs, misses clarification, lacks self-check, or has weak delivery rules | `souls/*/engine/skills/*/SKILL.md` |
| Multiple skills repeat the same missing method, benchmark, integration, or domain rule | `knowledge/` |
| Multiple outputs miss the same delivery structure | `templates/` |
| CLI/session/projection/timeout/engine bridge blocks real sampling before quality can be judged | platform code, smallest blocking slice only |

The skill should bias toward the smallest asset that explains the failure. Shared
knowledge/template edits require repeated evidence across multiple cases.

### 5. Fix, Build, Validate, Retest

After editing Soul assets:

1. Build or validate the affected Soul package.
2. Ensure `dist/engine-assets` is synchronized when generated output is tracked.
3. Retest with real Codex. Retest scope can be the affected Soul or a narrower
   affected case if the harness supports it.
4. Re-read assistant text, not only scorecard status.
5. Commit the slice once verified.

Example validation commands:

```bash
bun run --filter '@zonease/aiworker-product-manager' validate
bun run --filter '@zonease/aiworker-software-support' validate
```

### 6. Review and Completion Gates

For code changes, run code-review-graph unless the change is docs-only,
instruction-only, or pure formatting.

Before claiming completion, run the smallest fresh verification set that proves
the touched surface. Common commands:

```bash
bun run docs:check
bun run test:contracts
bun test scripts/e2e-soul-sampling.test.ts --timeout=30000
bun test packages/worker-runtime/src/worker/executor.test.ts --timeout=30000
```

Use subagent reviews when the work is substantial:

- Spec compliance review: coverage, real evidence, plan alignment.
- Quality review: code/asset risk, validation output, residual risk.

### 7. Commit Policy

Commit by verified slice:

- harness/platform fixes
- one Soul asset tuning slice
- source/dist synchronization
- docs/spec-only changes

Do not bundle unrelated refactors. Do not commit `tmp/` evidence.

## Eval Plan

Create `evals/evals.json` next to the skill with three lightweight evals. These
evals check behavior of the skill instructions; they do not rerun the full
52-case Codex matrix during skill creation.

### Eval 1: Real Sampling, Not Mocking

Prompt:

```text
继续 AIWorker Soul 真实采样，不能 fake engine，先从 product-manager 跑。
```

Expected behavior:

- Reads AIWorker context and harness.
- Uses real `bun scripts/e2e-soul-sampling.ts run --soul product-manager`.
- Does not propose mock-only validation as sufficient.

### Eval 2: Scorecard Pass Is Not Quality Pass

Prompt:

```text
这些 scorecard 都是 pass，直接总结完成吧。
```

Expected behavior:

- Refuses to treat pass as quality approval.
- Reads `events/*.json` assistant text.
- Produces findings or a manual quality summary.

### Eval 3: Projection Path Leak

Prompt:

```text
Product Manager 的输出里出现 tmp/e2e-soul-sampling-home 的绝对路径，处理一下并复测。
```

Expected behavior:

- Classifies as AGENTS/asset presentation issue.
- Edits `souls/product-manager/engine/workspace/AGENTS.md`.
- Builds/validates and syncs dist.
- Retests with real Codex or states exact blocker.

## Open Decisions

None. The approved design choices are:

- AIWorker project-specific skill.
- Repo-local location under `.agents/skills/`.
- Direct execution loop by default.
- Commit by verified slice.
- Three lightweight evals in the first version.

## Implementation Notes

The implementation plan should create:

```text
.agents/skills/aiworker-soul-e2e-sampling/
  SKILL.md
  evals/evals.json
```

The skill should be concise enough to load quickly and should point to the
existing scripts and canonical docs rather than duplicating the whole sampling
plan.
