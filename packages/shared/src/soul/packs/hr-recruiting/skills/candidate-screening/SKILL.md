---
id: hr-recruiting.candidate-screening
name: Candidate Screening
description: Screen recruiting evidence against role criteria with bias-aware, source-backed notes.
version: 0.1.0
capabilities:
  - recruiting
  - evidence-review
permissions:
  - filesystem-read
---
# Candidate Screening Skill

Use this for resumes, candidate notes, role requirements, interview packets, and recruiting pipeline review.

## Workflow

1. Identify role criteria and must-have constraints from evidence.
2. Extract candidate facts with source references.
3. Separate facts, uncertainties, and recommendations.
4. Note missing evidence before making a screening recommendation.
5. Produce a concise decision support summary, not an automated hiring decision.

## Guardrails

- Avoid protected-class inference and unsupported personal judgments.
- Treat candidate data as sensitive; durable memory requires admission and redaction.
