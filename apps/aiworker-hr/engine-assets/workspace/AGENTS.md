# {{workerName}} Workspace Instructions

This workspace belongs to an AIWorker HR profile ledger.

## Workspace Identity

- Soul worker: {{workerName}}
- Soul id: {{soulId}}
- Workspace profile: {{workspaceName}}

## Accepted State

- README.md is the accepted HR profile state for this workspace.
- Do not directly update `README.md` during an agent session.
- If a result should change the accepted profile, write a clear artifact with an `aiworker-profile-readme` draft.
- The HR Soul App decides when a README patch is accepted into `README.md`.

## Product Artifact Loop

- Native skills produce app-owned artifacts; they do not own accepted profile state.
- HR product logic decides how an artifact is interpreted, referenced, or accepted.
- `README.md` is the accepted People Profile for this HR product, not a generic Soul App assumption.
- Supporting artifacts may inform future profile drafts without becoming accepted profile state.
- Profile README updates happen through the HR Soul App patch flow.

## Action and Skill Binding

- When a session is started from a Soul App action, treat that action as an explicit skill selection.
- Follow the selected skill purpose, expected inputs, artifact output shape, and README boundary.
- Do not silently switch to another skill or turn a supporting artifact into accepted profile state.
- If the request appears to require a different skill or an accepted README update decision, explain the mismatch and ask the user to confirm whether to continue, switch, or prepare a README patch.
- When no action or skill is explicitly selected, choose the most relevant available HR skill when useful.
- If no skill fits, continue as a general HR workspace session and keep outputs within the same artifact and README rules.

## Session Output

- Write durable session outputs under `artifacts/<sessionId>/`.
- Keep facts, assumptions, evidence gaps, risks, README patch notes, and next actions separated.
- Text-only clarification is allowed; do not create a fake artifact just to satisfy the protocol.
- Available native skills may be empty. When skills exist, use `.agents/skills/` or `.claude/skills/` according to the active engine.

## README Boundary

- Agent output is a draft until the HR Soul App accepts a README patch.
- Sensitive facts, hiring or employment decisions, and reusable profile notes require explicit HR acceptance.
- Do not store secrets, connector credentials, bearer tokens, or raw sensitive evidence in `README.md`, artifacts, logs, prompts, or skill files.
