# HR Profile Patch Review Workbench Design

## Goal

Make the HR People Workbench understandable for humans reviewing profile
changes. A session artifact that wants to update `README.md` should render as a
section-aware Profile Patch: what the accepted profile says now, what it would
become, and whether the patch can be approved.

## Product Principle

The accepted README profile is the primary object. Artifacts are reviewable
proposal sources. Sessions are the work process around the profile. The user
reviews a profile state transition, not a raw artifact markdown document.

## Main Surfaces

### Reading Room

The Reading Room remains the default center-column surface. It reads like a
document, not a dashboard.

When a reviewable patch exists, the Reading Room shows one slim strip:

```text
Profile patch ready · 2 sections changed · 0 blockers        [Review]
From: Person Profile Proposal · 4h ago                         +2 more
```

The strip never renders markdown or a changed-section list. It answers only:
there is a pending profile patch, how large it is, whether it is blocked, and
how to review it.

Each affected section heading receives a compact badge:

- `+` means the patch adds accepted content to an empty or missing section.
- `~` means the patch changes existing accepted section content.
- `!` means a pending patch touches this section but cannot currently be
  promoted.

The badge opens Profile Patch Review and focuses that section. Agent run
shortcuts are separate from patch badges. A section run shortcut may appear on
hover/focus or as a lightweight empty-section prompt, but it starts a new
proposal; it does not approve or edit README directly.

### Profile Patch Review

Profile Patch Review replaces the center Reading Room while active. It is not a
modal and not a right drawer.

```text
Back to Reading Room
Profile Patch Review
Person Profile Proposal · 4h ago · 2 changed sections · 0 blockers

Changed Sections        Current README              Proposed README
[~] Summary             Current text...             Proposed text...
[+] Identity            No accepted content yet.    Proposed identity...
[~] Role Context        Current role...             Proposed role...

Source artifact: Person Profile Proposal
Guardrails: passed · accepted README draft extracted · proposal language clean
                                            [Reject] [Approve into README]
```

The comparison is section-aware. It compares parsed HR README sections, not raw
session files or generic text diffs. Approval is whole-patch only in this
version.

### Blocked Patch

If an artifact cannot form a promotable README patch, the review view explains
why and keeps the current README unchanged:

```text
Profile Patch Blocked
This artifact cannot be promoted into README.
- Missing aiworker-profile-readme fenced draft
- Accepted draft contains proposal-state language

[Back to Reading Room] [Run profile-update-proposal]
```

Blocked state does not render a large raw artifact markdown preview in the
right panel.

### Right Panel

The right panel becomes a Next Step panel. It does not contain markdown
preview. It should show:

- the current primary next step;
- one primary action such as `Review patch`;
- at most two secondary actions before a `More actions` affordance;
- compact source/activity summaries;
- the proposal composer.

When a patch is ready, the panel emphasizes review. When no patch exists, it
emphasizes the next profile proposal action.

## Interaction Rules

- Reading Room default state is reading-first.
- Patch strip is visible only when a selected/latest reviewable artifact exists.
- Section badges are indicators and review anchors, not extra action menus.
- Profile Patch Review owns approve/reject.
- Right panel never duplicates the full Reading Room or full patch review.
- Whole-patch approval writes README through the existing promotion flow.
- Section-level partial approval is intentionally out of scope.

## Accessibility

- Patch strip, section badges and review controls must have accessible names.
- Badge navigation must be keyboard reachable.
- The review view must maintain a clear heading hierarchy and visible focus.
- Long section comparisons use internal scroll or clamping without trapping
  keyboard users.

## Verification Expectations

- Unit tests cover section patch classification and blocked/ready states.
- Worker Studio tests cover Reading Room patch strip, section badges, patch
  review mode, approve flow and right-panel markdown removal.
- Browser smoke verifies the local HR workspace at desktop and a narrower
  viewport after implementation.

