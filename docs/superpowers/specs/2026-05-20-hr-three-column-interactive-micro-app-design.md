# HR Three Column Interactive Micro-App Design

## Context

AIWorker HR is a profile-first Soul App. The accepted people profile is the
primary object; artifacts are evidence or update proposals; sessions are the
work process around a profile. The current Host/Soul boundary is also clear:
Host mounts app-owned UI and routes public protocol/API surfaces, while the HR
Soul App owns profile semantics, review meaning and workflow language.

The mature HR workbench used to have a three-column desktop experience:

```text
Profile List | Reading Room / Patch Review | Recent Sessions + Composer
```

During the app-owned mounted surface migration, the Host-embedded renderer was
removed correctly, but the HR app-owned surface is still closer to a static
proof surface. The goal is to restore the mature three-column product
experience inside `apps/aiworker-hr`, without recreating
`apps/web/src/worker/souls/hr` or moving HR domain logic back into Host Web.

## Goals

- Restore the default desktop three-column HR workbench.
- Keep the implementation app-owned under `apps/aiworker-hr`.
- Make `Profile List`, `Reading Room`, and `Recent Sessions + Composer`
  visible by default for a selected profile.
- Predefine and show all profile lifecycle groups in the left column:
  `候选人`, `在职员工`, and `离职归档`.
- Restore the right-panel working ability: recent sessions, proposal type,
  text input, multi-file candidate material input, session submission, busy
  state and retryable error state.
- Keep profile patch review and approval in the center column.
- Keep Host Web as a mounted container and protocol/API router, not a HR domain
  renderer.

## Non-Goals

- Do not restore `apps/web/src/worker/souls/hr`.
- Do not put HR profile composition or review interpretation into Host Web.
- Do not make the right column a generic dashboard, settings panel or log view.
- Do not let the composer directly mutate the accepted profile.
- Do not introduce `packages/component`, `@zonease/aiworker-component` or
  `lucide-react` into the new HR app product web slice.
- Do not solve full ATS connector ingestion in this pass. Uploaded files and
  explicit source references are enough for this slice.

## Architecture

The mounted HR route becomes an interactive HR micro-app:

```text
Host Web mounted container
  -> /api/local/apps/aiworker-hr/micro-app/routes/hr-home
  -> HR app-owned client entry
  -> Host public local API and mounted route context
  -> HR app-owned profile workbench state and rendering
```

Host responsibilities:

- mount the micro-app route;
- provide narrow host data such as `workerId`, `workspaceId`, `theme`,
  `routePrefix`, app id and mount token status;
- expose public local API routes for workspace sessions, workspace files,
  profile README, profile revision promotion, artifacts, reviews and lessons;
- enforce mounted service permissions and broker boundaries.

HR app responsibilities:

- map workspaces into lifecycle profile groups;
- render the three-column workbench;
- parse accepted `README.md` into Reading Room sections;
- compare proposed profile drafts against accepted profile sections;
- own profile composer copy and proposal type labels;
- submit profile proposal sessions;
- keep approval inside the center patch review flow.

This preserves the current architecture contract: Host consumes only explicit
Soul App surfaces and does not infer HR profile fields or review verdict
meaning.

## Component Design

The HR app product web surface should be split into an interactive shell and
small presentational columns.

```text
HrPeopleWorkbenchApp
  -> ProfileListColumn
  -> ProfileReadingRoomColumn
  -> ProfileComposerColumn
```

`HrPeopleWorkbenchApp` owns:

- host data normalization;
- data loading and refresh;
- selected profile state;
- session creation;
- material file upload;
- profile revision promotion callbacks;
- status and error state.

`ProfileListColumn` owns:

- all lifecycle groups rendered by default;
- group empty states;
- selected profile item state;
- profile filter when useful.

The lifecycle groups are fixed in this order:

1. `候选人`
2. `在职员工`
3. `离职归档`

