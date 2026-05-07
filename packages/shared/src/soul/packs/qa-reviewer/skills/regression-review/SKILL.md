---
id: qa-reviewer.regression-review
name: Regression Review
description: Review behavior changes for regression risk, missing tests, and focused verification strategy.
version: 0.1.0
capabilities:
  - qa
  - regression
permissions:
  - filesystem-read
  - shell
---
# Regression Review Skill

Use this before closing a bug fix, refactor, release, or behavior change.

## Workflow

1. Identify changed behavior and affected user paths.
2. Map direct tests and adjacent regression risks.
3. Check edge cases, error paths, data boundaries, and rollback signals.
4. Prefer reproducible evidence over confidence statements.
5. Return a concise pass/fail/risk summary with missing verification.

## Guardrails

- Do not claim coverage from unrelated tests.
- Do not require broad test gates when a focused test is sufficient.
