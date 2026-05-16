# HR Profile Reading Room Design

## Decision

AIWorker HR should make the accepted People Profile the first visual object and
the first product concept.

The canonical profile remains a plain Markdown `README.md`. It is not a Web-only
dashboard, not an HTML layout, and not a free-form container where every skill
adds a new top-level section. The Web workbench should enhance how the Markdown
is read by parsing known sections and rendering a profile-first Reading Room.

The product contract is:

```text
README.md = accepted People Profile baseline
artifact = proposed profile update or supporting work product
review pass/warn = allowed promotion into README.md
external section = accepted supporting material linked from README.md
Web Reading Room = section-aware renderer for README.md
```

The workbench keeps the existing three-column, full-height layout. Each column
continues to own its vertical scroll:

```text
[ profile list ] [ README reading room ] [ tools rail / drawer ]
      scroll              scroll                 scroll
```

The change is not to replace the layout with a document page. The change is to
make the center column clearly read as the accepted profile, while the right
column stops competing with the profile by default.

## Current Findings

The current HR implementation already has the right domain boundary:

- `README.md` is the accepted profile state for a profile workspace.
- Session outputs under `artifacts/` are proposals until review.
- `promoteProfileRevision` writes the reviewed artifact into `README.md`.
- The HR workbench reads `profilePreview` and renders it as Current Profile
  Summary.

The product problem is visual and semantic hierarchy. The current center column
contains the profile summary, profile sources, proposed change, timeline and
review guardrails as peer surfaces. That makes `README.md` present but not
dominant. A user can see many useful things, but cannot immediately tell that
the accepted profile is the primary object.

The current README template is also too sparse to feel like a person profile.
It says a profile revision has not been approved, but it does not provide a
stable information architecture for identity, role context, capability/stack,
responsibility scope, evidence status, risks and next HR actions.

## Goals

- Make `Current Profile Summary` the dominant first-read surface in HR.
- Keep `README.md` plain, portable Markdown that works in GitHub, terminal and
  ordinary editors.
- Add a stable base-section contract for HR People Profiles.
- Allow future skills to improve base sections or produce accepted external
  sections without turning README into a skill-output dump.
- Preserve the three-column full-height workbench layout and each column's own
  vertical scroll.
- Move sources, proposed changes, guardrails and sessions into a right-side
  tools rail/drawer that is collapsed by default.
- Keep Host/Soul boundaries intact: HR owns profile meaning; Host and shared
  workbench code only render exposed profile content.

## Non-Goals

- Do not make README depend on HTML, frontmatter metadata or Web-only layout
  syntax.
- Do not create a block editor or bidirectional Markdown editor.
- Do not allow every skill to freely append permanent top-level README sections.
- Do not remove profile artifacts, review records, lessons or sessions.
- Do not change the promotion boundary so agent output can directly overwrite
  the accepted profile.
- Do not collapse the workbench into a single long page or make side columns
  scroll with the document.
- Do not make Host interpret HR profile meaning outside HR-owned renderer code.

## README Base Section Contract

The HR workspace seed `README.md` should use plain Markdown with fixed `##`
headings. The first implementation should support this base contract:

```md
# {{workspaceName}}

> Accepted People Profile. Agent outputs remain proposals until review.

## Current Profile Summary

No approved profile revision yet.

## Identity And Basics

- Lifecycle: Unknown
- Target role: Unknown
- Current stage: Not started
- Profile confidence: No accepted evidence yet

## Role Context And Responsibilities

No accepted role context yet.

## Capabilities And Stack

- No accepted capabilities yet.

## Confirmed Facts

- No confirmed facts yet.

## Evidence Status

| Signal | Status | Source |
| --- | --- | --- |
| Profile baseline | Missing | No approved revision |

## Risks And Gaps

- No accepted risks or gaps yet.

## Next HR Actions

- Approve a profile revision to update this README.

## Review State

No approved profile revision yet.

## Accepted External Sections

- None yet.
```

This section order matters for the default reading experience, but the renderer
must not require the exact order to avoid breakage.

### Base Sections

`Current Profile Summary` is the top-level human summary. It should answer:
"Who is this person in the current HR context, and what is the accepted state of
the profile?"

`Identity And Basics` captures stable identifying context such as lifecycle,
target role, process stage and profile confidence. It should avoid sensitive or
protected-class attributes unless explicitly reviewed and legally appropriate.

`Role Context And Responsibilities` explains the role or lifecycle context that
makes the profile meaningful. For candidates this may include target role,
responsibility scope and role-related evaluation criteria. For employees or
alumni it may include team scope, current responsibility, transition context or
handoff scope.

`Capabilities And Stack` captures role-related capabilities, tools, technical
stack, domain skills or operational strengths. The wording should remain tied
to accepted evidence and role relevance.

`Confirmed Facts` stores accepted factual claims with source discipline.

`Evidence Status` shows which important signals are supported, partial, missing
or conflicting.

`Risks And Gaps` keeps weak, missing or risky claims visible.

`Next HR Actions` names the next reviewed human or workflow action.

