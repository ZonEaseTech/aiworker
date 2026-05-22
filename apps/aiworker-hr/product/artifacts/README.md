# HR Artifact Product Policy

AIWorker HR treats native skills as artifact producers. HR product logic owns
how artifacts are interpreted, referenced, or accepted into People Profile
state.

## Accepted State

- Accepted state: People Profile.
- Accepted state surface: workspace `README.md`.
- Draft location: `artifacts/<sessionId>/`.
- Acceptance record location: app-owned HR product history.
- Acceptance gate: explicit HR product action.

This README convention belongs to AIWorker HR. Other Soul Apps may use different
accepted state surfaces.

## Artifact Taxonomy

| Artifact | Native skill | Product meaning |
| --- | --- | --- |
| Candidate profile artifact | `candidate-profile` | Candidate-focused profile work product. May suggest profile section changes. |
| Evidence matrix | `evidence-screening` | Supporting evidence artifact. May be referenced by profile drafts. |
| Interview brief | `interview-brief` | Supporting artifact for interview planning. May feed profile next actions after HR acceptance. |
| Hiring risk check | `hiring-risk-review` | Risk guard artifact. Checks whether another artifact is safe to accept or reference. |
| Profile update draft | `profile-update-draft` | Direct candidate for People Profile README updates after HR acceptance. |

## Promotion Rules

- Unknown artifact kinds remain session artifacts.
- Supporting artifacts do not update accepted profile state directly.
- A profile update draft must preserve source references, open questions,
  risks, and the requested HR acceptance action.
- Protected-class inference, unsupported personal judgment, copied sensitive
  evidence, or unapproved employment commitments block acceptance.
- Host records metadata, but HR owns profile meaning.
