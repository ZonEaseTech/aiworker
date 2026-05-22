---
name: profile-update-draft
description: Convert HR session evidence into a README-ready profile draft.
capabilities:
  - hr-profile
  - profile-draft
  - readme-patch
---

# Profile Update Draft

Use this skill when a session should produce a README-ready change for the
accepted People Profile.

## Rules

- Read the accepted profile surface first when available to understand the current baseline.
- Write README draft changes under `artifacts/<sessionId>/`.
- Produce a complete profile draft with source references, open questions,
  risks, and the exact README patch intent.
- Do not update `README.md` or any accepted profile surface directly.
- Preserve human decision ownership for accepted profile changes.

## Draft Checklist

- What changed since the accepted profile?
- Which claims are backed by explicit evidence?
- Which facts are still missing?
- Which risks need HR or legal review?
- What exact README change should the HR app inspect?

## Accepted Profile Draft

When the output is intended to update the accepted profile, include one fenced
block with the exact `README.md` candidate profile draft the HR product may
write after acceptance:

```aiworker-profile-readme
# <Profile name>

> Accepted People Profile for this HR workspace.

...
```

Keep rationale, evidence commentary, rejected claims, pending state, and
requested decisions outside this fenced block so the HR app can write only the
accepted profile state.

The fenced draft must be internally consistent. If it includes accepted facts or
is intended for acceptance, its `Profile Update State` must describe the
accepted state after acceptance, not a pending request. Do not leave
starter scaffold text, pending-acceptance notes, acceptance-request notes,
readiness notes, or any other approval-waiting wording in a draft that
otherwise contains accepted profile facts.
