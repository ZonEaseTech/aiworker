# HR Profile Ledger And Native Skills Design

## Decision

AIWorker HR should become a profile-first vertical Soul App. The first product
loop focuses on candidate-stage people profiles, while keeping the model and UI
ready for employee and alumni stages.

The core contract is:

```text
one profile item = one profile workspace = one local git repo
README.md = current accepted People Profile
artifact = proposed profile change or supporting work product
human review pass = accepted profile revision
git tag = approved profile version
```

Git is an internal revision substrate. HR users should see People Profile,
Proposed Change, Review Passed, Profile Revision, and Approved Version. They
should not see commit, branch, git log, or repository language in normal product
surfaces.

Soul Apps may also ship native engine skills as app-owned domain assets. The
canonical source directory is:

```text
apps/<app-id>/skills/<skill-id>/SKILL.md
```

For `aiworker-hr`, the initial skill set should be:

```text
apps/aiworker-hr/skills/
  candidate-profile/SKILL.md
  profile-update-proposal/SKILL.md
  evidence-screening/SKILL.md
  interview-brief/SKILL.md
  hiring-risk-review/SKILL.md
```

Host/runtime projects those skills into each relevant workspace root during app
and workspace lifecycle operations:

```text
workspaceRoot/
  .agents/skills/aiworker-hr-candidate-profile/SKILL.md
  .claude/skills/aiworker-hr-candidate-profile/SKILL.md
  .aiworker/native-skill-projections.json
```

This projection mechanism is a platform capability. A Soul App without skills is
still valid; projection is a no-op for that app.

## Scope

This design covers the next HR product milestone:

- profile item as workspace;
- `README.md` as the canonical human-readable profile surface;
- local git-backed profile revisions;
- artifact-to-review-to-profile promotion;
- HR native skill source directory and workspace projection;
- Worker Web information architecture for People Profiles;
- validation and test expectations for the design.

It does not include:

- remote git hosting or pushing;
- branch-based collaboration;
- exposing git terms in HR UI;
- replacing Host metadata, app registry, broker, or review routes wholesale;
- full ATS connector implementation;
- production privacy deletion guarantees for git history;
- Employee and Alumni workflows beyond preserving first-level list structure and
  stage-ready model slots.

## Product Shape

The main HR workbench should be a focused People Profile Ledger, not a generic
dashboard.

The left rail is a profile list organized by lifecycle stage:

```text
People Profiles
  Candidate
    Ada Chen
    Mina Patel
    Jon Rivera
  Employee
    Rui Wang
    Sam Lee
  Alumni
    Leah Stone
```

Each list item is one profile workspace. Selecting any item opens the same
ledger layout. The first implementation emphasizes Candidate actions and
recruiting context, but the frame should not rename the whole product to
Candidate Profiles.

The visual center of the middle pane is Current Profile Summary. Metrics,
recruiting context, evidence gaps, and Profile Change Ledger support that
summary instead of competing with it.

The right rail is Profile Tools. For candidate-stage profiles, it should prefer:

- generate profile update;
- evidence screening;
- interview brief;
- hiring risk review;
- request profile review.

## Workspace Contract

A profile workspace should have this shape:

```text
workspaceRoot/
  README.md
  artifacts/
    <sessionId>/
      <turnId>-profile-update-proposal.md
      <turnId>-interview-brief.md
  reviews/
    <reviewId>.md
  evidence/
    README.md
    descriptors/
    raw/
  .agents/
    skills/
      aiworker-hr-candidate-profile/
        SKILL.md
  .claude/
    skills/
      aiworker-hr-candidate-profile/
        SKILL.md
  .aiworker/
    native-skill-projections.json
    sessions/
```

`README.md` is the accepted current People Profile. It should be readable by a
human and useful to an engine starting from `workspaceRoot`.

`artifacts/` stores session outputs. These are proposed changes or supporting
work products. A generated artifact does not update the profile by itself.

`reviews/` stores human review records that explain whether a proposal can
change the profile.

`evidence/` stores evidence descriptors and optional raw files. Raw evidence
should be ignored by git by default unless the app explicitly decides a safe
descriptor or normalized summary can be versioned.

`.agents/skills` and `.claude/skills` are projection targets, not source of
truth. They should be ignored by profile revision commits.

`.aiworker/native-skill-projections.json` records projection ownership and
digests. It is Host/runtime metadata, not profile content.

