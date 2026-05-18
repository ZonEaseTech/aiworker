# HR Soul App Header Convergence Design

## Status

Approved direction in chat on 2026-05-18 after the user clarified that the
header to remove is the HR Soul App workbench header, not the Host header.

## Goal

Reduce the HR People Workbench chrome so the user reads and acts on the current
people profile instead of navigating a second app-level shell inside the Host
shell.

The Host header remains visible and Host-owned. The HR Soul App should stop
rendering its own top workbench header row with duplicate title, search, counts
and broad actions.

## Product Principle

Actions belong next to the object they affect:

- People-list actions belong to the People Profiles panel.
- Current-profile actions belong to the selected People Profile header.
- Next-step and secondary workflow actions belong to the right panel.
- Host layout controls remain Host-owned unless a control only affects an
  HR-owned panel inside the HR workbench.

This preserves the profile-first model: the selected person profile is the main
object; artifacts, review patches and sessions support that profile.

## Approved Layout

```text
Host Header
+-------------------------------------------------------------------------------+
| AIWorker HR / AIWorker HR                                      [host controls] |
+-------------------------------------------------------------------------------+

HR People Workbench
+-------------------------+---------------------------------------------+-----------------+
| People Profiles         | Stella People Profile                       | Profile Actions |
| [search] [count] [ + ]  | Stella - review / lesson candidate         |                 |
| Candidates              | [left] [right] [refresh] [evidence] [gear] |                 |
| Ben                     | README profile content starts here.        |                 |
| Stella                  | No separate Current Profile Summary UI.   |                 |
+-------------------------+---------------------------------------------+-----------------+
```

## Header Removal

Remove the HR Soul App top workbench header that currently contains:

- `AIWorker HR / People Workbench`;
- `People Workbench`;
- the workspace subtitle;
- global people search;
- counts for profiles, artifacts and lessons;
- `New people profile`;
- `Refresh`;
- `Evidence`;
- `HR settings`;
- HR left/right panel toggle buttons.

These controls do not disappear. They move to local object headers described
below.

## People Profiles Panel

The left panel becomes the home for people-list controls.

Header contents:

- title: `People Profiles`;
- compact count for visible profiles;
- search control for people profiles;
- icon button for new people profile.

The new-profile action should use a `Plus` icon button with a tooltip and
accessible name such as `New people profile`. It should not occupy the main
profile header or the removed workbench header.

## Current People Profile Header

The center Reading Room owns a single selected-profile header. It replaces the
visual role currently split between `People Workbench`, `[workspace] People
Profile` and `Current Profile Summary`.

Header contents:

- primary title: `{workspaceName} People Profile`, for example
  `Stella People Profile`;
- secondary line with the profile state, for example `review`, `lesson
  candidate`, accepted baseline status, or patch review status;
- HR-owned panel toggles for the People Profiles panel and the right tools
  panel;
- profile-scoped actions: refresh, evidence and HR settings.

The `Current Profile Summary` phrase remains valid README section content but
should not render as an extra UI header around the profile document. The body
should begin with the accepted README profile content or section cards directly
under the selected-profile header.

## Patch Review Bar

The slim patch bar is visible only when there is an actionable profile patch.

It must be hidden when:

- the selected profile has no pending reviewable artifact;
- the review model reports `changedSectionCount` as `0`;
- a previously ready patch has already been approved into README;
- the current visible artifact no longer maps to a promotable README patch.

The action button should be short. Use `Review` when the context already says
`Profile patch ready`, or use an icon button with tooltip `Review profile patch`
if the row is tight. Do not use long labels inside a narrow button.

## Right Panel

The right panel remains a concise profile actions surface. It should not
reintroduce a markdown preview or become another header/action pile.

Recommended contents:

- next review/run action;
- compact source or activity summaries;
- proposal composer;
- overflow affordance for secondary actions when more than two actions compete.

## Boundary With Host Shell

This change must not remove or redesign the Host header. Host header controls
for Host sidebar, terminal or Host right panel stay with the Host shell.

The HR controls moved into the selected-profile header are HR-owned because
they only affect the HR workbench panels or profile tools. They must not be
implemented as Host shell slots.

## Verification Expectations

- Worker Studio tests cover the absence of the HR workbench header.
- Tests verify `New people profile` lives in the People Profiles panel header.
- Tests verify HR left/right panel toggles live in the selected People Profile
  header.
- Tests verify no separate `Current Profile Summary` UI header is rendered
  around the document, while README section content remains intact.
- Tests verify the patch bar disappears for zero changed sections and after
  approval.
- Tests verify the patch bar action uses a short label or icon affordance.
- Browser smoke verifies the local HR workspace at desktop width and confirms
  the Host header remains visible.
