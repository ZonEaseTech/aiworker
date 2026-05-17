# HR Artifact Product Policy

AIWorker HR treats native skills as artifact producers. HR product logic owns
how artifacts are interpreted, reviewed, referenced, or promoted into accepted
People Profile state.

## Accepted State

- Accepted state: People Profile.
- Accepted state surface: workspace `README.md`.
- Proposal location: `artifacts/<sessionId>/`.
- Review record location: `reviews/*.md`.
- Promotion gate: HR product review with `pass` or `warn`.

This README convention belongs to AIWorker HR. Other Soul Apps may use different
accepted state surfaces.

## Artifact Taxonomy

| Artifact | Native skill | Product meaning |
| --- | --- | --- |
| Candidate profile artifact | `candidate-profile` | Candidate-focused profile work product. May propose profile section changes after review. |
| Evidence matrix | `evidence-screening` | Supporting evidence artifact. May be referenced by profile proposals. |
| Interview brief | `interview-brief` | Supporting artifact for interview planning. May feed profile next actions only after review. |
| Hiring risk review | `hiring-risk-review` | Promotion guard artifact. Reviews whether another artifact is safe to promote or reference. |
| Profile update proposal | `profile-update-proposal` | Direct candidate for People Profile promotion when HR product review passes or warns. |

## Promotion Rules

- Unknown artifact kinds remain session artifacts.
- Supporting artifacts do not update accepted profile state directly.
- A profile update proposal must preserve source references, open questions,
  risks, and the requested human decision.
- Protected-class inference, unsupported personal judgment, copied sensitive
  evidence, or unapproved employment commitments block promotion.
- Host records metadata and review events, but HR owns profile meaning.
