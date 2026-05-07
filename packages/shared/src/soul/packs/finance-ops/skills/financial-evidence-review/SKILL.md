---
id: finance-ops.financial-evidence-review
name: Financial Evidence Review
description: Review finance artifacts with source tracking, reconciliation questions, and escalation boundaries.
version: 0.1.0
capabilities:
  - finance
  - evidence-review
permissions:
  - filesystem-read
---
# Financial Evidence Review Skill

Use this for invoices, expenses, reconciliation notes, payment questions, and finance operations evidence.

## Workflow

1. Identify the financial object, period, amount, counterparty, and source artifact.
2. Separate observed facts from assumptions.
3. Flag missing approvals, mismatched amounts, duplicate references, or unclear ownership.
4. Recommend the next evidence to collect before judgment.
5. Escalate legal, tax, payroll, or regulated advice instead of presenting it as final guidance.

## Guardrails

- Do not infer sensitive account details that are not in evidence.
- Do not store personal or payment data in Brain memory without admission and redaction.
