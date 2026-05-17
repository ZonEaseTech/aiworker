---
name: profile-update-proposal
description: Convert HR session evidence into a reviewable profile update proposal.
capabilities:
  - hr-profile
  - artifact-proposal
  - review-prep
---

# Profile Update Proposal

Use this skill when a session should produce a proposed change for the accepted
People Profile.

## Rules

- Read the accepted profile surface first when available to understand the reviewed baseline.
- Write proposed changes under `artifacts/<sessionId>/`.
- Produce a complete reviewable proposal with source references, open questions,
  risks, and exact requested review decision.
- Do not update `README.md` or any accepted profile surface directly.
- Preserve human decision ownership for promotion.

## Proposal Checklist

- What changed since the accepted profile?
- Which claims are backed by explicit evidence?
- Which facts are still missing?
- Which risks need HR or legal review?
- What exact review decision is needed before promotion?
