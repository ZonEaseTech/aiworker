# PLAN-274 Worker Web font token and mono taxonomy

- **status**: completed
- **owner**: codex
- **createdAt**: 2026-05-12 03:07
- **approvedAt**: 2026-05-12 03:07
- **relatedTask**: BUG-115

## Current State

- `tokens.css` only defines `--font-aiworker-display`,
  `--font-aiworker-sans`, and `--font-aiworker-mono`.
- Display surfaces still target an SF Pro Rounded-like stack, while the desired
  concrete scheme is Nunito / Inter / JetBrains Mono.
- No Worker Web font files are self-hosted or preloaded.
- Button labels, tags, status labels, counters, IDs, and metadata inherit mixed
  UI/display font stacks instead of consistently using mono.

## Proposal

1. Add self-hosted Latin variable font files under `apps/web/public/fonts`.
2. Add `fonts.css` with `@font-face` rules for Nunito, Inter, and JetBrains
   Mono.
3. Preload the three critical normal variable font files in `apps/web/index.html`.
4. Define the requested token scheme in `tokens.css` and keep existing aliases
   mapped for compatibility.
5. Add centralized mono typography rules in `base.css` for buttons, fixed tags,
   status pills, metadata, IDs/counts, select hints, and other machine-readable
   UI terms.

## Scope

In scope:

- Worker Web font token layer.
- Worker Web local font assets and preload hints.
- CSS-only mono taxonomy for fixed UI terms and controls.
- PMA documentation.

Out of scope:

- Backend/API changes.
- Redesigning text hierarchy beyond font-family assignment.
- Changing user-authored prose, textareas, or artifact Markdown content to mono
  outside existing code/pre formatting.

## Risks

- Over-applying mono to prose would reduce readability, so the rule targets
  buttons, fixed labels, metadata, tags, and code-like surfaces only.
- Preloading too many subsets would waste bandwidth; this plan preloads only the
  Latin normal variable files used above the fold.

## Verification Plan

- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' lint`
- `bun run --filter '@zonease/aiworker-web' test`
- `bun run --filter '@zonease/aiworker-web' build`
- `git diff --check`
- Browser smoke on `http://127.0.0.1:9217`
- `bun run crg:update`
- `bun run crg:review`

## Approval Gate

Approved by operator on 2026-05-12 through the direct font token and mono usage
correction request.

## Progress

- 2026-05-12 03:07: Added local font faces, preload hints, requested font
  tokens, and centralized mono surface rules.
- 2026-05-12 03:11: Verified focused Web gates, local font delivery, Browser
  smoke, and code-review-graph review; closed BUG-115 / PLAN-274.

## Result

Worker Web now self-hosts the requested display/UI/mono font scheme, preloads
the critical variable font files from `index.html`, and consistently applies
mono typography to project terminology, constants, numeric/status metadata,
fixed tags, and button labels.