All groups are expanded by default. Empty groups remain visible with an empty
state so the left column reads as a people lifecycle map, not only a recruiting
queue.

`ProfileReadingRoomColumn` owns:

- accepted profile section rendering;
- empty accepted-profile state;
- profile patch strip;
- section-aware `Profile Patch Review`;
- profile revision approval and failure display.

`ProfileComposerColumn` owns:

- compact `Recent Sessions` list;
- profile composer title and safety copy;
- text input;
- multi-file candidate material rows;
- proposal type selector;
- submit button;
- busy, disabled and retryable error states.

## Interactive Runtime

The mounted route should serve a real interactive HR app entry rather than a
static proof card plus scattered inline handlers.

Implementation should provide:

- a HR product web client entry bundled with the HR app package;
- mounted HTML that includes the app-owned styles and client script;
- hydration or client render into the mounted route root;
- a small app-owned host-data adapter that reads micro-app data and falls back
  to route query parameters when needed for standalone verification;
- app-owned API helpers for local Host API calls.

The client entry may reuse server-rendered markup as an initial shell, but the
source of truth for interactive state is the HR app client. This keeps the
composer, file attachments, Recent Sessions refresh and patch-review state in
normal React code instead of a one-off DOM script.

## Layout

Desktop default:

```text
┌────────────────┬───────────────────────────────┬─────────────────────────┐
│ Profile List   │ Reading Room / Patch Review    │ Recent Sessions         │
│                │                               │ Composer                │
└────────────────┴───────────────────────────────┴─────────────────────────┘
```

The right column is visible by default when a profile is selected. It is not a
collapsed rail. The center Reading Room may expand only if the user explicitly
hides the right column in a later interaction; the restored default is three
visible columns.

Suggested desktop proportions:

```text
Profile List: 220-320px
Reading Room: minmax(0, 1fr)
Right column: 340-420px
```

Narrow layouts may stack or move the right composer under the Reading Room, but
they must preserve the same conceptual order: profile selection first, accepted
profile second, composer context third.

## Data Flow

Initial load:

```text
micro-app host data
  -> normalize workerId/workspaceId/theme
  -> load workspaces/sessions/artifacts/reviews/lessons for the worker or workspace
  -> load selected workspace README.md profile
  -> build person profiles and lifecycle groups
  -> render selected profile Reading Room and right composer
```

Composer submission:

```text
user text + candidate material files
  -> write files to evidence/uploads/
  -> build material descriptors
  -> POST workspace session with selected proposal type
  -> include material descriptors in context and metadata
  -> refresh sessions/artifacts/reviews/profile patch state
```

Patch review:

```text
latest reviewable proposal artifact
  -> HR app extracts promotable profile draft
  -> compare current README sections with proposed README sections
  -> center column shows patch strip or blocker state
  -> user opens patch review
  -> user approves whole patch
  -> POST profile revision promotion
  -> reload accepted README profile
```

The default proposal type is `profile-update-proposal`, displayed as
`候选人档案草案`. Other proposal types remain secondary selector options such as
`证据整理`, `面试提纲`, and `风险检查`.

## Public API Use

The HR micro-app should use Host public local APIs through route-relative paths
or the mounted route prefix supplied by host data. It must not import Host Web
source or private Host packages.

Expected API use:

- read sessions for a workspace;
- create a workspace session or session stream;
- read and write workspace files;
- read accepted profile README;
- promote profile revisions;
- read artifacts, reviews and lessons needed for the selected profile.

Candidate material files should be written under:

```text
evidence/uploads/
```

Session context should include a clear section such as:

```text
Attached candidate material:
- evidence/uploads/<file-name>
```

Session metadata should include material descriptors with at least filename,
workspace path and count.

## UI States

### No Profiles

The left column still renders all lifecycle groups. Each group displays an
empty state. The center column prompts the user to create or select a people
profile. The right composer is disabled because no profile is selected.

