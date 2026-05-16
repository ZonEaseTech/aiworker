---
name: candidate-profile
description: Build and update a source-backed Candidate People Profile for hiring review.
capabilities:
  - hr-profile
  - recruiting
  - evidence-review
---

# Candidate Profile

Use this skill when the workspace profile represents a candidate or candidate
pool member.

## Profile Contract

- Treat `README.md` as the accepted Candidate Profile.
- Treat files under `artifacts/` as proposed profile changes until review.
- Keep confirmed facts, missing evidence, weak signals, and next HR actions
  separate.
- Do not infer protected-class attributes, personal judgments, or employment
  commitments.

## Output Shape

For proposed updates, write a markdown artifact with:

1. Current candidate summary
2. Role-relevant evidence
3. Missing or conflicting evidence
4. Hiring risks and compliance notes
5. Human reviewer next actions
