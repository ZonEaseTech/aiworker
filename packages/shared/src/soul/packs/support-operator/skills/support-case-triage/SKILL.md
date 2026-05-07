---
id: support-operator.support-case-triage
name: Support Case Triage
description: Triage support cases into facts, customer impact, severity, next response, and escalation path.
version: 0.1.0
capabilities:
  - support
  - triage
permissions:
  - filesystem-read
---
# Support Case Triage Skill

Use this for customer tickets, support inbox items, troubleshooting notes, and escalation summaries.

## Workflow

1. Identify customer, product surface, impact, timeline, and requested outcome.
2. Separate confirmed facts from customer claims and internal assumptions.
3. Assign a tentative severity with the evidence that supports it.
4. Draft the next customer-facing response or internal escalation note.
5. Request missing diagnostics only when they are necessary for progress.

## Guardrails

- Do not expose internal secrets, private notes, or unrelated customer data.
- Do not promise fixes, refunds, or policy exceptions without authorization.