The workspace `.gitignore` should keep profile history focused on reviewed
profile state:

```gitignore
.aiworker/sessions/
.aiworker/native-skill-projections.json
.agents/skills/aiworker-*
.claude/skills/aiworker-*
evidence/raw/
```

Accepted profile revisions should include `README.md`, the accepted artifact or
proposal record, and the human review record. Pending session outputs may exist
in the working tree before promotion, but UI must label them as proposed changes,
not current profile facts.

## Native Skill Projection

Soul App skills are discovered statically. Host must not execute app code during
discovery.

The simplest authoring rule is:

```text
apps/<app-id>/skills/*/SKILL.md
```

The directory name is the default skill id. The projected id is namespaced:

```text
<app-id>-<skill-id>
```

For example:

```text
apps/aiworker-hr/skills/evidence-screening/SKILL.md
  -> workspaceRoot/.agents/skills/aiworker-hr-evidence-screening/SKILL.md
  -> workspaceRoot/.claude/skills/aiworker-hr-evidence-screening/SKILL.md
```

An optional manifest field may provide explicit scope later:

```json
{
  "skills": [
    {
      "id": "evidence-screening",
      "ref": "./skills/evidence-screening/SKILL.md",
      "workspaceTypes": ["people-profile", "candidate"],
      "targets": ["agents", "claude"]
    }
  ]
}
```

If the field is omitted, runtime should auto-discover `skills/*/SKILL.md` and
project all discovered app skills into workspaces owned by that app.

Projection is idempotent:

- create missing projected files;
- update app-owned projected files when digest changes;
- remove stale app-owned projected files when source skills are removed;
- never remove or overwrite user-authored files outside the projection manifest;
- keep projection metadata under `.aiworker/native-skill-projections.json`.

Projection should run during:

- app install or enable, for existing app-owned workspaces;
- app upgrade, for digest changes;
- profile workspace creation;
- workspace repair/open when projection metadata is missing or stale.

Session prompts should carry only turn-specific context. Domain method,
terminology, output contract, and HR guardrails belong in native skills.

## Profile Revision Flow

### Workspace Creation

When a user creates a profile item:

1. Host creates a workspace for the selected HR worker.
2. Runtime initializes `README.md` from the selected lifecycle stage.
3. Runtime creates `artifacts/`, `reviews/`, `evidence/`, and `.aiworker/`.
4. Runtime initializes a local git repository if needed.
5. Runtime writes `.gitignore`.
6. Runtime projects HR native skills into workspace root.
7. Runtime creates an initial profile revision for `README.md`.

The first commit is internal and may use a machine-oriented message, but UI
should show it as "Profile initialized".

### Session Turn

When a user runs a profile action:

1. Engine starts in `workspaceRoot`.
2. Engine can naturally discover projected native skills if the engine supports
   the target skill directory.
3. Prompt includes this turn's request and current workspace context.
4. Engine writes artifacts under `artifacts/<sessionId>/`.
5. Host records generated artifacts and displays them as Proposed Changes.

The profile `README.md` should not be updated automatically by an unreviewed
engine output.

### Human Review

When a human reviews a proposed change:

1. UI shows the proposed change, current `README.md`, evidence gaps, and risk
   notes.
2. A review pass can update `README.md`.
3. Runtime writes a review record under `reviews/<reviewId>.md`.
4. Runtime commits `README.md`, accepted artifact, and review record as one
   accepted profile revision.
5. UI shows the new Current Profile Summary from `README.md`.

Rejected or needs-review artifacts remain proposed changes and do not become
accepted profile revisions.

### Approved Version

When a user marks a milestone as approved, runtime may create a local git tag.
UI should call this an Approved Profile Version. Tag naming can be internal,
for example:

```text
profile/v1-screening-approved
profile/v2-interview-ready
```

Tag creation is optional in the first implementation. The review-to-commit flow
is the required minimum.

## Components

### `apps/aiworker-hr`

Owns HR domain assets:

- profile-oriented capability prompts;
- `skills/*/SKILL.md`;
- artifact schemas for proposed changes and supporting work products;
- review rubrics;
- mounted workbench behavior;
- HR terminology.

The app should avoid developer/platform vocabulary in user-facing copy. It
should prefer Candidate, Employee, Alumni, People Profile, Evidence, Profile
Summary, Proposed Change, Review, Risk, and Next Step.