### Selected Profile Without Accepted Content

The center column shows an empty Reading Room for the accepted profile. The
right column is enabled and defaults to `候选人档案草案`.

### Draft In Progress

Recent Sessions shows the active session at the top. The composer shows a busy
state and keeps user input stable until the request has completed or failed.

### Patch Ready

The center Reading Room shows a slim patch strip and a `Review` action.
Approval is only available in the center `Profile Patch Review` view.

### Patch Blocked

The center column explains the blocker, such as missing promotable profile
draft or proposal-state language inside the draft. The right composer remains
available for generating a corrected proposal.

### Accepted Profile

The center column shows the accepted profile. Recent Sessions includes the
proposal/review session. The composer remains available for the next profile
update or supporting artifact.

## Error Handling

- Data load failure: keep the three-column shell visible and show local error
  states in the affected column.
- Missing `workerId` or `workspaceId`: render a non-submittable mounted demo or
  empty state and explain that a workspace context is required.
- File read or upload failure: keep composer text and existing attachments,
  mark the failed material and allow retry.
- Unsupported material type: reject before submission with a local composer
  error.
- Session creation failure: keep the composer available and do not add a fake
  successful recent session.
- Patch extraction failure: show a center-column blocker and suggest generating
  a corrected candidate profile draft.
- Promotion failure: keep the accepted profile unchanged and show the failure
  in the center patch review view.

## Component Library Preflight

Use `@zonease/aiworker-ui` shadcn-managed primitives in the HR app:

- `Button`
- `Badge`
- `Card`
- `Item`
- `Input`
- `Textarea` or the closest existing shadcn primitive
- `Select` or app-local composition only if the shared primitive is missing
- `Table`
- `Separator`

Icons must follow the active `packages/ui/components.json` icon library. The
current preset is hugeicons, so new visible UI must use
`@hugeicons/core-free-icons` and `HugeiconsIcon`, not `lucide-react`.

App-local CSS is allowed only for HR-owned layout and micro-app responsive
behavior. It should use semantic shadcn theme variables and Tailwind v4 tokens,
not feature-local hex palettes or arbitrary colors.

## Testing And Verification

Focused HR app tests should prove:

- the mounted HR route renders app-owned interactive three-column structure;
- all three profile groups are visible and expanded by default;
- empty groups remain visible;
- the right column renders Recent Sessions above the composer;
- the composer defaults to `profile-update-proposal` while displaying
  `候选人档案草案`;
- multiple candidate material files can be attached and removed;
- submitted materials are written under `evidence/uploads/`;
- session context and metadata include material descriptors;
- patch review and approval remain in the center column;
- Host Web does not restore a HR renderer path.

Verification commands:

```bash
bun run --filter '@zonease/aiworker-hr' test
bun run --filter '@zonease/aiworker-hr' typecheck
bun run --filter '@zonease/aiworker-hr' validate
bun run --filter '@zonease/aiworker-hr' smoke
bun apps/web/scripts/smoke-mounted-surfaces.ts
bun run ui:check
git diff --check
bun run crg:update
bun run crg:review
```

Browser verification should include desktop and narrow viewport screenshots.
The desktop screenshot must show all three columns at once. The visual review
must reject overlapping text, right-column clipping, hidden lifecycle groups,
nonfunctional composer controls and radius/border regressions.

## Acceptance Criteria

- HR mounted desktop route defaults to three visible columns.
- Profile List shows `候选人`, `在职员工`, and `离职归档` expanded by default.
- Right column restores full Recent Sessions plus profile composer behavior.
- Composer can submit a profile proposal session with multiple candidate
  material files.
- Center Reading Room remains the only approval surface for accepted profile
  revisions.
- No HR domain renderer is reintroduced under `apps/web/src/worker/souls/hr`.
- The implementation is owned by `apps/aiworker-hr` and uses
  `@zonease/aiworker-ui` primitives.
