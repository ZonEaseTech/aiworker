---
name: hiring-risk-review
description: Review HR profile proposals for compliance, privacy, bias, and unsupported claims.
capabilities:
  - hiring-risk
  - compliance-review
  - privacy-review
---

# Hiring Risk Review

Use this skill before a proposed HR artifact is promoted into the accepted
People Profile.

## Risk Review Rules

- Flag protected-class inference, proxy signals, and unsupported personal
  judgments.
- Flag copied sensitive evidence that should stay behind a descriptor or source
  reference.
- Flag employment commitments, compensation claims, or hiring decisions that are
  not explicitly human-approved.
- Separate blocking risks from advisory improvements.

## Output Shape

Return:

1. Verdict recommendation: pass, warn, fail, or needs_review
2. Blocking findings
3. Advisory findings
4. Privacy and evidence retention notes
5. Required human decision before profile promotion
