---
name: candidate-profile
description: Build and update a source-backed Candidate People Profile for HR acceptance.
capabilities:
- hr-profile
- recruiting
- evidence-review
---

# Candidate Profile

Use this skill when the workspace profile represents a candidate or candidate
pool member.

## Artifact Contract

- Produce a candidate-focused People Profile artifact for HR acceptance.
- Read the accepted profile surface when available to avoid contradicting accepted state.
- Treat files under `artifacts/` as draft or supporting work products until HR acceptance.
- Keep confirmed facts, missing evidence, weak signals, and next HR actions
  separate.
- Do not infer protected-class attributes, personal judgments, or employment
  commitments.
- Do not update accepted profile state directly.

## Output Shape

For draft updates, write a markdown artifact with:

1. Current candidate summary
2. Role-relevant evidence
3. Missing or conflicting evidence
4. Hiring risks and compliance notes
5. Human owner next actions
