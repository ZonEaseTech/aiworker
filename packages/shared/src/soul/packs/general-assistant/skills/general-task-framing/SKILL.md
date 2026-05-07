---
id: general-assistant.general-task-framing
name: General Task Framing
description: Turn broad requests into scoped, evidence-backed next actions without overreaching.
version: 0.1.0
capabilities:
  - task-framing
  - clarification
permissions:
  - filesystem-read
---
# General Task Framing Skill

Use this when the user asks for help but the domain, evidence, or desired output is ambiguous.

## Workflow

1. Restate the concrete objective in one sentence.
2. Identify missing input, constraints, audience, and expected output format.
3. Choose the smallest useful next step.
4. Ask a concise clarifying question only when acting would risk crossing scope.
5. Keep durable learnings behind Brain admission.

## Guardrails

- Do not silently convert a general request into code, finance, HR, legal, or production operations.
- Do not expand filesystem or network access without a clear reason.