`Review State` explains whether the profile baseline is reviewed and whether
there are pending proposals.

`Accepted External Sections` is an index of accepted supporting material. It
uses links and short summaries, not full pasted artifacts.

## External Section Model

Future HR skills can affect the profile in two ways:

1. Propose edits to existing base sections.
2. Produce external sections that become accepted supporting material after
   review.

Examples of external sections include:

- interview brief;
- evidence matrix;
- hiring risk review;
- onboarding plan;
- offboarding handoff;
- compensation note;
- reference check summary.

An external section should remain outside the README body when it is too long,
too specialized or only useful in a review context. The README should link to
the accepted file and summarize why it matters. This keeps the accepted profile
readable while preserving richer supporting material.

The default rule is:

```text
Base section = broadly useful profile state
External section = accepted supporting material with a narrow purpose
Artifact = proposed or session-generated material before acceptance
```

## Web Reading Room

The HR workbench should preserve three columns:

- left: profile list;
- center: README reading room;
- right: tools rail or expanded tools drawer.

The existing grid/full-height behavior is part of the design contract. Desktop
viewports should keep each column `min-height: 0` with internal vertical
scrolling. Long profile content must scroll inside the center column, not push
the whole workbench height.

### Center Column

The center column becomes a section-aware profile renderer. It reads
`profilePreview.content`, parses known `##` sections and renders a profile-first
reading flow:

1. prominent profile title and current summary;
2. identity snapshot from `Identity And Basics`;
3. role context and responsibilities;
4. capabilities and stack;
5. confirmed facts;
6. evidence status;
7. risks, gaps and next actions;
8. review state and accepted external sections.

The renderer may use cards, chips or tables in Web, but those are presentation
choices only. The source remains normal Markdown.

### Right Column

The right column should default to a narrow icon rail. It should expose tools
without forcing the user to read them:

- sources/evidence;
- proposed change;
- review guardrails;
- recent sessions or profile actions.

Opening an icon expands the right column into a drawer-like tools panel that
keeps its own vertical scroll. The default should be collapsed even when a
proposal exists. Pending state may appear in the lightweight status strip, but
it should not auto-expand and interrupt reading.

### Lightweight Status Strip

The center column may keep a compact status strip above the README reading
surface. It should show only high-signal state such as:

- evidence ready or missing;
- pending proposal count;
- next HR action.

It must not become a metrics wall. It should not displace the summary from the
first screen.

## Section Parser

The Web parser should be intentionally small:

- split Markdown by level-two headings (`## `);
- retain heading text and raw Markdown body;
- normalize known section titles;
- return unknown sections without dropping them;
- avoid rewriting Markdown;
- avoid frontmatter or hidden UI metadata.

Known titles for the first implementation:

```text
Current Profile Summary
Identity And Basics
Role Context And Responsibilities
Capabilities And Stack
Confirmed Facts
Evidence Status
Risks And Gaps
Next HR Actions
Review State
Accepted External Sections
```

The parser should live near the HR workbench model unless shared reuse emerges.
It is product rendering logic for the HR Soul workbench, not a Host-wide domain
interpreter.

## Data Flow

Profile reading flow:

```text
workspace README.md
  -> local workspace readProfile API
  -> Worker Web profilePreview state
  -> HR section parser
  -> HR Reading Room renderer
```

Promotion flow remains unchanged:

```text
session output artifact
  -> human review
  -> promoteProfileRevision
  -> README.md updated
  -> profilePreview reload
  -> Reading Room re-renders
```

The right tools column continues to use existing artifacts, sessions, reviews
and lessons. It does not write to README directly.

## Error Handling And Fallbacks

The parser and renderer must not make profile reading fragile.

- Missing `Current Profile Summary`: show a gentle empty state and keep a full
  Markdown fallback available.
- Missing base section: render the remaining sections and show a small empty
  state only where useful.
- Unknown `##` headings: render them under `Other Profile Notes` or an
  equivalent fallback area.
- Parser failure: fall back to the current full `MarkdownPreview`.
- Proposed change is not a complete README: do not allow it to silently replace
  the accepted profile. It still requires the review/promotion boundary.

## Testing And Verification

Focused tests should cover:

- bootstrap README includes the new base sections;
- generic profile ledger fallback remains valid when app workspace templates are
  absent;
- HR parser splits known sections and preserves unknown sections;
- HR renderer falls back to full Markdown when sections are missing or parsing
  fails;
- workbench renders `Current Profile Summary`, identity, role, capabilities and
  accepted external sections from a profile README;
- desktop layout keeps profile list, reading room and tools rail as independent
  full-height scroll areas;
- right tools column starts collapsed by default;
- profile promotion still updates `README.md` only through review.

Manual/browser verification should include desktop and narrow viewport checks.
The desktop check must confirm that the three-column workbench still fills
available height and each column owns its scroll.

## Open Decisions

No product decision remains open for the first implementation. Later work may
decide how external sections are registered beyond Markdown links, but this
slice should keep the registry implicit in `Accepted External Sections`.
