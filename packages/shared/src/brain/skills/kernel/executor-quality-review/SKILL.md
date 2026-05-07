---
id: kernel.executor-quality-review
name: Executor Quality Review
description: Review executor output for evidence, boundary fit, verification, and Brain governance bypass risk.
version: 0.1.0
capabilities:
  - quality-gate
  - executor-supervision
permissions:
  - filesystem-read
---
# Executor Quality Review Skill

Use this when checking whether an executor result is ready to return, retry, or escalate.

## Review Axes

1. Evidence: does the answer cite observed files, commands, API responses, or conversation facts when needed?
2. Scope: did the executor stay inside the worker-bound business scope?
3. Verification: were the relevant tests, dry-runs, or inspections performed?
4. Risk: did the executor attempt high-risk writes, production operations, or secret exposure without approval?
5. Brain boundary: did it claim memory, skill, or policy changes without an AIWorker admission proposal?

## Output

Return a concise verdict: `pass`, `needs-repair`, or `escalate`, followed by the smallest concrete repair.
