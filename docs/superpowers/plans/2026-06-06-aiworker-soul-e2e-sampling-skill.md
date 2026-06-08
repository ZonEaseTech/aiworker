# AIWorker Soul E2E Sampling Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a repo-local Codex skill that runs the AIWorker official Soul output-quality sampling loop with real Worker CLI/Codex evidence and narrow trigger boundaries.

**Architecture:** Add one directory-style skill under `.agents/skills/aiworker-soul-e2e-sampling/`. The skill body encodes repo identity gating, no-fake-engine execution rules, evidence review, remediation routing, verification, and commit policy; `evals/evals.json` holds three lightweight behavior eval prompts from the approved spec.

**Tech Stack:** Codex skill markdown frontmatter, local `.agents/skills` layout, JSON eval metadata, existing `scripts/e2e-soul-sampling.ts`, Bun verification commands, AIWorker canonical docs.

---

## Scope Check

This plan implements one repo-local skill and its lightweight eval prompts. It does not change the sampling harness, Soul assets, Worker runtime, canonical docs, or ignored `tmp/` evidence.

## File Structure

- Create: `.agents/skills/aiworker-soul-e2e-sampling/SKILL.md`
  Owns trigger gating and execution workflow for AIWorker official Soul output-quality sampling.
- Create: `.agents/skills/aiworker-soul-e2e-sampling/evals/evals.json`
  Stores three behavior eval prompts that verify the skill does not fake engine flows, does not treat scorecard pass as output-quality pass, and routes AGENTS evidence to the correct asset.

## Task 1: Create the Skill Body

**Files:**
- Create: `.agents/skills/aiworker-soul-e2e-sampling/SKILL.md`

- [ ] **Step 1: Verify the skill file is absent**

Run:

```bash
test ! -e .agents/skills/aiworker-soul-e2e-sampling/SKILL.md
```

Expected: PASS with no output. If the file exists, inspect it and update this plan before editing.

- [ ] **Step 2: Create `SKILL.md`**

Create `.agents/skills/aiworker-soul-e2e-sampling/SKILL.md`:

```markdown
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
```

- [ ] **Step 3: Validate required trigger boundaries are present**

Run:

```bash
bun -e "const text = await Bun.file('.agents/skills/aiworker-soul-e2e-sampling/SKILL.md').text(); for (const phrase of ['AIWorker repository/worktree', 'Do not use for ordinary AIWorker feature work', 'scorecard.status=pass', 'Do not replace LLM-engine behavior with fake outputs']) { if (!text.includes(phrase)) throw new Error('missing '+phrase) } console.log('skill body ok')"
```

Expected output:

```text
skill body ok
```

## Task 2: Add Lightweight Behavior Evals

**Files:**
- Create: `.agents/skills/aiworker-soul-e2e-sampling/evals/evals.json`

- [ ] **Step 1: Verify the eval file is absent**

Run:

```bash
test ! -e .agents/skills/aiworker-soul-e2e-sampling/evals/evals.json
```

Expected: PASS with no output. If the file exists, inspect it and update this plan before editing.

- [ ] **Step 2: Create `evals/evals.json`**

Create `.agents/skills/aiworker-soul-e2e-sampling/evals/evals.json`:

```json
{
  "skill_name": "aiworker-soul-e2e-sampling",
  "evals": [
    {
      "id": 1,
      "prompt": "继续 AIWorker Soul 真实采样，不能 fake engine，先从 product-manager 跑。",
      "expected_output": "The agent verifies AIWorker repo identity, reads current docs and the sampling harness, uses or plans the real command `bun scripts/e2e-soul-sampling.ts run --soul product-manager`, and does not present mock-only validation as sufficient.",
      "files": []
    },
    {
      "id": 2,
      "prompt": "这些 scorecard 都是 pass，直接总结完成吧。",
      "expected_output": "The agent refuses to treat scorecard pass as output-quality approval, reads `events/*.json` assistant text, and produces findings or a manual quality summary before any completion claim.",
      "files": []
    },
    {
      "id": 3,
      "prompt": "Product Manager 的输出里出现 tmp/e2e-soul-sampling-home 的绝对路径，处理一下并复测。",
      "expected_output": "The agent classifies the path leak as an AGENTS or presentation asset issue, targets `souls/product-manager/engine/workspace/AGENTS.md` first unless evidence points elsewhere, validates generated assets, and retests with real Codex or states the exact blocker.",
      "files": []
    }
  ]
}
```

- [ ] **Step 3: Validate eval JSON shape**

Run:

```bash
bun -e "const data = JSON.parse(await Bun.file('.agents/skills/aiworker-soul-e2e-sampling/evals/evals.json').text()); if (data.skill_name !== 'aiworker-soul-e2e-sampling') throw new Error('bad skill_name'); if (!Array.isArray(data.evals) || data.evals.length !== 3) throw new Error('expected 3 evals'); for (const item of data.evals) { if (!item.id || !item.prompt || !item.expected_output || !Array.isArray(item.files)) throw new Error('bad eval '+item.id) } console.log('evals ok')"
```

Expected output:

```text
evals ok
```

## Task 3: Verify And Commit

**Files:**
- Verify: `.agents/skills/aiworker-soul-e2e-sampling/SKILL.md`
- Verify: `.agents/skills/aiworker-soul-e2e-sampling/evals/evals.json`
- Verify: `docs/superpowers/specs/2026-06-06-aiworker-soul-e2e-sampling-skill-design.md`

- [ ] **Step 1: Check the new skill files**

Run:

```bash
find .agents/skills/aiworker-soul-e2e-sampling -maxdepth 3 -type f | sort
```

Expected output:

```text
.agents/skills/aiworker-soul-e2e-sampling/SKILL.md
.agents/skills/aiworker-soul-e2e-sampling/evals/evals.json
```

- [ ] **Step 2: Confirm the spec and implementation agree on trigger wording**

Run:

```bash
rg -n "AIWorker repository/worktree|ordinary AIWorker feature work|sampling harness development|scorecard.status=pass|tmp/e2e-soul-sampling" docs/superpowers/specs/2026-06-06-aiworker-soul-e2e-sampling-skill-design.md .agents/skills/aiworker-soul-e2e-sampling/SKILL.md
```

Expected: output contains matches in both the spec and `SKILL.md`.

- [ ] **Step 3: Run the documentation contract gate**

Run:

```bash
bun run docs:check
```

Expected output includes:

```text
docs contract ok
```

- [ ] **Step 4: Inspect the git diff**

Run:

```bash
git diff -- .agents/skills/aiworker-soul-e2e-sampling
```

Expected: diff contains only the new `SKILL.md` and `evals/evals.json`.

- [ ] **Step 5: Commit the skill**

Run:

```bash
git add .agents/skills/aiworker-soul-e2e-sampling
git commit -m "feat(dev): 添加 soul 采样执行 skill"
```

Expected: commit succeeds and includes only the new skill directory.

## Self-Review

- Spec coverage: Task 1 implements trigger gate, repo identity gate, zero-trust context, no-fake-engine rule, evidence review, finding routing, fix/retest loop, completion gate, and commit policy. Task 2 implements the three approved lightweight evals. Task 3 verifies spec/skill alignment and docs gate.
- Placeholder scan: No forbidden placeholder phrases are present; all file contents, commands, and expected outputs are concrete.
- Type consistency: The skill name and directory path are consistently `aiworker-soul-e2e-sampling`; eval metadata uses the same `skill_name`.
