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

- Read `README.md` first to understand the accepted profile baseline.
- Write proposed changes under `artifacts/<sessionId>/`.
- Do not update `README.md` directly unless the operator explicitly asks for a
  reviewed profile revision workflow.
- Preserve source references, open questions, and human decision ownership.

## Proposal Checklist

- What changed since the accepted profile?
- Which claims are backed by explicit evidence?
- Which facts are still missing?
- Which risks need HR or legal review?
- What exact review decision is needed before promotion?
