# HR Profile Revision Review Workbench Design

## Intent

AIWorker HR should feel like a vertical people-profile product, not a generic
artifact browser. The next Web slice upgrades the selected profile's proposed
change area into a review workbench that helps an HR reviewer understand what
will change before accepting a profile revision into `README.md`.

This is the first step in the agreed order:

1. Profile Revision Review Workbench.
2. People Pipeline Board.
3. Visual polish pass.

This spec covers only step 1.

## Current State

The HR workbench already centers the accepted `README.md` profile in the middle
column and keeps artifacts, review guardrails, sessions, and composer controls
in the right panel. After the headless promotion work, CLI/runtime/API can
promote only clean `aiworker-profile-readme` drafts. Web still renders the
latest artifact as full Markdown and exposes a single approve button.

That means the reviewer must infer which part of the artifact will become the
profile, whether the proposal is promotable, and what state will exist after the
click.

## Product Design

The right panel's `Proposed Change` section becomes a revision review surface:

- a compact status strip tells the reviewer whether the selected artifact is
  promotable, still loading, missing an accepted README draft, or blocked by
  proposal-state language;
- the accepted README draft is extracted and shown as the primary preview when
  available;
- the current profile summary and proposed profile draft are shown side by side
  in a compact comparison;
- the approve button is disabled when the draft is not promotable and explains
  why;
- the section copy uses HR profile/revision language, not Host/runtime wording.

The section still stores no HR facts in Host state. It only renders the current
profile Markdown, the selected artifact Markdown, and shared profile-promotion
validation output.

## Architecture

Add a small Web-local review model under the HR people workbench:

- input: current profile preview, selected artifact, artifact preview, and copy;
- output: view state for status, extracted draft, current/proposed summaries,
  validation messages, and approve disabled reason.

`@zonease/aiworker-shared` remains the source for
`prepareProfileMarkdownForPromotion(...)`. HR Web does not duplicate fence
parsing or interpret profile domain facts beyond displaying known README
sections through the existing HR README parser.

## Components

- `revision-review.ts`: pure model that prepares review UI state from Markdown
  previews and shared validation.
- `profile-tools-panel.tsx`: renders the revision review state inside the
  existing proposed-change section.
- `copy.ts`: adds concise labels for revision status, comparison, and disabled
  states.
- `styles.css`: adds dense, scan-friendly review status and comparison layout.

No new route, modal, storage schema, API route, or Soul App protocol surface is
introduced.

## Error Handling

- No selected artifact: show the existing empty state and keep approve disabled.
- Artifact loading: show loading status and keep approve disabled.
- Artifact preview error: show the existing error state and keep approve
  disabled.
- Missing `aiworker-profile-readme` draft: show a product-level warning and keep
  approve disabled.
- Proposal-state language inside the accepted draft: show validation messages
  and keep approve disabled.

## Testing

- Add pure model tests for promotable drafts, missing fence, pending language,
  and current/proposed summary extraction.
- Extend Worker Web integration coverage so the HR workbench shows the extracted
  draft, disables invalid approvals, and still posts only the accepted draft
  when valid.
- Run focused Web tests, Web typecheck/build as needed, root lint, and
  code-review-graph because production UI code changes.

## Self-Review

- No placeholders remain.
- Scope is limited to the HR Web proposed-change/revision review surface.
- Host/Soul boundary is preserved: Host renders app-owned profile/artifact
  surfaces and uses shared validation, but does not synthesize HR facts.
- Follow-up steps B and C are intentionally outside this spec.
