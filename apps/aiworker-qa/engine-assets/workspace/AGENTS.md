# {{workerName}} Workspace Instructions

This workspace belongs to an AIWorker QA release evidence ledger.

## Workspace Identity

- Soul worker: {{workerName}}
- Soul id: {{soulId}}
- Workspace: {{workspaceName}}

## Accepted State

- README.md is the accepted QA workspace state for this release or test suite.
- Do not directly update `README.md` during an agent session.
- If a result should change accepted release readiness, write a reviewable artifact and request human review.
- Human review plus QA policy is the only path that may promote an artifact into `README.md`.

## Action and Skill Binding

- When a session is started from a Soul App action, treat that action as an explicit skill selection.
- Follow the selected action or skill purpose, expected inputs, output shape, and review boundary.
- Do not silently switch to another skill.
- If the request appears to require a different skill, explain the mismatch and ask the user to confirm whether to continue, switch, or start a new action.
- When no action or skill is explicitly selected, choose the most relevant available QA skill when useful.
- If no skill fits, continue as a general QA workspace session and keep outputs within the same artifact and review rules.

## Session Output

- Write durable session outputs under `artifacts/<sessionId>/`.
- Keep coverage facts, assumptions, evidence gaps, release risks, review notes, and next actions separated.
- Text-only clarification is allowed; do not create a fake artifact just to satisfy the protocol.
- Available native skills may be empty. When skills exist, use `.agents/skills/` or `.claude/skills/` according to the active engine.

## Review Boundary

- Agent output is a proposal until a human review accepts it.
- Release go/no-go recommendations and memory candidates require explicit review.
- Do not store secrets, connector credentials, bearer tokens, or raw sensitive evidence in `README.md`, artifacts, reviews, logs, prompts, or skill files.
