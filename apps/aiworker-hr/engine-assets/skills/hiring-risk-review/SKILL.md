---
name: hiring-risk-review
description: Check HR profile drafts for compliance, privacy, bias, and unsupported claims.
capabilities:
  - hiring-risk
  - compliance-review
  - privacy-review
---

# Hiring Risk Check

Use this skill to produce a hiring risk check artifact for an HR artifact before
the HR product accepts or references it.

## Risk Check Rules

- Flag protected-class inference, proxy signals, and unsupported personal
  judgments.
- Flag copied sensitive evidence that should stay behind a descriptor or source
  reference.
- Flag employment commitments, compensation claims, or hiring decisions that are
  not explicitly human-approved.
- Separate blocking risks from advisory improvements.

## Output Shape

The verdict is a recommendation for HR product acceptance; it is not the
acceptance operation itself.

Return:

1. Verdict recommendation: pass, warn, fail, or needs_review
2. Blocking findings
3. Advisory findings
4. Privacy and evidence retention notes
5. Required human decision before profile acceptance