### `packages/shared`

Owns shared schemas for optional skill declarations and projection metadata when
they become public contracts.

### `packages/core`

Owns runtime behavior:

- profile workspace initialization;
- git-backed profile revision operations;
- native skill source discovery;
- workspace projection;
- projection digest comparison;
- safe app-owned projection cleanup;
- promotion of reviewed artifacts into profile revisions.

Host/core must not interpret HR profile fields. It can operate on generic
workspace files and app-owned descriptors.

### `apps/api`

Owns local daemon routes for workspace/session/review operations. If promotion
needs a new route, the route should remain generic and app-owned:

```text
POST /api/local/workspaces/:workspaceId/profile-revisions
```

The route should accept an artifact id, review result, and README patch or
profile content supplied by the app/UI. It should not synthesize HR profile
facts.

### `apps/web`

Owns Host Web Shell rendering and HR workbench integration:

- People Profiles list with Candidate / Employee / Alumni as first-level groups;
- Current Profile Summary as the visual center;
- Profile Tools on the right;
- Proposed Changes and Profile Change Ledger;
- Review Passed / Profile Revision / Approved Version product language;
- no commit/tag/branch wording in normal HR surfaces.

## Error Handling

If `git` is unavailable, profile revision actions should return a clear
environment error and the UI should show profile revision unavailable. The app
may still display existing README/profile content, but review promotion cannot
claim success without a revision backend.

If a workspace already has a git repository, runtime should reuse it and verify
it is inside the workspace root.

If the working tree has pending proposed changes, UI should show them as
proposed changes. Runtime should avoid committing unrelated user edits during a
review promotion.

If a projected skill target was modified by the user, digest mismatch should be
handled conservatively:

- app-owned projection metadata match -> update;
- missing metadata or unknown owner -> do not overwrite; report conflict;
- stale app-owned file whose source disappeared -> remove only if metadata says
  AIWorker created it.

If raw evidence is present, runtime should not add it to profile revision
commits by default. Promotion should commit descriptors and reviewed summaries,
not raw sensitive attachments.

If review passes but README update fails, no profile revision should be created.
The UI should keep the artifact in proposed state.

## Privacy And Security

Git history preserves deleted content. HR profiles may contain sensitive personal
information, so review promotion must treat README content as durable.

The first implementation should:

- keep raw evidence out of git by default;
- make review guardrails explicit before README promotion;
- avoid storing secrets, connector credentials, bearer tokens, or engine auth in
  README, artifacts, reviews, `.aiworker`, or projected skills;
- keep Host metadata separate from app-owned profile meaning;
- avoid committing `.agents/skills`, `.claude/skills`, and `.aiworker/sessions`.

Future privacy work may add redaction checks, retention policies, or a non-git
revision backend for regulated deployments, but those are not required for the
first product loop.

## Testing

Focused tests should prove:

- HR app validation accepts `skills/*/SKILL.md` and rejects malformed declared
  skill refs.
- Soul App install/enable and workspace creation can discover skills without
  executing app code.
- Workspace creation initializes `README.md`, `.git`, `.gitignore`, and required
  directories.
- Native skill projection creates `.agents/skills/<app-id>-<skill-id>/SKILL.md`
  and `.claude/skills/<app-id>-<skill-id>/SKILL.md`.
- Projection is idempotent and digest-aware.
- Projection cleanup does not delete user-owned files.
- Session turns start from `workspaceRoot` and can see projected skill files.
- Review promotion updates `README.md` and creates exactly one accepted profile
  revision.
- Rejected artifacts do not update `README.md`.
- Worker Web renders Candidate / Employee / Alumni as first-level profile list
  groups.
- Worker Web makes Current Profile Summary the visual center.
- Normal HR UI copy does not expose git terms.

Verification should include focused package tests for changed areas, a Web
build or browser smoke when UI changes, and code-review-graph for production
code changes.

## Open Decisions

No major product decision remains open for this design. The following are
implementation details that can be decided during planning:

- exact internal git commit message format;
- exact tag naming convention for Approved Profile Versions;
- whether approved tags ship in the first implementation or a follow-up;
- whether skill declarations are manifest-explicit in the first slice or
  auto-discovered first with manifest schema added later;
- the smallest generic promotion API shape.

The implementation plan should keep those choices conservative and aligned with
the current codebase.
