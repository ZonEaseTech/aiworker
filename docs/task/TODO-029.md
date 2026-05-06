# TODO-029 Tune brain.governance.bypass_suspected heuristic to avoid noisy false positives

- **status**: completed
- **priority**: P3
- **owner**: local
- **createdAt**: 2026-05-05
- **discoveredAt**: 2026-05-05 20:44
- **completedAt**: 2026-05-06
- **plan**: PLAN-123
- **relatesTo**: QA-007, PLAN-122, BUG-074, BUG-076

## Context

The 0.9.0 matrix confirmed that `brain.governance.bypass_suspected` is emitted
and visible, which is useful. However, the same run also showed that the
heuristic is noisy.

## Observed Behavior

All ten Soul × executor pairs emitted `brain.governance.bypass_suspected`.
Many examples were not actual bypass attempts. They were ordinary boundary
explanations, final recaps, or status descriptions that mentioned admission or
pending proposals without claiming a new durable mutation had just been
submitted.

Evidence:

- `/home/ben/projects/debug-aiworker-cx/release-0.9.0-governance/reports/summary.json`
- `raw/developer-codex/turn01.stdout`
- `raw/developer-codex/turn06.stdout`
- `raw/general-assistant-codex/turn11.stdout`
- `raw/general-assistant-codex/turn12.stdout`

## Expected Behavior

The bypass detector should prioritize high-confidence cases:

1. The assistant claims a durable Brain mutation or admission was submitted,
   approved, applied, or stored.
2. The current turn has no matching DB delta, admission decision, or filesystem
   write.
3. The claim is not merely explaining governance boundaries or summarizing
   existing `pending` proposals.

## Actual Behavior

The detector fires on benign mentions of admission-related terms. This makes
the signal less useful for operators, and it can obscure real issues such as
BUG-076 where the classifier path actually mutates Brain state before the
orchestrator phase.

## Scope

This is observability tuning, not a correctness blocker.

## Reproducer

Use the archived 0.9.0 matrix evidence:

```sh
RUN=/home/ben/projects/debug-aiworker-cx/release-0.9.0-governance
rg -n 'brain\\.governance\\.bypass_suspected|assistant-claimed-admission' \
  "$RUN/raw/developer-codex/turn01.stdout" \
  "$RUN/raw/developer-codex/turn06.stdout" \
  "$RUN/raw/general-assistant-codex/turn11.stdout" \
  "$RUN/raw/general-assistant-codex/turn12.stdout"
```

Then compare the triggering user prompts and surrounding assistant output in
the same files. The warnings occur on boundary explanations or summaries that
mention admission, not only on claims that a new durable Brain mutation was
submitted.

## Validation

After tuning:

1. Boundary explanations and final summaries no longer emit bypass warnings.
2. Repro cases from BUG-074 and BUG-076 still emit a clear warning.
3. The event payload includes enough context to explain which claim triggered
   the warning without exposing sensitive raw output.

## Completion Evidence

- Bypass detection now matches high-confidence admission / memory mutation
  success claims instead of benign pending-proposal or governance-boundary
  mentions.
- Warning payloads include a short redacted `claimExcerpt` for operator
  diagnosis.
- Focused gate: `bun test packages/core/src/worker/orchestrator/service.claude-code.test.ts` -> included in 58 pass / 0 fail batch.
