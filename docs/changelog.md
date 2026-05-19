# AIWorker Changelog

## 2026-05-19 [completed] FEAT-102 / PLAN-376 — Session Kit shared composer and session surfaces

Completed the shared Session Kit extraction from the approved
`docs/superpowers/specs/2026-05-19-session-kit-design.md` design. The shared
component package now owns `SessionComposer`, `SessionComposerActionBar`,
attachment helpers, neutral session event normalization, timeline view-model
grouping, `SessionTimeline`, and `SessionDetailPanel`.

Worker Web now consumes the shared kit from the generic workspace session
composer, the session follow-up composer, the session detail panel and the HR
People Workbench right-panel composer. Host Web still owns data loading,
streaming and routing; HR still owns profile context, recent sessions, profile
draft copy, material metadata and promotion policy.

Verification covered component tests/typecheck, focused WorkerStudio tests, web
typecheck/lint/build, `ui:check`, `git diff --check`, browser smoke on the HR
right panel and session route, plus `crg:update` / `crg:review`.

## 2026-05-19 18:05 [completed] REL-050 / PLAN-375 — CLI 0.18.4 patch release

Started the `@zonease/aiworker-cli@0.18.4` patch release after `BUG-139 /
PLAN-374`. npm latest is `0.18.3`; current `main` contains the Worker Web
bundle baseline/release-record closeout from `0.18.3`, HR recent-session
refinement, and the HR composer select expanded-menu styling fix.

Local release gates passed through `bun run check`, `bun run test`,
`bun run build`, mounted-surface smoke, dist version/package checks, pack
dry-run, dist release smoke, and code-review-graph. Release workflow
`26090536203` and main lint workflow `26090531497` passed. npm latest now
resolves to `0.18.4`; `bunx @zonease/aiworker-cli@0.18.4 --version` reports
`aiworker/0.18.4`; GitHub Release `v0.18.4` is published with 8
binary/checksum assets; published-package smoke passed from public npm package
covering Host Web/API startup, Worker Web asset serving, official HR/QA apps,
HR template listing, and HR/QA mounted actions.

## 2026-05-19 [completed] BUG-139 / PLAN-374 — HR profile composer select dropdown visual split

Fixed the HR profile composer proposal type dropdown so the opened menu reads
as one connected compact control with the select trigger instead of a detached
portal panel. The shared `Select` primitive now supports opt-in popper `side`
and portal `contentClassName` hooks, while shared CSS handles top-opening menu
radii and portal radius fallback.

The HR People Workbench pins this bottom action-bar select to open upward and
uses an HR-owned compact content class for mono 13px option labels and 38px
rows. Browser smoke confirmed the trigger remains 38px before and after open,
the menu opens with `data-side="top"`, and the trigger/menu edges connect.
Verification covered shared component tests/typecheck, focused WorkerStudio
tests, Web typecheck/lint/build, UI component governance, docs contract, diff
check, browser smoke, and code-review-graph update/review.

## 2026-05-19 [completed] REL-049 / PLAN-373 — CLI 0.18.3 patch release

Published `@zonease/aiworker-cli@0.18.3` to carry the PNG brand asset fix,
shared UI component governance gate, and HR profile composer right panel
refinement.

Release evidence: local `check` / `test` / `build` / mounted-surface smoke /
dist release smoke / code-review-graph all passed; tag release workflow
`26087276218` passed; npm latest now resolves to `0.18.3`; GitHub Release
`v0.18.3` is a formal release with four binary tarballs and four checksum
assets. The first main lint run caught a stale Worker Web bundle-size baseline;
after updating the reviewed baseline, main lint run `26087432953` passed,
including Web bundle size report. Published-package smoke with
`bunx @zonease/aiworker-cli@0.18.3` started Host Web/API, loaded Worker Web,
bootstrapped official HR/QA Soul Apps, and invoked HR/QA mounted actions.

## 2026-05-19 [completed] BUG-138 / PLAN-371 — HR profile composer panel refinement

Refined the HR People Workbench right panel after visual review. Recent
Sessions now reads as the top segment of one continuous profile tools surface
instead of a separate card; the composer keeps the remaining height; the
bottom action bar now aligns paperclip file attach, shared component `Select`
proposal type, and icon-only send as one control row.

The composer now uses `IconButton`, `Textarea` and `Select` from
`@zonease/aiworker-component`. The hidden file input is removed from the
accessible tree so the visible paperclip button is the single file-entry
affordance. Verification covered focused WorkerStudio tests, Web typecheck and
build, docs contract, diff check, browser smoke against a local daemon/Web
instance, and code-review-graph update/review.

## 2026-05-19 [completed] REL-048 / PLAN-370 — CLI 0.18.2 patch release

Published `@zonease/aiworker-cli@0.18.2` after `FEAT-100 / PLAN-369`, carrying
the HR profile composer flow and icon-only composer send button refinement.

Release evidence: local `check` / `test` / `build` / mounted-surface smoke /
dist release smoke / code-review-graph all passed; `main` lint run
`26083926864` and tag release run `26083940091` passed; npm latest now resolves
to `0.18.2`; GitHub Release `v0.18.2` is a formal release with four binary
tarballs and four checksum assets. Published-package smoke with
`bunx @zonease/aiworker-cli@0.18.2` started Host Web/API, loaded Worker Web,
bootstrapped official HR/QA Soul Apps, and invoked HR/QA mounted actions.

## 2026-05-19 15:22 [progress] FEAT-100 / PLAN-369 — HR profile composer flow

Landed the HR profile composer flow. The HR People Workbench right panel now
collapses without leaving the old icon rail, shows a compact Recent Sessions
block at the top, and uses the remaining panel height for one profile-draft
composer with textarea, material attachment rows, proposal type selector, and
the bottom-right generate action.

The composer defaults HR profile work to the reviewable
`profile-update-proposal` template, labels it as a candidate profile draft in
the Web UI, supports multiple uploaded candidate material files, writes them to
workspace evidence under `evidence/uploads/`, and includes material descriptors
in the new session metadata/context. Review and approval still stay in the
center profile patch review flow; generated output does not directly mutate the
accepted README/profile.

Component library decision: reuse `@zonease/aiworker-component` primitives such
as `IconButton` and `Textarea`, but keep the full composer in the HR app because
candidate-material wording, proposal defaults, and profile draft semantics are
HR-owned. A generic material-composer shell can be promoted later if another
Soul App needs the same app-agnostic structure.

Verification: focused WorkerStudio tests, HR people model tests, Web
typecheck/lint/build, HR app validate/smoke, mounted-surfaces smoke, browser
smoke against a local daemon/Web instance, `git diff --check`, and
code-review-graph update/review. `crg:review` exited 0 and kept advisory static
test-gap labels for helpers/components covered through the WorkerStudio
integration path.

## 2026-05-19 [completed] REL-047 / PLAN-368 — CLI 0.18.1 patch release

Published `@zonease/aiworker-cli@0.18.1` after `FEAT-099 / PLAN-367`, carrying
the Host/Soul shared component library uplift, HR Soul App direct consumption
proof, and the engine icon style delivery fix.

Local release gates passed, including full check/test/build, mounted-surface
smoke for the engine icon delivery chain, dist version checks, pack dry-run,
dist release smoke and code-review-graph. CRG risk score was `0.00` with no
test gaps.

Release workflow `26074095645` passed and published npm latest plus GitHub
Release `v0.18.1` with 8 binary/checksum assets. Main lint workflow
`26074093498` passed. Published-package smoke passed from an isolated
`AIWORKER_HOME`: daemon health, runtimeVersion `0.18.1`, Host Web static
serving, engine icon asset delivery, official app bootstrap/list/template, and
HR/QA mounted actions.

## 2026-05-19 [completed] FEAT-099 / PLAN-367 — Host/Soul shared component library

Made `packages/component` the Host/Soul Web component source of truth with a
package-owned `@zonease/aiworker-component/styles.css` entrypoint, shared style
slices, a typed catalog/migration queue, Radix-backed Dialog/Select/Switch
primitives, and reusable settings, progress, message flow, artifact/review, and
profile reader patterns.

Host Web now imports the package style entrypoint and uses shared components
for settings, session progress/chat/detail, and reusable shell patterns. The HR
Soul App now has a real Web proof that imports shared components and styles
directly while keeping HR profile/review meaning local.

Browser smoke caught and fixed a modal positioning regression after the Dialog
uplift; the mounted-surface smoke now asserts creation/settings dialogs remain
inside the viewport. Verification passed: root check, root test, component/Web/
HR focused tests, Web build CSS guard, mounted-surface smoke, browser smoke,
`git diff --check`, and code-review-graph. CRG exited 0 with advisory static
UI shell gaps covered by the focused and browser tests.

## 2026-05-19 [completed] REL-046 / PLAN-366 — CLI 0.18.0 minor release

Published `@zonease/aiworker-cli@0.18.0` carrying the compact operator CLI
surface from `FEAT-098 / PLAN-365`: compact default help/commands, full command
discovery through `--all`, `daemon restart`, default update apply semantics and
managed daemon auto-restart after update convergence.

Local release gates passed, including full check/test/build, dist version
checks, pack dry-run, dist release smoke and code-review-graph review.

Release workflow `26048444696` passed and published npm latest plus GitHub
Release `v0.18.0` with 8 binary/checksum assets. Main lint workflow
`26048434417` passed. Published-package smoke passed from an isolated
`AIWORKER_HOME`: daemon health, runtimeVersion `0.18.0`, Host Web static
serving, official app bootstrap/list/template, and HR/QA mounted actions.

## 2026-05-19 [completed] FEAT-098 / PLAN-365 — Compact operator CLI surface

Converged the default CLI discovery surface around compact operator lifecycle
commands. `aiworker --help` and `aiworker commands` now show daemon lifecycle,
open, doctor, update, app install/enable/bootstrap, worker/workspace/session and
turn commands. Full authoring, diagnostics, inspection and compatibility
commands remain available through `aiworker --help --all` and
`aiworker commands --all`.

Added `aiworker daemon restart` and moved `aiworker dev` out of the default
operator surface as a source-checkout compatibility alias. `aiworker update`
now executes safe apply actions by default and automatically restarts a running
managed daemon for the same `AIWORKER_HOME` after update convergence; `--check`
and `--dry-run` remain non-writing modes.

Verification passed: focused CLI/updater tests, CLI typecheck, full CLI package
tests, CLI bundle build, dist command smoke for `commands`/`--help`/`commands
--all`, docs contract check, `git diff --check`, root lint and code-review-graph.
CRG exited 0 with advisory static gaps for private daemon/update helpers.

## 2026-05-18 [completed] REL-045 / PLAN-363 — CLI 0.17.6 patch release

Published `@zonease/aiworker-cli@0.17.6` carrying the Host left panel toggle
active-state repair from `BUG-137 / PLAN-362`.

Local release gates passed, including full check/test/build, dist version
checks, pack dry-run, dist release smoke and code-review-graph review.

Release workflow `26045311566` passed and published npm latest plus GitHub
Release `v0.17.6` with 8 binary/checksum assets. Main lint workflow
`26045309534` passed. Published-package smoke passed from an isolated
`AIWORKER_HOME`: daemon health, runtimeVersion `0.17.6`, Host Web static
serving, official app bootstrap/list/template, and HR/QA mounted actions.

## 2026-05-18 [completed] BUG-137 / PLAN-362 — Host left panel toggle active state repair

Fixed the Host shell left sidebar toggle so it now reports
`aria-pressed="true"` while the sidebar is visible and `aria-pressed="false"`
after collapse. The control now shares the same active icon button style
contract as the HR People Profile panel toggles.

Verification passed: focused RED regression, full Worker Studio test file, Web
typecheck/lint/build, browser smoke against the real HR workspace route,
`git diff --check`, and code-review-graph. CRG reported a static gap for the
private `HostTopBar` function, while the user-facing behavior is covered by the
Worker Studio integration test.

## 2026-05-18 [completed] BUG-136 / PLAN-361 — Profile ledger Git identity side-effect hardening

Fixed the profile ledger Git identity side effect that made the earlier parent
repository discovery bug more damaging. Profile ledger commits and annotated
tags now receive `AIWorker Profile Ledger <aiworker@local>` through per-process
Git environment variables instead of persistent repository-local
`user.name/user.email` config.

The regression now proves a workspace under an ignored parent repository gets
its own ledger repo, neither parent nor workspace local Git config receives
`user.*`, and the profile commit author still carries the ledger identity.

Current source checkout local Git config is clean. Historical polluted commits
were measured as 27 commits from `285e5f22` through `b31ff94a`; this fix records
the range but does not rewrite already-shared release history.

Verification: focused RED regression failed before the production change, then
`bun run --filter '@zonease/aiworker-core' test src/worker/runtime.test.ts`,
`bun run --filter '@zonease/aiworker-core' test`, and
`bun run --filter '@zonease/aiworker-core' typecheck` passed. `git diff
--check`, `bun run crg:update`, and `bun run crg:review` also passed; CRG
reported risk score `0.40` with indirect test-gap notes for the changed helper
functions covered through runtime tests.

## 2026-05-18 [completed] REL-044 / PLAN-360 — CLI 0.17.5 patch release

Published `@zonease/aiworker-cli@0.17.5` carrying the HR panel toggle icon fix,
HR People Workbench right-panel convergence, and external operator boundary
documentation update.

Local release gates passed, including full check/test/build, dist version
checks, pack dry-run, dist release smoke and code-review-graph review.

Release workflow `26044002863` passed and published npm latest plus GitHub
Release `v0.17.5` with 8 binary/checksum assets. Main lint workflow
`26043996324` passed. Published-package smoke passed from an isolated
`AIWORKER_HOME`: daemon health, runtimeVersion `0.17.5`, Host Web static
serving, official app bootstrap/list/template, and HR/QA mounted actions.

## 2026-05-18 [completed] REL-043 / PLAN-359 — CLI 0.17.4 patch release

Published `@zonease/aiworker-cli@0.17.4` after merging `FEAT-097 / PLAN-358`,
carrying the HR People Workbench header/search convergence.

Local release gates passed, including full check/test/build, dist version
checks, pack dry-run, dist release smoke and code-review-graph review.

Release workflow `26033776748` passed and published npm latest plus GitHub
Release `v0.17.4` with 8 binary/checksum assets. Main lint workflow
`26033769144` passed. Published-package smoke passed from an isolated
`AIWORKER_HOME`: daemon health, runtimeVersion `0.17.4`, Host Web static
serving, official app bootstrap/list/template, and HR/QA mounted actions.

## 2026-05-18 [completed] FEAT-097 / PLAN-358 — HR Soul App header convergence

Completed the HR People Workbench chrome convergence after the approved design:

- kept the Host header visible while removing the HR Soul App workbench header;
- removed the workbench-level search rendering and kept any filtering local to
  People Profiles;
- moved `New people profile` into the People Profiles panel header;
- moved profile-list/tool toggles plus refresh, evidence, and settings into the
  selected People Profile header;
- removed the duplicated `Current Profile Summary` UI header so the center
  surface reads as one People Profile;
- tightened the patch strip to actionable ready patches and shortened the
  visible review action to `Review`.

Focused Worker Studio tests, Web typecheck/lint/build and browser smoke against
the local Ben HR workspace passed.

## 2026-05-18 [completed] REL-042 / PLAN-357 — CLI 0.17.3 patch release

Started the `@zonease/aiworker-cli@0.17.3` patch release after merging
`BUG-135 / PLAN-356`, carrying the Web README approval and session parent
navigation fixes.

Local release gates passed, including full check/test/build, dist version
checks, pack dry-run, dist release smoke and code-review-graph review.

Release workflow `26012389330` passed and published npm latest plus GitHub
Release `v0.17.3` with 8 binary/checksum assets. Main lint workflow
`26012385184` passed. Published-package smoke passed from an isolated
`AIWORKER_HOME`: daemon health, runtimeVersion `0.17.3`, Host Web static
serving, official app bootstrap/list/template, and HR/QA mounted actions.

## 2026-05-18 [completed] BUG-135 / PLAN-356 — Web approval and session parent navigation regressions

Fixed two post-release Web regressions in the HR People Workbench and session
route:

- HR Profile Patch Review now handles fenced README drafts, unfenced native
  `person-profile` artifacts and document-level README changes. Unfenced HR
  artifacts are converted by product-owned logic into canonical accepted README
  markdown, sanitized through the promotion validator, then submitted as
  explicit `profileMarkdown`.
- Session routes now expose a direct header control back to the parent workspace
  / Soul workbench route without restoring the old Host workspace navigation
  panels.

Focused HR model and Worker Studio tests, Web lint/typecheck/build and a real
browser smoke against the local Ben workspace passed.

## 2026-05-18 [completed] REL-041 / PLAN-355 — CLI 0.17.2 patch release

Published `@zonease/aiworker-cli@0.17.2` as the patch release carrying Host
shell V9, Host/Soul workbench contract cleanup, scaffold workbench migration
and the HR Profile Patch Review workbench.

Local release gates passed, including full check/test/build, dist version
checks, pack dry-run, dist release smoke and code-review-graph review. Release
workflow `26010518321` passed and published npm latest plus GitHub Release
`v0.17.2` with 8 binary/checksum assets. Main lint workflow `26010512951`
passed. Published-package smoke passed from an isolated `AIWORKER_HOME`: daemon
health, runtimeVersion `0.17.2`, Host Web static serving, official app
bootstrap, app/soul/template listing, and HR/QA mounted actions.

## 2026-05-18 [progress] REL-041 / PLAN-355 — CLI 0.17.2 patch release

Started the `@zonease/aiworker-cli@0.17.2` patch release to publish the current
Host shell V9, Host/Soul workbench contract cleanup, scaffold workbench
migration and HR Profile Patch Review workbench changes.

## 2026-05-18 [completed] FEAT-096 / PLAN-354 — HR profile patch review workbench

Completed the HR People Workbench redesign around Product-owned profile patch
review:

- the Reading Room now remains reading-first while surfacing a slim pending
  patch strip, section-level patch markers and section action aliases;
- the full README promotion decision now happens in a center Profile Patch
  Review view with current/proposed section comparison and whole-patch approval;
- the right panel no longer renders proposal markdown and now focuses on the
  next review/run action, source/activity summaries and the proposal composer;
- section-aware patch metadata is generated by the HR revision-review model and
  covered by focused model and Worker Studio tests.

## 2026-05-18 [progress] FEAT-096 / PLAN-354 — HR profile patch review workbench

Started the HR People Workbench redesign that turns reviewable profile
artifacts into section-aware README promotion patches. The approved design keeps
the Reading Room reading-first, moves current/proposed comparison into a center
Profile Patch Review view, and reduces the right panel to a concise Next Step
surface.

## 2026-05-18 [completed] REFACTOR-082 / PLAN-353 — Soul App scaffold workbench design migration

Migrated Soul App authoring/scaffold design to the current Host-owned header
boundary:

- `aiworker app create` now generates `ui.workbench` action/search/settings
  descriptors and `ui.workspaceContext.terminal` workspace locator metadata;
- generated Host-mounted services implement `/protocol/actions` and
  `/protocol/search` for the scaffolded workbench descriptors;
- `aiworker app smoke` now verifies declared workbench action/search protocol
  wiring when present, including the official HR and QA apps;
- Soul App authoring docs, CLI docs and SDK README now state that workbench
  descriptors are app-owned while Host header actions remain platform chrome.

## 2026-05-18 [completed] REFACTOR-081 / PLAN-352 — Host/Soul workbench contract cleanup

Retired Host header slot semantics from the current Soul App manifest contract
while preserving Host/Soul protocol coordination:

- replaced `ui.shell` with `ui.workbench` for app-owned workbench
  actions/search/settings;
- replaced action `slot` placement with `role` intent, including
  `panel-toggle`;
- added `ui.workspaceContext.terminal` as the future Host-owned web terminal
  workspace locator descriptor;
- updated Host daemon API, Worker Web, security review, official HR/QA
  manifests and current architecture/authoring docs to declare that Host header
  actions are platform-owned and not Soul-customizable.

## 2026-05-17 [completed] REFACTOR-080 / PLAN-351 — Worker Web Host shell V9 layout

Implemented the approved Worker Web Host shell V9 layout. The Host header is
now a 40px full-width chrome row above the sidebar/main grid, with fixed
Host-owned `PanelLeft`, `PanelBottom`, and `PanelRight` controls. Sidebar
collapse fully hides the sidebar with no icon rail.

Replaced the sidebar brand/logo block with Host list item actions and kept the
sidebar scoped to Soul App / Soul worker navigation. Workspace/session lists
stay in the Soul App main surface, preserving the HR workbench, profile,
artifact review, and session detail behavior.

Verification passed: focused Worker Studio tests, Web typecheck, Web lint, Web
build, browser smoke for expanded/collapsed layouts, and code-review-graph
update/review.

## 2026-05-17 [completed] REL-040 / PLAN-350 — CLI 0.17.1 patch release

Published `@zonease/aiworker-cli@0.17.1` as the patch release carrying the HR
app production-readiness fixes from `QA-037 / PLAN-349`, including
`BUG-132`, `BUG-133`, and `BUG-134`.

Local release gates passed, including full check/test/build, dist bundle,
pack dry-run, dist release smoke, and code-review-graph review.

Release workflow `25989343420` passed and published npm latest plus GitHub
Release `v0.17.1` with 8 binary/checksum assets. The first main lint run hit
the Web bundle size review gate after the HR vertical workbench growth; the
reviewed Worker Web baseline was updated and main lint run `25989409374`
passed. Published-package smoke passed from an isolated `AIWORKER_HOME`:
daemon health, runtimeVersion `0.17.1`, Host Web static serving, official
HR/QA app bootstrap, app/soul/template listing, and HR/QA mounted actions.

## 2026-05-17 [completed] QA-037 / BUG-132 / BUG-133 / BUG-134 / PLAN-349 — HR app production readiness campaign

Completed HR app production-readiness validation across CLI and Web after the
profile revision workbench landed.

- Baseline HR app gates, CLI bundle smoke, CLI/API/Web focused tests, dist app
  validate/smoke, and `smoke:dist-release` passed before new fixes.
- Real disposable debug root
  `/private/tmp/aiworker-hr-prod-20260517173556` reproduced `BUG-132`: a
  Codex-generated `aiworker-profile-readme` fenced draft still contained
  review/proposal readiness language, and `aiworker profile promote` wrote it
  into `README.md`.
- The same run reproduced `BUG-133`: official Soul App `defaultTemplates`
  projection duplicated defaults for HR and QA.
- A second disposable run reproduced `BUG-134`: after a clean profile
  promotion, a follow-up CLI read path re-projected
  `engine-assets/workspace/README.md` and restored the starter scaffold over
  the promoted profile.
- Fixed profile promotion validation so accepted README drafts reject copied
  scaffold/proposal/review-ready language, including the reproduced
  "Agent outputs remain proposals until review" and "ready for HR review"
  phrases.
- Tuned HR `profile-update-proposal` native skill/workflow assets so the fenced
  draft example is accepted-profile-only, and proposal/review lifecycle state
  stays outside the promotable block.
- Fixed official app default template projection: HR now defaults to
  person-profile, profile-update-proposal, and candidate-screen; QA now
  defaults to regression-matrix and release-gate, with duplicates removed in
  declaration order.
- Fixed engine asset reprojection so existing workspace `README.md` is
  preserved while agent instruction projections can still be repaired.
- Verified the original dirty Ada artifact is now blocked, then ran a fresh
  real Codex Grace Hopper profile session through clean artifact generation,
  CLI promotion, follow-up CLI read, and daemon-served Web rendering.

Verification passed: focused shared/core/CLI/API/Web tests, HR
validate/smoke/typecheck/test, CLI bundle build, dist release smoke, root
`bun run check`, full repo `bun run test`, and Playwright Web evidence under
`/private/tmp/aiworker-hr-prod-fix-20260517-2gs7kH`.

## 2026-05-17 [completed] FEAT-095 / PLAN-348 — HR Profile Revision Review Workbench

Made the HR proposed-change area a Product-owned profile revision review
surface instead of a raw artifact preview.

- Added a pure HR Web revision-review model that uses shared
  `aiworker-profile-readme` promotion validation and README section parsing.
- Rendered ready/blocked status, current vs accepted-draft summary comparison,
  and the extracted accepted profile Markdown preview before approval.
- Disabled approval when the selected artifact lacks a promotable accepted
  README draft, with the shared validation reason visible to the reviewer.
- Kept native skill boundaries intact: skills produce reviewable artifacts;
  HR Web decides whether the accepted README draft can be approved into the
  profile.
- Improved the collapsed Profile Workbench rail so section buttons open the
  requested area, and fixed medium-desktop flex shrink overlap in the tools
  panel found during browser debugging.

Verification passed: focused HR model tests, full Worker Studio tests, Web
typecheck/build, root lint/docs checks, `git diff --check`, and mocked browser
debug rounds for ready approval, blocked approval, and mobile stacked
comparison.

## 2026-05-17 [completed] TODO-046 / PLAN-347 — Headless reviewed profile promotion CLI

Added a product-owned headless promotion path for reviewed profile artifacts.

- Added shared accepted-profile README helpers for `aiworker-profile-readme`
  fence extraction, empty draft rejection, and proposal-state language
  rejection.
- Added `aiworker profile promote` with `--workspace`, `--artifact`,
  `--verdict pass|warn`, `--profile-markdown`, `--finding`, `--risk`, and
  `--tag`.
- Tightened runtime promotion so artifact-based README writes require a clean
  fenced accepted draft unless the caller supplies explicit reviewed profile
  markdown.
- Reused the shared helper in Worker Web promotion and returned
  `PROFILE_REVISION_REJECTED` from the local API for invalid profile drafts.
- Verified deterministic isolated CLI debug rounds for success, missing-fence
  rejection, pending-state rejection, and explicit markdown promotion, plus a
  real Codex two-turn HR profile session promoted from artifact to `README.md`.

Verification passed: focused shared/core/CLI/API/Web tests and isolated debug
evidence under `tmp/hr-profile-promote-debug-20260517151429` and
`tmp/hr-profile-promote-real-20260517151507`.

## 2026-05-17 [completed] QA-036 / BUG-130 / BUG-131 / PLAN-346 — HR native skill closure follow-up regression

Ran another real Codex-backed HR native skill regression campaign from
zero-state workspaces through artifact creation, failed-turn recovery, and
reviewed README promotion.

- Fixed first-turn `session start` metadata enrichment so app-authored
  capability prompt/review assets materialize for the initial invocation, not
  only continuation turns (`BUG-130`).
- Clarified embedded capability source refs so external engines do not treat
  `./product/workflows/...` app refs as missing workspace files (`TODO-045`).
- Tightened HR profile proposal prompt/skill/review wording so promotable
  `aiworker-profile-readme` drafts represent accepted post-approval profile
  state, while pending review decisions stay outside the fence (`BUG-131`).
- Verified real artifacts for `evidence-matrix`, `interview-brief`,
  `hiring-risk`, and `profile-update-proposal`, including multi-turn role,
  candidate, and profile sessions.
- Promoted corrected profile proposal artifact
  `95e7aaeb-35a9-43cb-a411-3ea4459072b6` into the accepted profile README with
  review `c7e57663-fa06-4d34-9fcb-a495b9ee84b2` and workspace commit
  `996a32a9e46c8061093b891a8d33db0be9a3294d`.
- Verified deterministic failed-turn recovery keeps failed status visible while
  indexing the recovered artifact and `needs_review` record.
- Recorded `TODO-046` for a future headless reviewed profile promotion CLI
  command.

Verification passed: focused CLI/core/HR tests, CLI/core/HR typechecks, HR app
validate, root lint, and real debug evidence under
`/private/tmp/aiworker-hr-regression-20260517-131444`.

## 2026-05-17 [completed] BUG-129 / TODO-043 / TODO-044 / PLAN-345 — HR native skill closure follow-ups

Closed the remaining HR native skill README closure follow-ups from the real
Codex debug campaign.

- Failed local-engine turns can now recover artifacts written before a non-zero
  exit. Recovered artifacts are indexed with `needs_review`, while the turn and
  invocation remain failed.
- HR native skill outputs now have first-class app-owned artifact kinds and
  capabilities for `evidence-matrix`, `interview-brief`, `hiring-risk`, and
  `profile-update-proposal`.
- Manifest-path Soul App capability prompt/review assets are materialized into
  session context and invocation prompts for external engines, so engines no
  longer receive only inaccessible source refs.

Verification passed: focused core/shared/API/CLI/Web/HR tests, HR app validate,
package typechecks, root lint, `git diff --check`, and code-review-graph.

## 2026-05-17 [completed] QA-035 / PLAN-344 — HR native skills README closure debug campaign

Ran and tuned the real Codex-backed HR native skill closure loop from zero
profiles to reviewed `README.md` promotion.

- Executed a 3-profile matrix across all five HR native skills with 30 real
  Codex turns, plus targeted third turns for human-review promotion readiness.
- Promoted `hr-profile-alpha` and `hr-profile-gamma` through the local daemon
  REST profile revision endpoint with `warn` verdicts and profile ledger git
  commits; left `hr-profile-beta` unpromoted because its proposal flagged
  unresolved risk around unsupported `culture fit` language and documentation
  inconsistency.
- Fixed profile-ledger git isolation under ignored parent repositories
  (`BUG-126`).
- Fixed CLI/runtime continuation metadata so follow-up turns preserve selected
  capability output kind and review context (`BUG-127`).
- Tuned HR profile update proposals and Worker Web promotion to extract an
  explicit `aiworker-profile-readme` draft instead of writing whole proposal
  artifacts into accepted `README.md` (`BUG-128`).
- Recorded remaining follow-ups for failed-turn artifact salvage (`BUG-129`),
  first-class HR native artifact kinds (`TODO-043`), and capability prompt
  materialization for external engines (`TODO-044`).

Verification passed: focused core runtime/executor tests, CLI tests, Worker Web
test, HR app validate/test, real REST profile promotion, and debug matrix
evidence under `/private/tmp/aiworker-hr-native-skill-debug-20260517-114309-matrix`.

## 2026-05-17 [completed] FEAT-094 / PLAN-343 — HR native skill artifact boundary

Landed the HR native skill artifact boundary from the approved Superpowers
design. HR native skills now read as artifact producers, while HR product-owned
material defines artifact taxonomy, review gates and promotion meaning.

- Updated HR workspace instructions to keep durable session output
  artifact-first and make accepted People Profile promotion a product review
  decision.
- Reworded the five HR native skills around artifact output, evidence, risk and
  human decision boundaries instead of accepted profile writes.
- Added HR product artifact policy under `apps/aiworker-hr/product/artifacts/`.

Verification passed: HR app validate/typecheck/test, focused core
engine-assets/runtime tests, and `git diff --check`.

## 2026-05-17 [completed] BUG-125 / PLAN-342 — HR workbench selection and drawer refinement

收敛 HR People Workbench 的空选择、drawer 动效、右侧 icon rail 对齐和
Profile Actions 过重的问题。

- Worker home 不再把 HR 的第一个 workspace/profile 隐式当作已选对象；未显式选中时只显示
  People Profiles 列和选择提示，不渲染 Reading Room 或右侧工具 rail。
- HR profile 选中后才进入 Reading Room，并保留可折叠的右侧 profile workbench。
- HR profile list 和右侧 workbench 使用稳定 grid track 与 motion token 过渡；collapsed
  right rail 移除滚动槽位预留，icon button 在 48px rail 内水平居中。
- 右侧 drawer 从 `Profile Actions` 收敛为 `Next Profile Step`，将下一步建议动作前置，
  sources、proposed change、guardrails 和 sessions 降为支撑上下文。
- Verification passed: focused Worker Web test, Web typecheck, Web build,
  isolated browser smoke, `git diff --check`, `bun run crg:update`, and
  `bun run crg:review`.

## 2026-05-17 [completed] REL-039 / PLAN-341 — CLI 0.17.0 minor release

Published `@zonease/aiworker-cli@0.17.0` as a minor preview release for
`FEAT-093 / PLAN-340`, carrying the HR Profile Reading Room and README
base-section contract into the packaged CLI.

- Release prep commit `19e2f38d` was pushed to `main`, and annotated tag
  `v0.17.0` was pushed to GitHub.
- Local release gates passed: `bun run check`, `bun run test`, `bun run build`,
  `git diff --check`, dist version checks, npm pack dry-run,
  `smoke:dist-release`, `bun run crg:update` and `bun run crg:review`.
- `npm pack --dry-run --json` reported `@zonease/aiworker-cli@0.17.0` with
  128 entries, including the Worker Web `people-workbench-BHpi7EqO.js` bundle
  and official HR README base-section seed.
- GitHub Actions release workflow `25967504572` passed and published the npm
  package plus GitHub Release assets; main lint workflow `25967501296` passed.
- npm `latest` now resolves to `0.17.0`, and
  `bunx @zonease/aiworker-cli@0.17.0 --version` reports
  `aiworker/0.17.0 darwin-arm64 node-v24.3.0`.
- GitHub Release `v0.17.0` is non-draft/non-prerelease and contains 8 assets:
  four platform binary tarballs plus matching `.sha256` files.
- Published-package smoke passed with isolated `AIWORKER_HOME`: Host Web/API
  served runtimeVersion `0.17.0`, official HR/QA Soul Apps bootstrapped, and
  HR `create-people-profile` plus QA `create-release-gate` mounted actions
  returned expected responses.
- Residual risk: users pinned to `0.16.1` must upgrade or use
  `@zonease/aiworker-cli@0.17.0` explicitly before seeing the Reading Room in
  the published CLI.

## 2026-05-17 [completed] FEAT-093 / PLAN-340 — HR Profile Reading Room

Made AIWorker HR profile-first by foregrounding the accepted `README.md` as the
center Reading Room while keeping sources, proposed changes, guardrails and
session tools available from the right rail/drawer.

- Added the HR README base-section contract for current profile summary,
  identity, role context, capabilities, confirmed facts, evidence status, risks,
  next actions, review state and accepted external sections.
- Updated the runtime fallback profile README and tests so new profile
  workspaces seed the same plain Markdown shape without Web-only metadata.
- Added an HR-local README parser and Reading Room renderer that foregrounds
  accepted sections and preserves unknown Markdown sections as additional notes.
- Changed the HR workbench to keep three full-height columns: profile list,
  Reading Room and a collapsed tools rail by default; expanding the rail opens
  sources, proposed change preview, review guardrails, recent sessions, actions
  and composer.
- Verification passed: focused core runtime test, HR Web parser/integration
  tests, Web typecheck, Web build/CSS gate, project `bun run check`,
  `git diff --check`, code-review-graph update/review, and isolated browser
  smoke for the HR worker layout.

## 2026-05-16 [completed] BUG-124 / PLAN-339 — GitHub Actions Node 24 action runtime migration

Cleared the GitHub Actions Node.js 20 action runtime deprecation annotations
from the active lint and release workflows.

- Updated `actions/setup-node@v4` to `actions/setup-node@v5` in
  `.github/workflows/lint.yml` and `.github/workflows/release.yml`.
- Updated `softprops/action-gh-release@v2` to `softprops/action-gh-release@v3`
  in `.github/workflows/release.yml`.
- Preserved `ubuntu-latest`, `NODE_OPTIONS=--max-old-space-size=1024`,
  `node-version: '24'`, npm publish behavior, binary packaging, and release
  asset globs.
- Verification passed: deprecated-reference scan, upgraded-reference scan,
  `bun run docs:check`, `git diff --check`, `bun run crg:update`, and
  `bun run crg:review`.
- Residual: the next tag-triggered release should confirm that the remote
  release workflow no longer emits the Node.js 20 deprecation annotation.

## 2026-05-16 [completed] REL-038 / PLAN-338 — CLI 0.16.1 patch release

Published `@zonease/aiworker-cli@0.16.1` as a patch release for the official
Soul App mounted entrypoint repair in `BUG-123 / PLAN-337`.

- Bumped `apps/cli/package.json` to `0.16.1`.
- Local release gates passed: `bun run check`, `bun run test`, `bun run build`,
  `git diff --check`, dist version checks, npm pack dry-run,
  `smoke:dist-release`, `bun run crg:update` and `bun run crg:review`.
- `npm pack --dry-run --json` reported `@zonease/aiworker-cli@0.16.1` with
  128 entries, no legacy flat official app runtime files, and all four nested
  HR/QA mounted/standalone runtime files.
- Release prep commit `e51d00c5` was pushed to `main`, and annotated tag
  `v0.16.1` was pushed.
- Release workflow `25965424624` completed successfully and published npm plus
  four GitHub Release binary tarballs with four matching `.sha256` assets. Main
  lint run `25965422858` also passed.
- npm latest is `0.16.1`; explicit `bunx @zonease/aiworker-cli@0.16.1
  --version` reports `aiworker/0.16.1 darwin-arm64 node-v24.3.0`.
- Published-package smoke verified daemon runtimeVersion `0.16.1`, Host
  Web/API, official HR/QA app bootstrap, app/soul/template listing, HR
  `create-people-profile` and QA `create-release-gate` mounted actions.
- Release residual: `0.16.0` remains affected if pinned explicitly; users should
  upgrade to npm latest `0.16.1`.
- Release residual: GitHub Actions still reports the existing Node.js 20 action
  deprecation annotation for `actions/setup-node@v4` and
  `softprops/action-gh-release@v2`; it did not block this release.

## 2026-05-16 [completed] BUG-123 / PLAN-337 — Published official Soul App mounted entrypoint repair

Fixed the published official Soul App packaging path that caused HR/QA mounted
header actions to fail with 502 in the `@zonease/aiworker-cli@0.16.0` package.

- Root cause: `build-publish-manifest.ts` patched official app manifests to
  `dist/host-mounted.js` and `dist/standalone.js`, while a clean Bun app build
  emits `dist/mounted/host-mounted.js` and `dist/standalone/standalone.js`.
- Updated publish-manifest patching to the real nested runtime paths and added
  copied-file assertions so missing official app runtime entrypoints fail the
  build step.
- Filtered stale flat official app dist leftovers from release resources so a
  local dirty ignored `dist/` cannot leak `dist/host-mounted.js` or
  `dist/standalone.js` into the package.
- Extended `smoke:dist-release` to invoke HR `create-people-profile` and QA
  `create-release-gate`, proving mounted service startup plus app-owned broker
  storage/search writes.
- Verification passed: focused publish-manifest test, CLI typecheck,
  full `check/test/build`, dist version checks, npm pack dry-run with no legacy
  flat official app runtime files, dist release smoke, `git diff --check`,
  `bun run crg:update`, and `bun run crg:review`.
- Residual: already-published `0.16.0` remains affected if pinned explicitly;
  `0.16.1` ships this source fix as npm latest.

## 2026-05-16 [completed] REL-037 / PLAN-336 — CLI 0.16.0 minor release

Published `@zonease/aiworker-cli@0.16.0` as a minor preview release for the Soul
App authoring layout v2 work. The release carries `engine-assets/`, `product/`
and `host-adapter/` layout convergence, engine asset projection, MCP
client/server declarations, scaffold/validator updates, and current `origin/main`
fixes from `0.15.2`.

- Merged the feature branch with `origin/main`, preserving BUG-121 / PLAN-329
  and BUG-122 / PLAN-330 while renumbering Soul App v2 plans to
  `PLAN-331..335`.
- Bumped `apps/cli/package.json` to `0.16.0`.
- Local release gates passed: `bun run check`, `bun run test`, `bun run build`,
  `git diff --check`, dist version checks, npm pack dry-run,
  `smoke:dist-release`, `bun run crg:update` and `bun run crg:review`.
- Release workflow `25956576934` completed successfully on `v0.16.0` /
  `ca4d00ca` and published npm plus four GitHub Release binary tarballs with
  four matching `.sha256` assets. Main lint run `25956576009` also passed.
- npm latest is `0.16.0`; explicit `bunx @zonease/aiworker-cli@0.16.0
  --version` reports `aiworker/0.16.0 darwin-arm64 node-v24.3.0`.
- Published-package smoke verified daemon runtimeVersion `0.16.0`, Host
  Web/API, official HR/QA app bootstrap, app/soul listing and HR template
  discovery.
- Release residual: GitHub Actions still reports the existing Node.js 20 action
  deprecation annotation for `actions/setup-node@v4` and
  `softprops/action-gh-release@v2`; it did not block this release.

## 2026-05-16 [completed] FEAT-092 / PLAN-335 — Soul App Scaffold And Legacy Layout Removal

Completed Phase 5 of Soul App authoring layout v2. New app scaffolds now
generate the same inspectable `engine-assets/`, `product/` and `host-adapter/`
shape used by official Soul Apps, and active docs/tests no longer teach the old
scattered layout as the default authoring model.

- Updated `aiworker app create` to write workspace engine assets, native skill
  sources, product workflow/schema/review/profile/web placeholders, and
  host-adapter mounted/standalone entrypoints.
- Updated generated manifests, package scripts and tsconfig include paths to
  point at `engine-assets/`, `product/` and `host-adapter/`.
- Updated validation to scan `host-adapter/`, `product/` and legacy `src/`
  production source directories for Host-private imports and raw Web Storage.
- Updated scaffold, SDK, runtime and publish-manifest tests so executable
  examples use the v2 layout.
- Verification passed: `bun test apps/cli/src/aiworker.test.ts
  packages/soul-app-sdk/src/index.test.ts
  packages/soul-app-runtime/src/index.test.ts
  apps/cli/scripts/build-publish-manifest.test.ts`,
  `bun run --filter '@zonease/aiworker-cli' typecheck`,
  `bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck`,
  `bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck`,
  `bun run --filter '@zonease/aiworker-cli' build:bundle`, `bun run lint`,
  `git diff --check`, `bun run crg:update`, and `bun run crg:review`.

## 2026-05-16 [completed] FEAT-091 / PLAN-334 — Soul App MCP Client And Server Contract

Completed Phase 4 of Soul App authoring layout v2. Soul App MCP client config
is now a workspace-local engine asset projection, and MCP server declarations
are constrained to generic MCP package names instead of app-private workflow
implementations.

- Added manifest validation for `engineAssets.mcpServers` package names:
  generic names such as `@zonease/aiworker-mcp-ats` are accepted, while
  workflow-private names such as `aiworker-hr-candidate-screening-mcp` are
  rejected.
- Added runtime MCP client target adapters:
  `engine-assets/mcp-clients/codex/config.toml` projects to
  `.codex/config.toml`, and
  `engine-assets/mcp-clients/claude-code/.mcp.json` projects to `.mcp.json`.
- Projection now uses the worker's selected supported engine target and records
  `mcp-client` receipt entries with `engineTarget`; unsupported engines skip MCP
  client projection.
- Added a literal-secret guard so generated MCP client config cannot carry
  bearer tokens, API keys, passwords, tokens or literal secret assignments.
- Updated Soul App developer docs with the MCP client/server boundary and
  generic `packages/mcp-*` / `@zonease/aiworker-mcp-*` package convention.
- Verification passed: `bun test packages/shared/src/soul-app/manifest.test.ts`,
  `bun run --filter '@zonease/aiworker-shared' typecheck`,
  `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`,
  `bun run --filter '@zonease/aiworker-core' typecheck`,
  `bun run --filter '@zonease/aiworker-core' test`,
  `bun run --filter '@zonease/aiworker-soul-app-runtime' test`,
  `bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck`,
  `bun run lint`, `git diff --check`, `bun run crg:update`, and
  `bun run crg:review`.

## 2026-05-16 [completed] FEAT-090 / PLAN-333 — Soul App Host Adapter Layout Migration

Completed Phase 3 of Soul App authoring layout v2. HR and QA app definitions,
protocol exports, API entries, mounted services and standalone services now
live under `host-adapter/`, while `product/` remains the domain asset surface
and `engine-assets/` remains the engine projection source.

- Moved official HR/QA adapter code from `src/` into
  `host-adapter/{protocol,mounted,standalone}` without adding legacy path
  aliases.
- Updated official app manifests, package exports/scripts, shared reference
  fixtures and manifest tests to use `./host-adapter/...` API, protocol and mode
  refs.
- Updated active Soul App developer docs so reference and production apps show
  `host-adapter/` as the adapter boundary.
- Verification passed: `bun test packages/shared/src/soul-app/manifest.test.ts`,
  `bun run --filter '@zonease/aiworker-shared' typecheck`,
  `bun run --filter '@zonease/aiworker-hr' test`,
  `bun run --filter '@zonease/aiworker-hr' typecheck`,
  `bun run --filter '@zonease/aiworker-hr' validate`,
  `bun run --filter '@zonease/aiworker-qa' test`,
  `bun run --filter '@zonease/aiworker-qa' typecheck`,
  `bun run --filter '@zonease/aiworker-qa' validate`, `bun run lint`,
  `git diff --check`, `bun run crg:update`, and `bun run crg:review`.

## 2026-05-16 [completed] FEAT-089 / PLAN-332 — Soul App Product Layout Migration

Completed Phase 2 of Soul App authoring layout v2. HR and QA product semantics
now live under `product/`, while Host adapter entrypoints remain in `src/` for
the next migration phase.

- Moved official app workflow prompts and review rubrics to
  `product/workflows/*/{prompt,review}.md`.
- Moved artifact schemas to `product/artifacts/schemas/`, artifact review
  policies to `product/reviews/`, profile/SOUL packs to `product/profiles/`,
  and Web product contribution files to `product/web/`.
- Updated HR/QA manifests, shared fixtures and manifest tests to use the v2
  product paths.
- Updated active Soul App developer docs so reference app layout no longer
  teaches the old scattered `capabilities/`, `review/`, `schemas/`, `packs/`
  and `src/ui/` structure as the default.
- Verification passed: `bun test packages/shared/src/soul-app/manifest.test.ts`,
  `bun run --filter '@zonease/aiworker-shared' typecheck`,
  `bun run --filter '@zonease/aiworker-hr' test`,
  `bun run --filter '@zonease/aiworker-hr' validate`,
  `bun run --filter '@zonease/aiworker-qa' test`,
  `bun run --filter '@zonease/aiworker-qa' validate`, `bun run lint`,
  `git diff --check`, `bun run crg:update`, and `bun run crg:review`.

## 2026-05-16 [completed] FEAT-088 / PLAN-331 — Soul App Engine Assets Foundation

Implemented Phase 1 of Soul App authoring layout v2. Official Soul Apps now
declare `engineAssets`, HR native skills moved under `engine-assets/skills`, and
HR/QA workspace seed files live as inspectable `engine-assets/workspace`
templates instead of core Markdown renderers.

- Shared manifest schema, fixture manifests and SDK exports now include
  `engineAssets` plus projection receipt types.
- Core runtime projects workspace files and native skills through
  `packages/core/src/worker/engine-assets.ts`, writes a unified
  `.aiworker/projections.json` receipt, and Host manifest-path workers pass the
  app source root into the same projection path.
- `packages/soul-app-runtime` accepts `appSourceRoot`, so standalone test
  runtimes materialize the same workspace files and engine-native skills as the
  Host-mounted path.
- FEAT-087's uncommitted root `AGENTS.md` / `CLAUDE.md` renderer work was
  absorbed into this source-template projection. `CLAUDE.md` remains the
  one-line `@AGENTS.md` shim, but the maintained source is now app-owned.
- Verification passed: `bun test packages/shared/src/soul-app/manifest.test.ts`,
  `bun run --filter '@zonease/aiworker-shared' typecheck`,
  `bun test --timeout=30000 packages/core/src/worker/runtime.test.ts`,
  `bun run --filter '@zonease/aiworker-core' typecheck`,
  `bun run --filter '@zonease/aiworker-core' test`,
  `bun run --filter '@zonease/aiworker-soul-app-runtime' test`,
  `bun run --filter '@zonease/aiworker-soul-app-runtime' typecheck`,
  `bun run --filter '@zonease/aiworker-soul-app-sdk' test`,
  `bun run --filter '@zonease/aiworker-soul-app-sdk' typecheck`, `bun run lint`,
  `git diff --check`, `bun run crg:update`, and `bun run crg:review`.

## 2026-05-15 14:42 [completed] FEAT-087 / PLAN-328 — Soul workspace agent instructions projection

Soul profile workspaces now bootstrap and repair engine-root guidance for Codex
and Claude Code without duplicating the maintained instruction source.

- `AGENTS.md` is written at the Soul workspace root with the generic workspace
  contract: `README.md` is accepted state, session output belongs under
  `artifacts/<sessionId>/`, agent output stays proposed until human review, and
  promotion into `README.md` is controlled by Soul App policy.
- Action-started sessions are now documented as explicit Soul skill selections:
  agents must follow the selected skill and must ask before switching skills.
- `CLAUDE.md` is written as the one-line `@AGENTS.md` shim.
- Profile ledger `.gitignore` excludes `AGENTS.md` and `CLAUDE.md` so generated
  engine guidance does not enter accepted profile revision commits.
- Focused verification passed: `bun test --timeout=30000
  packages/core/src/worker/runtime.test.ts`, `bun run --filter
  '@zonease/aiworker-core' typecheck`, `bun run --filter
  '@zonease/aiworker-core' test`, `bun run lint`, `git diff --check`,
  `bun run crg:update`, and `bun run crg:review`.
## 2026-05-15 21:00 [completed] BUG-122 / PLAN-330 — Restore GitHub-hosted release workflows

Restored `.github/workflows/lint.yml` and `.github/workflows/release.yml` from
the temporary `self-hosted` / `ttpos-uat-linux` release fallback back to
`ubuntu-latest`. The workflows keep `actions/setup-node@v4` with Node 24 and
`NODE_OPTIONS=--max-old-space-size=1024`, because those settings address the
self-hosted Node/runtime instability seen during the emergency release path
without binding public CI to private runners.

Release run `25909996552` remains the completed `v0.15.2` publication evidence.
Future queued GitHub-hosted runs should be cancelled and re-run first; switching
public repository workflows to self-hosted runners is an explicit last resort,
not the default remediation path.

## 2026-05-15 17:20 [completed] BUG-121 / PLAN-329 — CLI updater global package source detection

Published `@zonease/aiworker-cli@0.15.2` as a patch release for `aiworker
upgrade` reporting `source_unknown` from package-manager installs. The root
cause was that npm/Bun global shims launch the package's `aiworker-bun.js`
bundle, while the detector only recognized the global bin shim path.

- Added updater regression coverage for npm global and Bun global package bundle
  paths, then fixed `detectInstallSource` to classify them as `npm-global` and
  `bun-global`.
- Local gates passed: focused updater/CLI tests, CLI typecheck, Web build, CLI
  bundle, dist release smoke, root `check`, root `test`, root `build`,
  `git diff --check`, npm pack dry-run, `bun run crg:update` and
  `bun run crg:review`.
- GitHub Actions release run `25909996552` completed successfully on
  `v0.15.2` / `6c0dc357` and published npm plus four GitHub Release binary
  tarballs with four matching `.sha256` assets. Main lint run `25909992060`
  also passed.
- npm latest is `0.15.2`; explicit `bunx @zonease/aiworker-cli@0.15.2
  --version` reports `aiworker/0.15.2 darwin-arm64 node-v24.3.0`.
- Published-package smoke verified daemon runtimeVersion `0.15.2`, Host
  Web/API, official HR/QA app bootstrap, app/soul listing and HR template
  discovery.
- Published Bun global install smoke verified `aiworker update --check --target
  99.0.0` now reports `source.kind: bun-global`,
  `source.canAutoUpgrade: true` and `status: update_available`.
- CI note: the self-hosted runner exposed a 256MB Node heap OOM during
  Typecheck/Web build. The lint and release workflows now set
  `NODE_OPTIONS=--max-old-space-size=1024`; the temporary runner-group
  public-repository access used to unblock the release was restored to
  `allows_public_repositories=false`.

## 2026-05-15 14:08 [completed] REL-036 / PLAN-327 — CLI 0.15.1 patch release

Published `@zonease/aiworker-cli@0.15.1` as a patch release for the post-0.15.0
Worker Web shell header action status fix. The release carries the
`WorkerStudio` success-status suppression plus a CI-stable regression test that
waits for the Soul App action dialog before asserting that no success status row
is rendered.

- Local release gates passed: `bun run check`, `bun run test`, `bun run build`,
  `git diff --check`, dist version checks, npm pack dry-run,
  `smoke:dist-release`, `bun run crg:update` and `bun run crg:review`.
- First tag-triggered workflow `25903035166` failed in Test before npm publish;
  the root cause was a test-only async dialog race. The remote `v0.15.1` tag was
  rebuilt after fixing the test and before any package or GitHub Release was
  published.
- Release workflow `25903157643` completed successfully and published npm plus
  four GitHub Release binary tarballs with four matching `.sha256` assets.
- npm latest now resolves to `0.15.1`; `bunx @zonease/aiworker-cli@0.15.1
  --version` reports `aiworker/0.15.1 darwin-arm64 node-v24.3.0`.
- Published-package smoke verified the Host Web/API, runtimeVersion `0.15.1`,
  official HR/QA Soul App bootstrap, app/soul listing and HR person-profile
  template discovery.

## 2026-05-15 13:50 [completed] REL-035 / PLAN-326 — CLI 0.15.0 minor release

Published `@zonease/aiworker-cli@0.15.0` as a minor release for the completed
FEAT-086 self-updater slice. The release bumps the CLI package version, adds
GitHub Release `.sha256` checksum assets for binary tarballs, and passed local
release gates before pushing `main` and annotated tag `v0.15.0`. GitHub Actions
release run `25902585088` succeeded, npm latest now resolves to `0.15.0`,
`bunx @zonease/aiworker-cli@0.15.0 --version` reports `aiworker/0.15.0`, and
published-package smoke verified the Host Web/API plus official HR/QA Soul App
bootstrap path.

## 2026-05-15 [completed] FEAT-086 / PLAN-325 — CLI self-updater

Completed the top-level `aiworker update` / `aiworker upgrade` self-updater
slice. Verification passed: `bun test --timeout=15000
apps/cli/src/updater.test.ts apps/cli/src/aiworker.test.ts` with 66 tests,
`bun run --filter '@zonease/aiworker-cli' typecheck`,
`bun run --filter '@zonease/aiworker-cli' build:bundle`,
`bun run --filter '@zonease/aiworker-cli' smoke:dist-release`,
`git diff --check`, `bun run crg:update` and `bun run crg:review` with final
docs risk score 0.00.

## 2026-05-15 10:14 [completed] REL-034 / PLAN-324 — CLI 0.14.0 minor release

Published `@zonease/aiworker-cli@0.14.0` as a minor release after merging PR #3
into `main`. The release carries the HR profile-first workspace loop, profile
ledger, native Soul App skill projection, profile revision API, and HR-native
skills into the published CLI package.

- Baseline release facts: npm latest is `0.13.2`; local and remote `v0.14.0`
  tags are unused; local `main` and `origin/main` both point at `f14af975`.
- Release prep is in progress under `REL-034 / PLAN-324`.
- Local release gates passed: `bun run check`, `bun run test`, `bun run build`,
  `git diff --check`, dist version checks, npm pack dry-run,
  `smoke:dist-release`, `bun run crg:update` and `bun run crg:review`.
- Pack preview reports `@zonease/aiworker-cli@0.14.0` with 119 files and the
  expected HR native skills, Worker Web static, worker migrations and official
  HR/QA app runtime resources.
- Release prep commit `97d127ad chore(release): 准备 CLI 0.14.0` and annotated
  tag `v0.14.0` were pushed to origin.
- GitHub Actions release workflow `25896450431` completed successfully and
  published npm plus four GitHub Release binary tarballs; main lint workflow
  `25896448657` also passed.
- npm latest is `0.14.0`; explicit `bunx @zonease/aiworker-cli@0.14.0
  --version` reports `aiworker/0.14.0 darwin-arm64 node-v24.3.0`.
- GitHub Release `https://github.com/ZonEaseTech/aiworker/releases/tag/v0.14.0`
  is non-draft / non-prerelease and includes the darwin-arm64, darwin-x64,
  linux-arm64 and linux-x64 tarballs.
- Published-package smoke passed from
  `/private/tmp/aiworker-release-0.14.0-published-smoke-ihaCX6`, covering
  `/health`, runtimeVersion `0.14.0`, Host Web static serving, official app
  bootstrap, HR template discovery, profile `README.md`, local git init, and 5
  HR native skill projections.
- Residual workflow note: `softprops/action-gh-release@v2` still emits the
  existing Node.js 20 deprecation annotation; it did not affect this release.

## 2026-05-15 02:45 [completed] FEAT-085 / PLAN-323 — HR Profile Ledger and Native Skills

Started the profile-first HR Soul App landing work from the approved
`docs/superpowers/specs/2026-05-15-hr-profile-ledger-native-skills-design.md`.
The implementation targets one People Profile per workspace, `README.md` as the
accepted profile, git-backed profile revisions, app-owned native skill
projection into engine workspaces, and an HR workbench centered on Current
Profile Summary with Candidate / Employee / Alumni as first-level profile lists.

Baseline focused gates passed before implementation:
`packages/core/src/worker/runtime.test.ts`,
`apps/api/src/modes/worker.local.test.ts`, and
`apps/web/src/worker/souls/hr/people-workbench/model.test.ts`.

Implementation progress: native Soul App skill projection, profile workspace
ledger bootstrap, profile revision promotion API, HR native skills, and the
profile-first Worker Web loop are implemented. Focused HR Web RED/GREEN checks
now pass through the package-local Vitest runner.

Completed the end-to-end slice:

- Profile workspaces now bootstrap `README.md`, profile-safe folders,
  `.gitignore`, local git initialization, and repair logic.
- Source-backed Soul Apps can project static native skills into
  `.agents/skills` and `.claude/skills`; `aiworker-hr` ships five HR-native
  skills for profile, evidence, interview, and risk review workflows.
- The local daemon exposes generic profile read and approved revision promotion
  endpoints without interpreting HR profile fields.
- Worker Web now centers HR around Current Profile Summary, keeps Candidate /
  Employee / Alumni as first-level profile lists, and treats artifact output as
  Proposed Change with an explicit approval path.
- Verification passed: focused runtime/API/HR/Web tests, HR app validate/test,
  root `check`, root `test`, root `build`, `git diff --check`, desktop/mobile
  Playwright smoke, `crg:update`, and `crg:review`.

## 2026-05-15 00:31 [completed] REL-033 / PLAN-322 — CLI 0.13.2 patch release

Published `@zonease/aiworker-cli@0.13.2` as a patch release. `0.13.1` was
already published on npm and GitHub Release, so this release uses a new patch
version for the current post-0.13.1 `main` changes: dev home isolation, Soul App
authoring boundary cleanup, packaged daemon runtime version propagation and Soul
App Web Storage discipline.

- Local release gates passed: `bun run check`, `bun run test`, `bun run build`,
  `git diff --check`, dist version checks, npm pack dry-run,
  `smoke:dist-release`, `bun run crg:update` and code-review-graph change
  detection against `origin/main`.
- Pack preview reports `@zonease/aiworker-cli@0.13.2` with 114 files and the
  expected CLI, Worker Web, worker migration and official HR/QA app runtime
  resources.
- Release prep commit `683b7f21 chore(release): 发布 CLI 0.13.2` and annotated
  tag `v0.13.2` were pushed to origin.
- GitHub Actions release workflow `25871841845` completed successfully and
  published npm plus four GitHub Release binary tarballs; main lint workflow
  `25871841945` also passed.
- npm latest is `0.13.2`; explicit `bunx @zonease/aiworker-cli@0.13.2
  --version` reports `aiworker/0.13.2 darwin-arm64 node-v24.3.0`.
- GitHub Release `https://github.com/ZonEaseTech/aiworker/releases/tag/v0.13.2`
  is non-draft / non-prerelease and includes the darwin-arm64, darwin-x64,
  linux-arm64 and linux-x64 tarballs.
- Published-package smoke passed from
  `/private/tmp/aiworker-release-0.13.2-published-smoke-pDiAut`, covering
  `/health`, runtimeVersion `0.13.2`, Host Web static asset serving, official
  app bootstrap, app/Soul catalog and HR template projection.
- Residual workflow note: `softprops/action-gh-release@v2` still emits the
  existing Node.js 20 deprecation annotation; it did not affect this release.

## 2026-05-14 17:45 [completed] FEAT-084 / PLAN-321 — Soul App Web Storage discipline

Completed the trusted first-party browser storage discipline slice for official
Soul Apps.

- Added `createSoulAppWebStorage(...)` to the Soul App SDK for scoped
  `aiworker:app:<appId>:...` browser UI state.
- Added SDK tests for key scoping, scoped clear, invalid keys, unavailable
  storage and invalid JSON values.
- Extended `aiworker app validate` with additive `webStorageIssues` so raw
  `localStorage` / `sessionStorage` usage in production Soul App source fails
  validation.
- Extended the root Soul App boundary self-check used by `bun run lint` to
  protect official HR/QA app source from raw Web Storage API regressions.
- Documented the boundary explicitly: current same-realm Soul Apps are trusted
  first-party code governed by self-checks, not third-party sandboxed plugins;
  future third-party apps need a separate isolated renderer, worker/protocol or
  descriptor-only design.
- Verification passed: focused SDK tests/typecheck, focused CLI validation
  tests, root boundary self-check, docs check, root `check`, root `test`, root
  `build`, `git diff --check`, `bun run crg:update` and `bun run crg:review`.
- code-review-graph exited 0 with static helper-level test-gap hints; CLI
  behavior is covered through `aiworker app validate` regression tests.

## 2026-05-14 [done]

Completed BUG-119 / PLAN-319. Soul App SDK/runtime packages remain unpublished,
but the source-checkout authoring boundary is now tighter: mounted app broker
callbacks can use Host-issued app-scoped mount tokens under bearer-protected
daemons, `createSoulAppClient(...)` can send that token, HR/QA mounted services
pass it through, scaffold output clearly labels `workspace:*` as preview-only,
the SDK README no longer claims runtime harness exports, and runtime harnesses
expose a minimal app-facing worker snapshot instead of `WorkerRow`.

Completed BUG-120 / PLAN-320. Packaged CLI daemon startup now injects the CLI
package version into local daemon bootstrap, so `/api/local/info`,
`/health` and Worker Web Settings About no longer fall back to `dev` for a dist
release daemon. Added dist release smoke coverage that fails when
`runtimeVersion` diverges from `apps/cli/dist/package.json`.

## 2026-05-14 [progress]

Started BUG-120 / PLAN-320 to fix packaged daemon runtime version propagation.
The currently running published `@zonease/aiworker-cli@0.13.1` daemon reports
`runtimeVersion: "dev"` through `/health` and `/api/local/info`, which makes
Worker Web Settings show a dev version for a release daemon.

## 2026-05-14 [progress]

Started BUG-119 / PLAN-319 to clean Soul App SDK/runtime authoring boundaries
without publishing standalone SDK/runtime npm packages. The slice targets
mounted broker auth through Host mount tokens, source-checkout scaffold
messaging, SDK/runtime docs alignment and runtime harness type narrowing.

## 2026-05-14 [done]

Completed FEAT-083 / PLAN-318. Source-checkout development now defaults to
`~/.aiworker-dev`, packaged CLI defaults remain `~/.aiworker`, and explicit
`AIWORKER_HOME` / `WORKER_DB_PATH` overrides keep priority. Verified with
focused fs-layout/Core/CLI tests, Web build, CLI bundle, dist release smoke,
`git diff --check` and code-review-graph.

## 2026-05-14 [progress]

Started FEAT-083 / PLAN-318 to isolate source-checkout development state under
`~/.aiworker-dev` while preserving packaged CLI default state under
`~/.aiworker`.

## 2026-05-14 16:25 [completed] BUG-118 / PLAN-317 — Worker Web legacy orphan worker blank-page repair

Published `@zonease/aiworker-cli@0.13.1` as a patch release for the 0.13.0
preview.

- Fixed Worker Web worker selection so persisted legacy workers whose `soulId`
  is no longer projected by the enabled Soul App catalog cannot blank the Host
  shell.
- Worker Web now selects only workers backed by a current available Soul and at
  least one capability template; if none exist, it falls back to the first-run
  Soul App home.
- Added Worker Studio regression tests for both mixed valid/legacy workers and
  all-orphan legacy workers.
- Verified a temporary legacy-home daemon and the published package with old
  `devops` / `pm` workers now render the HR/QA first-run Soul App cards instead
  of an empty page.
- Local verification passed: focused Worker Studio tests, Worker Web build,
  browser smoke, `bun run check`, `bun run test`, `bun run build`, dist version
  checks, npm pack dry-run, dist release smoke, `git diff --check`, and
  code-review-graph.
- GitHub Actions release workflow `25849847547` completed successfully and
  published npm plus four GitHub Release binary tarballs.
- npm latest is `0.13.1`; explicit `bunx @zonease/aiworker-cli@0.13.1
  --version` reports `aiworker/0.13.1 darwin-arm64 node-v24.3.0`.
- Residual workflow note: `softprops/action-gh-release@v2` still emits the
  existing Node.js 20 deprecation annotation; it did not affect this release.

## 2026-05-14 15:45 [completed] REL-032 / PLAN-316 — CLI 0.13.0 preview minor release

Published `@zonease/aiworker-cli@0.13.0`.

- Release scope is the CLI npm package and tag-triggered GitHub Release assets.
- Local gates passed: `bun run check`, `bun run test`, `bun run build`, `git diff
  --check`, dist version checks, npm pack dry-run and `smoke:dist-release`.
- GitHub Actions release workflow `25848244863` completed successfully and
  published npm plus four GitHub Release binary tarballs.
- npm latest is `0.13.0`; explicit `bunx @zonease/aiworker-cli@0.13.0
  --version` reports `aiworker/0.13.0 darwin-arm64 node-v24.3.0`.
- Published-package smoke passed for Host Web/API, official app bootstrap,
  app/Soul catalog and HR template projection.
- Independent SDK/runtime npm publication, third-party authoring outside the
  monorepo, Host auth and 1.0 GA claims are out of scope.
- The legacy governance compact harness was not used as a blocking gate because
  it still targets retired worker-governance surfaces rather than the packaged
  Host/Soul App preview path.

## 2026-05-14 14:11 [completed] FEAT-082 / PLAN-315 — npm preview release readiness

Completed the 0.x public preview release readiness slice.

- Added package-local resource locators for Worker Web static files and
  official HR/QA Soul App manifests.
- Packaged `official-apps/`, `web/` and `drizzle/` into the CLI dist package,
  with official app mounted/standalone entries patched to app `dist/` bundles.
- Added `smoke:dist-release` to verify dist daemon startup, Host Web assets,
  `/api/local/apps`, official app bootstrap and HR template projection.
- Documented the external `bunx` / `npx @zonease/aiworker-cli` preview path.
- Host auth, 1.0 release claims and third-party SDK/runtime npm publication are
  out of scope for this slice.
- Verification passed: focused core/API/CLI tests, Web build, CLI build bundle,
  npm pack dry-run, dist release smoke, root `check`, root `test`, root
  `build`, `git diff --check`, `bun run crg:update` and `bun run crg:review`.

## 2026-05-14 13:39 [completed] DOC-013 / PLAN-314 — Agent-operational documentation contract

Completed the documentation contract convergence slice.

- Centralized hard Host/Soul/protocol/data/import/documentation constraints in
  `docs/architecture.md`.
- Kept `AGENTS.md`, README and route skills as thin agent-operational layers.
- Replaced stale `README.zh-CN.md` product prose with canonical active
  pointers.
- Added a docs contract check so stale entrypoints and retired route names do not
  drift back into active guidance.
- Verification passed: `bun run docs:check`, `bun run lint`, `git diff
  --check`, `bun run crg:update`, and `bun run crg:review`.

## 2026-05-14 13:17 [completed] FEAT-081 / PLAN-313 — Host and Soul App developer route onboarding

Completed the active-entrypoint convergence slice for new developers and
agents.

- Added a Host-side agent skill for daemon/API, Web shell, CLI, runtime, broker,
  auth, shared protocol, storage and shared UI work.
- Kept the Soul App skill focused and handed Host-owned changes to the Host
  route.
- Mapped `AGENTS.md`, `README.md` and `docs/architecture.md` to the two active
  development routes without creating a second architecture contract.
- Verification: parsed both skill frontmatter blocks, searched active
  references, confirmed `aiworker-validate` was not reintroduced as an active
  route, and ran `git diff --check`.
- Skipped code-review-graph because only documentation and agent instruction
  files changed.

## 2026-05-14 12:28 [completed] FEAT-080 / PLAN-312 — Official Soul App broker proof closure

Closed the proof gap found by the code audit: FEAT-079's search broker now runs
through official HR/QA Soul App code paths instead of only synthetic tests.

- Align API descriptor permission parsing with shared manifest `search` support.
- Make HR/QA app manifests and Host reference manifests declare
  `search:read/write:<appId>` and publish app-owned broker search descriptors
  from mounted actions.
- Gate Settings enablement through Host-owned security review before calling
  enable.
- Keep Host generic: no HR profile or QA release interpretation in platform code.

Verification passed: focused API/HR/QA/Web tests, HR/QA validate and smoke,
root `check`, `build`, `test`, `git diff --check`, and code-review-graph. CRG
exited 0 with static test-gap hints for mounted helper functions and test fetch
mocks, covered by HR/QA mounted-service tests, API local-daemon tests and Worker
Studio Settings flow tests.

## 2026-05-14 11:47 [completed] FEAT-079 / PLAN-311 — App-owned search index broker

Completed the final convergence slice after identity boundary delivery.

- Add `search` broker permissions for app-owned index descriptors.
- Let Soul Apps push non-authoritative title/summary/reference records through Host broker routes.
- Keep Host search indexing generic and avoid domain result interpretation.
- Expose SDK helpers for public app-scoped broker search routes.

Verification passed: focused shared/core/API/SDK tests and typechecks, lint,
`git diff --check`, and code-review-graph. CRG exited 0 with static test-gap
hints for API parsing/OpenAPI helpers and search-index helpers, covered by the
focused API/core/SDK tests.

## 2026-05-14 11:41 [completed] FEAT-078 / PLAN-310 — Identity boundary

Completed the next convergence slice after broker provider registry delivery.

- Move local bearer auth behind a Host auth provider interface.
- Keep existing local daemon token behavior compatible.
- Project authenticated operator identity into broker scope and signed mount context.
- Keep Soul Apps away from caller cookies, caller authorization headers and Host auth internals.

Verification passed: focused core/API tests and typechecks, lint, `git diff
--check`, and code-review-graph. CRG exited 0 with static test-gap hints for
API request helpers and mount context projection, covered by the focused
authenticated identity API test.

## 2026-05-14 11:33 [completed] FEAT-077 / PLAN-309 — Broker provider registry

Completed the next convergence slice after permission visibility delivery.

- Define a typed broker provider registry for storage, connector, audit and
  secret-reference providers.
- Expose local SQLite providers and future S3/GCP/vault metadata without adding
  real cloud SDK dependencies.
- Let Soul Apps inspect Host platform capability providers through public
  broker routes and SDK helpers.
- Keep provider metadata secret-safe and domain-agnostic.

Verification passed: focused shared/core/API/SDK tests and typechecks, lint,
`git diff --check`, and code-review-graph. CRG exited 0 with static test-gap
hints for API bootstrap/route registration and broker projection helpers,
covered by focused API/core tests.

## 2026-05-14 02:05 [completed] FEAT-076 / PLAN-308 — Soul App permission visibility and install review

Completed the next convergence slice after storage broker provider delivery.

- Add a Host-owned security review projection for manifest permissions,
  connector needs and descriptor `requiredPermissions`.
- Expose review through local daemon routes before app code runs.
- Show review details in Settings before generic enable/disable actions.
- Keep the review generic and avoid HR/QA-specific approval semantics.

Verification passed: focused core/API/Web tests and typechecks, lint, `git
diff --check`, Worker Web build, and code-review-graph. CRG exited 0 with
static test-gap hints for route/bootstrap/display helpers, covered by the
HTTP-level local daemon test and Worker Studio Settings flow test.

## 2026-05-14 01:34 [completed] FEAT-075 / PLAN-307 — Soul App storage broker provider and app-owned drafts

Completed the next convergence slice after broker permission hardening.

- Added a Host/core storage provider interface with SQLite as the default local
  provider.
- Kept broker permission, scope and audit decisions in Host.
- Separated Host action `scope` from app-owned action `input`.
- Made HR/QA mounted create actions write app-owned draft records through the
  public broker storage path when Host context is present.
- Updated Worker Web shell action calls to pass scope separately.

Verification passed: core/API/HR/QA/Web focused tests and typechecks, HR/QA
validate, lint boundary, `git diff --check`, and code-review-graph. CRG reported
static private-helper gaps covered through HR/QA mounted-service tests, API
HTTP-level tests and Web action payload tests.

## 2026-05-14 01:16 [completed] FEAT-074 / PLAN-306 — Soul App broker permission hardening

Completed the next zero-trust slice after the protocol interaction closure. App
declared shell action/search `requiredPermissions` are now enforceable before
Host contacts a mounted Soul App service.

- Added shared manifest validation and public exports for
  `requiredPermissions` as `kind:action:target`.
- Guarded Host action/search invocation through the broker permission decision.
- Added official HR/QA permission declarations for app-owned shell descriptors.
- Covered allowed and denied paths, including the denied path not reaching the
  mounted service.

Verification passed: shared focused/full tests and typecheck, SDK test, API
focused test and typecheck, HR/QA tests/typechecks/validate, lint boundary,
`git diff --check`, and code-review-graph. CRG reported static private-helper
test gaps covered through HTTP-level local daemon tests.

## 2026-05-14 00:40 [completed] FEAT-073 / PLAN-305 — Soul App protocol interaction closure

Closed the local-first Host / Soul App interaction loop by making app-declared
shell actions and search providers usable through generic Host protocol routes.

- Added generic Host action and search routes for declared Soul App shell
  descriptors.
- Implemented HR/QA mounted protocol action and search handlers.
- Enabled Worker Web shell actions and app-owned shell search without
  app-specific branches.
- Kept Host as lifecycle, declaration, scope and mounted invocation owner while
  Soul Apps own domain result meaning.

Verification passed: focused shared/API/Web/HR/QA tests and typechecks, HR/QA
validate and smoke, root typecheck/lint/test/build, browser smoke on
`http://127.0.0.1:5273/`, `git diff --check`, and code-review-graph. CRG
reported private-helper static test gaps, covered by HTTP-level mounted service
and Host/Web protocol tests.

## 2026-05-13 23:55 [completed] FEAT-072 / PLAN-304 — Host platform locator and capability shell boundary

Converged Host toward a platform locator, capability broker and shell contract
while keeping Soul Apps authoritative for domain state and domain meaning.

- Added shell/action/search descriptors to the Soul App manifest and protocol
  contract.
- Projected app-declared shell descriptors through Host catalog without adding
  domain semantics.
- Marked mounted descriptor responses as app-owned, non-authoritative protocol
  views.
- Kept HR/QA people profile and release gate meaning inside their apps while
  exposing only protocol-owned descriptor surfaces to Host.
- Rendered Worker Web shell slots from app descriptors without implementing
  Host-owned HR/QA action handlers.

Verification passed: shared/core/API/Web/HR/QA focused tests and typechecks,
HR/QA validate and smoke package scripts, root typecheck/lint/test/build,
browser smoke on `http://localhost:5173/`, `git diff --check`, and
code-review-graph.

## 2026-05-13 21:06 [completed] DOC-012 / PLAN-303 — Clean active documentation map

Cleaned the root documentation map so active agent guidance is task-routed
instead of scattered across stale pages.

- Deleted `docs/e2e-smoke.md` because the referenced PLAN-004 smoke script no
  longer exists.
- Deleted `docs/governance-node-status.md` so old governance posture no longer
  acts as a third architecture entrypoint.
- Rewrote `docs/cli.md` for the current app/worker/workspace/session/turn
  command tree.
- Refreshed `docs/deployment.md`, `docs/executor-engines.md`, `AGENTS.md` and
  README around the current Host / Soul App local daemon contract.

Verification passed: deleted-doc reference search, stale CLI term search,
stale governance/product term search and `git diff --check`. code-review-graph
skipped because this slice changes only documentation and agent guidance.

## 2026-05-13 20:36 [completed] DOC-011 / PLAN-302 — Converge Host and Soul App architecture entrypoints

Converged the active architecture entrypoints to root `AGENTS.md` and
`docs/architecture.md`.

- Deleted the old north-star document instead of keeping a redirect stub.
- Rewrote the architecture contract around Host as platform locator and
  capability shell, with Soul Apps owning domain state and meaning.
- Updated Soul App authoring guidance, the repository README and the governance
  status note so Host consumes only protocol-exposed app surfaces.

Verification passed: active-entrypoint stale-reference searches and
`git diff --check`. code-review-graph skipped because the slice changes only
documentation, root agent instructions and skill markdown.

## 2026-05-13 19:49 [completed] REFACTOR-079 / PLAN-301 — Move Soul Apps management out of the worker rail

Moved installed Soul App visibility out of the daily worker navigation rail and
into Settings so the workbench left side can stay focused on worker, workspace
and session navigation.

- Removed the always-visible `Soul Apps` rail card and inline mounted-surface
  preview diagnostics from Worker Studio.
- Kept the first-run main surface backed by enabled installed Soul Apps when no
  worker exists.
- Reworked Settings' `Soul Apps` section to list installed apps with status,
  version, domain, permission count, template count, mounted contribution count
  and API prefix.
- Updated Worker Studio tests and localized Settings copy for the new placement.

Verification passed: focused Worker Studio test, Web typecheck, Web build,
browser verification on `http://localhost:5173`, `git diff --check`, and
code-review-graph. CRG exits 0 with static test-gap hints for small Settings
display helpers; the focused test and browser check cover the product contract.

## 2026-05-13 19:00 [completed] FEAT-071 / PLAN-300 — Soul App development skill and rules

Added an agent-native Soul App development route so contributors can work on
Soul Apps without drifting from Host / Soul App dual autonomy.

- Added `.agents/skills/aiworker-soul-app-dev/SKILL.md` with required context,
  boundary rules, product-language checks, standalone/Host mounted expectations
  and verification gates.
- Routed `apps/aiworker-*`, Soul App scaffold/validation and authoring-doc edits
  from root `AGENTS.md` to the new skill.
- Updated `docs/soul-app-developer.md` to distinguish the human-readable
  authoring guide from the agent-native execution route and to keep
  `apps/AGENTS.md` out of the canonical path until nested loading is proven.

Verification passed: placeholder scan, `test ! -e apps/AGENTS.md`, and
`git diff --check`. code-review-graph was skipped because this change only
touches docs, root agent instructions, and skill markdown.

## 2026-05-13 18:32 [completed] REFACTOR-078 / PLAN-299 — Make Worker Web first-run Soul App first

Made Worker Web first-run start from enabled Soul Apps instead of an unexplained
empty worker object.

- Replaced the no-worker home with a Soul App first-run surface that shows
  enabled HR/QA app cards and starts the existing create-worker flow with the
  chosen app-projected Soul preselected.
- Kept the backend route model unchanged: Soul App -> worker -> workspace ->
  session remains the implementation path, but the user begins with the
  business app.
- Collapsed technical Soul App rail diagnostics such as permission counts, API
  routes, mounted slots and mounted surfaces behind `Developer details`.
- Updated localized copy and the mounted-surface browser smoke to use the new
  disclosure interaction.

Verification passed: focused Worker Studio test, Web `lint`, `typecheck`,
`test`, `build`, root `typecheck`, `lint`, `test`, `build`,
`web:smoke:mounted-surfaces`, browser smoke on a temporary local daemon,
`git diff --check`, and code-review-graph. CRG exits 0 with overall risk 0.40
and static test-gap hints; Worker Studio tests plus the browser smoke cover the
changed first-run and mounted-surface paths.

## 2026-05-13 18:05 [completed] REFACTOR-077 / PLAN-298 — Make Host runtime a first-class bounded context

Made Host a shared core use-case boundary while keeping API, CLI and Web as
separate delivery adapters.

- Added `packages/core/src/host/runtime.ts`, a Host runtime facade for Soul App
  lifecycle, official bootstrap, catalog projection, worker creation, runtime
  creation, template ownership and metadata enrichment.
- Added direct Host contract tests that cover official app bootstrap, legacy
  built-in Soul rejection, app-scoped worker metadata, duplicate worker
  conflicts, worker-owned template validation and template metadata enrichment.
- Refactored local daemon API routes to delegate Host decisions through
  `state.host` while keeping Hono routes, auth, streaming, settings and mounted
  service handling in the API adapter.
- Refactored CLI app/worker/template/session paths and `app smoke` to use the
  same Host facade.

Verification passed: focused core/API/CLI typechecks and tests, root `lint`,
`typecheck`, `test`, `build`, `web:smoke:mounted-surfaces`, `git diff --check`
and code-review-graph. CRG exits 0 with overall risk 0.60 and static test-gap
hints around adapter helpers; new Host contract tests plus existing API/CLI
tests and mounted smoke cover those paths.

## 2026-05-13 17:28 [completed] REFACTOR-076 / PLAN-297 — Remove legacy gateway and fleet surfaces

Removed the historical gateway/fleet control plane from active source,
packaging, storage, deployment and operator docs.

- Deleted `packages/gateway`, `packages/gateway-proto`, dead gateway smoke
  scripts, fleet DB schema/migrations/generation, Docker/GHCR/compose/Caddy
  deployment surfaces and old gateway runbooks.
- Removed gateway/proto dependencies from current CLI/API/core packages and
  regenerated `bun.lock`.
- Rehomed the remaining current worker id helpers into shared ids and moved
  `EngineKind` to the provider availability contract.
- Kept release packaging focused on Worker Web static assets and worker DB
  migrations.
- Rewrote active README/deployment docs around local daemon, Host and Soul App
  autonomy instead of a remote gateway/fleet path.

Verification passed: focused shared/storage/CLI/API typechecks, focused
shared/storage tests, CLI bundle build, root `typecheck`, `lint`, `test`,
`build`, `web:smoke:mounted-surfaces`, and code-review-graph. CRG exits 0 with
overall risk 0.35 and one static test-gap hint for `configureWorker`; current
CLI and root test gates cover the changed smoke configuration path.

## 2026-05-13 15:49 [completed] BUG-117 / PLAN-296 — Worker Web build chunk reduction

Fixed the Worker Web Vite chunk-size warning by reducing the actual initial
JavaScript bundle instead of raising the warning threshold.

- Added a lightweight `@zonease/aiworker-shared/soul-workbench-catalog` export
  so Worker Web can read workbench descriptors without importing the full shared
  barrel and its schema/fixture dependencies.
- Added `@zonease/aiworker-component/markdown-preview` for targeted lazy
  loading of the markdown preview renderer.
- Lazy-loaded the HR specialized workbench and nested markdown preview stack.
- Reduced Worker Web's largest JS chunk from about 779 kB to 351.99 kB; build
  now emits `index`, `people-workbench`, and `markdown-preview` JS chunks with no
  Vite chunk-size warning.

Verification passed: focused Web/shared tests, Web build, root `lint`,
`typecheck`, `test`, `build`, `web:smoke:mounted-surfaces`,
`git diff --check`, and code-review-graph. `crg:review` exits 0 and reports
static test-gap warnings for touched lazy modules; focused Web tests and browser
smoke cover the behavior.

## 2026-05-13 14:07 [completed] FEAT-070 / PLAN-295 — Legacy Soul metadata discard and mounted surface hardening

Completed the selected follow-ups 1, 2 and 4, while leaving additional official
Soul Apps out of scope.

- Added legacy HR/QA metadata discard for old `hr` / `qa` workers. API startup
  and `aiworker app bootstrap official` now delete those legacy workers and
  cascaded local metadata instead of migrating them to `aiworker-hr` /
  `aiworker-qa`.
- Surfaced discard counts in CLI bootstrap output.
- Added a generic Soul App boundary lint script that discovers manifest-backed
  `apps/*` Soul Apps and rejects Host-private imports, sibling app imports and
  Host imports of `apps/*/src` internals.
- Added `web:smoke:mounted-surfaces`, a Playwright browser smoke that starts a
  temporary local daemon, opens Host-served Worker Web, and verifies mounted HR
  descriptor and sandboxed frame surfaces.
- Fixed mounted service startup races by deduplicating pending app service
  launches per app; the browser smoke exposed this because multiple mounted
  surfaces resolve concurrently.

Verification passed: focused storage/core/API/CLI tests, root `lint` with the
new boundary script, root `typecheck`, root `test`, root `build`,
`web:smoke:mounted-surfaces`, `git diff --check` and code-review-graph. Web
build still emits the existing chunk-size warning, but exits 0.
Code-review-graph exits 0 and reports static test-gap warnings for touched
bootstrap/helper functions; focused storage/API/CLI/core tests cover the
corrected discard behavior.

## 2026-05-13 12:43 [completed] FEAT-069 / PLAN-294 — Host app-only catalog and official Soul App bootstrap

Completed the no-built-in-Soul Host catalog convergence.

- Removed Host runtime fallback to `BUILTIN_VERTICAL_SOULS` and
  `BUILTIN_CAPABILITY_TEMPLATES`; Host catalog now projects only installed Soul
  Apps and enabled app capability templates.
- Added first-party official bootstrap for `aiworker-hr` and `aiworker-qa`
  using normal install/enable lifecycle, without arbitrary `apps/*` scanning.
- Wired local daemon startup to bootstrap official HR/QA apps before serving
  catalog-dependent routes.
- Preserved explicitly disabled official apps across daemon restart/bootstrap
  refresh.
- Added `aiworker app bootstrap official` for CLI bootstrap and diagnostics.
- Updated API/CLI/Web tests and HR specialized workbench binding to use
  app-projected IDs such as `aiworker-hr` and
  `aiworker-hr.person-profile`; legacy `hr` worker creation is rejected.
- Kept PM/DevOps/finance/legal/ops out of runtime catalog until they become
  official Soul Apps, as approved in option A.

Verification passed: focused core/shared/API/CLI/Web tests, Web package test,
temporary-home `app bootstrap official`, HR/QA `app validate` and `app smoke`,
root `typecheck`, `lint`, `test`, `build`, `git diff --check`,
`crg:update` and `crg:review`. Web build still emits the existing chunk-size
warning, but exits 0. code-review-graph reports risk 0.60 with heuristic
test-gap hints around mounted service/surface helpers.

## 2026-05-13 12:16 [completed] FEAT-068 / PLAN-293 — Mounted Surface Protocol and release gate hardening

Completed the renderer-aware mounted surface slice without making iframe the
only Host integration path.

- Added mounted `surface` declarations for UI routes, panels, widgets, artifact
  previews and review panels, with `host-descriptor`, `sandboxed-frame`, and a
  reserved-but-rejected `trusted-module` renderer.
- Added mounted contribution surface summaries for Host catalog projection.
- Replaced HR/QA artifact schema placeholder hashes with real SHA-256 values
  and made `aiworker app validate` fail on schema hash mismatch.
- Added Host healthchecks for manifest-declared mounted `baseUrl` services.
- Added Host-signed `x-aiworker-mount-context` and
  `x-aiworker-mount-signature` headers on mounted API and declared surface
  requests.
- Added `/api/local/apps/:appId/surfaces/:surfaceId` for manifest-declared
  descriptor/frame surface resolution.
- Updated HR/QA mounted services to expose descriptor surfaces and sandboxed
  frame surfaces.
- Updated Worker Web to render descriptor fields/actions and sandboxed frame
  surfaces in the Soul Apps rail.

Verification passed: focused shared/API/CLI/Web/HR/QA checks, HR/QA
`app validate` and `app smoke`, root `typecheck`, `lint`, `test`, `build`, and
`git diff --check`. Web build still emits the existing chunk-size warning, but
exits 0.

## 2026-05-13 03:34 [completed] FEAT-067 / PLAN-292 — Soul App mounted hardening and authoring readiness

Completed the first five post-FEAT-066 follow-up items without publishing the
branch.

- Split `@zonease/aiworker-soul-app-sdk` back to the public authoring surface:
  manifest/protocol helpers, `defineSoulApp(...)`, namespace helpers and scoped
  Host client.
- Added `@zonease/aiworker-soul-app-runtime` for standalone and Host-mounted
  runtime harnesses, worker DB bootstrap and LocalExecutor test/runtime types.
- Hardened mounted services with loopback-only URL validation, Host-generated
  mount tokens, credential/forwarded-header stripping, upstream timeout handling
  and launched service teardown on app disable.
- Added HR/QA mounted token checks and kept app source on SDK while tests use
  runtime explicitly.
- Updated Worker Web to surface mounted API prefixes, routes and mounted slot
  counts in the Soul Apps rail.
- Upgraded `aiworker app create` to generate standalone and host-mounted entry
  files, expanded scripts, mounted service metadata and smoke evidence.

Verification passed: focused shared/SDK/runtime/HR/QA/API/CLI/Web tests,
HR/QA `app validate` and `app smoke`, browser smoke against a real local daemon
with HR/QA installed, root `typecheck`, `lint`, `test`, `build`,
`git diff --check`, `crg:update` and `crg:review`. Web build still emits the
existing chunk-size warning, but exits 0. code-review-graph reports risk 0.60
with 34 heuristic test-gap hints.

## 2026-05-13 02:11 [completed] FEAT-066 / PLAN-291 — Soul App app-level autonomy and Host mounted execution

Completed the B+C convergence for Soul App / Host dual autonomy.

- Moved HR and QA from reference package shape into runnable app workspaces
  under `apps/aiworker-hr` and `apps/aiworker-qa`, with app-owned manifests,
  standalone and host-mounted entries, protocol files, schemas, capabilities,
  review policies, pack assets, scripts, tests and READMEs.
- Fixed SDK app-origin runtime identity so worker/catalog/template paths use the
  Soul App id (`aiworker-hr`, `aiworker-qa`) consistently, while the domain Soul
  id is retained as metadata.
- Extended `soul-app/v1` API metadata with mounted local service configuration.
  Host can now proxy enabled app API calls to a declared or launched local app
  service instead of returning `SOUL_APP_API_NOT_LOADED`.
- Added mounted service smoke in `aiworker app smoke`, including service launch,
  healthcheck, discovered base URL injection, Host-mounted runtime smoke and
  standalone browser-openable smoke.
- Hardened broker writes with Host-owned worker/workspace/session scope
  validation before storage/review/memory mutation.
- Added lint and CLI validation boundaries blocking Host-private imports and
  sibling Soul App imports from app code.
- Updated Soul App developer docs and recorded the hybrid autonomy design under
  `docs/superpowers/specs/`.

Verification passed: focused HR/QA app typecheck/test/build, SDK/API/CLI/Core/Web
focused tests, `aiworker app validate` and `aiworker app smoke` for both apps,
root `typecheck`, `lint`, `test`, `build`, `git diff --check`, `crg:update` and
`crg:review`. Web build still emits the existing chunk-size warning, but exits
0. code-review-graph reports risk 0.65 with 148 test-gap hints.

## 2026-05-13 00:52 [completed] FEAT-065 / PLAN-289 — Soul App developer onboarding and validation harness

Completed the developer-facing Soul App authoring path.

- Added `aiworker app create <id> --dir <path>` to scaffold a minimal vertical
  Soul App with manifest, SDK app definition, artifact schema, capability
  prompt, review policy, Soul pack, README, and package scripts.
- Added `aiworker app validate <path>` for manifest validation, asset checks,
  artifact schema JSON parsing, and Host-private import detection.
- Added `aiworker app smoke <path>` to run isolated Host-mounted runtime smoke
  through install/enable, catalog projection, worker/workspace/session creation,
  artifact generation, review creation, and temporary standalone browser-openable
  HTML smoke.
- Added `docs/soul-app-developer.md` with the SDK boundary, ownership model,
  connector/storage/review/memory rules, and contribution checklist.
- Verified focused CLI tests/typecheck plus root `typecheck`, `lint`, `test`,
  `build`, `git diff --check`, and code-review-graph update/review.

## 2026-05-13 00:32 [completed] FEAT-064 / PLAN-288 — HR and QA reference Soul Apps

Completed the first monorepo reference Soul App extraction.

- Added `@zonease/aiworker-hr` with HR manifest-backed app definition,
  protocol handlers, package boundary docs, and standalone/mounted smoke tests.
- Added `@zonease/aiworker-qa` with release/test-suite focused app definition,
  protocol handlers, package boundary docs, and standalone/mounted smoke tests.
- Extended SDK type exports for app authors.
- Verified HR and QA package tests and typechecks.

## 2026-05-13 00:18 [completed] FEAT-063 / PLAN-287 — Soul App isolation brokers and permission boundary

Completed the Host-owned Soul App broker layer.

- Added app-scoped `soul_app_storage_records` and `soul_app_audit_events` to
  worker DB, with repository helpers and generated migration.
- Added core `createSoulAppBroker(...)` for manifest permission decisions,
  storage namespace isolation, connector evidence reads, review/memory proposal
  paths, and raw engine invocation denial.
- Added local daemon broker routes under `/api/local/apps/:appId/broker/*`,
  SDK client helpers, CLI permission display and Worker Web permission count.
- Verified focused storage/core/API/SDK/CLI/Web tests and package typechecks.

## 2026-05-12 23:35 [completed] FEAT-062 / PLAN-286 — Soul App standalone runtime and SDK

- Added `@zonease/aiworker-soul-app-sdk` as the external authoring boundary for
  Soul Apps, with `defineSoulApp(...)`, manifest validation, shared protocol
  type exports, a scoped local daemon client, standalone runtime bootstrap, and
  mounted test runtime helper.
- Added SDK tests proving one demo Soul App definition works unchanged in
  standalone mode and through Host mounted manifest projection, creating
  worker/workspace/session/artifact/review in both paths.
- Kept the runtime boundary narrow: standalone reuses worker.db and
  `LocalWorkerRuntime`; mounted tests use Host registry projection; production
  execution of external UI/API handlers remains deferred to PLAN-287 isolation
  brokers.
- Added SDK authoring docs and retained `soulAppId` in generated artifact
  metadata when session metadata supplies it, preserving app provenance.
- Verification passed: SDK/core focused typecheck and tests, root
  `typecheck`, `lint`, `test`, `build`, `git diff --check`, and
  code-review-graph update/review.

## 2026-05-12 22:47 [completed] FEAT-061 / PLAN-285 — Host Soul App registry and mount discovery

- Added Host-side Soul App registry persistence for installed/enabled/disabled/error
  lifecycle state, manifest digest, stored manifest JSON, validation issues and
  static healthcheck results.
- Added core registry services that install static `soul-app/v1` manifests,
  revalidate compatibility before enable/healthcheck, and project enabled app
  Souls and capability templates into the Host catalog without executing Soul
  App code.
- Added local daemon and CLI lifecycle surfaces for app list/show/install/enable/
  disable/doctor, plus scoped `/api/local/apps/:appId/*` namespace reservation
  so app API paths cannot override Host core routes.
- Wired Worker Web to load installed Soul Apps and show lifecycle status in the
  worker rail, while worker/session creation uses enabled app capabilities and
  disabled apps remain audit-visible but unavailable for new sessions.
- Verification passed: focused package typecheck/test for shared, storage,
  core, API, CLI and Web; root `typecheck`, `lint`, `test`, `build`; and
  `git diff --check`; plus code-review-graph update/build/review.

## 2026-05-12 22:09 [completed] FEAT-060 / PLAN-284 — Soul App protocol and manifest contract

- Added the shared `soul-app/v1` contract under `packages/shared/src/soul-app/`:
  manifest schema, JSON parse helper, Host discovery validation result and
  protocol surface type definitions.
- Added HR and QA reference Soul App manifest fixtures covering standalone and
  Host-mounted modes, Soul pack refs, capabilities, workspace types, artifact
  schemas, UI/API contributions, connector needs, storage namespace,
  permissions, healthcheck and protocol exports.
- Added focused shared tests for valid fixtures and deterministic validation
  failures: unsupported protocol, incompatible Host version, missing connector,
  invalid namespace, unsafe permission, missing UI/API entry and artifact schema
  errors.
- Scope stayed limited to the protocol contract. Host registry/mount runtime,
  standalone SDK, isolation brokers, HR/QA extraction and developer scaffold
  remain in PLAN-285..289.
- Verification passed: focused shared typecheck/test, root typecheck/lint/test,
  `git diff --check`, and code-review-graph build/review.

## 2026-05-12 21:20 [completed] DOC-010 / PLAN-290 — Remove legacy OD and control-plane guidance from current contracts

- Removed Open Design mapping tables and fleet/gateway deferral guidance from
  current product entrypoints: `GOALS.md`, `docs/architecture.md`, `README.md`,
  and `AGENTS.md`.
- Reframed current guidance around Host / Soul App dual autonomy, standalone and
  Host-mounted Soul Apps, and Soul App protocol boundaries.
- Marked stale OD-style active PMA entries as superseded in task/plan indexes
  and added explicit superseded notes to REFACTOR-026 / PLAN-192.
- Identified stale Codex memory themes around OD/fleet/gateway, but did not
  mutate memory because this checkpoint only had authorization for repository
  cleanup.

## 2026-05-12 21:00 [decision] FEAT-060..065 / PLAN-284..289 — Soul App / Host dual-autonomy architecture

- Recorded Soul App as the next architecture unit above Soul pack: a vertical
  product can run standalone and can be mounted into AIWorker Host through a
  protocol boundary.
- Added architecture topology, upstream/downstream call chain, isolation layers,
  and key protocol surfaces for Host / Soul App interaction.
- Planned six full PMA features for the rollout: manifest/protocol contract,
  Host registry and mount runtime, standalone SDK/runtime, isolation brokers,
  HR/QA reference app extraction, and developer onboarding/validation harness.
- No runtime code changes in this checkpoint.

## 2026-05-12 20:42 [completed] REFACTOR-075 / PLAN-283 — HR Profile Workbench panel controls polish

- Removed the visible Needs Attention smart section from HR Profile List, so the
  list now uses lifecycle sections only.
- Simplified Profile List cards into compact navigation rows that still show
  profile name, lifecycle, current moment, and next step.
- Added Profile List and Profile Tools visibility toggles to the header icon
  control group beside refresh and settings.
- Let Profile Details expand when either or both side panels are hidden.
- Rebalanced Profile Tools spacing and removed nested scrolling from Suggested
  Tools, leaving the tools panel as the single scroll owner.
- Verification passed: focused HR WorkerStudio/model tests, Web
  typecheck/lint/build, `git diff --check`, Playwright desktop panel-toggle
  review, mobile overflow/scroll review, action-to-composer smoke,
  session-thumbnail jump smoke, PM fallback smoke, and code-review-graph
  update/review.

## 2026-05-12 19:08 [completed] REFACTOR-074 / PLAN-282 — HR Profile Workspace three-panel layout

- Reframed HR People Workbench into one header plus three primary panels:
  Profile List, Profile Details, and Profile Tools.
- Replaced the profile poster wall with grouped, collapsible Profile List
  sections for smart attention and lifecycle buckets.
- Moved selected-profile facts, source counts, timeline, review guardrails, and
  Markdown artifact preview into a bounded Profile Details panel.
- Added compact recent session thumbnails to Profile Tools, with jump actions
  into the existing full session route.
- Kept agent usage auxiliary: suggested tools populate a profile-bound proposal
  composer, while generated outputs remain reviewable artifacts.
- Fixed responsive layout so desktop uses remaining-height panels with internal
  scroll and mobile stacks bounded panels without horizontal overflow.
- Verification passed: focused HR WorkerStudio/model tests, Web
  typecheck/lint/build, `git diff --check`, Playwright desktop/mobile layout
  review, lifecycle collapse smoke, session-thumbnail jump smoke,
  action-to-composer smoke, PM fallback smoke, and code-review-graph
  update/review.

## 2026-05-12 18:18 [completed] REFACTOR-073 / PLAN-281 — HR People Workbench focus layout and artifact preview

- Rebalanced HR People Workbench around a clearer work center: profile poster
  wall, selected-profile dossier, and right-side action composer.
- Removed the internal HR source rail and moved source counts, timeline,
  review guardrails, and artifact preview into the selected-profile dossier.
- Added shared `MarkdownPreview` under `packages/component` using
  `react-markdown` plus `remark-gfm`, with raw HTML skipped for artifact
  preview safety.
- Passed selected artifact preview state into specialized Soul workbench
  renderers so HR can render the latest artifact without changing backend
  artifact/session contracts.
- Made responsive order more task-oriented: mobile now shows profile wall,
  action composer, then the long dossier/preview surface.
- Verification passed: focused HR WorkerStudio/model tests, component
  typecheck, Web typecheck/lint/build, `git diff --check`, Playwright desktop
  and mobile layout review, HR action-to-composer smoke, Markdown preview smoke,
  and PM fallback smoke.

## 2026-05-12 17:34 [completed] REFACTOR-072 / PLAN-280 — Vertical Soul workbench module architecture

- Converted the first HR specialized workbench from a single-file experiment
  into a repeatable vertical Soul module structure under
  `apps/web/src/worker/souls/`.
- Added a shared `SoulWorkbenchContext`, compile-time renderer registry, and
  common workbench section/status primitives so the next specialized Soul can
  start from the same shell contract without changing WorkerStudio again.
- Split HR People Workbench into module-local container, components, model,
  copy, types, and styles while preserving the existing people-profile UI and
  agent proposal loop.
- Added focused HR model tests for lifecycle projection, needs-review behavior,
  attention filtering, lifecycle counts, and lifecycle-specific action ordering.
- Verification passed: focused Web tests, Web typecheck, Web lint, Web build,
  `git diff --check`, Playwright HR desktop/mobile layout checks, PM fallback
  smoke, and code-review-graph update/review.

## 2026-05-12 16:17 [completed] BUG-116 / PLAN-279 — Session artifact status clarity

- Added a shared Worker Web session progress summary derived from existing
  session, turn, event, artifact, and review records.
- Surfaced the progress summary in the session chat header and artifact preview
  rail, so users can distinguish engine running, artifact file written but not
  indexed, and artifact indexed but still waiting for human review.
- Kept the fix frontend-only: no daemon API, database, engine execution, or
  HR-specific state changes.
- Added focused WorkerStudio coverage for engine-running, artifact-finalizing,
  and indexed-artifact review states.
- Verification passed: focused WorkerStudio test, Web typecheck/lint/build,
  `git diff --check`, and Playwright desktop/mobile UX checks on the live local
  daemon session route.

## 2026-05-12 14:28 [completed] REFACTOR-071 / PLAN-278 — HR People Profile Workbench

- Reframed the HR specialized Soul workbench from role-search-first to
  people-first, with a flex profile poster wall, lifecycle filters, selected
  profile loop panel, timeline, evidence/review status, and next-step actions.
- Updated the shared HR workbench descriptor and HR capability templates for
  person profile, lifecycle next step, onboarding, offboarding, interview,
  evidence, and risk review artifacts.
- Wired HR actions into the existing local worker session/artifact proposal
  flow, so the workbench stays an assistant surface and does not automate hiring
  or employment decisions.
- Preserved the specialization boundary: HR uses People Workbench, while PM,
  QA, DevOps, and other Souls continue to render the generic worker studio.
- Removed the duplicate lifecycle selector from the left rail after UX review;
  lifecycle filtering now lives only in the header strip, and the rail summarizes
  the current view plus selected profile stage.
- Fixed the HR flow rehearsal defects: pending review records no longer render
  as completed review, needs-review profiles stay actionable, and proposal
  submissions launched from the worker route now navigate into the created
  session.
- Verification passed: shared descriptor tests, focused WorkerStudio tests,
  Web/API/shared/root typecheck and lint gates, Web build, Playwright desktop
  and mobile UX checks, HR action-to-composer flow, PM fallback validation,
  `git diff --check`, and code-review-graph update/review.

## 2026-05-12 12:55 [completed] REFACTOR-070 / PLAN-277 — HR evidence-first cockpit UX

- Reworked the HR Role Search Cockpit into an evidence-first workbench with
  context rail, primary Evidence Matrix workspace, secondary rubric/roundup
  panels, and a Next Actions + Proposal Composer right rail.
- Added localized HR cockpit copy so zh-CN workspaces read as an HR operation
  surface instead of a mixed generic agent page.
- Preserved the specialized-workbench boundary: HR uses the v2 cockpit while PM,
  QA, DevOps, and other Souls remain on the generic worker studio fallback.
- Added Worker Web static font serving through local daemon `/fonts/*`, fixing
  built-preview font 404s on `127.0.0.1:9327`.
- Verification passed: Web typecheck/lint/focused WorkerStudio test/build, API
  typecheck/focused local daemon test/build, root typecheck, `git diff --check`,
  and Playwright UX review for HR desktop/mobile, HR action-to-composer, and PM
  fallback.

## 2026-05-12 12:23 [completed] REFACTOR-068 / PLAN-275 and REFACTOR-069 / PLAN-276 — HR specialized Soul workbench

- Added a shared Soul workbench descriptor/registry so Worker Web can resolve a
  specialized Soul workbench or fall back to the generic worker studio.
- Implemented HR as the first specialized workbench: Role Search Cockpit with
  pipeline rail, rubric/evidence surface, Evidence Matrix, Roundup Packet
  summary, and Agent Task Tray.
- Added HR evidence matrix and roundup packet capability templates, and wired HR
  task actions to prefill artifact patch/proposal prompts while preserving the
  existing session stream and review/lesson contract.
- Kept PM, QA, DevOps, and future Souls on the generic fallback path.
- Verification passed: shared typecheck/test, focused WorkerStudio test, Web
  typecheck/lint/build, root typecheck, Playwright desktop/mobile UX review on
  `127.0.0.1:9328`, `git diff --check`, and code-review-graph update/review
  (risk 0.50; reported WorkerStudio heuristic test gaps covered by the focused
  WorkerStudio regression suite).

## 2026-05-12 10:26 [decision] REFACTOR-068 / PLAN-275 and REFACTOR-069 / PLAN-276 — Domain-specific Soul workbenches

- Recorded the product decision that Souls must evolve from a shared generic
  worker layout into domain-specific workbenches while preserving the common
  local worker runtime contract.
- Added HR as the first specialized workbench path: Role Search Cockpit,
  Candidate Dossier, Evidence Matrix, Agent Task Tray, Roundup Packet, and
  review-before-memory.
- Explicitly kept PM, QA, DevOps, finance, legal, and ops on the current generic
  implementation until HR proves the specialized workbench architecture.
- No code changes in this checkpoint; implementation remains pending approval.

## 2026-05-12 03:11 [completed] BUG-115 / PLAN-274 — Worker Web font token and mono taxonomy

- 新增 Worker Web 自托管 Nunito、Inter、JetBrains Mono variable font，并在
  `index.html` 中预加载关键字体文件。
- 定义 `--font-display`、`--font-ui`、`--font-mono`，并让既有
  `--serif`、`--sans`、`--mono` alias 继承新字体方案。
- 将 button、固定 tag、status pill、metadata、ID/count、select hint 和 code-like
  UI surface 统一切到 mono，避免影响正文和 artifact 内容阅读性。
- Verification passed: focused Web typecheck/lint/test/build, `git diff --check`,
  font URL smoke on 9217, Browser smoke on 9217, and code-review-graph
  update/review.

## 2026-05-12 02:55 [completed] BUG-114 / PLAN-273 — Session drawer controls and motion polish

- 移除选中 session header 内重复的“返回 worker”按钮，以及右侧 drawer 自带的
  refresh/settings/collapse 控制组。
- 在 session header 的 settings 右侧新增 sidebar toggle icon button，激活时打开
  右侧 drawer，未激活时收起 drawer 且不保留 restore sliver。
- 强化 drawer/layout、panel、row、button、composer 的过渡时长与状态动效，并修复右侧
  drawer section title 与 icon 的对齐/换行问题。
- Verification passed: focused Web typecheck/lint/test/build, `git diff --check`,
  browser smoke on 9217, and code-review-graph update/review.

## 2026-05-12 02:44 [completed] BUG-113 / PLAN-272 — Session route return-to-worker alignment

- 将选中 session 时的上下文卡片和聊天头部返回动作从“返回工作区”统一为
  “返回 worker”。
- 点击 session route 的返回动作会直接回到 `/workers/:workerId`，与未选中
  session 的 workspace route 保持一致。
- Verification passed: focused Web typecheck/lint/test/build, `git diff --check`,
  browser smoke on 9217, and code-review-graph update/review.

## 2026-05-12 02:33 [completed] REFACTOR-067 / PLAN-271 — Worker Web design system, component, and motion upgrade

- Web 样式入口启用 Tailwind CSS v4，并通过 `@theme` 承载 `DESIGN.md`
  palette、radius、font、spacing 和 motion token。
- 新增 `packages/component` studio pattern：section header、empty state、
  pill/status、activity row，并迁移 Worker home / workspace rail / session
  chat / session detail 的重复结构。
- 新增 reduced-motion-aware 的交互动效层，覆盖 shell、panel、list/card、
  select、chat、drawer 和 status dot。
- Verification passed: focused Web typecheck/lint/WorkerStudio test/build,
  `git diff --check`, browser desktop/mobile smoke on 9217, and
  code-review-graph update/review.

## 2026-05-12 02:07 [completed] BUG-112 / PLAN-270 — Worker item trailing status dot

- 将 Worker list item 的状态点移动到尾随列。
- 移除 item 内重复的 Soul 和状态文本 label，保留组头 Soul 信息。
- Verification passed: focused Web typecheck/lint/WorkerStudio test/build, `bun run check`,
  `git diff --check`, browser verification on 9217, and code-review-graph review.

## 2026-05-12 01:59 [completed] BUG-111 / PLAN-269 — Worker list Soul grouping

- 将 Worker home 的 worker list 按 Soul 分组，组头使用 `Soul (N)` 文本。
- 为每个 Soul 分组增加折叠/展开控制，保留组内 worker item 选择行为。
- Verification passed: focused Web typecheck/lint/WorkerStudio test/build, `bun run check`,
  `git diff --check`, browser verification on 9217, and code-review-graph review.

## 2026-05-12 01:48 [completed] BUG-110 / PLAN-268 — Count text convergence

- 将能力模板和工作区数量从 badge/tag 改为标题后的 `(N)` 文本。
- 删除不再使用的 `count-pill` 样式。
- Verification passed: focused Web typecheck/lint/WorkerStudio test/build, `bun run check`,
  `git diff --check`, browser verification on 9217, and code-review-graph review.

## 2026-05-12 01:44 [completed] BUG-109 / PLAN-267 — Add actions plus icon buttons

- 将 Worker home 和 Workspace rail 的 add actions 统一回归为 plus icon button。
- 移除不再使用的 `rail-mini-action` 样式。
- Verification passed: focused Web typecheck/lint/test/build, `bun run check`, `git diff --check`,
  browser verification on 9217, and code-review-graph review.

## 2026-05-12 01:33 [completed] BUG-108 / PLAN-266 — Worker home add action convergence

- 将 Worker 列表和工作区列表的 add icon-only 按钮改为 plus + label pill action。
- 保留 refresh/settings 等 chrome action 的 icon-only 样式。
- Verification passed: focused Web typecheck/lint/test/build, `bun run check`, `git diff --check`,
  browser verification on 9217, and code-review-graph review.

## 2026-05-12 01:24 [completed] BUG-107 / PLAN-265 — Workspace rail width convergence

- 统一 workspace route 与 session route 的桌面态 sidebar padding。
- 修复选中/未选中 session 时左侧 rail card 和列表项宽度不一致的问题。
- Verification passed: focused Web typecheck/lint/test/build, `bun run check`, `git diff --check`,
  browser width verification on 9217, and code-review-graph review.

## 2026-05-11 20:45 [completed] BUG-106 / PLAN-264 — Workspace route worker return action

- 在未选中 session 的 workspace route 中恢复“返回 worker”动作。
- 保持 session 详情态只显示“返回工作区”。
- 补充 WorkerStudio 测试覆盖 workspace route 返回 worker page。
- Verification passed: focused Web typecheck/lint/test/build, `bun run check`, `git diff --check`,
  browser verification on 9217, and code-review-graph review.

## 2026-05-11 20:34 [completed] BUG-105 / PLAN-263 — 未安装 engine icon 可见性

- 修复未安装 engine 的 muted icon 前景/背景同色导致视觉不可见的问题。
- 补充 WorkerStudio 测试覆盖未安装 Cursor engine icon 渲染。
- Verification passed: focused Web typecheck/lint/test/build, `bun run check`, `git diff --check`,
  browser verification on 9217, and code-review-graph review.

## 2026-05-11 20:23 [completed] BUG-104 / PLAN-262 — Settings engine icon assets

- 拉取 engine 专属 SVG icon 到 Worker Web 静态资产。
- Settings engine card 改为按 engine id 渲染专属 icon。
- 补充 WorkerStudio 测试覆盖 icon 映射和渲染路径。
- Verification passed: focused Web typecheck/lint/test/build, `bun run check`, `git diff --check`,
  browser verification on 9217, and code-review-graph review.

## 2026-05-11 20:12 [completed] BUG-103 / PLAN-261 — Settings 引擎操作按钮统一

- 将 settings 中“测试 / 重新扫描”从 icon-only button 收敛为统一的小号 action button。
- 为“测试”补充图标，和“重新扫描”保持 icon + label 结构一致。
- 更新 WorkerStudio 测试覆盖按钮 class 与原有行为。
- Verification passed: focused Web typecheck/lint/test/build, `bun run check`, `git diff --check`,
  browser verification on 9217, and code-review-graph review.

## 2026-05-11 18:13 [completed] BUG-102 / PLAN-260 — 移除工作区返回 worker 入口

- 移除 workspace rail 顶部多余的“返回 worker”动作。
- 保留 session route 中的“返回工作区”动作。
- 清理不再使用的 `backToWorkerHome` i18n 文案。
- Verification passed: focused Web typecheck/lint/test/build, `bun run check`, `git diff --check`,
  browser verification on 9217, and code-review-graph review.

## 2026-05-11 18:09 [completed] BUG-101 / PLAN-259 — 工作区会话新建入口

- 将“工作区会话”头部右侧从会话数量改为“新建会话”快捷动作。
- 点击新建会话会回到当前 workspace 的 create-session composer。
- 增加 WorkerStudio 测试覆盖从 session route 发起新建会话。
- Verification passed: focused Web typecheck/lint/test/build, `bun run check`, `git diff --check`,
  browser verification on 9217, and code-review-graph review.

## 2026-05-11 18:02 [completed] BUG-100 / PLAN-258 — 其他工作区筛除当前项

- “其他工作区”侧栏列表改为排除当前选中的 workspace。
- 保留新建工作区动作，并在没有其他 workspace 时显示空态。
- 更新 WorkerStudio 测试覆盖当前 workspace 不出现在其他工作区列表。
- 验证通过:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run check`
  - `git diff --check`
  - Browser verification on `http://127.0.0.1:9217/`
  - `bun run crg:update`
  - `bun run crg:review`

## 2026-05-11 17:49 [completed] BUG-099 / PLAN-257 — Select 展开态样式统一

- 收敛 `StudioSelect` 的 trigger、listbox 和 option 盒模型。
- 提升展开态层级，并允许 creation dialog 中的 select 浮层完整显示。
- 为 WorkerStudio 增加 select open/close 语义测试。
- 验证通过:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run check`
  - `git diff --check`
  - Browser verification on `http://127.0.0.1:9217/`
  - `bun run crg:update`
  - `bun run crg:review`

## 2026-05-11 17:26 [completed] BUG-098 / PLAN-256 — Workspace route create-session composer

- Replace the no-session workspace route with a Codex-like create-session
  composer.
- Remove the temporary workspace overview panel and central session-card grid
  from the workspace route.
- Keep session navigation in the workspace side rail and preserve session
  detail routing.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run check`
  - `git diff --check`
  - Browser verification on `http://127.0.0.1:9217/workers/hr-worker/workspaces/b8a15051-14ef-4aad-9c66-5405ce39670f`
  - `bun run crg:update`
  - `bun run crg:review`

## 2026-05-11 17:11 [completed] BUG-097 / PLAN-255 — Workspace route management layout alignment

- Restructured `workspaces/[workspace_id]` to match the worker route rhythm:
  overview panel first, managed sessions section second.
- Added `WorkspaceIdentityBlock` and `WorkspaceSessionCard` so workspace page
  UI has dedicated components instead of borrowing worker/card semantics.
- Kept the create-session form on the workspace page, now inside the sessions
  management section.
- Updated WorkerStudio tests to cover the central session entrypoint alongside
  the rail session entrypoint.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run check`
  - `git diff --check`
  - Browser verification on `http://127.0.0.1:9217/workers/hr-worker/workspaces/b8a15051-14ef-4aad-9c66-5405ce39670f`
  - `bun run crg:update`
  - `bun run crg:review`

## 2026-05-11 16:59 [completed] BUG-096 / PLAN-254 — Worker workspace card grid layout

- Replaced the single-column `design-grid-list` workspace surface with a
  responsive `workspace-grid` card layout.
- Renamed the local card component from `ProjectCard` to `WorkspaceCard` to
  match worker-managed workspace semantics.
- Added a WorkerStudio regression check that card view uses `workspace-grid`
  and does not reintroduce `design-grid-list`.
- No list-view toggle was introduced; future list mode should use a dedicated
  `WorkspaceListItem` surface instead of compressing cards.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run check`
  - `git diff --check`
  - Browser verification on `http://127.0.0.1:9217/worker/`
  - `bun run crg:update`
  - `bun run crg:review`
- Browser result: at 1800x1000, `.workspace-list` has classes
  `design-grid workspace-grid workspace-list` and computes four 340.5px grid
  columns.
- code-review-graph result: risk score `0.40`, 0 affected flows; reported gaps
  are covered by WorkerStudio RTL, Web build, and browser verification.

## 2026-05-11 16:42 [completed] BUG-095 / PLAN-253 — Worker Web full-width route shell

- Removed the non-session route width cap and auto margins that made
  worker/workspace pages render as centered layouts while session pages stayed
  full width.
- Worker, workspace, and session routes now share the same full-width
  `.entry-header` and `.entry-tab-content` shell.
- Component-level card layout is unchanged; only route shell width ownership was
  unified.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run check`
  - `git diff --check`
  - Browser verification on `http://127.0.0.1:9217/worker/`
  - `bun run crg:update`
  - `bun run crg:review`
- Browser result: at 1800x1000, worker and workspace routes both render main,
  header, and content at 1460px wide from the sidebar edge; the session route
  keeps its existing 3-column layout with a 1120px middle session column.
- code-review-graph result: risk score `0.00`, 0 affected flows, 0 test gaps.

## 2026-05-11 16:24 [completed] BUG-094 / PLAN-252 — Worker list rail scroll ownership

- Removed the fixed `188px` max height from the worker list rail.
- Let the worker list section fill the remaining sidebar height, with the row
  list owning internal vertical scroll.
- Kept the worker list header and sidebar footer stable around the scroll
  region.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run check`
  - `git diff --check`
  - Browser verification on `http://127.0.0.1:9217/worker/`
  - `bun run crg:update`
  - `bun run crg:review`
- Browser result: worker list section expanded to 708px high and the listbox
  owns a 595px internal scroll region at 1280x900.
- code-review-graph result: risk score `0.00`, 0 affected flows, 0 test gaps.

## 2026-05-11 16:16 [completed] BUG-093 / PLAN-251 — Worker Web readiness rail simplification

- Removed the persistent left-rail `readiness-card ready` section because it
  duplicated Settings entrypoints and did not add decision value when execution
  was ready.
- Kept blocked execution feedback inline beside session creation, where it
  directly explains the disabled action.
- Removed obsolete readiness-card rail styles and the unused `executionReady`
  locale key.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run check`
  - `git diff --check`
  - Browser verification on `http://127.0.0.1:9217/worker/`
  - `bun run crg:update`
  - `bun run crg:review`
- code-review-graph result: risk score `0.40`, 0 affected flows; the reported
  `WorkerStudio` gap is covered by RTL, build, and browser verification.

## 2026-05-11 15:06 [completed] BUG-092 / PLAN-250 — Worker Web icon button size convergence

- Added `IconButton` to `packages/component` so add, settings, and refresh
  controls use the same primitive instead of split local button classes.
- Added shared icon-button tokens: `--icon-button-size: 30px` and
  `--icon-button-icon-size: 16px`.
- Routed add/settings/refresh controls through `IconButton`, while keeping
  `.settings-trigger` and `.icon-only` as compatibility aliases tied to the
  same tokens.
- Corrected `IconButton` so it does not inherit `.icon-btn` text-action
  min-height or padding; the issue was button box size, not SVG size.
- Added a Worker Web regression test that keeps add/settings/refresh icon
  buttons on the compact `icon-button` primitive contract.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-component' typecheck`
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run check`
  - `git diff --check`
  - Browser verification on `http://127.0.0.1:9217/worker/`
  - `bun run crg:update`
  - `bun run crg:review`
- code-review-graph result: risk score `0.55`, 0 affected flows; reported
  gaps are covered by WorkerStudio RTL tests, component typecheck, Web build,
  and browser startup verification.

## 2026-05-11 13:51 [completed] REFACTOR-066 / PLAN-249 — Component package library structure

- Reworked `packages/component` from a single Worker Studio extraction file
  into a component-library structure with `primitives`, `layout`, `patterns`,
  `studio`, and `utils` modules.
- Added primitive exports for button, card/action-card, dialog, field,
  header, nav, badge, and select while preserving compatibility exports used by
  Worker Web.
- Updated Worker Web creation dialogs, project cards, worker identity, and
  settings surfaces to consume package primitives instead of hand-rolled base
  button/card/field/nav markup.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-component' typecheck`
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run check`
  - `git diff --check`
  - Browser verification on `http://127.0.0.1:9217/worker/`
  - `bun run crg:update`
  - `bun run crg:review`
- code-review-graph result: risk score `0.40`, 0 affected flows; the reported
  UI component test gaps are covered by existing WorkerStudio RTL tests, Web
  build, and browser startup verification.

## 2026-05-11 12:21 [completed] REFACTOR-065 / PLAN-248 — Worker Web architecture modularization

- Added `packages/component` as a workspace package for shared Worker Web React
  primitives and moved studio layout/dialog/select primitives behind that
  package boundary.
- Split Worker Web into app/router, shared local API client, feature-scoped API,
  i18n/catalog/locales, settings, workspace components, session/theme helpers,
  and style modules.
- Removed the monolithic `api.ts`, `i18n.ts`, and `studio.css` files, and
  reduced `worker-studio.tsx` from 2172 lines to 1081 lines.
- Kept URLs, class names, and behavior stable while preserving the existing RTL
  worker studio coverage.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-component' typecheck`
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run check`
  - `git diff --check`
  - Browser preview on `http://127.0.0.1:4173/worker/`
  - `bun run crg:update`
  - `bun run crg:review`
- code-review-graph result for `8f63d85..HEAD`: risk score `0.40`, 0 affected
  flows; review priorities `WorkerStudio` and `WorkerStudioLayout` are covered
  by existing WorkerStudio RTL tests, component package typecheck, Web build,
  and browser startup verification.

## 2026-05-11 11:41 [completed] BUG-091 / PLAN-247 — Mobile session route layout repair

- Corrected the mobile session route validation miss where no horizontal
  overflow was incorrectly treated as sufficient acceptance.
- Collapsed mobile session sidebar content to route-critical back actions and
  workspace context instead of rendering the full desktop navigation stack.
- Let session chat header controls wrap on narrow screens and hid the back
  button text behind an accessible label on mobile.
- Bounded the mobile artifact rail as a bottom preview so it no longer competes
  with the chat surface for the whole viewport.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `git diff --check`
  - `bun run crg:update`
  - `bun run crg:review`
  - Playwright MCP 390px visual inspection on `http://127.0.0.1:9217/`
- code-review-graph result: risk score `0.55`, 0 affected flows; the reported
  `WorkerSessionChat` gap is covered by existing session route tests and the
  mobile Playwright visual inspection for this CSS/accessibility-only repair.

## 2026-05-11 11:31 [completed] REFACTOR-064 / PLAN-245..246 / QA-034 — Worker Web shared route layout

- Added shared Worker Web route layout helpers for shell/sidebar/main/detail
  composition, and routed no-worker, worker home, workspace, and session
  surfaces through the same layout primitive.
- Unified worker/workspace/session left navigation geometry around the same
  340px sidebar width and shared main content rail rules.
- Kept session-specific behavior as a layout variant with the right-side
  artifact rail and collapsed detail state.
- Playwright MCP on `http://127.0.0.1:9217/` confirmed worker home, workspace,
  and session routes share sidebar/main geometry; 390px workspace/session
  snapshots confirmed stacked layout without horizontal overflow.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test -- worker-studio`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `git diff --check`
  - `bun run crg:update`
  - `bun run crg:review`
- code-review-graph result: risk score `0.40`, 0 affected flows; reported UI
  helper test gaps are covered by existing WorkerStudio RTL route tests and
  Playwright route evidence for this layout-only refactor.

## 2026-05-11 11:14 [completed] BUG-090 / PLAN-244 — Settings autosave and scroll layout repair

- Changed settings autosave feedback to start hidden instead of showing
  "All changes saved" on every dialog open.
- Kept saving/failed/saved feedback for real save and rescan actions, with
  successful saved feedback auto-hiding after a short confirmation window.
- Made the settings modal fixed-height within the viewport, with the header
  fixed and sidebar/content scrolling vertically inside the dialog body.
- Added focused RTL coverage for the hidden initial saved state.
- Playwright MCP on `http://127.0.0.1:9217/` confirmed no saved pill on open,
  a 760px settings dialog, and scrollable Soul package content inside the
  fixed dialog body.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run crg:update`
  - `bun run crg:review`
- code-review-graph CLI result: risk score `0.35`, 0 affected flows, 2 reported
  test gaps (`current`, `SettingsDialog`) covered by focused RTL and browser
  layout evidence.

## 2026-05-11 10:58 [completed] REFACTOR-063 / PLAN-242..243 / QA-033 — Worker Web interaction polish follow-up

- Tightened Worker Web typography to the `DESIGN.md` type scale in the built
  studio CSS: 12/14/16/18/20/24/30px, weights 400/500/600, and zero letter
  spacing.
- Reworked creation dialog spacing and close-button placement, replaced native
  Worker Studio selects with integrated listbox selects, aligned select chevron
  padding, and preserved readable button hover foreground colors.
- Replaced empty-worker Soul tags with a vertical scrollable list item selector
  while preserving the existing worker list row pattern.
- Centered the workspace route content rail and added direct return-to-workspace
  actions in session sidebar and session header.
- Guarded session creation streaming so engine output no longer forces the
  operator back to a session after they intentionally navigate away.
- Playwright MCP validation on `http://127.0.0.1:9217/` covered desktop,
  create worker dialog/listbox select, workspace route, session route,
  return-to-workspace actions, and 390px mobile. It also found a mobile
  create-session/empty-state overlap, which was fixed and revalidated.
- The local 9217 database already contained a worker, so the no-worker vertical
  Soul list was validated through focused RTL coverage instead of deleting local
  operator data.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run crg:update`
  - `bun run crg:review`
- code-review-graph result: risk score `0.60`, 0 affected flows; remaining
  reported test gaps are UI component entities covered by focused RTL and
  Playwright evidence.

## 2026-05-11 09:00 [completed] REFACTOR-060..062 / PLAN-238..241 / QA-032 — Worker Web visual polish

- Converged Worker Web styling toward `DESIGN.md`: black / white / neutral
  tokens, pill-first controls, unified `input` / `select` / `textarea` states,
  no gradients, and no decorative shadows on the touched surfaces.
- Reworked worker navigation into compact list rows and moved create worker /
  create workspace flows behind accessible icon-button dialogs.
- Reworked the session surface with a dedicated chat scroll island,
  session-scoped follow-up draft state, pinned-bottom auto-follow, and
  jump-to-latest behavior.
- Added a collapsible right-side session detail drawer, with artifact/review
  kept high-signal and event/history detail de-emphasized behind compact
  sections.
- Added/updated Worker Web RTL coverage for create dialogs, session drawer
  collapse/restore, and chat jump-to-latest behavior.
- Playwright smoke on `http://127.0.0.1:9331/` covered create worker, create
  workspace, create session, session detail collapse/restore, and 390px mobile
  overflow validation. The in-app Browser target was blocked by
  `ERR_BLOCKED_BY_CLIENT`, so Playwright CLI was used as the browser evidence.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `git diff --check`
  - `bun run crg:update`
  - `bun run crg:review`
- code-review-graph result: 22 changed functions/classes, 0 affected flows,
  15 reported test gaps, risk score `0.55`; remaining gaps are direct
  component-level UI entities already covered by focused RTL tests and browser
  smoke evidence.

## 2026-05-11 01:37 [completed] REFACTOR-056..059 / PLAN-233..236 / QA-031 — Worker-first product entry

- Investigated the current Soul-first Web shape against the intended
  worker-first IA and split the work into registry/storage, API/CLI, Web IA,
  capability/session alignment, and validation tracks.
- Relaxed the worker storage contract so multiple workers can bind the same
  Soul while keeping workspaces isolated by worker id.
- Stopped daemon/CLI bootstrap from auto-creating one worker per available
  Soul; workers are now explicitly created and selected.
- Added worker-scoped local daemon routes for templates, workspaces, sessions,
  session messages, files, and artifacts while preserving transitional flat
  routes for the current Web client surface.
- Reworked CLI commands around explicit or selected worker ids:
  `worker create`, `worker select`, worker-scoped workspace/session/file/artifact
  commands, and host init without implicit Soul workers.
- Reworked Worker Web routes to canonical
  `/workers/:workerId`,
  `/workers/:workerId/workspaces/:workspaceId`, and
  `/workers/:workerId/workspaces/:workspaceId/sessions/:sessionId`.
- Worker Web now uses workers as the top-level entry, creates workspaces under
  the selected worker, and moves capability selection into workspace-scoped
  session creation.
- Follow-up regression fix: existing local `worker.db` files created before the
  worker-first refactor may still have a unique `workers_soul_idx`. Worker
  migrations now repair that legacy unique index into a normal non-unique index
  so multiple workers can bind the same Soul in real upgraded environments.
- Playwright MCP validation on `http://127.0.0.1:9217/` clicked through the real
  Web flow after the repair: created worker `hr-playwright-worker-1740-31ce9d16`,
  created workspace `3f240c55-a457-4c5b-be43-f0d5dd66628d`, created session
  `f3e44590-08ec-4093-a066-e8bff979f443`, reached the canonical session route,
  and observed a succeeded engine run with 1 artifact and pending review state.
- Browser validation on `http://127.0.0.1:9328/` with clean
  `AIWORKER_HOME=/tmp/aiworker-worker-first-validation` created an HR worker,
  workspace, Candidate Screen session, follow-up turn, artifacts, and review
  state through the canonical worker route. A 390px viewport reported no
  horizontal overflow.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-storage-sqlite' test`
  - `bun run --filter '@zonease/aiworker-storage-sqlite' typecheck`
  - `bun run --filter '@zonease/aiworker-core' test`
  - `bun run --filter '@zonease/aiworker-api' typecheck`
  - `bun run --filter '@zonease/aiworker-api' test`
  - `bun run --filter '@zonease/aiworker-cli' typecheck`
  - `bun run --filter '@zonease/aiworker-cli' test`
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run typecheck`
  - `bun run lint`
  - `bun run test`
  - `bun run build`
  - `git diff --check`
  - `bun run crg:update`
  - `bun run crg:review`
- code-review-graph result: 83 changed functions/classes, 0 affected flows,
  61 reported test gaps, risk score `0.60`; the remaining gaps are tied to
  broader worker-first entrypoints such as `createHrWorker`,
  `bootstrapWorkerApp`, `template`, `workspace`, and `artifact`.

## 2026-05-11 00:35 [completed] REFACTOR-055 / PLAN-232 — Worker Web Soul rail and worker identity

- Reworked the Worker Web home sidebar from a vertical Soul grid into an
  OD-style horizontal Soul rail.
- Added visible local worker identity on both home and workspace/session route
  sidebars: worker name, `workerId`, status, default engine, and Soul binding.
- Kept capability templates as the existing list surface under the selected
  Soul worker context.
- Added localized worker identity copy and Worker Web tests for Soul switching,
  template scope, and session-route worker context.
- Verification passed: focused Web typecheck, lint, test, build, browser
  validation, 390px viewport overflow check, `git diff --check`, and
  code-review-graph review.

## 2026-05-10 22:31 [completed] REFACTOR-054 / PLAN-228..231 / QA-030 — Structured engine session parity

- Investigated the reported stderr-only session behavior.
- Confirmed the root cause is the local executor contract, not only Worker Web:
  AIWorker wraps Codex as one synthetic Bash command without `--json`, emits
  stdout/stderr as coarse logs, and fails turns that do not write a mandatory
  artifact file.
- Compared the current implementation with Open Design's daemon run service,
  engine argument registry, structured JSON event parsers, and Web event
  translation.
- Opened REFACTOR-054 plus PLAN-228..231 to port the OD session/engine contract
  into AIWorker's `session` / `engine_invocation` model without making run a
  user-facing product object.
- Implemented OD-style local engine adapters for the surfaced engines:
  Codex CLI, Claude Code, Cursor Agent, Gemini CLI, OpenCode, and Qwen Code.
  Unsupported ACP engines are not exposed in Local CLI settings until AIWorker
  has a correct ACP adapter.
- Codex now runs through `codex exec --json` with stdin prompt delivery,
  workspace cwd, and workspace-write network config. Claude, Cursor, Gemini,
  and OpenCode use their structured stream modes; Qwen uses a plain stdout
  fallback.
- Local CLI execution now uses the resolved engine path from Settings instead
  of assuming the daemon PATH can find the same binary; Codex also honors
  `AIWORKER_CODEX_DISABLE_PLUGINS=1` / `OD_CODEX_DISABLE_PLUGINS=1` for the
  OD-style plugin-warning workaround.
- Added structured stream parsing for status, assistant text, thinking,
  tool-use/tool-result, Codex file-change, usage, and raw fallback events.
- Successful turns store stdout/stderr logs under the invocation root, surface
  stderr only on failure, allow text-only success, and index artifacts only
  when files are actually produced under `artifacts/<sessionId>/`.
- Added `GET /api/local/sessions/:sessionId/events` for replay and
  `POST /api/local/workspaces/:workspaceId/sessions/stream` so the first
  workspace session streams like follow-up turns.
- Worker Web now uses the streamed initial-session endpoint, merges adjacent
  assistant/thinking deltas, handles engine-native `toolUseId`, and renders
  file changes as structured timeline status instead of raw JSON.
- Fixed daemon foreground lifetime so `daemon start` keeps the local server
  alive when it spawns the foreground child.
- Browser validation on `http://127.0.0.1:9327/` with clean
  `AIWORKER_HOME=/tmp/aiworker-stream-validation-home` created an HR /
  Candidate Screen session through real Codex. The route entered
  `/workspaces/:workspaceId/sessions/:sessionId` immediately, then streamed
  running status, Bash tool events, file-change status, assistant text,
  artifact, and review. Persisted DB evidence: one succeeded turn, one
  artifact, ten tool events, ten status events, four assistant deltas, and zero
  raw JSON events.
- Desktop (`1440x1000`) and narrow (`390x844`) browser checks showed no
  horizontal overflow and reachable session controls.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-core' typecheck`
  - `bun run --filter '@zonease/aiworker-core' test`
  - `bun run --filter '@zonease/aiworker-api' typecheck`
  - `bun run --filter '@zonease/aiworker-api' test`
  - `bun run --filter '@zonease/aiworker-api' build`
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run --filter '@zonease/aiworker-cli' build:bundle`
  - `bun run typecheck`
  - `bun run lint`
  - `bun run test`
  - `bun run build`
  - `git diff --check`
  - `bun run crg:update`
  - `bun run crg:review`

## 2026-05-10 21:35 [completed] REFACTOR-053 / PLAN-227 — Worker Web workspace route contextual navigation

- Investigated the reported route-context mismatch.
- Found that `WorkerStudio` always renders the global Soul catalog and
  workspace creation sidebar; session routes only swap the center column.
- Opened REFACTOR-053 / PLAN-227 to keep the creation sidebar on the home
  route and render a workspace-context navigation rail after entering a
  workspace/session route.
- Completed REFACTOR-053 / PLAN-227.
- Worker Web now keeps Soul catalog/capability/create controls on `/`, and
  switches `/workspaces/:workspaceId` plus
  `/workspaces/:workspaceId/sessions/:sessionId` to contextual workspace
  navigation.
- Workspace/session routes show current Soul, current workspace, selected
  capability/session metadata, workspace sessions, same-Soul workspace
  switching, Settings, and engine status instead of the creation rail.
- Empty workspace routes no longer show the create panel.
- Browser validation confirmed no Import text, no creation panel on session
  routes, and no horizontal overflow across 1440x947, 1024x640, 980x720, and
  390x844 viewports.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `git diff --check`
  - `bun run crg:update`
  - `bun run crg:review`
- code-review-graph result: 6 changed functions/classes, 0 affected flows,
  risk score `0.45`; MCP impact radius found only adjacent Worker Web API
  client symbols within one hop.

## 2026-05-10 20:50 [completed] BUG-088 / PLAN-226 — Worker Web streamed turn visibility and Codex warning cleanup

- Investigated the reported session UX defects.
- Found that Web clears the composer before the stream exposes the newly
  created turn row, so streamed events cannot attach to a visible turn until
  the final refresh.
- Confirmed that the observed Codex `403 Forbidden` is a non-fatal featured
  plugin cache warm warning from `chatgpt.com/backend-api/plugins/featured`,
  while the actual Codex invocation succeeded and produced an artifact.
- Opened BUG-088 / PLAN-226 to stream real turn rows immediately, add an
  optimistic pending turn in Web, and filter known non-fatal Codex plugin cache
  warning noise from visible session logs.
- Completed BUG-088 / PLAN-226.
- Runtime now includes the persisted turn row in turn bus payloads; the API
  streams them as `turn` SSE frames; Worker Web merges persisted, streamed, and
  optimistic turns so the submitted operator message is visible immediately.
- Filtered Codex's known featured plugin cache 403 warning from visible session
  logs and final tool output while preserving raw `stderr.log` on disk.
- Browser validation confirmed a real Codex-backed follow-up turn appeared
  within 300ms, completed successfully, produced an artifact, and exposed no
  `backend-api/plugins/featured` / Cloudflare / `403 Forbidden` text in the Web
  session timeline.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-core' test`
  - `bun run --filter '@zonease/aiworker-core' typecheck`
  - `bun run --filter '@zonease/aiworker-api' test`
  - `bun run --filter '@zonease/aiworker-api' typecheck`
  - `bun run --filter '@zonease/aiworker-api' build`
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `git diff --check`
  - `bun run crg:update`
  - `bun run crg:review`
- code-review-graph result: 17 changed functions/classes, 0 affected flows,
  risk score `0.55`; MCP `get_affected_flows` also returned 0 affected flows.

## 2026-05-10 19:59 [completed] REFACTOR-052 / PLAN-225 — Worker Web session-first interaction model

- Investigated the UX critique after PLAN-224 and confirmed the core issue:
  the Web is technically connected but still not session-first.
- Compared current Worker Web against Open Design's entry/project route,
  conversation/message/run surface, streamed assistant events, and bounded
  scroll layout.
- Found that AIWorker currently compresses engine execution into blocking
  `LocalExecutor.invoke(...)` plus coarse session events, so the UI cannot show
  the full engine process the way Open Design shows run/message progress.
- Updated the plan direction: do not reinvent session rendering, message type
  grouping, stream buffering, run reattachment, tool cards, composer ergonomics,
  or scroll behavior. Port Open Design's mature session primitives where
  practical and adapt them to AIWorker workspace/session/turn APIs.
- Opened REFACTOR-052 and draft PLAN-225 to rebuild the Web interaction model
  around routed workspace/session screens, streamed engine event timelines,
  contextual artifact/review/memory surfaces, and explicit scroll validation.
- Approved by operator with `proceed` and completed the Web session-first
  rebuild.
- Added Worker Web routing for `/` and
  `/workspaces/:workspaceId/sessions/:sessionId`, with SPA fallback and
  production asset base fixes for direct session-route reloads.
- Reworked the home route into a Soul catalog/workspace launcher and moved the
  active session into its own conversation-style route.
- Added streamed local executor events across core/runtime/API/Web so a session
  turn shows engine status, Bash tool use/result, compact stdout/stderr,
  assistant text, artifact/review chips, and completion state inside the
  assistant flow.
- Added SSE heartbeat and daemon idle-timeout tuning for long local engine
  turns.
- Moved artifact/review/memory/event inspection into the session route
  secondary pane so the main viewport stays focused on the conversation.
- Browser validation at `http://127.0.0.1:9217/` confirmed Soul home, session
  deep link, real Codex CLI continuation, explicit Settings open/close,
  independent chat/artifact scrolling, no console errors, and no mobile
  horizontal overflow at 390px width.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run --filter '@zonease/aiworker-api' build`
  - `bun run check`
  - `bun run test`
  - `bun run build`
- code-review-graph passed:
  - `bun run crg:status`
  - `bun run crg:update`
  - `bun run crg:review`
  - MCP `get_minimal_context`
  - MCP `get_affected_flows`
  - Result: 16 changed files, 38 changed functions/classes, 0 affected flows,
    risk score `0.55`; `streamSessionTurn`/bootstrap test-gap warnings are
    covered by API SSE tests, Web stream tests, root gates, and local browser
    validation.

## 2026-05-10 19:39 [completed] REFACTOR-051 / PLAN-224 — Worker Web production UX integration

- Investigated the current Worker Web production-readiness gap after the
  session/workspace MVP landed.
- Found that Web currently has working API contracts but disconnected UX:
  inert top tabs, create-only session flow, no follow-up turn composer, passive
  review/memory counts, Settings readiness not surfaced in the turn path, and
  hidden artifact access below tablet width.
- Opened REFACTOR-051 and draft PLAN-224 for a focused Web refactor that
  connects Soul selection, capability selection, workspace/session browsing,
  turn continuation, artifact preview, review/memory actions, and Settings
  readiness into one operator flow.
- Approved by operator with `proceed` and implemented the connected Worker Web
  flow.
- Replaced inert top tabs with a three-column Soul workspace: Soul/capability
  selector, workspace/session list, and selected session detail.
- Added follow-up session turns, review creation, and lesson status actions to
  the Web client and UI.
- Split the active session surface into `SessionDetail`, covering turn composer,
  artifact preview, turn history, review, memory candidates, and session events.
- Browser verification at `http://127.0.0.1:9217/` confirmed the current Web
  opens directly into the Soul workspace, shows HR/PM/QA/DevOps Souls, keeps
  Settings explicit, displays a real follow-up Codex artifact, and preserves
  session/artifact detail at narrow width.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' lint`
  - `bun run --filter '@zonease/aiworker-web' test -- --reporter=verbose`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run typecheck`
  - `bun run lint`
  - `bun run test`
  - `bun run build`
  - `git diff --check`
- code-review-graph passed:
  - `bun run crg:status`
  - `bun run crg:update`
  - `bun run crg:review`
  - MCP `get_review_context`, `detect_changes`, `get_impact_radius`, and
    `get_affected_flows`
  - Result: 11 changed files, 36 changed functions/classes, 0 affected flows,
    overall risk score `0.55`; API client/session detail test gaps are covered
    by the expanded Worker Web RTL flow and local browser verification.

## 2026-05-10 18:50 [completed] QA-029 / PLAN-223 — Session workspace MVP validation

- From an empty `/Users/ben/.aiworker`, started the local daemon with
  `bun apps/cli/src/aiworker.ts daemon start --host 127.0.0.1 --port 9217`.
- Verified `GET /health` returns Soul workspace mode and active HR/PM/QA/DevOps
  Soul workers.
- Browser verification at `http://127.0.0.1:9217/` confirmed the Soul catalog
  first screen, capability template selection, HR Candidate Screen workspace
  session creation, real Codex CLI turn execution, and visible business
  artifact rail.
- Settings verification confirmed explicit open/close behavior, Local CLI
  engine Test, installed/uninstalled engine states, and language persistence
  across refresh.
- Fixed two QA findings:
  - `daemon start` now detaches correctly and writes foreground logs to
    `~/.aiworker/aiworker-daemon.log`.
  - Artifact preview rail remains visible at normal desktop widths.
- Root gates passed:
  - `bun run typecheck`
  - `bun run lint` (passes with existing React hook warnings)
  - `bun run test`
  - `bun run build`
  - `git diff --check`
- code-review-graph passed:
  - `bun run crg:status`
  - `bun run crg:update`
  - `bun run crg:review`
  - Result: 7 changed files, 4 changed functions/classes, 0 affected flows,
    risk score `0.40`; CRG noted unit-test gaps for `bootstrapWorkerApp` and
    `startDaemon`, covered here by local daemon/browser validation.

## 2026-05-10 18:38 [completed] REFACTOR-050 / PLAN-222 — Host home lifecycle and project-scope removal

- Removed active project-scope fs-layout initialization and cwd-based scope
  detection. `AIWORKER_HOME` / `~/.aiworker` is now the local daemon source of
  truth.
- Worker initialization creates only the engine-usable workspace root
  `workers/<workerId>/workspaces`; worker identity, Soul binding, capabilities,
  settings, reviews, and memory metadata stay in `aiworker.db`.
- Default daemon paths now resolve to `~/.aiworker/aiworker.db` and
  `~/.aiworker/workers`.
- CLI command surface now exposes `dev`, `daemon`, `worker`, `workspace`,
  `session`, `turn`, `artifacts`, `review`, `lessons`, `settings`, and `engine`
  commands without public `run` commands.
- Local daemon serves the built Worker Web at `/`, so a source checkout can be
  debugged with one daemon process after the Web build.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-fs-layout' typecheck`
  - `bun run --filter '@zonease/aiworker-fs-layout' test`
  - `bun run --filter '@zonease/aiworker-core' typecheck`
  - `bun run --filter '@zonease/aiworker-core' test`
  - `bun run --filter '@zonease/aiworker-api' typecheck`
  - `bun run --filter '@zonease/aiworker-api' test`
  - `bun run --filter '@zonease/aiworker-cli' typecheck`
  - `bun run --filter '@zonease/aiworker-cli' test`

## 2026-05-10 18:01 [progress] Session workspace implementation slices

- Opened implementation PMA slices for the approved session-handoff
  architecture:
  - REFACTOR-047 / PLAN-219 — worker/session/turn/invocation data contract.
  - REFACTOR-048 / PLAN-220 — local daemon worker/session API.
  - REFACTOR-049 / PLAN-221 — Worker Web session workspace surface.
  - REFACTOR-050 / PLAN-222 — host-home lifecycle and project-scope removal.
  - QA-029 / PLAN-223 — focused/root gates, CRG review, and browser validation.
- Investigation found the concrete old-contract anchors to remove:
  `projects/runs/run_events` storage, `/api/local/runs`, Web `startRun()`, CLI
  `run` commands, `ensureProjectAiworker()` init, and the internal
  `workspace-template` engine.

## 2026-05-10 18:11 [completed] REFACTOR-047 / REFACTOR-048 — Worker session data and daemon API

- Replaced the local worker contract with workers, workspaces, sessions, turns,
  internal engine invocations, and session events.
- Regenerated the worker SQLite migration; the greenfield schema no longer has
  `runs` or `run_events`.
- Core runtime now materializes session context under the workspace, invokes an
  external engine adapter, and registers artifacts/reviews/lessons against
  session/turn/invocation metadata.
- Local daemon boot now seeds HR/PM/QA/DevOps Soul workers and exposes
  worker/workspace/session/turn routes.
- Removed public run API paths and removed the internal `workspace-template`
  engine from Settings scan/test.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-shared' typecheck`
  - `bun run --filter '@zonease/aiworker-storage-sqlite' typecheck`
  - `bun run --filter '@zonease/aiworker-storage-sqlite' test`
  - `bun run --filter '@zonease/aiworker-core' typecheck`
  - `bun run --filter '@zonease/aiworker-core' test`
  - `bun run --filter '@zonease/aiworker-api' typecheck`
  - `bun run --filter '@zonease/aiworker-api' test`

## 2026-05-10 18:31 [completed] REFACTOR-049 / PLAN-221 — Worker Web session workspace surface

- Worker Web now consumes local daemon workers, workspaces, sessions, turns,
  artifacts, reviews, lessons, and session events.
- The create path selects a Soul worker, creates a workspace/project under that
  worker, starts a workspace session turn with the selected capability template,
  and shows the resulting artifact.
- Web calls to `/api/local/runs` are removed; artifact preview reads
  workspace-scoped file paths.
- Settings language now states that session turns require an external engine or
  BYOK provider; no built-in template runner fallback is advertised.
- Verification passed:
  - `bun run --filter '@zonease/aiworker-web' typecheck`
  - `bun run --filter '@zonease/aiworker-web' test`
  - `bun run --filter '@zonease/aiworker-web' build`
  - `bun run --filter '@zonease/aiworker-api' typecheck`
  - `bun run --filter '@zonease/aiworker-api' test`

## 2026-05-10 17:44 [completed] DOC-009 / PLAN-218 — Session handoff and file consumer contract correction

Follow-up architecture discussion clarified that AIWorker must not ask users to
maintain runs. Engine handoff begins at the workspace session layer, aligned
with Claude Code / Codex / Cursor native sessions:

- Updated `GOALS.md`, `docs/architecture.md`, and `README.md` so the product
  chain is `worker -> workspace/project -> session -> turn -> artifact`, not
  `session -> run`.
- Reframed `run` as internal `engine_invocation` audit/retry/debug metadata,
  not a product object or default UI/API path.
- Added the file consumer contract to `docs/architecture.md`: files must serve
  daemon prompt/catalog composition, engine-visible session cwd, audit/replay,
  or human/export use. Files outside those consumers should not be created.
- Documented that this architecture must be strictly followed unless
  implementation evidence proves it impossible or inferior, in which case a new
  proposal is required before adjustment.
- Synced `docs/task/DOC-009.md` and `docs/plan/PLAN-218.md` with the corrected
  session/turn/invocation model.

Verification: `git diff --check` passed. code-review-graph was skipped because
this was documentation-only architecture work.

## 2026-05-10 16:59 [completed] DOC-009 / PLAN-218 — Host daemon and Soul worker architecture contract

Initial architecture pass treated the local product as `1 host -> 1 local
daemon -> N Soul workers -> N workspaces -> N sessions -> N capability runs`.
The 17:44 follow-up entry above supersedes that run wording with the final
session/turn/invocation contract:

- Updated `GOALS.md` so Soul selection means selecting or creating a Soul-bound
  worker, not storing Soul as long-term project metadata.
- Expanded `docs/architecture.md` with definitions for host, local daemon,
  worker, workspace/project, session, turn/invocation, capability template,
  host settings, and worker settings.
- Added an Open Design mapping that keeps OD's project/conversation/run/artifact
  grammar while making AIWorker's extra Soul worker layer explicit.
- Defined the target local daemon API/storage/debug contracts, including
  worker registry routes, host-vs-worker settings, session ownership, and a
  single lifecycle debug path.
- Updated `README.md` to explain the model and mark split API/Web startup as a
  transitional contributor escape hatch rather than the intended operator path.

Verification: `git diff --check` passed. code-review-graph was skipped because
this was documentation-only architecture work.

## 2026-05-10 12:25 [completed] REFACTOR-046 / PLAN-217 — Worker Web theme switching and dark mode readiness

Worker Web appearance settings now drive the rendered shell instead of only
persisting a preference:

- Added theme resolution for `system | light | dark`, with live
  `prefers-color-scheme` updates and stable `data-appearance` / `data-theme`
  shell attributes.
- Added dark-mode token coverage for the Worker Studio shell, settings modal,
  controls, overlays, icon surfaces, artifact preview elements, status states,
  shadows, and primary actions.
- Decoupled primary action colors from warm accent tokens so light and dark
  themes both meet production contrast expectations.
- Added focused tests for system theme resolution, system preference changes,
  and persisted dark-theme application.

Verification passed: `git diff --check`,
`bun run --filter '@zonease/aiworker-web' typecheck`, `test`, `lint` (0 errors,
existing five effect-setState warnings), and `build` including Worker Studio CSS
quality, plus root `bun run check` and `bun run build`. Browser validation at
`http://127.0.0.1:5179/worker/` verified Light/Dark/System switching,
`/api/local/settings` persistence, OS preference response, 0 browser
warnings/errors, and passing sampled contrast ratios. code-review-graph
update/review completed with 0 affected flows and risk score 0.55.

## 2026-05-10 12:12 [completed] FEAT-059 / PLAN-216 — Production-grade Worker Web localization

Worker Web language switching now localizes the product shell instead of only
persisting a language code:

- Added a typed Worker Web localization catalog for English, Simplified Chinese,
  Japanese, and German.
- Routed Worker Studio navigation, creation form, Settings dialog, status labels,
  accessibility labels, language names, and built-in Soul/template display copy
  through the catalog.
- Saved `settings.language` now controls the active locale, updates
  `document.documentElement.lang`, and falls back to English for unknown values.
- Settings language switching updates the UI after the existing
  `/api/local/settings` save path returns.

Verification passed: `bun run --filter '@zonease/aiworker-web' test`,
`typecheck`, `lint` (0 errors, existing five effect-setState warnings), `build`
including CSS quality, root `bun run check`, root `bun run build`,
`git diff --check`, browser validation for `en`, `zh-CN`, `ja`, and `de`, and
code-review-graph update/review.

## 2026-05-10 11:26 [completed] REFACTOR-045 / PLAN-214 + QA-028 / PLAN-215 — Soul project semantics and init artifact purge

User review clarified that the remaining `case` language is not the intended
default product object and that old Project Brain initialization artifacts
should not leak into the vertical Soul workspace. Scope:

- Replace the local work object with Soul `project` across Web, API, CLI,
  storage, shared schemas, runtime metadata, tests, and docs.
- Remove default initialization of `.aiworker/local`, `scope.json`,
  `brain-capabilities.json`, and `executor-capabilities.json`.
- Keep the OD-style IA skeleton while making the visible product path
  Soul / capability template / project / run / artifact.
- Revalidate with focused gates, browser preview, and code-review-graph.

Completed:

- Replaced local `case` semantics with Soul `project` across Web, API, CLI,
  core runtime, shared DTOs, storage schema/migration metadata, tests, and docs.
- `aiworker init` now writes product-facing `.aiworker` Soul workspace
  scaffolding and no longer writes `.aiworker/local`, `scope.json`,
  `brain-capabilities.json`, or `executor-capabilities.json` by default.
- Browser validation at `http://127.0.0.1:5178/worker/` created HR, PM, QA, and
  DevOps projects/runs/artifacts, verified Settings Test/Rescan and `zh-CN`
  persistence, and confirmed no visible `case` or import entry.
- Verification passed: focused package gates, root `bun run typecheck`,
  `bun run test`, `bun run build`, `bun run lint`, `git diff --check`, and
  code-review-graph. Lint exits 0 with the existing five Web effect-setState
  warnings.

## 2026-05-10 11:28 [superseded] REFACTOR-044 / PLAN-212 + QA-027 / PLAN-213 — OD-style vertical Soul workspace correction

This correction track was superseded before completion. User review clarified
that the work object itself must converge from `case` to `project`, and that
default initialization must stop carrying `.aiworker/local`, scope manifest,
Brain capability, and executor overlay JSON artifacts.

## 2026-05-10 10:46 [completed] REFACTOR-041..043 / PLAN-208..210 + QA-026 / PLAN-211 — Vertical Soul workspace MVP

Landed the out-of-box vertical Soul workspace MVP:

- Rebuilt Worker Web around HR/PM/QA/DevOps Soul catalog, scoped skill/template
  selection, case/run creation, business artifact cards, and selected-Soul
  review rail.
- Removed import entrypoints and developer/work-order-first product language
  from the Web surface.
- Added shared vertical Soul and capability template schemas plus built-in
  HR/PM/QA/DevOps template catalog, with Finance/Legal/Ops marked later.
- Carried selectedSoulId and selectedSkillId through storage, API, CLI, runtime,
  run metadata, and generated artifact metadata.
- Implemented AIWorker Settings with Local CLI / BYOK mode, engine status
  scan/test, connectors, MCP, language, appearance, autosave, close/reopen, and
  reload persistence.
- Updated README, GOALS, architecture, PMA task/plan docs, and Web CSS quality
  selectors to match the shipped MVP.

Verification: focused shared/storage/core/API/CLI/Web tests passed; `bun run
typecheck`, `bun run lint`, `bun run test`, and `bun run build` passed. Browser
validation at `http://127.0.0.1:5174/worker/` created HR, PM, QA, and DevOps
cases/runs, showed artifacts, saved/reloaded Settings, and captured
`tmp/vertical-soul-preview/soul-workspace.png`. CRG update passed; CRG review
reported 0 affected flows, 71 test gaps, and risk score 0.60, with high-risk
minimal context due the intended cross-layer rewrite.

## 2026-05-10 10:03 [completed] DOC-008 / PLAN-207 — Vertical Soul product north star reset

Reset the product guidance away from Open Design visual copying and
developer-first worker loops:

- Rewrote `GOALS.md` around vertical Soul workspace, HR/PM/QA/DevOps priority,
  capability templates, domain systems, cases, business artifacts, review, and
  durable org memory.
- Rewrote `docs/architecture.md` to define the target Soul/domain/template/case
  architecture and to demote `work order` to a low-level/internal concept.
- Updated `AGENTS.md` with anti-drift rules against executor-platform,
  developer-first, coding-only, and Open Design shell-copy directions.
- Rewrote `README.md` to present Open Design as product grammar, not a
  visual/brand/domain copy target.

Verification: `git diff --check` passed. CRG was skipped because this slice
only changes documentation and instruction files.

## 2026-05-10 09:11 [completed] REFACTOR-040 / PLAN-206 — Worker Web product detail correction

Corrected the too-literal Open Design Web copy:

- Removed the macOS traffic-light window controls from the browser page.
- Made settings closed by default and opened only through the explicit settings
  button.
- Replaced copied Open Design/Nexu/design-prototype copy with AIWorker work
  order, worker pack, workspace, run, and executor vocabulary.
- Replaced the copied avatar image and Open Design logo geometry with AIWorker
  UI assets.
- Updated Worker Studio tests to reject the stale copied text and desktop
  chrome.

Verification: `bun run --filter '@zonease/aiworker-web' test`,
`bun run --filter '@zonease/aiworker-web' typecheck`,
`bun run --filter '@zonease/aiworker-web' lint`,
`bun run --filter '@zonease/aiworker-web' build`, and `git diff --check` pass.
Browser review of `http://127.0.0.1:5173/worker/` confirmed the default home
has no settings dialog, macOS traffic lights, or copied avatar image, and
settings opens through the explicit settings button. CRG reported 0 affected
flows, 3 test gaps, and risk score 0.40.

## 2026-05-10 01:43 [completed] REFACTOR-039 / PLAN-205 — Worker Web Open Design source parity

Replaced the rejected Worker Web studio with a direct Open Design source-parity
baseline:

- Rebuilt `WorkerStudio` around Open Design's entry shell structure: left
  `newproj` creation panel, center designs toolbar/grid, right `pet-rail`, and
  first-run `modal-settings`.
- Removed the home-screen review, lessons, run events, and artifact canvas
  concepts from the visible first screen.
- Copied Open Design public `logo.svg` and `avatar.png` assets into the Worker
  Web bundle.
- Updated Web tests and studio CSS quality selectors to guard the OD source
  structure.

Verification: `bun run --filter '@zonease/aiworker-web' test`,
`bun run --filter '@zonease/aiworker-web' typecheck`,
`bun run --filter '@zonease/aiworker-web' lint`,
`bun run --filter '@zonease/aiworker-web' build`, `bun run check`,
`bun run test`, `bun run --filter '@zonease/aiworker-api' build`,
`bun run --filter '@zonease/aiworker-cli' build:bundle`, and
`git diff --check` pass. Browser review of
`http://127.0.0.1:5173/worker/` passed for settings/home views at default and
2048px widths with 0 console errors. CRG reported 0 affected flows, 18 test
gaps, and risk score 0.55. Aggregate `bun run build` was terminated after the
Web Vite subprocess stalled despite the package-level API/Web/CLI builds
passing.

## 2026-05-10 00:23 [completed] REFACTOR-038 / PLAN-204 — Worker Web greenfield studio rebuild

Completed the destructive Worker Web reset after user review found the previous
screen still looked like legacy admin UI:

- Removed the parked fleet Web bundle/source, old `apps/web/fleet` and
  `apps/web/worker` HTML entries, TanStack route trees, shared admin UI
  primitives, shared theme store, and gateway smoke from `apps/web`.
- Replaced the Web package with a single worker studio build that outputs
  `dist/worker`.
- Added `WorkerStudio` and purpose-built studio CSS around brief shelf, run
  lane, artifact canvas, review rail, run events, and lesson ledger.
- Rewrote Web tests and quality checks around the worker-only studio surface.
- Updated bundle size baseline to the new single-worker bundle.

Verification: `bun run --filter '@zonease/aiworker-web' test`,
`bun run --filter '@zonease/aiworker-web' typecheck`,
`bun run --filter '@zonease/aiworker-web' lint`,
`bun run --filter '@zonease/aiworker-web' build`,
`bun run --filter '@zonease/aiworker-web' size:baseline`,
`bun run check`, `bun run test`, `bun run build`, and `git diff --check` pass.
Browser review of `http://127.0.0.1:5173/worker/` passed on desktop and mobile
with 0 console errors / 0 warnings. CRG reported 0 affected flows, 33 test
gaps, and risk score 0.45.

## 2026-05-10 00:26 [completed] REFACTOR-037 / PLAN-203 — Greenfield local worker rebuild

Completed the destructive greenfield local worker rebuild:

- Replaced the default worker schema with workspace, briefs, runs, run events,
  files, artifacts, reviews, lessons, and settings.
- Deleted the old default worker runtime subsystems and rebuilt the local run
  engine around brief -> run -> artifact -> review -> lesson.
- Replaced the worker API with `/api/local/*` only.
- Rebuilt the CLI around local workspace commands.
- Rebuilt Worker Web as a workspace app instead of an admin dashboard.
- Rewrote README, GOALS, architecture, and CLI docs around the shipped product
  loop, with remote aggregation deferred.

Verification: `bun run check`, `bun run test`, `bun run build`,
`git diff --check`, focused package gates, source-local smoke, and browser
review pass. CRG completed with no affected flows and static test-gap warnings
recorded for the broad rewrite surface.

## 2026-05-09 21:58 [completed] REFACTOR-036 / PLAN-202 — Hard reset OD-style worker product surface

Completed the destructive OD-style worker hard reset:

- Root CLI now exposes only the local worker loop: init, daemon, run, runs,
  artifacts, pack, review, lessons, doctor, and executor.
- Worker Web now routes only Workbench, Runs, Artifacts, Reviews, Lessons, and
  Settings; old Chat/Cases/Brain/Cron/Approvals/Test/Secrets pages were removed
  from the worker shell.
- The local worker API removed `/api/worker/cases`; review and lesson promotion
  are the product-facing surfaces.
- Core product naming now uses Worker Review and Lesson Promotion services
  instead of Brain Case / Inbox terminology.
- Successful daemon runs now capture final assistant output as an
  `assistant-output` artifact and the source-local smoke covers init -> daemon
  -> run -> artifacts -> review -> lesson promotion.

Verification: `bun run check`, `bun run test`, `bun run build`,
`bun run --filter '@zonease/aiworker-core' test`,
`bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`, and
`git diff --check` pass. Production release remains a separate step requiring a
published-package compact harness and deployment validation.

## 2026-05-09 19:08 [completed] REFACTOR-035 / PLAN-201 — Complete OD-style worker default loop

Completed S7 of the OD-style worker reboot:

- Added daemon-backed `runs list/show/cancel` CLI commands.
- Added daemon-backed `artifacts list/show` CLI commands.
- Refreshed root help so onboarding reads init -> daemon -> run -> inspect artifacts
  -> review/promote.
- Updated `docs/cli.md` to describe the current local worker loop and mark
  Brain/Fleet/Gateway as secondary/admin surfaces.

## 2026-05-09 18:58 [completed] REFACTOR-034 / PLAN-200 — Worker review promotion surface

Completed S6 of the OD-style worker reboot:

- Added product-facing `/api/worker/reviews` list/show/rerun/promote routes over the
  existing Case / Inbox / Admission backend.
- Added root/canonical `review list/show/rerun/promote` CLI commands.
- Updated Worker Web review copy to Reviews / Promote lessons and wired promotion to
  the new review API.
- Kept promotion safe: it only creates pending proposals and does not auto-approve or
  apply durable memory.

## 2026-05-09 18:42 [completed] REFACTOR-033 / PLAN-199 — Worker web workbench first screen

Completed S5 of the OD-style worker reboot:

- Replaced the Worker Admin `/` overview with a local worker workbench.
- Added built-in worker pack and work-order template pickers backed by shared worker pack
  metadata.
- Added a first-screen composer that submits through the existing run contract.
- Added run timeline, artifact metadata, and case review panels.
- Added runs / worker artifact query hooks and invalidated runs after work-order submit.
- Kept old Brain / Config / Cron / Approvals / Chat pages as secondary/admin routes.

## 2026-05-09 18:23 [completed] REFACTOR-032 / PLAN-198 — Local worker daemon lifecycle commands

Completed S4 of the OD-style worker reboot:

- Added local worker daemon lifecycle commands:
  - `aiworker daemon start/status/stop/logs/check/inspect`
  - `aiworker worker daemon start/status/stop/logs/check/inspect`
- `daemon start` reuses the existing `up` / `init` / `serve` path and launches a
  detached worker child process.
- The active scope home now stores worker daemon pid, log, and metadata files.
- `daemon check` verifies `/health`; `daemon logs --tail <n>` reads recent log
  lines; `daemon inspect` prints JSON status.
- `up --pack` now passes worker pack selection through to `init`.

## 2026-05-09 18:10 [completed] REFACTOR-031 / PLAN-197 — Project init worker pack materialization

Completed S3B of the OD-style worker reboot:

- Added `.aiworker`-local worker pack seed support in fs-layout with path guards.
- Added `aiworker init --pack <id>` and `aiworker worker init --pack <id>`.
- `init --soul <id>` now materializes a same-id built-in worker pack when one
  exists, writing:
  - `.aiworker/worker-packs/<pack>/SKILL.md`
  - `.aiworker/domain-systems/<pack>/DOMAIN.md`
- `policy.json` records selected worker pack metadata for brand-new projects.
- Init preflight, next steps, and root help now expose the worker pack assets
  and `aiworker pack show` inspection path.

## 2026-05-09 17:20 [completed] REFACTOR-030 / PLAN-196 — OD-style worker pack registry

Completed S3A of the OD-style worker reboot:

- Added a shared worker pack registry with developer, HR recruiting, project
  manager, and QA reviewer packs.
- Each pack now exposes OD-style `SKILL.md` and `DOMAIN.md` markdown, work-order
  templates, artifact kinds, and a default review checklist.
- Added `aiworker pack list/show` and `aiworker worker pack list/show`.
- Fixed CLI dotenv bootstrap command detection for multi-token diagnostic
  commands so pack/soul read-only commands do not require worker state.

## 2026-05-09 17:12 [completed] REFACTOR-029 / PLAN-195 — Worker artifact metadata index

Completed S2A of the OD-style worker reboot:

- Added `worker_artifacts` to worker.db as the workbench artifact metadata
  index.
- Added `WorkerArtifactService` with workspace-relative path normalization,
  upsert-by-path registration, and list/get filters.
- Added read-only worker REST routes for artifact list/show and registered
  them in the Worker OpenAPI path registry.
- Added Web API client methods with explicit `WorkerArtifact` naming so this
  surface does not collide with Brain artifact registry APIs.

## 2026-05-09 17:02 [completed] REFACTOR-028 / PLAN-194 — CLI run daemon contract default

Completed the second runtime slice for the OD-style local worker loop:

- `aiworker run` now submits work orders to the local daemon
  `/api/worker/runs` by default.
- CLI output now follows run-scoped SSE from `/api/worker/runs/:id/events` and
  keeps terminal exit-code mapping for finished, error, and timeout states.
- Added explicit `--local` fallback for the old in-process runtime path.
- Refreshed root and `worker run` help text so the default behavior no longer
  claims to avoid the HTTP daemon.

## 2026-05-09 16:36 [decision] REFACTOR-026 / PLAN-192 — OD-style local worker reboot

Accepted the Open Design-style reboot direction for AIWorker worker:

- Product north star moves from governance-first Project Brain runtime to
  local-first worker workbench.
- Default loop becomes work order -> run -> artifact -> review -> lesson.
- Fleet/gateway and desktop are deferred until the local worker loop is useful
  and verifiable.
- S0 updated GOALS, target architecture, README, CLI docs, governance-node
  status, and PMA tracking only; runtime code remains unchanged in this slice.

## 2026-05-09 16:55 [completed] REFACTOR-027 / PLAN-193 — Worker run contract compatibility layer

Landed the first runtime slice for the OD-style local worker loop:

- Added core `WorkerRunService` over the transitional `agent_tasks` store.
- Added worker `/api/worker/runs` list/create/show/cancel and per-run SSE
  filtering.
- Registered run endpoints in Worker OpenAPI metadata.
- Moved Worker Web submit/continue calls to `/api/worker/runs` while keeping
  current UI function names.
- Kept old orchestrator task routes as compatibility paths for later cleanup.

## 2026-05-09 15:29 [completed] REL-031 / QA-025 — CLI 0.12.1 release

Released `@zonease/aiworker-cli@0.12.1` after FEAT-058:

- Fixed default Brain/Case redaction so governance and authorship fields such
  as `authorityMode`, `authorId`, and `authHint` remain visible while real auth
  material is still redacted.
- Source gates pass after the fix: `bun run check`, `bun run test`,
  `bun run build`, and `git diff --check`.
- Bundle CLI and dist manifest report `0.12.1`; publish dry-run from
  `apps/cli/dist` packs 34 files / 3.20MB before the expected local npm auth
  boundary.
- Dist CLI dogfood used a real project-scope worker DB and verified
  task-scoped Case status, high-risk ambient authority visibility, final
  assistant message selection, and pending lesson proposal creation.
- GitHub release workflow `25595158313` passed and published npm plus 4 GitHub
  Release binary assets.
- npm latest is `0.12.1`; `bunx @zonease/aiworker-cli@0.12.1 --version`
  returns `aiworker/0.12.1 darwin-arm64 node-v24.3.0`.
- main `lint` workflow `25595157442` and `build-image` workflow `25595157441`
  passed.
- Published-package compact governance harness passed with 80 PASS / 0 FAIL
  across `developer-codex` and `general-assistant-claude-code`.
- GitHub Actions emitted Node.js 20 deprecation warnings for release/docker
  actions; schedule CI runtime updates before GitHub's 2026-06-02 Node 24
  default switch.

## 2026-05-09 15:52 [completed] FEAT-058 / QA-024 — Case-driven Project Brain loop source validation

Completed the source-level validation for the Case-driven Project Brain learning
loop after the 0.12.0 dogfood exposed that Worker Admin Chat still felt like an
executor harness.

- GOALS / architecture now state the native-engine-first boundary: users work
  in native executors; AIWorker is the Project Brain sidecar for task-scoped
  Case evidence, Brain review, admission, projection, and later verification.
- Brain Journal and Case projection are now task-scoped in shared
  conversations: Case Files bind to the task's own events and assistant message
  window instead of the latest conversation assistant.
- Review Decision is more truthful: pure heuristic observe-only pass becomes
  `needs_review`; `ready_to_ship` requires `brain-engine-review` evidence.
- Codex current native thread resume no longer replays old conversation turns
  into the executor; stale binding fallback still restores DB-rendered context
  on a fresh thread.
- Validation passed: focused Journal / Case / Codex / REST / CLI tests,
  `@zonease/aiworker-core` package tests (674 pass / 0 fail), full `bun run typecheck`,
  `bun run lint`, and full `bun run test`.
- No release was performed in this record; QA-024 concludes source MVP can
  continue, but release readiness still requires package / install / harness
  validation.

## 2026-05-09 12:11 [completed] FEAT-057 / QA-023 / REL-030 — Worker Case operating surface and 0.12.0 release

Completed the Worker Case source MVP and released it as
`@zonease/aiworker-cli@0.12.0`.

- Case File, Review Decision, per-case Lessons Queue, Worker REST/CLI, Worker
  Admin `/cases`, and fleet-hosted worker bridge are now available from the
  published CLI package.
- Source validation passed: `bun run check`, `bun run test`, `bun run build`,
  `git diff --check`, bundle version smoke, and publish dry-run pack stage.
- Source dogfood used a real project-scope worker DB and verified `case list`,
  `case show`, and `lessons propose`; it caught and fixed a redactor false
  positive on `task-case` proposal ids in commit `2a8d194`.
- Release validation passed: `v0.12.0` release workflow `25591091932`, npm
  latest `0.12.0`, `bunx @zonease/aiworker-cli@0.12.0 --version`, GitHub
  Release binary assets, and main lint/build-image workflows.
- Published-package compact governance harness passed with 80 PASS / 0 FAIL
  across `developer-codex` and `general-assistant-claude-code`.
- PLAN-187 batch Lessons Queue review remains pending by design. The validated
  path is per-case lesson proposal plus the existing Brain admission state
  machine; batch approve/apply should only be added if dogfood proves the
  operator cost justifies it.

## 2026-05-09 05:55 [progress]

Opened FEAT-057 to shift the post-FEAT-056 product surface from raw proof-loop
mechanics to Worker Case operations. The new epic keeps Brain Journal, Gate,
Brain Engine review, rerun, and Brain Inbox as the evidence layer, then exposes
Case File, Review Decision, and Lessons Queue as the operator-facing workflow.
The first implementation slice is PLAN-183 / PLAN-184 / PLAN-185: contract,
core projection, and REST/CLI surface before Web/Fleet expansion.

## 2026-05-09 06:05 [progress]

Started PLAN-184 / PLAN-185 implementation. The first code slice intentionally
avoids DB schema changes: `BrainCaseService` will derive Case File and Review
Decision from existing worker-owned task rows and Brain Journal events, then
REST/CLI will expose the Case surface while keeping raw Journal commands as
debug-level tools.

## 2026-05-09 06:32 [completed] PLAN-183 / PLAN-184 / PLAN-185 — Worker Case REST/CLI surface

Completed the first Worker Case operating slice:

- Added `BrainCaseService` as the shared projection over Brain Journal,
  Gate verdict, Brain Engine review, task rows, risk preflight and lesson
  candidates. No DB schema change was introduced.
- Added Worker REST `GET /api/worker/cases`, `GET /api/worker/cases/:taskId`,
  `POST /api/worker/cases/:taskId/rerun` and
  `POST /api/worker/cases/:taskId/lessons/propose`, including OpenAPI registry
  entries.
- Added CLI `aiworker case list/show/rerun`, `aiworker lessons propose`, and
  worker-prefixed equivalents.
- Focused core/API/CLI/OpenAPI tests, `bun run typecheck`, and `bun run lint`
  pass for this slice.

## 2026-05-09 06:45 [completed] PLAN-186 / PLAN-188 — Worker Admin Cases UI and bridge

Completed the operator-facing Worker Case source MVP:

- Added Worker Admin `/cases` route with Case list, Review Decision detail,
  Work Order, Risk, Evidence, Lessons Queue, rerun, and per-case lesson proposal
  actions.
- Added worker web API client and React Query hooks for `/api/worker/cases*`;
  the route is available in local worker admin and fleet-hosted worker admin.
- Added gateway proto `cases.*` methods, gateway-client dispatcher handlers,
  `aiworker serve` node handlers, and HTTP bridge allowlist mapping for
  `/w/:workerId/api/worker/cases*`.
- Fleet bridge remains transit-only: it does not persist full Case File payload
  or Brain data into `fleet.db`.
- PLAN-187 batch lesson approve/apply is intentionally still pending until
  dogfood proves the per-case flow is too slow.

## 2026-05-09 06:55 [progress] QA-023 / REL-030 — Worker Case validation and 0.12.0 release

Opened the validation/release track for the Worker Case source MVP. The release
target is `@zonease/aiworker-cli@0.12.0`, not 1.0 GA. Gates must include source
checks, build, publish dry-run, CLI/package smoke, Case flow evidence, and a
clear statement on PLAN-187 remaining pending.

## 2026-05-09 11:57 [progress] QA-023 / REL-030 — Worker Case release gate and dogfood

Prepared `@zonease/aiworker-cli@0.12.0` for release after the Worker Case source
MVP:

- Source gates pass after the dogfood fix: `bun run check`, `bun run test`,
  `bun run build`, and `git diff --check`.
- Bundle CLI and dist manifest report `0.12.0`; publish dry-run from
  `apps/cli/dist` packs 34 files / 3.20MB before the expected local npm auth
  boundary.
- Source dogfood used a real project-scope worker DB at
  `/tmp/aiworker-case-dogfood-39ezZQ/project` and verified `case list`,
  `case show`, and `lessons propose`.
- Dogfood caught a product-facing redaction bug where `task-case` proposal ids
  were mistaken for `sk-` secrets. Commit `2a8d194` narrows the scanner and
  keeps operator proposal ids usable while still redacting actual token-shaped
  content.

## 2026-05-09 [completed] REL-029 / PLAN-182 — 发布 aiworker CLI 0.11.0

发布 `@zonease/aiworker-cli@0.11.0` minor release，承载 0.10.4 之后的
FEAT-056 developer repo worker proof loop。

- 本次不是 1.0 GA；目标是把 Brain Journal、Gate verdict、Brain Engine reviewer、
  bounded rerun、Brain Inbox admission、authority preflight 和 QA-022 readiness
  evidence 作为 0.x minor 版本交付。
- 本地 release gate 已通过：frozen install、typecheck、lint、test、build、
  CLI run/fleet smoke、dist version、`git diff --check` 和 publish dry-run pack stage。
- `main` 与 annotated tag `v0.11.0` 已推送；GitHub Actions release run
  `25586331820` 成功，npm latest 已更新到 `0.11.0`，GitHub Release 上传四个
  binary assets。
- `bunx @zonease/aiworker-cli@0.11.0 --version` 报告
  `aiworker/0.11.0 darwin-arm64 node-v24.3.0`。
- 发布包 `cli-release-local` compact harness 已重跑通过：developer/codex 与
  general-assistant/claude-code 共 80 PASS / 0 FAIL / 0 SKIPPED。
- main push 的 Web bundle-size baseline 过期问题已用 commit `61b9729` 修正；
  重跑后的 main lint 与 build-image workflow 均成功。

## 2026-05-09 [completed] PLAN-180 / PLAN-181 — proof-loop dogfood and readiness closeout

完成 FEAT-056 的 dogfood 与 readiness 收口：developer repo worker proof loop
已达到 source MVP 投产门槛，但不宣称 1.0 GA 发布完成。

- 新增 `QA-022`，记录 Brain Journal / Gate verdict、Brain Engine review、
  repair/rerun/hold、Brain Inbox admission、authority preflight、Worker REST 与
  CLI surfaces 的 source-backed dogfood 证据。
- README / CLI docs 增加 developer repo proof-loop 使用入口：
  `aiworker brain journal show <taskId>`、`aiworker brain inbox propose <taskId>`
  与 worker REST rerun endpoint。
- `docs/architecture.md` 固化 `execute → journal → gate → hold/rerun or pass →
  inbox/admission` 边界，并明确 authority preflight 不是 sandbox / MCP firewall /
  permission broker。
- `docs/governance-node-status.md` 更新到 2026-05-09，新增 FEAT-056 conformance
  rows 与 residual-risk：source MVP 不等于 published package / 1.0 GA release
  evidence。
- FEAT-056 与 PLAN-181 已按 source MVP ready 关闭；正式发布仍应另走 REL task、
  package build / install verification / release harness。
- 最终 source gate：`bun run check`、`bun run test`、`bun run build`、
  `git diff --check` 均通过。

## 2026-05-09 04:12 [completed] PLAN-179 — Authority mode and high-risk preflight

完成 authority mode / high-risk preflight：把“AIWorker 能治理 Brain，但不能隔离
ambient executor”的边界变成 operator-visible runtime 信号。

- 新增 authority preflight classifier，识别 production、database、destructive、
  payment、PII、secret、cross-scope 等高风险信号。
- Orchestrator 在 executor dispatch 前写 `authority.preflight` Journal event。
- Journal trace 暴露 `authorityPreflight`；Gate verdict 可引用
  `authority-preflight` reason。
- `aiworker run` 启动时打印 authority/risk，高风险 ambient 任务显示
  `enforceable=false` 语义的 warning，不承诺 sandbox / MCP firewall / permission broker。

## 2026-05-09 04:05 [completed] PLAN-178 — Brain Inbox lesson admission flow

完成 Brain Inbox MVP：把 Brain Engine review 里的 lesson candidates 转换成 pending
Brain admission proposals，而不是自动写长期 memory。

- 新增 `BrainInboxService.proposeFromTask()`，从 Journal 中读取最新
  `brain_engine.review` 事件并提取 `lessonCandidates`。
- 每个 candidate 生成 `memory-add` admission proposal，带 evidence refs、scope、
  risk、confidence、target、payload body 和 rollback。
- Worker REST 新增 `POST /api/worker/brain/inbox/from-task/{taskId}`；CLI 新增
  `aiworker brain inbox propose <taskId>` / `aiworker worker brain inbox propose <taskId>`。
- Rejected candidate 只停留在 admission row，不改变 canonical Brain。

## 2026-05-09 03:52 [progress] PLAN-177 — Repair and rerun orchestration

开始实现 bounded proof-loop rerun：沿用现有单次 repair，不新增无限自动规划；
新增 operator-triggered rerun、parent/child lineage Journal 和 retry cap，让失败原因能
回灌 executor，同时保留 hold/需要人工处理的边界。

完成 PLAN-177 runtime 切片：

- `Orchestrator.rerunTask()` 可基于 parent Gate verdict 生成 rerun prompt，创建 child
  task，并把 `rerun.requested` / child `task.queued` lineage 写入 Journal。
- Worker REST 新增 `POST /api/worker/orchestrator/tasks/{id}/rerun`，gateway proto /
  dispatcher / bridge 新增 `orchestrator.tasks.rerun`。
- Quality-gate block mode 会写 `task.held` Journal event，operator 可区分 Gate hold
  与 executor failure。
- Parent task rerun cap 固定为 3，超出后返回 `rerun-cap-exceeded`，不做无限循环。

## 2026-05-09 03:46 [progress] PLAN-176 — Brain Engine reviewer contract

开始实现 bounded Brain Engine reviewer：它只做结果评审、证据缺口和 lesson
candidate 提取，运行时禁用工具，失败时回退为 truthful fallback，并由 Journal/Gate
引用其结论；不让 Brain Engine 成为 executor 或直接写 canonical Brain。

完成 PLAN-176 runtime 切片：

- 新增 `reviewTaskWithBrainEngine()`，输出 schema-validated review、evidence gaps、
  unsupported claims、repair/rerun/hold 建议和 lesson candidates。
- Reviewer 通过 control executor 运行，`tools: []`、`temperature: 0`、bounded budget；
  invalid JSON/schema drift/timeout 均转成 observe-only fallback review。
- Orchestrator 在 LLM quality gate 模式下记录 `brain_engine.review` Journal event。
- Journal Gate verdict 保持 Kernel invariant 优先，同时可引用 Brain Engine review 与
  heuristic quality gate 理由。

## 2026-05-09 03:45 [completed] PLAN-174 / PLAN-175 — Brain Journal trace and Gate verdict surface

完成 AIWorker 1.0 proof loop 的首个 runtime 切片，让一个 worker task 可以被
operator 从输入、执行、决策、工具事件、Gate verdict 到结果进行追踪。

- `worker.db` 新增 append-only `brain_journal_events` 表与 task/conversation/kind
  索引，迁移文件为 `0008_peaceful_titanium_man.sql`。
- Orchestrator 记录 task lifecycle、conversation/user/assistant message refs、
  intent/capability decision、quality gate、repair attempt、tool use/result、
  executor finish/error/binding/token usage、permission request 和
  admission-bypass signal。
- 新增 `BrainJournalService.getTaskTrace(taskId)`，默认 redaction，保留 worker-owned
  trace，不把私有 Brain / transcript payload 复制到 `fleet.db`。
- Worker REST 新增
  `GET /api/worker/orchestrator/tasks/:id/journal`，gateway bridge 新增
  `orchestrator.tasks.journal`，CLI 新增
  `aiworker brain journal show <taskId>` / `aiworker worker brain journal show <taskId>`。
- Journal trace 新增 `gateVerdict`：区分 heuristic、brain-engine-review、
  kernel-invariant、executor-claim 以及 observe-only / enforced；admission bypass
  会形成 enforced hold，executor failure 会形成 observe-only rerun suggestion。
- 验证已通过 focused Journal/API/storage/gateway dispatcher tests、core/API/CLI/
  gateway-proto/storage typecheck，以及 workspace `bun run check`、`bun run test`、
  `bun run build`、`git diff --check`。

## 2026-05-09 03:12 [planned] FEAT-056 / PLAN-173..181 — AIWorker 1.0 developer repo worker proof loop

把 `GOALS.md` 的 1.0 产品判断拆成 PMA 全量计划，聚焦 developer repo worker 的可验证闭环。

- 新增 `FEAT-056` 作为 1.0 proof-loop epic：init scope、executor run、Journal、Gate、
  repair/rerun、Brain Inbox、admission、authority mode 与 dogfood evidence。
- 新增 `PLAN-173..181`，依次覆盖 proof-loop contract、Brain Journal、Gate verdict、
  Brain Engine reviewer、repair/rerun orchestration、Brain Inbox、authority mode、
  developer repo dogfood 和 1.0 readiness closeout。
- 明确 1.0 前不进入通用 sandbox、MCP firewall、cloud permission broker、多垂直业务
  workflow 或自研 executor tool loop。
- 本轮只落盘计划，不实施 runtime 改动。

## 2026-05-09 02:07 [completed] DOC-007 / PLAN-172 — AIWorker product north star guardrail

新增根目录 `GOALS.md`，把 AIWorker 的产品北极星落成后续开发 session 的防跑偏契约。

- 明确 AIWorker 是 self-hosted Project Brain governance runtime for bring-your-own
  agents，不是 executor 平台、通用 memory layer 或 coding-only 项目管理器。
- 固化 Project Brain ownership、governed self-iteration、executor neutrality、
  Worker/Fleet operations 四个核心竞争面。
- 补充未来功能 decision tests：必须解释守住的治理不变量、executor 边界、业务 scope
  语义、admission/audit/rollback 路径与对用户确认负担的影响。
- 补充 Brain Kernel / Brain Engine / Executor 三分法，以及 Journal / Gate / Admission
  三层运行模型，避免把 Brain 误解成纯硬逻辑或另一个 executor。
- 补充 1.0 产品判断：第一目标用户、developer repo worker 第一垂直场景、最小不可替代
  价值、Brain 学习边界、权限边界承诺、1.0 前非目标和 proof loop。
- `AGENTS.md` 新增产品北极星入口，要求 Brain / Executor / Soul / Fleet / scope /
  memory / capability 等边界改动先读 `GOALS.md`。
- `docs/architecture.md` 头部引用 `GOALS.md`，区分产品取舍来源与架构实现契约。

## 2026-05-08 22:56 [completed] REL-028 / PLAN-171 — 发布 aiworker CLI 0.10.4

发布 `@zonease/aiworker-cli@0.10.4`，承载 0.10.3 之后的 native executor
skill placement 与 managed native skill projection lifecycle。

- 默认 Project Brain skills 投影到 executor 原生 project skill 目录，不再把
  `.aiworker/skills/` 当主路径。
- AIWorker-managed native skill 使用 `aiworker-*` slug，并通过
  `.aiworker/native-skill-projections.json` 记录 source hash/version、target、
  last applied hash、status 与 tombstone。
- 新增 `aiworker brain skills sync-native`，支持 dry-run/apply reconciliation，
  并通过 doctor / brain status / brain skills 报告 drift/deprecate/orphan 等状态。
- 本地 release gate 已通过：frozen install、typecheck、lint、test、build、
  CLI run/fleet smoke、dist version、`git diff --check` 和 publish dry-run pack
  stage。
- `main` 与 annotated tag `v0.10.4` 已推送；GitHub Actions release run
  `25560613180` 成功，npm latest 已更新到 `0.10.4`，GitHub Release 上传四个
  binary assets。
- 修正 release harness 的 `brain-skill-add` 断言，使其验证 executor-native
  `.agents/skills/aiworker-*` / `.claude/skills/aiworker-*` 与
  `.aiworker/native-skill-projections.json`，不再要求旧 `.aiworker/skills`
  canonical file。
- 发布包 `cli-release-local` compact harness 已重跑通过：developer/codex 与
  general-assistant/claude-code 共 80 PASS / 0 FAIL / 0 SKIPPED。

## 2026-05-08 18:27 [completed] REFACTOR-025 / PLAN-170 — Native executor skill projection lifecycle

把 native executor skill placement 从“一次性 copy”升级为可诊断、可同步、
可退役的 managed projection 生命周期。

- 默认投影目录名改为 `aiworker-*` managed namespace，例如
  `.agents/skills/aiworker-kernel-brain-admission/SKILL.md`。
- `aiworker init --soul <id>` 现在写
  `.aiworker/native-skill-projections.json`，记录 logical id、engine、target、
  source hash/version、last applied hash 与 projection status。
- 新增 `aiworker brain skills sync-native`（root / worker namespace 双入口），
  默认 dry-run；`--apply` 可安全 create/update/deprecate，并拒绝静默覆盖 drifted
  operator edits。
- `doctor`、`brain status`、`brain skills` 现在报告 managed projection lifecycle：
  missing、outdated、drifted、deprecated、removed、orphaned。
- project-scope `brain-skill-add` admission apply 继续写 executor-native
  `SKILL.md`，同时更新 projection manifest，保留来源与 hash 证据。
- 验证通过：focused fs-layout / CLI planner / admission / init / doctor /
  validation / CLI registration tests，`bun run typecheck`，`bun run lint`，
  `bun run test`，`bun run build`，`git diff --check`。

## 2026-05-08 17:53 [completed] REFACTOR-024 / PLAN-169 — Native executor skill placement

将 Project Brain 默认 skill 物化从 `.aiworker/skills/` 收敛到 executor 原生
project skill 目录，避免 AIWorker 在 Codex / Claude Code 前面再实现一层 prompt
skill runtime。

- `aiworker init --soul <id>` 现在默认写 `.agents/skills/aiworker-*/SKILL.md`
  与 `.claude/skills/aiworker-*/SKILL.md`，不再创建 project `.aiworker/skills/`
  作为主路径。
- `ContextManager` / orchestrator 对 `codex`、`claude-code` 禁用 fallback brain
  skill 摘要和 `skill_load` prompt 注入；unsupported engine 仍可使用显式
  `.aiworker/skills/` fallback。
- `brain-skill-add` admission 在 project scope 下 apply 到 native executor skill
  targets；fallback scope 仍写 `<brainHome>/skills/<id>/SKILL.md`。
- `doctor` / `brain status` / `brain skills` 现在显式区分 native executor project
  skills 与 fallback Brain prompt skills。

## 2026-05-08 02:08 [completed] REL-027 / PLAN-168 — 发布 aiworker CLI 0.10.3

发布 `@zonease/aiworker-cli@0.10.3`，包含 0.10.2 之后的 Project Brain
布局收敛、worker 入网配置引导和 README 用户定位更新。

- 本地 release gate 通过：frozen install、typecheck、lint、test、build、
  CLI run/fleet smoke、dist version、`git diff --check` 和 publish dry-run pack
  stage。
- `main` 与 annotated tag `v0.10.3` 已推送；GitHub Actions release run
  `25513697854` 成功，npm latest 已更新到 `0.10.3`，GitHub Release 上传四个
  binary assets。
- 发布包 `cli-release-local` compact harness 最终通过：developer/codex 与
  general-assistant/claude-code 共 80 PASS / 0 FAIL / 0 SKIPPED。
- 验证中发现两个测试流程注意点：debug root 不应放在已有 `.aiworker` 的父目录下；
  macOS 上应使用 `/private/tmp` 真实路径，避免 `/tmp` symlink 造成 evidence path
  字符串比较假失败。

## 2026-05-08 02:17 [completed] TODO-042 / PLAN-167 — README refresh from current CLI onboarding behavior

Fed the latest CLI onboarding behavior back into the public README files.

- README quickstart now says `aiworker up` initializes, validates, checks
  executor readiness, and serves; it no longer claims to select an executor.
- Added compact CLI discovery guidance for short root help, full command index,
  and scoped worker/fleet/gateway help.
- Clarified first initialization writes the master key to worker-local `.env`
  rather than implying every first run writes `~/.aiworker/.env`.
- Documented that new `.env` files reserve commented gateway enrollment examples
  and that `aiworker doctor` reports standalone/configured enrollment.
- Synced Chinese README status facts with the current 0.10.2 baseline and
  800+ Governance Kernel harness checks.
- Added target-audience sections for who should use AIWorker, replaced the
  compact topology diagram with a wider two-view layout, and removed README
  wording that exposed internal workflow names instead of user-facing guidance.
- Removed the regression harness script from the public "More" entry points,
  rewrote status rows around capability readiness, and localized the Chinese
  topology/status wording.

## 2026-05-08 01:46 [completed] TODO-041 / PLAN-166 — Gateway enrollment hints in init dotenv and doctor

Made optional gateway enrollment discoverable without adding interactive init
questions.

- Newly minted worker-local `.env` files now reserve commented examples for
  `AIWORKER_GATEWAY_URL` and `AIWORKER_DISPLAY_NAME`, plus the recommended
  `aiworker env ...` shortcuts.
- The examples stay commented when unset, so they do not populate `process.env`
  or trigger runtime validation as empty configured values.
- `aiworker doctor` now reports gateway enrollment as standalone/configured with
  INFO/PASS guidance, while keeping standalone mode valid.
- Doctor does not print the configured gateway URL value, avoiding accidental
  basicauth leakage.

## 2026-05-08 01:06 [completed] TODO-040 / PLAN-165 — Progressive CLI help and worker env shortcuts

Simplified the first CLI screen and removed manual `.env` editing from worker
gateway enrollment onboarding.

- `aiworker --help` now shows a short first-run path, common inspection
  commands, and discovery pointers instead of expanding the full command tree.
- `aiworker commands` now prints the complete worker/fleet/gateway command
  index, while `aiworker worker --help`, `aiworker fleet --help`, and
  `aiworker gateway --help` keep scoped discovery available.
- Added worker-local startup env shortcuts:
  `aiworker env gateway-url <url>` and `aiworker env display-name <name>`,
  plus the equivalent `aiworker worker env ...` forms.
- The new env shortcuts require an initialized worker-local `.env`, validate
  gateway URL / display name input, and update only allowlisted startup env
  keys.
- README and CLI docs now use the shortcuts for OTP enrollment instead of
  asking users to append env lines by hand.

## 2026-05-08 00:16 [completed] REFACTOR-023 / PLAN-164 — Simplify Project Brain filesystem layout

Collapsed the project-scope Brain authoring surface so a new worker no longer
teaches stale split concepts.

- Project init now seeds `SOUL.md`, `USER.md`, `MEMORY.md`, `ROLLUP.md`,
  `policy.json`, `brain-capabilities.json`, `executor-capabilities.json`,
  `skills/`, `memories/`, and `local/`; it no longer seeds project `AGENT.md`,
  `toolsets.json`, `capability-packs.json`, or Brain `mcp.json`.
- `brain-capabilities.json` is the single Brain-side capability draft manifest
  for default toolsets, Brain capability packs, and Brain MCP descriptors.
- The shared schema surface no longer exports standalone toolset or capability
  pack manifest schemas, and pack validation now uses the current structured
  validation result instead of legacy string statuses.
- Runtime capability discovery, Brain brief/system prompt composition, doctor
  validation, up validation, scope/status output, Soul preset materialization,
  architecture docs, CLI docs, and focused tests were updated together.
- Executor overlay remains separate in `executor-capabilities.json`; this
  change does not make AIWorker own executor-native MCP/skill/plugin effective
  state.

Verification passed: focused shared/fs-layout/core/CLI tests, `bun run
typecheck`, `bun run lint`, `bun run test`, `bun run build`, and `git diff
--check`.

## 2026-05-07 23:36 [completed] TODO-039 / PLAN-163 — README product positioning clarity

Moved AIWorker's customer-facing reason to the top of the README in both
English and Chinese.

- The README now says AIWorker is not a smarter coding assistant or a new
  executor platform.
- It frames the product as a way to turn existing external executors into
  durable, scope-bound, governed business workers.
- The stated competitive surface is Project Brain ownership, governed
  self-iteration, bring-your-own executor integration, and Worker/Fleet
  operations.

## 2026-05-07 23:28 [completed] REL-026 / PLAN-162 — publish CLI 0.10.2

Published `@zonease/aiworker-cli@0.10.2` as a patch release for Worker Admin Web
polish after the 0.10.1 production baseline.

- Release scope contains BUG-088 (Worker Admin Chat no longer renders the final
  assistant reply twice after persisted messages refresh) and BUG-089 (Worker
  Config save controls no longer float outside the content width).
- No Brain / executor runtime code is changed in this release.
- Validation target is standard release gate plus published-package metadata
  and package smoke, with 0.10.1's full Governance Kernel matrix remaining the
  runtime baseline.
- Local release gates passed through frozen install, typecheck, lint, test,
  build, CLI run/fleet smoke, dist version checks, `git diff --check`, and
  publish dry-run pack stage. Publish dry-run packed 32 files / 3.1 MB and
  stopped at the expected local npm authentication boundary.
- Release commit `268c87f` and annotated tag `v0.10.2` were pushed. GitHub
  Actions release run `25505262025` passed in 2m11s, publishing npm and four
  GitHub Release binary assets.
- npm latest resolves to `0.10.2`; explicit
  `bunx @zonease/aiworker-cli@0.10.2 --version` reports `aiworker/0.10.2`.
- Non-blocking release workflow annotation: `softprops/action-gh-release@v2`
  still runs on Node.js 20 and should be updated before GitHub Actions forces
  Node.js 24 by default.

## 2026-05-07 17:10 [completed] BUG-088 / PLAN-161 — Worker Admin Chat final reply de-duplication

Fixed Worker Admin Chat's duplicate final assistant rendering and softened the
chat background:

- The Chat panel now records the message ids present when a send starts and
  hides the local streaming preview only after a matching new persisted
  assistant message appears.
- Live streaming remains visible while the transcript query is stale, and older
  same-content assistant messages do not suppress the current stream.
- The message area now uses a soft-stone bordered admin canvas; assistant
  bubbles stay deep green and user/composer surfaces stay white.
- Added a focused regression test for the persisted-message-plus-streaming
  preview case.

Verification passed: focused Worker Chat test, Web typecheck, Web lint, Web
build, and `git diff --check`.

## 2026-05-07 16:09 [completed] REL-025 / PLAN-160 / QA-021 — publish CLI 0.10.1

Published `@zonease/aiworker-cli@0.10.1` as the patch release that ships
BUG-087's executor timeout budget fix and closes the published-package full
matrix gap.

- Release scope is intentionally narrow: version metadata, README latest,
  release docs, tag-triggered publish, and published-package validation.
- The code fix is already on `main`: `executor select --timeout-ms` persists
  `executor.overrides.timeoutMs`, and the Governance Kernel harness aligns the
  selected executor hard timeout with its per-turn budget.
- The missing production evidence is the published package path. After release,
  validation should run `cli-release-local --matrix full`, not only compact.
- Local release gates passed through frozen install, typecheck, lint, test,
  build, CLI run/fleet smoke, dist version checks, `git diff --check`, and
  publish dry-run pack stage. Publish dry-run packed 32 files / 3.1 MB and
  stopped at the expected local npm authentication boundary.
- Release commit `c82dc45` and annotated tag `v0.10.1` were pushed. GitHub
  Actions release run `25482320641` passed in 2m13s, publishing npm and four
  GitHub Release binary assets.
- npm latest resolves to `0.10.1`; explicit
  `bunx @zonease/aiworker-cli@0.10.1 --version` reports `aiworker/0.10.1`.
- Published-package full Governance Kernel matrix passed against 0.10.1:
  400 PASS / 0 FAIL / 0 SKIPPED. The two BUG-087 risk pairs
  (`hr-recruiting-codex`, `finance-ops-codex`) both passed on the published
  package path.

## 2026-05-07 14:11 [completed] QA-020 / BUG-087 / PLAN-158 / PLAN-159 — source full matrix after CLI 0.10.0

Closed the source-local production validation gap after publishing 0.10.0.

- Ran the full 5 Soul × 2 executor Governance Kernel matrix after the
  file-first Brain Skill admission work. The first run found a real timeout
  mismatch: two Codex turns hit the executor adapter's 120s hard cap even
  though the harness outer turn budget was 240s.
- Added `aiworker executor select --timeout-ms` and the matching
  `worker executor select` alias. The option persists
  `executor.overrides.timeoutMs`, which the Codex / Claude Code adapters
  already consume.
- Updated the harness to set executor timeout to its per-turn budget when
  selecting Codex / Claude Code for each pair.
- Final full source matrix passed: 400 PASS / 0 FAIL / 0 SKIPPED.

Verification passed: focused executor select test, CLI full test, CLI
typecheck, full typecheck, harness help, final full source matrix, and
`git diff --check`.

## 2026-05-07 12:52 [completed] REL-024 / PLAN-157 / QA-019 — publish CLI 0.10.0

Published `@zonease/aiworker-cli@0.10.0` for the lightweight Project Brain
production path.

- Release scope includes file-first Soul/Brain Skill packs, runtime
  `SKILL.md` body loading, runtime memory search context loading,
  `brain-skill-add` admission materialization, Cohere Web UI redesign, and
  Brain Skill admission harness evidence.
- Version metadata updated from `0.9.7` to `0.10.0`; README latest updated.
- Local release gates passed: frozen install, typecheck, lint, test, build,
  CLI run/fleet smoke, dist version checks, built CLI `--version`,
  `git diff --check`, and publish dry-run pack stage. Publish dry-run stopped
  at the expected local npm authentication boundary; formal publish completed
  through the tag-triggered GitHub Actions release workflow.
- GitHub Actions release run `25476431319` completed successfully; npm latest
  resolves to `0.10.0`; GitHub Release `v0.10.0` is live with four binary
  assets.
- Published-package compact Governance Kernel harness passed against
  `@zonease/aiworker-cli@0.10.0`: 80 PASS / 0 FAIL / 0 SKIPPED, including
  Brain Skill admission materialization, serve restart continuity, REST auth
  boundary, and both compact executor pairs.

## 2026-05-07 11:34 [completed] TODO-038 / PLAN-156 — Harness brain-skill-add admission roundtrip evidence

Raised the new Brain Skill materializer from focused-test confidence to
repeatable black-box governance evidence.

- Extended `scripts/governance-kernel-harness.ts` with a deterministic
  `brain-skill-add` fixture per compact pair.
- The harness now verifies propose / approve / apply, canonical
  `.aiworker/skills/<skillId>/SKILL.md` materialization, DB transitions, and
  post-apply `aiworker doctor` acceptance.
- Recorded QA-018 source-local compact evidence: 80 PASS / 0 FAIL / 0 SKIPPED.
- Updated governance status so the positive admission invariant covers both
  `memory-add` and `brain-skill-add`.

Verification passed: `bun scripts/governance-kernel-harness.ts --help`, full
check, compact source-local governance harness, full test, build, and
`git diff --check`.

## 2026-05-07 11:19 [completed] REFACTOR-022 / PLAN-155 — Brain Skill admission materializer

Closed the next self-iteration gap in the file-first Project Brain direction:
approved Brain Skill proposals can now become governed `SKILL.md` files.

- Added `brainAdmissionSkillAddPayloadSchema` and expanded materialized
  proposal kinds to include `brain-skill-add`.
- Brain admission apply now supports dry-run and commit for
  `.aiworker/skills/<skillId>/SKILL.md`, validating SKILL.md frontmatter and
  requiring frontmatter id to match the payload skill id.
- Commit keeps no-overwrite as the default, allows explicit overwrite via
  payload, and reuses the existing secret body policy before writing.
- `policy-update` remains explicitly unsupported so policy mutation can be
  handled by a separate materializer with JSON merge/validation semantics.

Verification passed: focused shared/core/CLI admission tests, full check, full
test, build, and `git diff --check`.

## 2026-05-07 11:10 [completed] REFACTOR-021 / PLAN-154 — Runtime Brain Memory search context

Closed the next observe-only Project Brain runtime gap: selected memory search
is now executed and projected into the executor turn context.

- Added bounded `ContextManager.searchMemories()` and a `Loaded brain memories`
  prompt section for matched Project Brain memory snippets.
- Orchestrator now executes `memory_search` before executor dispatch, reuses
  loaded memory context on context-overflow retry, and keeps executor dispatch
  non-blocking if memory search fails.
- Capability decisions now report loaded memory ids/count and search errors;
  mode is enforced when any skill body or memory snippet is actually injected.
- Architecture and governance status now state the current boundary: memory
  search is executed, but ranking quality remains provider-specific and not a
  hard-coded Brain workflow.

Verification passed: focused core orchestrator tests, core typecheck, full
check, full test, build.

## 2026-05-07 11:04 [completed] REFACTOR-020 / PLAN-153 — Runtime Brain Skill body loading

Closed the most important Project Brain runtime gap from the lightweight
Brain direction: selected Brain Skills are now real turn context, not only
metadata hints.

- Added optional `BrainProvider.loadSkill(id)` and `BrainSkillBody`, implemented
  by filesystem and multi-source Brain providers.
- Filesystem Brain skills now retain frontmatter-stripped `SKILL.md` bodies
  behind stable scan-derived ids, avoiding path-derived access.
- Orchestrator context assembly loads selected skill bodies when `load_skill`
  is chosen, appends bounded skill bodies to the executor system prompt, and
  preserves the loaded context across context-overflow retry.
- Capability decisions now report loaded skill ids/count and load errors; the
  decision is marked enforced only when bodies were actually loaded.
- Updated architecture/status docs and CLI doctor tests to reflect seeded
  Soul brain skills and the implemented `load_skill` path.

Verification passed: focused core/shared tests, focused CLI doctor test, full
typecheck, lint, full test, build, check.

## 2026-05-07 10:47 [completed] REFACTOR-019 / PLAN-152 — Worker 生命周期与 Brain-Executor 实现反查

将当前 worker 产品形态和 Brain-Executor 边界落到架构文档，并反查源码是否一致：

- `docs/architecture.md` 新增 `init → up → serve` 生命周期、Brain/Executor
  runtime loop sequence，以及逐项代码符合度表。
- `docs/governance-node-status.md` 新增 worker lifecycle、file-first Brain skill
  surface、Brain-to-executor handoff 的 current-source 结论。
- 明确剩余偏差：runtime 目前只注入 brain skill 名称/描述，没有实际 `load_skill`
  body 装载路径；admission materializer 只支持 `memory-add`。
- 修正 admission schema 注释，使非 `memory-add` proposal 的 unsupported/failed
  行为与当前 service 实现一致。

Verification passed: `git diff --check` and focused shared admission schema
test.

## 2026-05-07 10:04 [completed] REFACTOR-017 / PLAN-150 — Cohere 设计语言 Web UI 全面切换

将 Fleet 与 Worker Web UI 从旧高对比控制台视觉切换到新版 `DESIGN.md` 的
Cohere 风格运营界面：

- 重写 Web token 与 shared primitives：near-black pill actions、薄规则、
  soft stone surfaces、深绿状态 band、8px 卡片半径、无默认重阴影和统一 focus。
- 重构 Fleet / Worker app shell 为顶栏导航 + 白色 canvas，Worker 保留深绿状态
  band；锁定态改为表单卡片。
- Sweep Fleet workers/enroll/audit/presence/worker detail 与 Worker
  overview/brain/config/secrets/test/cron/approvals/chat 主要页面、表单、表格、
  empty/loading/error/dialog 状态。
- 更新 responsive tests，并修正 Vite Markdown text import 以兼容 Brain Skill
  Pack 的 `.md?import` 引入。

Verification passed: web typecheck, lint, test, build, `git diff --check`, and
desktop/mobile screenshot audit under `tmp/webui-cohere-screenshots/`.

## 2026-05-07 09:45 [completed] REFACTOR-018 / PLAN-151 — Soul-initialized Brain Skill Packs

Continued the OD-style lightweight Brain direction by making brain skills a
file-first pack surface initialized from kernel + Soul source:

- Added `BrainSkillPack` loader and built-in `SKILL.md` packs for kernel
  governance (`brain-admission`, `executor-quality-review`) plus one default
  pack per built-in Soul.
- `aiworker init --soul <id>` now seeds `.aiworker/skills/<id>/SKILL.md`
  without overwriting existing operator-edited skill files.
- Filesystem runtime and doctor validation now treat `SKILL.md` as the skill
  entrypoint and ignore Markdown sidecars under `references/` or `assets/`.
- Runtime `BrainSkill.id` is now a stable project-relative skill id instead
  of an absolute filesystem path.

Verification passed: shared tests, fs-layout tests, core filesystem scanner
tests, focused CLI tests, full typecheck, lint, CLI bundle, and
`git diff --check`.

## 2026-05-07 02:04 [completed] REFACTOR-016 / PLAN-149 — File-first Soul and Brain Pack authoring

Continued the lightweight Brain direction by moving built-in Soul authoring
from TypeScript literals into open-design-style Markdown packs:

- Added `packages/shared/src/soul/packs/<id>/SOUL.md` and `AGENT.md` for all
  9 built-in Souls. `SOUL.md` uses YAML frontmatter for `SoulModule` structure
  and Markdown body for LLM-facing Soul semantics.
- Added the Soul Pack loader in `@zonease/aiworker-shared`; `BUILTIN_SOUL_MODULES`
  is now derived from pack loader output, while existing registry/doctor/brief
  consumers keep using the structured `SoulModule` contract.
- `aiworker init --soul <id>` now materializes pack-authored `SOUL.md` /
  `AGENT.md` instead of assembling built-in persona docs from TS strings.
- `BrainBriefCompiler` strips Markdown frontmatter before projecting canonical
  docs into executor context, so structured pack metadata does not pollute the
  LLM-facing brief.
- Architecture docs now name Soul Pack as the authoring surface and state that
  new Soul semantics should go into Markdown packs, not TS/JSON registries.

Verification passed: shared tests, CLI tests, core tests, full typecheck,
CLI bundle, lint, and `git diff --check`.

## 2026-05-07 01:17 [completed] REL-023 / PLAN-148 — 发布 aiworker CLI 0.9.7

发布 `@zonease/aiworker-cli@0.9.7`，作为 0.9.6 之后的 patch release，
交付 worker-only Governance Kernel harness 收敛：

- `TODO-037 / PLAN-147`：Governance Kernel harness 新增 `aiworker serve`
  进程重启连续性断言；REST turn 1 成功后停止 serve，等待 `/health`
  下线，重启同一 project/port，再继续同一 conversation id。
- 本地 release gates 通过：install、typecheck、lint、test、build、CLI run/fleet
  smoke、dist version、built CLI `--version`、`git diff --check`、publish dry-run
  pack 阶段。
- `chore(release): 发布 CLI 0.9.7` 已推送到 `main`，annotated tag `v0.9.7`
  已推送；GitHub Actions release workflow `25450306828` 成功。
- 外部验证通过：npm latest 为 `0.9.7`，指定版本 `bunx` 返回
  `aiworker/0.9.7 ...`，GitHub Release `v0.9.7` 非 draft / 非 prerelease
  且上传 4 个平台 binary。
- 发布包 `cli-release-local` compact harness 验证通过：
  `tmp/governance-kernel-0.9.7-cli`，72 PASS / 0 FAIL / 0 SKIPPED。

## 2026-05-07 01:12 [completed] TODO-037 / PLAN-147 — Serve process restart continuity harness

Closed the remaining worker-only Governance Kernel harness gap around
`aiworker serve` process restart between REST turns:

- `scripts/governance-kernel-harness.ts` now stops the active `serve` process
  after REST turn 1, waits for `/health` to go down, relaunches `serve` on
  the same project/port, and then continues the same conversation id.
- Added one explicit check per compact pair:
  `REST serve restart continuity setup`.
- `docs/governance-node-status.md` now marks serve process restart between
  REST turns as conforming in source and removes it from residual risks.
- Validation passed: `--help`, lint, Bun bundle check, and source-local
  compact Governance Kernel harness
  (`tmp/governance-kernel-plan147-source`, 72 PASS / 0 FAIL / 0 SKIPPED).

## 2026-05-07 00:49 [completed] REL-022 / PLAN-146 — 发布 aiworker CLI 0.9.6

准备发布 `@zonease/aiworker-cli@0.9.6`，作为 0.9.5 之后的 patch release，
交付 worker-only Brain Governance Kernel 收敛：

- `TODO-036 / PLAN-144`：Governance Kernel harness 新增同一 worker 内跨
  `chat-id` conversation isolation DB check。
- `BUG-086 / PLAN-145`：`claude-code/default` 不再强制 `--model sonnet`，
  默认模型/provider routing 回到外部 Claude Code CLI；显式 `model` /
  `modelId` 仍作为 best-effort hint 转发。
- 本地 release gates 通过：install、typecheck、lint、test、build、CLI run/fleet
  smoke、dist version、built CLI `--version`、`git diff --check`、publish dry-run
  pack 阶段。
- `chore(release): 发布 CLI 0.9.6` 已推送到 `main`，annotated tag `v0.9.6`
  已推送；GitHub Actions release workflow `25449077642` 成功。
- 外部验证通过：npm latest 为 `0.9.6`，指定版本 `bunx` 返回
  `aiworker/0.9.6 ...`，GitHub Release `v0.9.6` 非 draft / 非 prerelease
  且上传 4 个平台 binary。

## 2026-05-07 00:30 [completed] TODO-036 / PLAN-144 + BUG-086 / PLAN-145 — Worker governance harness isolation and executor-owned Claude model

Continued the lightweight Brain direction by improving verification rather
than adding Brain domain logic:

- Governance Kernel harness now creates an alternate `chat-id` per pair and
  asserts primary/alternate conversation separation directly in `worker.db`.
- Fixed a source compact failure where `claude-code/default` forced
  `--model sonnet`; Claude Code default now leaves model/provider routing to
  the external CLI unless the operator explicitly configures a model hint.
- Worker Admin copy and executor engine docs now describe Claude Code default
  as CLI-owned instead of Sonnet-owned.
- Verification passed: focused executor profile tests, Claude Code adapter
  tests, repository lint/typecheck/test, and source compact Governance Kernel
  harness (`tmp/governance-kernel-plan144-source-3`, 70 PASS / 0 FAIL).

## 2026-05-06 23:55 [completed] BUG-085 / PLAN-143 — Pre-compaction memory through admission

Closed the last known generated durable Brain memory bypass in session
compaction:

- `runPreCompactionMemoryFlush()` now creates a deterministic pending
  `memory-add` admission proposal instead of calling
  `BrainProvider.writeMemory()` directly.
- Compaction audit/session metadata records `status='proposed'` and the
  proposal id; duplicate proposal ids become `already-proposed` without
  blocking compaction.
- Architecture, CLI, and governance status docs now state the same boundary:
  generated runtime memory is proposed first and only becomes canonical memory
  through Brain admission.
- Verification passed: focused orchestrator history test, admission service
  test, core package test/typecheck, repository lint, and `git diff --check`.

## 2026-05-06 14:59 [completed] BUG-084 / PLAN-142 — Docker image gateway path correction

Fixed the stale Docker image gateway path after the gateway package move from
`apps/gateway` to `packages/gateway`:

- Dockerfile now copies `packages/gateway/package.json` in the dependency layer
  and `/app/packages/gateway` into the runtime image.
- Compose now starts gateway with `bun packages/gateway/src/index.ts`.
- Current gateway/deployment/architecture docs now reference
  `packages/gateway`; historical plan/changelog facts were left unchanged.
- Fix commit `7c6f0ca` pushed to `main`; GitHub Actions `build-image`
  workflow `25443020176` succeeded, including both slim and full image
  build/push; `lint` workflow `25443020173` succeeded.

## 2026-05-06 14:46 [completed] REL-021 / PLAN-141 — 发布 aiworker CLI 0.9.5

发布 `@zonease/aiworker-cli@0.9.5`，作为 0.9.4 之后的 patch release，
交付 fleet-hosted Worker Admin Brain bridge 修复：

- `BUG-082 / PLAN-140`：gateway worker bridge 显式支持 Worker Admin Brain
  页面使用的 `brain.summary`、`brain.admission.*` 与 `brain.artifacts.*`
  路径，保持 allowlist bridge，不引入通用 proxy。
- `BUG-083`：fleet-hosted chat continuation bridge 问题仅补 PMA backlog
  文档，未进入本次修复范围。
- Release commit `01372c8` + annotated tag `v0.9.5` 已 push；GitHub Actions
  release workflow `25442359652` 全绿；npm latest 已是 `0.9.5`；GitHub
  Release `v0.9.5` 非 draft / 非 prerelease，4 个平台 binary 全 uploaded。

## 2026-05-06 14:29 [completed] BUG-082 / PLAN-140 — Fleet-hosted Worker Admin Brain bridge routes

Fixed the fleet-hosted Worker Admin Brain page bridge gap. Gateway now maps the
Brain governance routes used by Worker Admin to explicit node RPC methods
instead of rejecting them as unsupported bridge paths:

- `brain.summary`
- `brain.admission.{list,show,approve,reject,apply}`
- `brain.artifacts.{list,show}`

The fix keeps the narrow gateway bridge model: no generic worker HTTP proxy was
introduced, `/w/:workerId/api/worker/*` remains guarded by worker bearer auth,
and Brain proposal/artifact data remains in worker-owned storage.

Verification passed: gateway worker bridge regression, worker node dispatcher
regression, focused proto/core/gateway/cli typechecks, repository lint, and
`git diff --check`.

## 2026-05-06 14:07 [completed] REL-020 / PLAN-139 — 发布 aiworker CLI 0.9.4

发布 `@zonease/aiworker-cli@0.9.4`，作为 0.9.3 之后的 patch release，
交付远端 fleet Worker Admin hotfix：

- `BUG-079 / PLAN-136`：恢复 public Caddy `/w*` route。
- `BUG-080 / PLAN-137`：允许 approved OTP worker 在 `/enroll-ws` 使用
  registered worker token 重连。
- `BUG-081 / PLAN-138`：`/w/:workerId/api/worker/*` 由 gateway worker bearer
  token 校验，Caddy 不再对 `/w*` 做 Basic Auth。
- Release commit `2026988` + annotated tag `v0.9.4` 已 push；GitHub Actions
  release workflow `25440741823` 全绿；npm latest 已是 `0.9.4`；GitHub
  Release `v0.9.4` 非 draft / 非 prerelease，4 个平台 binary 全 uploaded。

## 2026-05-06 13:58 [completed] BUG-081 / PLAN-138 — `/w/*` uses worker bearer auth, not Caddy Basic Auth

Fixed fleet-hosted Worker Admin authentication:

- Caddy no longer applies Basic Auth to `/w*`; `/admin*` and `/ws` remain
  protected by Caddy Basic Auth.
- Gateway now validates `Authorization: Bearer <worker token>` before
  forwarding any `/w/:workerId/api/worker/*` bridge request.
- Gateway decrypts the registered worker token from `registered_workers` and
  compares it in constant time; missing or wrong bearer returns `401` before
  any node RPC is sent.
- Production `https://aiw.jbcnet.co.jp/w/w_8jbcm249cxn4/` now returns the
  Worker Admin shell without a Caddy login prompt; the API bridge without
  bearer returns gateway `401` with `WWW-Authenticate: Bearer`; the stored
  worker token returns `200`.

## 2026-05-06 13:46 [completed] BUG-080 / PLAN-137 — OTP worker reconnect on `/enroll-ws`

Fixed the approved OTP worker reconnect path without reopening public `/ws`:

- Gateway now accepts a plain node reconnect on `/enroll-ws` only for workers
  already stored in `registered_workers` with `added_by='otp'` and a matching
  encrypted worker token.
- OTP submit behavior is unchanged; unknown, missing-token, or wrong-token
  node reconnects on `/enroll-ws` remain rejected.
- Remote `aiwork` gateway bundle was backed up, replaced with the fixed
  `aiworker-bun.js`, and restarted.
- Production audit now records `gateway.connect.accepted` for
  `w_8jbcm249cxn4` via `registered-worker-token`; direct gateway bridge
  `/w/w_8jbcm249cxn4/api/worker/info` returns `200`.
- At completion time, public `/w/w_8jbcm249cxn4/api/worker/info` returned
  Caddy Basic Auth `401`, confirming the restored `/w*` route no longer fell
  through to `404`; `BUG-081` later moved `/w*` auth to gateway worker bearer
  validation.

## 2026-05-06 13:32 [completed] BUG-079 / PLAN-136 — Public Caddy `/w/*` ingress restored

Restored the public Caddy route for fleet-hosted Worker UI:

- `ops/caddy/Caddyfile.tmpl` gained `/admin*` and `/w*` handlers before `/ws`,
  while keeping `/enroll-ws` unauthenticated for OTP enrollment. `BUG-081`
  later removed Caddy Basic Auth from `/w*` and moved that boundary to gateway
  worker bearer validation.
- Production `/etc/caddy/Caddyfile` on `aiwork` was backed up, patched, passed
  `caddy validate`, and reloaded with Caddy still active.
- At completion time, public unauthenticated `/w/w_8jbcm249cxn4/` and
  `/w/w_8jbcm249cxn4/api/worker/info` returned Caddy Basic Auth `401`
  instead of the previous fallback `404`; direct gateway `/w/...` still served
  the Worker UI shell. `BUG-081` superseded this external auth decision.
- Follow-up `BUG-080 / PLAN-137` records the independent OTP reconnect issue:
  the approved worker reconnects to `/enroll-ws` as a plain node and gateway
  rejects it with `wrong_path:expected_enroll_otp`.

## 2026-05-06 12:47 [completed] REL-019 / PLAN-135 — 发布 aiworker CLI 0.9.3

发布 `@zonease/aiworker-cli@0.9.3`，作为 0.9.2 之后的 patch release，
交付 worker-local gateway enrollment env 持久化：

- `AIWORKER_GATEWAY_URL` / `AIWORKER_JOIN_TOKEN` / `AIWORKER_DISPLAY_NAME` /
  `AIWORKER_ENROLL_MODE` 可从当前 scope 的 `.env` 加载。
- 显式进程 env 中的上述 worker 入网启动项会合并回 worker-local `.env`，
  让一次性 export 可以固化到对应 worker，避免同一主机多 worker 串配置。
- project scope 明确以 `<project>/.aiworker/local` 作为 worker runtime state
  root；共享 Project Brain 仍在 `<project>/.aiworker/`。
- `config.yaml` 仍是 redacted worker config advisory mirror，不承载 gateway
  enrollment token / startup secret。
- Release commit `93692ea` + annotated tag `v0.9.3` 已 push；GitHub Actions
  release workflow `25436040503` 全绿；npm latest 已是 `0.9.3`；GitHub
  Release `v0.9.3` 非 draft / 非 prerelease，4 个平台 binary 全 uploaded。

## 2026-05-06 10:08 [completed] TODO-035 / PLAN-133 / QA-015 — Long-running serve multi-turn REST regression

扩展 `scripts/governance-kernel-harness.ts` 的 `restSmoke` 块，按对在
长驻 `aiworker serve` 进程内增加 4 项 multi-turn REST 检查：

- **unauth boundary**：不带 bearer 的 `POST /api/worker/orchestrator/tasks`
  必须返回 401。
- **submit**：带 bearer 的 `POST /tasks` 返回 201；orchestrator 异步把
  `agent_tasks.status` 推到 `'succeeded'`，conversation 行落 worker.db。
- **continue**：`POST /conversations/:id/messages` 在同一 conversation id
  上继续，第二个 task 也走到 `'succeeded'`，conversation id 保持一致。
- **messages**：`GET /conversations/:id/messages` 返回 ≥4 条（两 user +
  两 assistant）。

这把 admission / conversation / chat-id 连续性的回归覆盖从 per-turn
`aiworker run` CLI 扩展到生产面 long-running `serve` REST，封堵
BUG-035 / BUG-043 / BUG-044 同类回归路径。source-local compact 两对全部
通过；证据落 QA-015。

## 2026-05-06 09:54 [completed] REL-018 / PLAN-132 — 发布 aiworker CLI 0.9.2

发布 `@zonease/aiworker-cli@0.9.2`，作为 0.9.1 之后的 patch release，
标记 Brain Governance Kernel 回归 harness 在源码与已发布 CLI 双侧的
full 5×2 matrix 证据完成节点。

- 包含 PLAN-128 / PLAN-129 / PLAN-130 / PLAN-131 与对应 QA-011 / QA-012 /
  QA-013 / QA-014 的 harness 扩展和评估证据。
- 发布 `docs/governance-node-status.md` 作为 Project Brain governance node
  的最终评估报告（conformance 表 + 残留边界 + 证据目录）。
- **不修改产品代码**：`apps/`、`packages/`、`drizzle/` 都未变更，0.9.2 与
  0.9.1 在产品行为上等价。本次 release 是 "regression-coverage milestone"，
  不是产品行为升级。

## 2026-05-06 09:46 [completed] TODO-034 / PLAN-131 / QA-014 — Soul-agnostic Governance Kernel full 5×2 matrix on cli-release-local

`cli-release-local --version 0.9.1 --matrix full` 跑完 5 Soul × 2 executor
共 10 对，每对 30 项 source-backed 检查，总计 300 PASS / 0 FAIL / 0 SKIPPED。

- 证据根目录：`/home/ben/projects/debug-aiworker/qa-2026-05-06-governance-full-cli`。
- Soul-agnostic Brain Governance Kernel 现在在源码（QA-013）与已发布
  `@zonease/aiworker-cli@0.9.1`（QA-014）两侧都有 full-matrix 证据。
- `docs/governance-node-status.md` 同步把 Soul-agnostic 行升级为
  "conforming on source + published"。

## 2026-05-06 09:01 [completed] TODO-033 / PLAN-130 / QA-013 — Soul-agnostic Governance Kernel full 5×2 matrix evidence

`worker-source-local --matrix full` 一次性跑完 5 Soul × 2 executor 共 10 对，
每对 30 项 source-backed 检查，总计 300 PASS / 0 FAIL / 0 SKIPPED。覆盖
chat-id 连续性、admission 三态（pending → approved → applied、
pending → rejected、approved → blocked-by-secret-scan）、canonical memory
边界、decision truthfulness、risk-policy、tool-call observability、
REST/SSE 鉴权与 Worker Admin mount。

- 证据根目录：`/home/ben/projects/debug-aiworker/qa-2026-05-06-governance-full`。
- 这是 Soul-agnostic Brain Governance Kernel 最强的源码端证据：每个 Soul
  在每个支持的 executor 上都通过相同的 governance 不变量。
- `docs/governance-node-status.md` 同步登记 Soul-agnostic conformance 行
  与 QA-013 证据指针。

## 2026-05-06 08:14 [completed] TODO-032 / PLAN-129 / QA-012 — Admission negative paths and secret-scan-block coverage

扩展 `scripts/governance-kernel-harness.ts`，按对追加 reject 与 secret-scan-
block 两条 sibling 路径：

- **Reject path**：propose → reject 后验证 `brain_admission_proposals.status='rejected'`、
  `brain_admission_decisions` 写 `'rejected'`、canonical memory 文件不出现。
- **Secret-scan-block path**（BUG-055 回归线）：合成 `apiKey=sk-LIVE-fake...`
  body，propose → approve → apply --commit 在默认 block 策略下退出 1 并返回
  `outcome.kind='blocked-by-secret-scan'`，proposal 维持 `'approved'`，不写
  `'applied'` 决策行，也不写 canonical memory 文件。

source-local 与 cli-release-local 0.9.1 双模式 compact 都通过；证据落
QA-012。

## 2026-05-06 07:45 [completed] TODO-031 / PLAN-128 / QA-011 — Admission positive roundtrip evidence

扩展 `scripts/governance-kernel-harness.ts`，按对运行
`pending → approved → applied` 闭环并校验：

- proposal status 在 DB 中流转为 `approved` 与 `applied`；
- `brain_admission_decisions` 写入 `approved` 与 `applied` 行；
- `apply --commit` 把 canonical memory 写到
  `<projectScope>/.aiworker/memories/<topic>.md` 并向 `MEMORY.md` 追加
  index entry；
- `aiworker brain brief` 的 projection 能读到刚 applied 的 memory；
- pre-apply canonical memory boundary 仍保持空。

source-local 与 cli-release-local 0.9.1 双模式 compact 都通过；证据落
QA-011。本 slice 把"durable Brain mutation 必须走 admission"的正向不变量
从单元测试拓宽到 CLI 端到端回归。

## 2026-05-06 06:58 [completed] QA-010 — Source worker Governance Kernel harness validation

使用新增 `scripts/governance-kernel-harness.ts` 的 `worker-source-local` mode
验证当前源码 worker bundle，证据根目录
`/home/ben/projects/debug-aiworker/qa-2026-05-06-governance-source`。

- Harness 自动执行 source CLI bundle build，被测对象：
  `bun /home/ben/projects/aiworker/apps/cli/dist/aiworker-bun.js`。
- Codex / Claude Code 均可用：`codex-cli 0.128.0`、`claude 2.1.129`。
- Compact matrix 两组均 PASS：developer/codex 与
  general-assistant/claude-code。
- 覆盖 same chat-id continuity、formal admission path、admission claim vs DB、
  canonical memory boundary、decision truthfulness、decision samples 持久化、
  tool-call observability、risk-policy signal、REST auth boundary、OpenAPI、SSE
  与 Worker Admin mount。
- 无 skipped / failed checks；结果已落 `QA-010`。

## 2026-05-06 06:47 [completed] TODO-027 / PLAN-127 / QA-009 — Governance Kernel regression harness

新增 `scripts/governance-kernel-harness.ts`，把 Brain Governance Kernel 的 compact
本地回归验证做成可复跑脚本。默认 `cli-release-local` mode 会隔离安装
`@zonease/aiworker-cli@<version>`，检查 Codex / Claude Code 可用性，跑
developer/codex 与 general-assistant/claude-code 两组真实 same chat-id 多轮
worker 验证，并采集 worker.db、Project Brain filesystem、runtime events、REST、
OpenAPI、SSE 和 Worker Admin mount 证据。

- `aiworker-validate` 的 `cli-release-local` / `worker-source-local` references
  已指向该 harness。
- 发布包验证：`@zonease/aiworker-cli@0.9.1` compact harness run 通过，证据根目录
  `/home/ben/projects/debug-aiworker/qa-2026-05-06-governance-harness-0.9.1-r2`。
- 覆盖项：decision source/mode/evaluator truthfulness、formal admission path、
  admission claim vs DB、canonical memory boundary、same chat-id continuity、
  Codex / Claude Code tool-call observability、risk=high policy signal、REST
  auth boundary、OpenAPI/SSE/Admin smoke。
- 结果已落 `QA-009`；`TODO-027` completed。

## 2026-05-06 05:58 [completed] QA-008 / PLAN-126 — CLI 0.9.1 `cli-release-local` validation recorded

按 canonical `aiworker-validate` 的 `cli-release-local` mode 完成并落盘一次
`@zonease/aiworker-cli@0.9.1` 已发布包本地黑盒验证。产品被测对象是隔离 npm
安装路径下的发布包，不是当前源码 checkout。

- Evidence root:
  `/home/ben/projects/debug-aiworker/qa-2026-05-06-cli-0.9.1`。
- Isolated CLI version:
  `aiworker/0.9.1 linux-x64 node-v24.3.0`。
- `developer` + `codex/default`：fresh init、executor doctor、doctor、
  brain status、single run、8-turn continuity run、DB/filesystem assertions
  全部通过。
- `general-assistant` + `claude-code/default`：fresh init、executor doctor、
  doctor、brain status、single run 全部通过。
- Worker REST/SSE：`runtimeVersion: "0.9.1"`、未授权 info=401、授权 info /
  brain summary / OpenAPI task/conversation/event routes / SSE connection
  验证通过。
- Serve cleanup：进程已退出，端口 `19391` 已释放。
- 未确认新产品缺陷；未修改源码。

## 2026-05-06 04:25 [completed] TODO-030 / PLAN-125 — AIWorker testing skill consolidation

新增 canonical `aiworker-validate` skill，把标准验证入口收口成四个 mode：`fleet-remote`（远端 fleet/gateway/Fleet UI/挂载 worker E2E）、`worker-source-local`（本地源码版本 worker 验证）、`cli-release-local`（本地已发版 CLI 黑盒验证）、`coder-claude-code`（远端 Coder + Claude Code executor 验证）。

删除冗余顶层 skill：`aiworker-test`、`aiworker-test-fleet`、`aiworker-test-worker`、`aiworker-release-debug`、`aiworker-coder-claude-engine` 不再作为 skill 暴露；只保留 `aiworker-validate`。release-debug 的 historical references/templates 已搬到 `aiworker-validate` 的 supporting files 中，仍可按需加载。

按 Claude Code 官方 skill 写法继续收口：保留现有 `.agents/skills` 源目录 + `.claude/skills` 软链布局，不迁移目录；给有副作用的测试入口加 manual invocation frontmatter；`aiworker-validate/SKILL.md` 缩为 mode router、安全边界和 completion checklist，详细流程拆到一层 `references/`。

最终命名收敛为 canonical `aiworker-validate`；新增 `.claude/skills/aiworker-validate` 软链。`aiworker-coder-claude-engine` 不再作为独立 skill 维护，具体 Coder + Claude Code 流程移入 `aiworker-validate/references/coder-claude-code.md`。

## 2026-05-06 04:24 [completed] REL-017 / PLAN-124 — CLI 0.9.1 released

`@zonease/aiworker-cli@0.9.1` patch release 完成，承载 QA-007 / PLAN-123 的 Brain Governance Kernel 后续修复：quality gate control prompt、decision pipeline recent samples 持久化、Claude Code no-tools control calls、Codex tool progress dead-loop、Worker OpenAPI route truthfulness、bypass heuristic 降噪。

- 本地 release gates 全通过：`bun install --frozen-lockfile`、`bun run typecheck`、`bun run lint`、`bun run test`、`bun run build`、CLI run / fleet smoke、dist version checks、`git diff --check`。
- `bun publish --dry-run --access public` 完成 pack 阶段（32 files / 2.73 MB），随后停在本机 npm authentication boundary；正式发布走 tag-triggered GitHub Actions workflow。
- Release commit `a2a86e5 chore(release): 发布 CLI 0.9.1` + annotated tag `v0.9.1` 已 push 到 origin。
- GitHub Actions release workflow run id `25416301967`（job `74548401046`）1m56s 全绿；npm `@zonease/aiworker-cli` `latest=0.9.1` 已上线；GitHub Release `v0.9.1` 已发布（非 draft / 非 prerelease），4 个平台 binary 全部 uploaded（darwin-arm64 23.96 MB / darwin-x64 26.38 MB / linux-arm64 39.66 MB / linux-x64 39.99 MB）。
- `bunx @zonease/aiworker-cli@0.9.1 --version` → `aiworker/0.9.1 linux-x64 node-v24.3.0`。

## 2026-05-06 03:19 [completed] PLAN-123 — BUG-075..078 / TODO-028..029 governance follow-up fixes

- `packages/core/src/worker/executor/engines/claude-code/executor.ts`：suppressed control calls 通过 `AgentRunInput.tools=[]` 投影到 Claude Code no-tool 模式（`--tools ""`、禁 slash commands、strict MCP config、no session persistence），并对 control request 使用 deny policy，避免 conversation classifier / quality gate 继承任务执行面的工具副作用。
- `packages/core/src/worker/orchestrator/{intent-classifier,quality-gate,service}.ts` 与 `packages/core/src/worker/conversation/router.ts`：LLM intent classifier、quality gate、conversation classifier、repair/compaction 等 control calls 显式传空 tool list；quality gate 新增回归覆盖，确认 LLM evaluator 的 user prompt 非空且包含 request + assistant answer。
- `packages/storage-sqlite`：新增 worker migration `0007_solid_bromley.sql` 和 `decision_pipeline_samples` 表；`decision-pipeline-stats.ts` 记录 intent / quality / conversation classifier recent samples 到 worker.db，并让 `brain status` / REST summary 在新进程中读回最近窗口，修复 CLI `run` 后 `recent.samples=0` 的观测缺口。
- `packages/core/src/worker/orchestrator/dead-loop.ts` / `service.ts`：tool result 与 terminal tool lifecycle status 现在重置 dead-loop counter；重复 tool_call 仍会触发 guard，但合法多工具 Codex workflow 不再因已产生 tool progress 而被固定阈值误杀。
- `apps/api/src/modes/worker.ts`：Worker OpenAPI 移除 stale `/api/worker/orchestrator/chat`，补齐实际工作的 `/api/worker/orchestrator/tasks` 与 `/api/worker/orchestrator/conversations{/:id/messages}` 路由。
- `detectAdmissionSuccessClaim()`：bypass heuristic 收窄到高置信 admission / memory mutation success claim，普通 pending proposal 说明不再触发；event payload 增加短脱敏 `claimExcerpt` 便于 operator 诊断。
- Focused verification：`bun test packages/core/src/worker/orchestrator/quality-gate.test.ts packages/core/src/worker/conversation/router.test.ts packages/core/src/worker/orchestrator/dead-loop.test.ts packages/core/src/worker/orchestrator/decision-pipeline-stats.test.ts packages/core/src/worker/orchestrator/service.claude-code.test.ts packages/core/src/worker/executor/engines/claude-code/executor.test.ts packages/storage-sqlite/src/worker/index.test.ts apps/api/src/modes/worker.openapi.test.ts` -> 58 pass / 0 fail。
- Full gates：`bun run typecheck`、`bun run lint`、`bun run test` 全部 0 退出。

## 2026-05-06 03:55 [completed] REL-016 / PLAN-121 — CLI 0.9.0 released

`@zonease/aiworker-cli@0.9.0` minor release 完成。

- 自 `v0.8.0` (release commit `2230deb`) 至 release-bump commit `fe3f57f` 共 7 个 commit；按 semver 0.x 走 minor（Brain Governance Kernel truthfulness / admission path / Codex parity / init secret UX / command help 行为均为用户可观察变化）。
- 本次 release 承载 QA-006 之后的 Brain Governance Kernel retained defects 收口：`PLAN-116` decision truthfulness / fallback diagnostics、`PLAN-117` admission propose 正式入口 + bypass guardrail、`PLAN-118` Codex continuity + tool-call parity、`PLAN-119` init secret safe defaults + doctor status truthfulness、`PLAN-120` CLI group help / advisory recommendation / `--arg -y` parser polish。
- `TODO-027` 已作为发布后 Governance Kernel regression harness 入口保留为 pending，不阻塞本次 release。
- 本地 release gates 全通过；release commit `fe3f57f chore(release): 发布 CLI 0.9.0` + annotated tag `v0.9.0` 已 push 到 origin。
- GitHub Actions release workflow run id `25393952863`（job `74475583117`）2m4s 全绿；npm `@zonease/aiworker-cli` `latest=0.9.0` 已上线；GitHub Release `v0.9.0` 已发布（非 draft / 非 prerelease），4 个平台 binary 全部 uploaded（aiworker-darwin-arm64 23.95 MB / aiworker-darwin-x64 26.38 MB / aiworker-linux-arm64 39.66 MB / aiworker-linux-x64 39.98 MB）。

验证：

- `bun install --frozen-lockfile` ✅
- `bun run typecheck` ✅（9 workspace 全 0 退出）
- `bun run lint` ✅（0 violation）
- `bun run test` ✅（workspace tests 全 0 退出）
- `bun run build` ✅（api 1.46 MB / fleet 639.71 kB / worker 665.31 kB / cli aiworker-bun.js 1.1 MB；CSS utility check 通过）
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run` ✅
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet` ✅
- `apps/cli/dist/package.json` 版本字段 = `0.9.0` ✅
- `bun apps/cli/dist/aiworker-bun.js --version` → `aiworker/0.9.0 linux-x64 node-v24.3.0` ✅
- `git diff --check` ✅
- `bun publish --dry-run --access public` 在 `apps/cli/dist` 完成 pack 阶段（30 files / 2.69 MB），随后停在本机 npm authentication boundary；正式发布继续依赖 tag-triggered GitHub Actions release workflow 的 `NPM_TOKEN`。
- `npm view @zonease/aiworker-cli version` → `0.9.0` ✅
- `bunx @zonease/aiworker-cli@0.9.0 --version` → `aiworker/0.9.0 linux-x64 node-v24.3.0` ✅
- `gh release view v0.9.0` → published, 4 assets uploaded ✅

## 2026-05-06 03:05 [completed] PLAN-120 — CLI onboarding polish for command groups and executor hints

完成 PLAN-115 剩余 onboarding polish：BUG-073、TODO-026、BUG-051。

- `apps/cli/src/help.ts` / `apps/cli/src/aiworker.ts`：新增 group-level help renderer；`aiworker soul --help`、`aiworker brain --help`、`aiworker executor --help` 等 unmatched command group 在 parse 前输出 scoped subcommands，不再先落回顶级 help。真实 unknown command 仍返回 usage error。
- `apps/cli/src/aiworker.ts`：仅对 `executor mcp add` / `worker executor mcp add` 做定向 argv 预处理，把 `--arg -y` 保留为 stdio MCP arg value；其它命令的 unknown-option validation 不放宽。
- `apps/cli/src/commands/worker/init.ts`：executor recommendation 文案改成 `Suggested` / `also tested` / `Advisory only`，明确不是 enforced Soul compatibility matrix。
- `docs/cli.md` / `docs/executor-engines.md`：记录 `--arg -y` 支持、`--arg=-y` 兼容，以及 Soul recommendation advisory-only contract。
- 测试：新增 group help snapshot、hyphenated MCP arg regression、init advisory wording assertions；聚焦测试 64 pass，CLI typecheck 与 lint 通过。

PLAN-115 要求的后续 regression harness 入口已重开为 `TODO-027`。它是发布后/后续验证专项，不阻塞本轮 retained defects closeout。

## 2026-05-06 02:35 [completed] PLAN-119 — Init secret handling and executor doctor status truthfulness

按 PLAN-115 第 4 阶段完成 BUG-071 + BUG-072 收口。operator-facing status 与 first-run secret 输出现在使用更一致、更安全的默认 contract。

- `apps/cli/src/commands/worker/executor.ts`：`aiworker executor doctor` 的正文 `Status:` 改用与顶部 banner 相同的 surfaced warning rubric；fresh-init optional overlay 不再让正文显示 WARN，但 default http stub / binary missing 等真实 warning 仍会保留 WARN。
- `apps/cli/src/commands/worker/init.ts` + `apps/cli/src/context.ts`：`aiworker init` 静默 bootstrap worker identity，自行处理首次 token delivery；默认写 chmod 0600 `bootstrap-token.txt`，stdout 只显示 masked token、token file 路径、master-key `.env` 路径与离线备份提示；`--token-file` 覆盖路径，`--show-token` 才显示完整 token warning block。
- `packages/core/src/worker/bootstrap/print.ts`：抽出 `markBootstrapShown`，保留容器 / supervisor 旧 stdout token scrape 路径，同时让 CLI init 可在安全输出后标记一次性 token 已交付。
- `apps/cli/src/aiworker.ts` / `apps/cli/src/help.ts` / `docs/cli.md` / `docs/architecture.md` / `docs/executor-engines.md`：同步 `--token-file`、`--show-token`、token-file migration path、master-key backup 和 doctor PASS/WARN/FAIL rubric。
- 测试：新增 init 默认 token file + masked stdout + no master-key value assertion、`--show-token` gated raw output assertion、BUG-071 selected-engine fresh-init snapshot；聚焦测试 37 pass，CLI/core typecheck 与 lint 通过。

## 2026-05-06 01:55 [completed] PLAN-118 — Codex continuity and tool-call parity

按 PLAN-115 第 3 阶段完成 BUG-069 + BUG-070 收口。Codex 显式 `chat-id` 连续性现在优先于 conversation classifier，当前 Codex app-server 的 tool/function/command frames 也会进入 AIWorker shared tool event surface。

- `packages/core/src/worker/orchestrator/service.ts`：已有 Codex session entry 命中时，在 gateway reset / Worker Admin selected continuation 之后、classifier 之前直接继续当前 conversation，避免同一 `--chat-id` 被 classifier 拆成多个 AIWorker conversation。
- `packages/core/src/worker/executor/engines/codex/types.ts` / `normalize.ts`：补齐当前协议 `rawResponseItem/completed` function_call / function_call_output 与 `item/started|completed` commandExecution 归一化；`exec_command` / `commandExecution` 映射为 `command_run` action，并保留 correlation id、arguments、status、tool_result。
- `packages/core/test-fixtures/cli/codex-stub.mjs` + Codex tests：current protocol fixture 发出真实 probe 中观察到的 tool frames；normalizer / executor tests 覆盖 `tool_use` 与 `tool_result`。
- `packages/core/src/worker/orchestrator/service.history.test.ts`：新增 5-turn Codex same chat-id regression，证明 1 个 conversation、消息累积、native engine binding 复用与更新；同步更新 stale binding 断言以反映 Codex session continuity bypass。
- `docs/executor-engines.md`：记录 Codex shell exec 当前以 logical `exec_command` + actual `commandExecution` lifecycle 暴露，同一 correlation id 可供消费者合并。
- 验证：聚焦 `bun test ./packages/core/src/worker/executor/engines/codex/normalize.test.ts ./packages/core/src/worker/executor/engines/codex/executor.test.ts ./packages/core/src/worker/orchestrator/service.history.test.ts` 74 pass；`bun run --filter '@zonease/aiworker-core' typecheck`、`bun run lint`、`bun run typecheck`、`bun run test` 全部 0 退出。

## 2026-05-06 01:20 [completed] PLAN-117 — Admission governance bridge and bypass guardrail

按 PLAN-115 第 2 阶段完成 BUG-068 + BUG-074 收口。`aiworker brain admission propose` 从 debug-only 提升为正式 pending proposal 入口；`aiworker init` 新生成的 `AGENT.md` / `SOUL.md` 明确长期记忆 / policy / brain skill proposal 必须走 AIWorker admission，executor native memory 不是 canonical Brain。

- `apps/cli/src/aiworker.ts` / `apps/cli/src/help.ts` / `apps/cli/src/commands/worker/brain.ts`：去掉 `--i-know-this-is-debug` gate 与 debugWarning，保留同一 zod + worker.db `BrainAdmissionService.propose` 写入路径。
- `apps/cli/src/commands/worker/init.ts`：新 scope 的 `AGENT.md` / `SOUL.md` 增加 Brain admission governance 指引和 CLI 示例。
- `packages/core/src/worker/orchestrator/service.ts` + `packages/core/src/worker/brain/governance-bypass.ts`：每轮前后比较 admission count；assistant 声称 admission / 长期记忆已提交或已落盘但本轮 DB delta=0 时 emit `brain.governance.bypass_suspected`，并记录进程内最近 warnings。
- `packages/core/src/worker/brain/summary.ts` + `packages/shared/src/fleet/worker-info.ts` + Worker Admin Brain panel：`brainSummary.admissions.bypassRisk` 暴露 observe-only 风险，pending admissions 空状态显示 engine-native memory bypass 提示。
- 测试：扩展 admission CLI、init integration、orchestrator stub turn、brain summary、gateway WorkerInfo fixture；聚焦 CLI/core/API/Web 测试通过；`bun run typecheck`、`bun run lint`、`bun run test`、`bun run check`、`git diff --check` 全部通过。

## 2026-05-06 00:30 [completed] PLAN-116 — Truthfulness contract for orchestrator decision events and brain status surface

按 DOC-006 指定的 P1 Truthfulness layer 切片完成 BUG-066 + BUG-067 收口。**heuristic + observe-only 仍是默认安全路径**，本 PLAN 不引入默认接管 LLM brain decision，只让 runtime / CLI / REST 如实暴露 source、mode、evaluator、fallback 诊断。

代码改动：

- `packages/core/src/worker/orchestrator/decisions.ts`：`DecisionMode` 扩展为 `'observe_only' | 'enforced'`；新增 `DecisionEvaluator = 'heuristic' | 'llm' | 'none'`；`IntentDecisionPayload` 新增 optional `evaluator / templateId / attempt / rawOutput / parseError`；新增 `resolveQualityGateMode(configuredMode, action)` 真值表（仅当 retry+repair / block+block 才标 enforced）；`buildQualityGatePayload` 接 `{ mode }` option；`ORCHESTRATOR_DECISION_SCHEMA_VERSION` bump 至 2（不做向后兼容）。
- `packages/core/src/worker/orchestrator/intent-classifier.ts`：heuristic / LLM-ok / LLM-fallback 三态都填 `evaluator + templateId='intent-classifier-v1' + attempt`；fallback 时携带经 `redactBodySecrets` 脱敏并截断到 ≤2KB 的 `rawOutput` 与完整 `parseError`，保留 `intent-fallback` source。
- `packages/core/src/worker/orchestrator/quality-gate.ts`：所有 `buildQualityGatePayload` 走新增 `buildPayload(input, fields)` helper，自动按 `resolveQualityGateMode` 计算顶层 `mode`；retry+repair / block+block 真改写下游时事件 `mode='enforced'`，其余 `'observe_only'`。
- `packages/core/src/worker/conversation/router.ts` + `packages/shared/src/fleet/conversation.ts`：`ConversationDecision` 新增 `source ∈ {classifier-llm, classifier-fallback, classifier-disabled}` / `evaluator` / `engine` / `model` / `templateId='conversation-classifier-v1'` / `attempt` / `rawOutput` / `parseError`；3 种 fallback 路径（`non-json-classifier-output` / `malformed-response` / `classifier-error-default-continue`）均带 redacted+truncated rawOutput 与完整 parseError；`service.ts` 把 engine 透传给 classifier。
- `packages/core/src/worker/orchestrator/decision-pipeline-stats.ts`：新建进程内 ring buffer（windowSize=50），`recordIntentDecision` / `recordQualityGate` / `recordConversationClassifier` 在 `service.ts` emit 后立即喂数据；`getDecisionPipelineSnapshot(config)` 返回 `WorkerInfoDecisionPipelineSummary`。**重启清空，不入 worker.db**。
- `packages/core/src/worker/brain/summary.ts` + `packages/shared/src/fleet/worker-info.ts`：`buildBrainSummary(decisionPipelineConfig)` 新增 `decisionPipeline` 段；`WorkerInfoBrainSummary` 新增 `decisionPipeline: WorkerInfoDecisionPipelineSummary` 必含字段（包括 intentClassifier / capabilityRouter / qualityGate / conversationClassifier 四组 evaluator+mode+recent）。
- `packages/core/src/worker/management/info.ts`：`/api/worker/info` 的 `brainSummary` 调用注入实际 decisionPipeline 配置。
- `apps/api/src/worker/brain/routes.ts` + `apps/api/src/modes/worker.ts`：`BrainRoutesDeps` 新增 `getDecisionPipelineConfig?` 注入；`/api/worker/brain/summary` 返回新 `decisionPipeline` 段。
- `apps/cli/src/commands/worker/brain.ts`：`aiworker brain status` 输出新 `decisionPipeline` 段；CLI 子命令描述同步更新。
- 测试：新增 `decisions.test.ts`（schema bump、mode 真值表、capability advisory、QualityGate enforced 切换）、`decision-pipeline-stats.test.ts`（ring buffer + fallback rate + reason histogram + windowSize 上限）、`conversation/router.test.ts`（4 种 fallback 路径 + 脱敏截断）；扩展 `intent-classifier.test.ts`（heuristic/LLM/fallback 三态 evaluator+templateId+attempt + rawOutput 脱敏截断）、`quality-gate.test.ts`（observe_only / enforced mode 切换断言）、`apps/api/src/worker/brain/routes.test.ts`（`/summary` 暴露 decisionPipeline）。

不做事项（明确边界）：

- 不引入默认 LLM brain decider；intent / quality 默认仍 heuristic，capability 仍 advisory registry。
- 不向后兼容（1.0.0 前不留 alias / shim）：consumer schema 一次性同步，不保留旧字段。
- 不修 admission governance bridge（BUG-068 / BUG-074）；留给下一 PLAN slice。
- 不修 codex executor parity（BUG-069 / BUG-070）；留给下一 PLAN slice。
- 不新增 DB migration / worker.db schema 改动；recent stats 全 in-memory ring buffer，重启清空。

验证：

- `bun run typecheck` ✅（9 workspace 全 0 退出）
- `bun run lint` ✅（0 violation）
- `bun run test` ✅（fs-layout 20 / shared 140 / gateway-proto 19 / storage 19 / gateway 148 / core 612 / api 86 / cli 171 / web 59 = 1274 tests，0 fail）

## 2026-05-05 23:48 [completed] DOC-006 / PLAN-115 — Brain Governance Kernel 决策后的 backlog reset

按 DOC-005 / PLAN-114 的 Governance Brain Kernel 决策，对所有旧 pending / draft PMA 项做断代收口：旧入口失去直接实施资格，真实发布缺陷保留为决策后的开发队列。

- 关闭旧入口：`PLAN-080` rejected；`BUG-050` rejected / superseded by `BUG-070`；`TODO-008` rejected / future post-decision regression harness；`TODO-007` rejected / deferred。
- 完成验证证据：`QA-006` 标记 completed，并把所有发现 triage 到后续任务。
- 同步 stale 状态：`BUG-015` / `REFACTOR-007` 在 index 已关闭且代码实现存在，本轮把详情文件内的 `in-progress` / `in-review` 同步为 completed。
- 保留并重写口径：`BUG-066` 变成 truthfulness contract（先暴露 heuristic / LLM、observe_only / enforced，不默认实现 heavy Brain decision LLM）；`BUG-067` 是 classifier fallback diagnostics；`BUG-068` / `BUG-074` 是 admission governance bridge 与 bypass guardrail；`BUG-069` / `BUG-070` 是 executor parity；`BUG-071` / `BUG-072` 是 operator trust / safety；`BUG-073` / `TODO-026` / `BUG-051` 是 onboarding polish。
- 后续开发顺序写入 `PLAN-115`：Truthfulness layer → Admission governance bridge → Executor parity → Safety/operator trust → Onboarding polish → post-decision regression harness。

验证：`git diff --check`。

## 2026-05-05 22:58 [completed] DOC-005 / PLAN-114 — Brain Governance Kernel 决策落盘

拉取最新主线到 `7adc00a` 后，针对 Brain 层已经大量实现但产品边界开始变重的问题，完成架构决策落盘：AIWorker Brain 是 **Governance Brain Kernel**，不是硬编码领域自动化引擎。

- `docs/architecture.md` 新增 `Brain Governance Kernel 决策`：明确 `hard logic owns invariants, LLM owns semantics`，Brain hard logic 只守 scope identity、数据面隔离、evidence/provenance、admission 状态机、secret redaction、rollback/audit、token budget、source tagging 等治理不变量；候选人/代码/合同/财务等领域语义、下一步规划与业务判断交给 LLM / executor。
- 逐一重解释 FEAT-054 / PLAN-097..103 已落地组件：Soul module 是 LLM-readable role package，scope manifest 是 business scope identity，artifact registry 是 evidence index，schema pack 是 vocabulary / validation hints，admission 是 durable mutation permission boundary，brief compiler 是 projection layer，decision events 是 truthfulness / observability contract。
- 文档化新增 Brain hard logic 前的四个自检：invariant test、mutation test、executor-boundary test、truthfulness test，避免把 Brain Kernel 继续推向 HR/finance/legal/dev 的 hardcoded workflow engine。
- 诚实记录 0.8.x 现实：QA-006 观察到 `intent_decision` / `capability_decision` / `quality_gate` 仍是 heuristic / observe-only，不能包装成 LLM-backed Brain decider；未来 LLM decider 必须显式 opt-in，并清楚标注 source/mode。
- 修正 architecture 中 admission state 仍写成 roadmap / 未落 DB 的过期表述，改为 PLAN-101 / PLAN-103 已落地 worker.db admission MVP；后续 admission LLM-facing entry point 或 guardrail 仍需独立 PMA。
- `AGENTS.md` 增加短红线：Brain 硬逻辑只守治理不变量，领域语义和 workflow planning 交给 LLM / executor。

验证：`git diff --check`。

## 2026-05-05 14:20 [progress] QA-006 — 0.8.0 published end-to-end debug campaign (5 Souls × 12 turns × 2 engines)

按 `aiworker-coder-claude-engine` skill 在本机对 `@zonease/aiworker-cli@0.8.0` 跑了 60 turn 的 Project Brain 与 executor 端到端验证。Souls × engines 矩阵：developer × claude-code、developer × codex、hr-recruiting × claude-code、finance-ops × codex、qa-reviewer × claude-code，每个 Soul 用同一 `--chat-id` 跑 12 轮，覆盖身份、scope、跨轮 marker recall、out-of-scope 拒绝、risk policy gating、admission proposal、self-summary 与文件落盘连续性。

正面发现：

- Soul / persona / scope / capability 注入 LLM 真实工作；5/5 Soul 对 out-of-scope 请求按 boundary 转交、对高风险请求按 risk policy 阻断（HR 拒发 offer letter、QA 拒跳 P1 回归、finance 拒未授权账务调整、developer 对 `rm -rf` dry-run + 回滚 memo）。
- claude-code 引擎单 chat-id 跨 12 轮维持单一 conversation（dev-cc 21 messages，hr 16，qa 13），marker recall 精确；`/health` mode=worker、brain healthy、executor healthy；`/openapi.json` 12 paths（确认 BUG-065 已在 0.8.0 修复）。

负面发现（已按 PMA 标准落盘）：

- `BUG-066 P1` Brain decision layer (intent / capability / quality_gate) 全部 heuristic + observe_only，与"Brain decision LLM"的产品定位不符；60 turn 中**无任何**事件 source 指向 LLM-backed decider。
- `BUG-067 P1` `conversation.classifier` 每轮 `reason: "non-json-classifier-output"` 静默回退，无原始 LLM 输出可追责。
- `BUG-068 P1` Brain admission proposal 无 LLM-discoverable 入口；claude-code 上 0/3 Soul 触发真实 admission，全部把"长期记忆"写到 `~/.claude/projects/<scope>/memory/`；codex 上 2/2 Soul 真的写入 `brain_admission_proposals` DB。是 admission pipeline 的根本设计 gap。
- `BUG-069 P1` codex executor 同 chat-id 切成多 conversation（12 turn 跑完后 dev-codex 7 conv / 24 msg、finance 6 conv / 24 msg），导致 dev-codex turn-4 marker recall 失败。claude-code 三 Soul 同条件下全部 1 conv / 24 msg。
- `BUG-070 P1` codex executor 在 AIWorker 事件流里完全没有 `orchestrator.tool_call` 事件，observability 严重不对等。
- `BUG-071 P2` `aiworker executor doctor` banner "0 ERR · 0 WARN" 与 body `Status: WARN` 自相矛盾。
- `BUG-072 P2` `aiworker init` stdout 直接打印 bootstrap token + master-key，warning UX 弱，易随 stdout 泄漏。
- `BUG-073 P3` `aiworker soul --help` 等未知子命令静默回退到顶级 help，没有 "unknown command" 提示。
- `BUG-074 P2` claude-code 上 LLM 自信宣称 "proposal 已采纳" 但 admission DB 0；hallucination 让 operator 看不到任何待审批项。
- `TODO-026 P3` `aiworker init` "alternates" 推荐文案是 advisory 但渲染得像权威 — finance-ops 选 codex 也允许；需要在 advisory 与 enforced 之间二选一。

全部细节、复现命令、acceptance criteria 已写入 `docs/task/QA-006.md` 与对应 `BUG-066..074` / `TODO-026`。

## 2026-05-05 06:50 [completed] REL-015 / PLAN-113 — CLI 0.8.0 released

`@zonease/aiworker-cli@0.8.0` minor release 完成。

- 自 `v0.7.0` (release commit `4968d63`) 至 release-bump commit 共 5 个 release-relevant commit；按 semver 0.x 走 minor（多个用户可观察行为质变 + 新 CLI flag + 新 worker config schema 字段）。
- 本次 release 收口 QA-005（0.7.0 published claude-code Soul/Brain 端到端调试）登记的 11 个 task：
  - `PLAN-109` Brain brief / admission read-path 收口。覆盖 `BUG-060` (P1 brain memory body 注入) / `BUG-061` (P1 admission redact 双闸 — `--show-sensitive` × `AIWORKER_ADMIN_REVEAL=1`，content-scan reuse `redactBodySecrets`) / `BUG-062` (P3 brief artifact-summary 防御性过滤) / `TODO-012` (P2 secret-scan ruleset +slack-token / +stripe-live / +gcp-api-key / +pem-private-key / ASIA AWS)。
  - `PLAN-110` Decision pipeline 强化。覆盖 `BUG-063` (P1 dev-Soul tool loop — 9 个 Soul 在 SOUL.md 加 "模糊或缺失上下文" + dead-loop detector +`orchestrator.deadLoop` config) / `BUG-064` (P2 intent risk 词典扩展 force-push / drop table / 落账 直接 / 立即上线 等) / `TODO-013` (P2 LLM evaluator 并行 + `orchestrator.qualityGate.budgetMs` 默认 30s 超时降级 heuristic)。
  - `PLAN-111` Worker API surface 修复。覆盖 `BUG-065` (P2 OpenAPI 12 typed paths) / `TODO-014` (P3 safe-env explicit-allow `AIWORKER_DEBUG_*` / `DEBUG_*`，AIWORKER_MASTER_KEY / AIWORKER_JOIN_TOKEN 仍被 BLOCK_PREFIXES 拦下) / `TODO-016` (P2 serve `tryBindPreflight` + `--pid-file` flag + `/health` 自描述)。
  - `PLAN-112` Doctor first-run UX。覆盖 `TODO-015` (P3 doctor 顶部 summary line + fresh-init `*.empty` info 抑制 + `brain-skills.empty` / `executor-overlay.{capabilities,mcp}.empty` 命名消歧)。
- 本地 release gates 全通过；release commit `2230deb chore(release): 发布 CLI 0.8.0` + annotated tag `v0.8.0` 已 push 到 origin。
- GitHub Actions release workflow run id `25377089930`（job `74415001398`）2m5s 全绿；npm `@zonease/aiworker-cli` `latest=0.8.0` 已上线；GitHub Release `v0.8.0` 已发布（非 draft / 非 prerelease），4 个平台 binary 全部 uploaded（aiworker-darwin-arm64 23.95 MB / aiworker-darwin-x64 26.37 MB / aiworker-linux-arm64 39.65 MB / aiworker-linux-x64 39.98 MB）。

验证：

- `bun run typecheck` ✅（9 workspace 全 0 退出）
- `bun run lint` ✅（0 violation）
- `bun run test` ✅（fs-layout 20 / shared 140 / gateway-proto 19 / storage 19 / gateway 148 / core 592 / api 86 / cli 171 = 1195 tests）
- `bun run build` ✅（fleet 639 kB / worker 664 kB / cli aiworker-bun.js 1.1 MB；CSS utility check 通过）
- `apps/cli/dist/package.json` 版本字段 = `0.8.0` ✅
- `git diff --check` ✅
- `npm view @zonease/aiworker-cli version` → `0.8.0` ✅
- `gh release view v0.8.0` → published, 4 assets uploaded ✅

## 2026-05-05 06:00 [completed] REL-014 / PLAN-108 — CLI 0.7.0 released

`@zonease/aiworker-cli@0.7.0` minor release 完成。

- 自 `v0.6.0` (release commit `425601a`) 至 release commit `4968d63` 共 9 个 commit；按 semver 0.x 走 minor（PLAN-105 让 SOUL/AGENT/MEMORY 真正注入 LLM、PLAN-106 新增 CLI/REST surface，用户可观察行为质变）。
- 本次 release 收口 QA-004（0.6.0 published claude-code Soul/Brain 端到端调试）登记的 9 个 task：
  - `PLAN-105` Project Brain 注入贯穿 4 个 executor adapter（claude-code / codex / acp / cursor）+ orchestrator decision retry。覆盖 `BUG-056` (P0 产品定位) / `BUG-057` (P1 brain LLM evaluator)。
  - `PLAN-106` Brain admission MVP 安全 / 鲁棒 / 可观察性补齐：secret scan 三档 policy（block / redact / raw）+ per-row safeParse + unsupported kind audit + REST `POST /admission`（仅 `WORKER_DEV_TOOLS=true`）+ CLI `aiworker brain admission propose`。覆盖 `BUG-055` (P0 安全) / `BUG-058` (P2) / `BUG-059` (P3) / `TODO-009` / `TODO-010`。
  - `PLAN-107` CLI `brain brief --artifact` 兜底 + `aiworker init` next-steps 文案修复。覆盖 `BUG-054` (P2) / `TODO-011` (P3)。
- 本地 release gates 全通过；release commit `4968d63 chore(release): 发布 CLI 0.7.0` 与 annotated tag `v0.7.0` 已 push 到 origin。
- GitHub Actions release workflow run id `25342991825` 2m2s 全绿；npm `@zonease/aiworker-cli` `latest=0.7.0` 已上线；GitHub Release `v0.7.0` 已发布（非 draft / 非 prerelease），4 个平台 binary 全部 uploaded（aiworker-darwin-arm64 23.94 MB / aiworker-darwin-x64 26.37 MB / aiworker-linux-arm64 39.64 MB / aiworker-linux-x64 39.97 MB）。

验证：

- `bun run typecheck` ✅
- `bun run lint` ✅
- `bun run test` ✅（fs-layout 20 / shared 131 / gateway-proto 19 / storage 19 / gateway 148 / core 579 / api 83 / web 59 / cli 164 = 1222 tests）
- `bun run build` ✅（api 1.44 MB / fleet 639 kB / worker 664 kB / cli aiworker-bun.js 1.1 MB；CSS utility check 通过）
- `apps/cli/dist/package.json` 版本字段 = `0.7.0` ✅
- `git diff --check` ✅
- `npm view @zonease/aiworker-cli version` → `0.7.0` ✅
- `gh release view v0.7.0` → published, 4 assets uploaded ✅

## 2026-05-05 02:00 [completed] PLAN-105 / 106 / 107 — 0.6.0 QA-004 缺陷收口

QA-004（0.6.0 published claude-code Soul/Brain end-to-end debug campaign）登记的 9 个 task 全部完成，分三个 plan 落地：

- `PLAN-105` Project Brain 注入贯穿 4 个 executor adapter（claude-code / codex / acp / cursor；`http` provider 已正确，`cli` / `mcp` providers 不实现 chat 不在范围）。新增共享 `engines/common/run-input.ts`（`extractRunMessages` / `composeSystemPromptText` / `renderHistoryAsUserPreamble` + 10 单元测试）：claude-code 走 `--append-system-prompt` + history user-envelope（弃用 `--resume`，stateless per turn）；codex resume / 非 resume 统一发 `renderCodexPrompt` 全 messages；acp `session/prompt` 改为 `[system_block, history_block, user_block]` content blocks；cursor stdin 折成 `[SYSTEM] / Recent conversation / New message` 三段。orchestrator `intent-classifier` / `quality-gate` 抽 `runIntentLlm` / `runQualityGateLlm` 走 1 次 strict re-prompt 重试，失败 fallback heuristic + reason 含 `llm-retry-exhausted`。覆盖 BUG-056 (P0) / BUG-057 (P1)。
- `PLAN-106` Brain admission MVP 安全 / 鲁棒 / 可观察性补齐。新增共享 `scan-body.ts`（sk-token / JWT / bearer / AWS / GitHub / 高熵兜底 + `redactBodySecrets`）。`BrainAdmissionService.apply` 接 secret scan 三档：默认 `block`（HTTP 409 / exit 1） / `redact`（标 `[REDACTED:<rule>]` 写盘） / `raw`（原文落盘 + decision row reason 标识）；dry-run JSON 始终含 `secretScan: { hits, action, policy }`。`list` / `get` 走 per-row `safeParse`，`BrainAdmissionListResult` 新增 `skipped: { count, ids, reasons }`，CLI / REST footer 同步；新增 `getSafe` 暴露 skip reason。`apply` unsupported `kind` `commit=true` 时写 `failed` decision row + 状态机迁移到 `failed`（`failureReason='unsupported-kind:<kind>'`），dry-run 不变状态。`BrainAdmissionEvidence` schema 增加 `summary?: string ≤ 500` / `notes?: string ≤ 2000`（与 PLAN-101 现有 field-name redact 协同）。CLI 新增 `aiworker brain admission propose --i-know-this-is-debug`（root + worker 双入口），REST 新增 `POST /admission`（仅 `WORKER_DEV_TOOLS=true` 启用，否则 403）。覆盖 BUG-055 (P0) / BUG-058 (P2) / BUG-059 (P3) / TODO-009 / TODO-010。
- `PLAN-107` CLI brief 与 init next-steps 文案修复。`brain brief` CLI normalize cac repeat-option 三种形态（undefined / single / array）；`brainBriefRequestSchema.artifactRefs` 走 zod transform strip undefined / blank / 非 string，避免下游 `- undefined: not found in brain artifact registry` 字面输出。`aiworker init` next-steps 不再写死 `--engine codex`：`recommendedEnginesForSoul` 按 Soul preset 给主 / 备 engine 提示，候选 `claude-code | codex | acp | cursor | mcp | http` 全列；`executor doctor` `executor.config_default_stub` 文案同步。覆盖 BUG-054 (P2) / TODO-011 (P3)。

验证：

- `bun run typecheck` ✅（9 workspace 全 0 退出）
- `bun run lint` ✅（0 violation）
- `bun run --filter '*' test` ✅（fs-layout 20 / shared 131 / gateway-proto 19 / storage 19 / gateway 148 / core 579 / api 83 / web 59 / cli 164 = 1222 tests，对比 0.6.0 baseline 1181 多 41 个新覆盖）

未发布；BUG-055 / BUG-056 / BUG-057 是 P0/P1 安全 + 产品定位关键修复，建议尽快切 0.6.1 patch 发版。

## 2026-05-04 23:15 [completed] REL-013 / PLAN-104 — CLI 0.6.0 released

`@zonease/aiworker-cli@0.6.0` minor release 完成。

- 自 `v0.5.3` 至 release commit 前 `HEAD (191ba02)` 共 30 个 commit；按 semver 0.x 走 minor。
- 本次 release 跨 6 个 FEAT epic 收口：`FEAT-048` 产品定位 pivot、`FEAT-049` executor 改 BYO + project overlay、`FEAT-050` Project Brain product surface 强化、`FEAT-051` Worker/Fleet aggregation surface 强化、`FEAT-052` BYO executor integration strategy、`FEAT-053` Project scope = worker-bound business scope、`FEAT-054` Soul modules + Scope Brain kernel（PLAN-097..103 完整落地 SoulModule registry / scope manifest / artifact registry / Soul schema pack / admission MVP / brief compiler / Worker REST + Worker Admin UI + Fleet UI 收口）；外加 `BUG-052` / `BUG-053` 两个流式文本去重 fix。
- 本地 release gates 全通过；release commit `425601a chore(release): 发布 CLI 0.6.0` 与 annotated tag `v0.6.0` 已 push 到 origin。
- GitHub Actions release workflow run id `25318251246` 1m58s 全绿；npm `@zonease/aiworker-cli` `latest=0.6.0` 已上线；GitHub Release `v0.6.0` 已发布（非 draft / 非 prerelease），4 个平台 binary 全部 uploaded（aiworker-darwin-arm64 / aiworker-darwin-x64 / aiworker-linux-arm64 / aiworker-linux-x64）。

验证：

- `bun run typecheck` ✅
- `bun run lint` ✅
- `bun run test` ✅（fs-layout 20 / shared 120 / gateway-proto 19 / storage 19 / gateway 148 / core 554 / api 83 / web 59 / cli 159 = 1181 tests）
- `bun run build` ✅（api / fleet bundle / worker bundle / cli bundle）
- `git diff --check` ✅
- `npm view @zonease/aiworker-cli version` → `0.6.0` ✅
- `gh release view v0.6.0` → published, 4 assets uploaded ✅

## 2026-05-04 19:00 [completed] FEAT-054 / PLAN-103 — Worker/Fleet Brain surface closeout

把 PLAN-097..102 的 Soul / scope / artifact / admission / brief 落到 Worker REST + Worker Admin UI + Fleet UI（deep-link only），并跑接近全量 gate 作为 FEAT-054 epic 收口。

- shared `WorkerInfo.brainSummary`：scope manifest 状态 + artifact `byStatus` 计数 + admission `byStatus` 计数 + `lastUpdatedAt`。聚合不复制 payload / artifact ref / canonical brain。
- core `packages/core/src/worker/brain/summary.ts:buildBrainSummary`：worker.db group-by 计数 + `<project>/.aiworker/scope.json` 解析；`buildInfo` 注入 `brainSummary`。
- apps/api 新增 `/api/worker/brain/{summary,admission*,artifacts*}` REST：bearer-auth 由顶层 `/api/worker/*` 守门；`POST /admission/:id/{approve,reject,apply}` 写端点 + dry-run 默认；`?showSensitive=true` 才解锁 redact。12 个 route test 覆盖 summary / list redaction / approve/reject 状态机 / apply dry-run+commit / artifacts redact / 409 invalid transition / 项目 scope manifest 解析。
- apps/web Worker Admin `/brain` 视图（`features/brain/brain-panel.tsx` + `routes/brain.tsx`）：scope manifest 摘要 + admission 审批（approve / reject / apply / apply --commit）+ redacted artifact 列表；要求填 `--decided-by`。Nav 增加 Brain 入口。`api.ts` + `lib/hooks.ts` 加全套 brain 客户端 + TanStack Query hooks。
- apps/web Fleet UI worker detail 增加 "Brain (PLAN-103)" 深链卡：明确 fleet 控制面不持 admission / artifact state，仅深链 `/w/<workerId>/#/brain`，维持 fleet UI 不消费 worker brain 数据的边界。
- docs/architecture.md Brain admission roadmap 段标记完成 + Approval surface 改为已实现描述 + MVP materializer 范围 + Worker/Fleet aggregation surface 增加 brainSummary 字段说明与 “Brain 数据面隔离” 子段。docs/cli.md 在 init 后续步骤示例补 brain artifacts / admission / brief 三组命令。

边界遵守：

- fleet.db 没有新增表 / 列 / 行；没有任何 brain artifact / admission proposal / scope manifest 反向缓存。
- fleet UI 不读取 worker brain 数据；通过深链跳到 worker UI 自身的 `/brain` 视图完成审批。
- admission write endpoints `apply` 默认 `commit:false`（dry-run）；写 filesystem 必须显式 `commit:true`。
- redact 默认开；CLI / API 输出 secret-like 字段必须显式 `--show-sensitive` / `?showSensitive=true`。
- MVP materializer 仅 `memory-add`；其他 proposalType `apply` 返回 `unsupported`，留人工跟进。

验证：

- `bun run check` ✅ typecheck + lint 全 workspace 通过
- `bun run test` ✅ 9/9 workspace 全绿（shared 120 / fs-layout 20 / gateway-proto 19 / storage 19 / gateway 148 / core 554 / web 59 / api 83 / cli 159 = 1181 tests）
- `bun run build` ✅ web (fleet + worker bundle) + cli bundle + api 全通过
- `git diff --check` ✅

## 2026-05-04 19:00 [completed] FEAT-054 — Soul modules and Scope Brain kernel epic 收口

FEAT-054 epic 跨 7 个 PLAN（PLAN-097..103）收口完成。Project Brain 从 filesystem-only memories / skills / persona surface 演进为 worker-bound business scope 的 Brain Kernel + 独立 Soul Modules：

- **PLAN-097** 落 `SoulModule` contract + `SoulRegistry`，9 个内置 Soul 迁到 `packages/shared/src/soul/modules/`，CLI preset 退化为 projection。
- **PLAN-098** 落 `<project>/.aiworker/scope.json` 显式声明业务作用域；`init` 写最小 skeleton，`doctor` / `brain status` 展示状态。
- **PLAN-099** 落 `brain_artifacts` 表 + `BrainArtifactRegistry` + CLI inspector；ref/hash/sensitivity/retention/status/metadata 通用登记，不复制 artifact 内容。
- **PLAN-100** 填上每个 Soul 的 schemaPack（artifactTypes / entityTypes / proposalTypes / workflowStates）；developer + HR 完整覆盖；7 个其他 Soul skeleton；`memory-add` 是所有 Soul 共享的 admission baseline。
- **PLAN-101** 落 admission MVP：`brain_admission_proposals` + `brain_admission_decisions` 双表 + `BrainAdmissionService` 状态机 + CLI 五命令。
- **PLAN-102** 落 `BrainBriefCompiler`：preview-only，按 task / scope / Soul / artifact / risk / token budget 投影 canonical brain；`AGENTS.md` / `CLAUDE.md` / Copilot instructions / executor hints 都是 projection 不是 source of truth。
- **PLAN-103** 收口 Worker REST + Worker Admin UI + Fleet UI 边界，跑接近全量 gate。

7 个 git commit 串起整条主线。所有 Soul 元数据现在跨 CLI / core / API / web 共享同一份 registry；admission 写路径有 evidence / risk / confidence / rollback / dry-run / redact 多层 guard；fleet 控制面与 worker 数据面边界明确。

## 2026-05-04 17:35 [completed] FEAT-054 / PLAN-102 — Brain brief compiler

把 ContextManager 当前粗粒度的「AGENT/SOUL/USER/MEMORY/ROLLUP + 前 N 个 brain skill」拼接，扩成 task-specific brief compiler 的 preview。Brief 是 canonical brain 的**投影**，不替换 orchestrator 系统提示；`AGENTS.md` / `CLAUDE.md` / Copilot instructions / executor hints 都是 projection 不是 source of truth。

- shared 新增 `packages/shared/src/brain/brief.ts`：`BrainBriefRequest` / `BrainBrief` zod schema + 7 个 source 枚举（agent-doc / soul-doc / memory-doc / rollup-doc / risk-policy / admission-summary / artifact-summary / scope-manifest / soul-skeleton）+ `estimateBrainBriefTokens` 启发式（~4 char/token）+ `DEFAULT_BRAIN_BRIEF_TOKEN_BUDGET=4000`。
- core `packages/core/src/worker/brain/brief/compiler.ts`：`BrainBriefCompiler` + `createBrainBriefCompiler(deps)`，依赖注入 `brainHome / soulRegistry / scopeManifestReader? / artifactRegistry? / admissionService? / estimateTokens? / now?`。流程：scope manifest → 推 soulId（request → manifest.primarySoul → general-assistant fallback）→ 用 Soul.briefHooks.defaultSections 构建段（AGENT/SOUL/MEMORY/ROLLUP 文件 + risk-policy 合成 + 7 类 Soul-specific skeleton）→ artifact-summary 可选段（artifactRegistry.get） → token budget 截断（protected 优先；超预算时 protected 强制保留并 warning）→ 还原段顺序。
- CLI `aiworker brain brief`（root + worker namespace）：`--task` 必填；`--scope` / `--soul` / `--artifact` (重复) / `--executor` / `--token-budget` 可选；JSON 输出含 brief + projection-note。
- 测试：shared 11 case；core compiler 8 case 覆盖文件加载 / scope fallback / token budget / artifact-summary（命中 + missing）/ 缺失文件 / 未知 soulId / executor 透传；CLI brief 6 case 覆盖 --task 必填 / 文件加载 / artifact 注入 / token 预算 / --executor / 未知 soulId 错误。

边界遵守：preview-only；不替换 orchestrator 系统提示；不写 executor-specific 文件；不改 executor adapter contract；不做 semantic vector retrieval。

验证：

- `bun run --filter '@zonease/aiworker-shared' test` ✅ 120 pass
- `bun run --filter '@zonease/aiworker-core' test` ✅ 554 pass
- `bun run --filter '@zonease/aiworker-cli' test` ✅ 159 pass
- `bun run typecheck` ✅ 全 workspace 通过
- `bun run lint` ✅

## 2026-05-04 16:50 [completed] FEAT-054 / PLAN-101 — Brain admission MVP

把 admission roadmap 从 architecture 文本落成 worker.db 双表 + core 服务 + CLI 五个命令。Generated brain change（memory / brain-skill / policy / artifact-status）必须先进 `brain_admission_proposals`，经 operator approve / reject 才能 transition；`apply` 默认 dry-run，MVP 仅对 `kind === 'memory-add'` 自动落 filesystem。

- shared 新增 `packages/shared/src/brain/admission.ts`：`BrainAdmissionProposal` / `BrainAdmissionDecision` zod schema + `brainAdmissionProposalInputSchema`（默认 risk=high）+ `brainAdmissionMemoryAddPayloadSchema`（body / topic / indexEntry）+ `redactSecretLikeValues`（递归 token / apiKey / password / secret / bearer / auth / credential）+ `redactBrainAdmissionProposal` + `MATERIALIZED_PROPOSAL_KINDS=['memory-add']`。
- storage 加 `brain_admission_proposals` + `brain_admission_decisions`，加 `(status, kind)` / `scope_id` / `created_at` / `proposal_id` / `decided_at` 五个索引；migration `0006_fair_jetstream.sql`。`brain_admission_decisions.proposal_id` 是 FK，cascade delete 跟随 proposal。
- core `BrainAdmissionService`（`packages/core/src/worker/brain/admission/service.ts`）：`propose / get / list / count / approve / reject / apply / listDecisions`。状态机严格守 `pending → approved | rejected → applied | failed`；`apply` 默认 dry-run，`commit: true` 才写文件 + 更新状态 + 写决策行；非 `memory-add` kind 返回 `unsupported` 不改状态；写 IO 失败 → `failed` + 决策行带 `failureReason`；`list` / `get` 默认 `redactSensitive=true`。
- CLI `aiworker brain admission list/show/approve/reject/apply`（root + worker namespace 双注册）：`--decided-by` 必填用于 audit；`apply` 默认 dry-run，`--commit` 才落 `<brainHome>/MEMORY.md` 或 `<brainHome>/memories/<topic>.md`；`--show-sensitive` 才显示 secret-like 字段；`brainHome` 通过 `resolveBrainHome(workerId)` 解析（project scope → `<project>/.aiworker/`，user scope → `<home>/workers/<id>/brain/`）。
- 测试：shared 16 个 case 覆盖 schema / defaults / payload / redaction；storage `EXPLAIN QUERY PLAN` 命中四个新索引；core 15 个 case 覆盖状态机 / dry-run / commit / topic+index entry / unsupported / failed payload / list+count 过滤；CLI 12 个 case 覆盖默认 redact / unlock / 过滤 / 状态机 / dry-run / commit / id 必填。

边界遵守：

- admission 全文不写 fleet.db
- 不复用 executor MCP / engine plugin 通路
- redaction 默认开；CLI 输出 secret-like 字段必须显式 `--show-sensitive`
- MVP 只 materialize `memory-add`；其他 proposalType 进表但 `apply` 返回 unsupported，留人工跟进

验证：

- `bun run --filter '@zonease/aiworker-shared' test` ✅ 110 pass
- `bun run --filter '@zonease/aiworker-storage-sqlite' test` ✅ 19 pass
- `bun run --filter '@zonease/aiworker-core' test` ✅ 546 pass
- `bun run --filter '@zonease/aiworker-cli' test` ✅ 153 pass
- `bun run typecheck` ✅ 全 workspace 通过
- `bun run lint` ✅

## 2026-05-04 16:00 [completed] FEAT-054 / PLAN-100 — Soul-specific schema packs and validation samples

把 PLAN-097 留下的 `SoulModule.schemaPack` 占位填上每个 Soul 的领域 schema：artifactTypes / entityTypes / proposalTypes / workflowStates；developer + hr-recruiting 完整覆盖，其余 7 个 Soul skeleton。Brain Kernel 仍只验 shape — Soul 拥有领域语义；artifact type 可跨 Soul 共享（PLAN-100 风险条目落实）。

- 9 个 Soul module 同步填充 schemaPack。developer：6 个 artifactTypes（code-module / adr / design-doc / test-suite / release-note / changelog-entry）+ workflow `draft → review → merged → released → rolled-back` + 3 个 proposalTypes。hr-recruiting：5 个 artifactTypes（candidate-resume / screening-decision / interview-note / offer-letter / reference-check）+ workflow `applied → screening → interview → offer → hired/rejected/archived` + 3 个 entityTypes。其余 Soul 提供 1+ artifactTypes / 4-5 个 workflowStates。所有 Soul 把 `memory-add` 列入 proposalTypes（admission MVP baseline）。
- `SoulRegistry` 新增三个反查 helper：`findByArtifactType` / `findByProposalType` / `getSchemaPack`。`design-doc` artifact type 在 developer + product-designer 共享，验证 Kernel 不假设 type 唯一归属。
- CLI `aiworker soul show` 在已有 Capability packs / Toolsets 之后追加 Schema pack 段：primary scope kind、supported scopes、artifact / entity / proposal / workflow types。
- 测试覆盖：shared `registry.test.ts` 加 5 个 helper case；`schema-packs.test.ts` 12 个 case 覆盖 developer / HR fixture（synthetic, 无 PII）+ kebab-case 不变量 + 跨 Soul 共享 + memory-add baseline；CLI `soul.test.ts` 4 个 case 验证 `soul show` 的 schema pack 输出。

约束遵守：HR / finance / support fixtures 全部 synthetic；不引入实际业务自动化；不做 UI 表单生成；每个 Soul 的 schema pack 在 module 自身内维护，没有中央大表。

验证：

- `bun run --filter '@zonease/aiworker-shared' test` ✅ 91 pass
- `bun run --filter '@zonease/aiworker-cli' test` ✅ 141 pass
- `bun run typecheck` ✅ 全 workspace 通过
- `bun run lint` ✅

## 2026-05-04 15:35 [completed] FEAT-054 / PLAN-099 — Artifact registry kernel

把 worker scope 的业务资料登记从概念升级为 worker.db 中的 `brain_artifacts` 表 + core registry service + CLI 只读 inspector。Brain Kernel 不复制 artifact 内容，只存 ref / hash / sensitivity / retention / status / 通用 workflow 状态 + opaque metadata；Soul module 解释业务语义（PLAN-100 接续）。

- shared 新增 `packages/shared/src/brain/artifact.ts`：`BrainArtifact` zod schema（id / scopeId / type / ref / hash / source / sensitivity / retention / status / summary / evidenceRefs / metadata / createdAt / updatedAt） + `brainArtifactRegisterInputSchema` 默认 `sensitivity=internal` / `status=active` + `redactBrainArtifact` 工具：confidential / secret artifact 的 ref + hash 自动替换为 `<redacted>`，summary 保留。
- storage 加 `brain_artifacts` 表 + `(scope_id, type)` / `(status, type)` / `updated_at` 三索引；`bun run db:generate:worker` 生成 `0005_worthless_whiplash.sql` 迁移。
- core 新增 `packages/core/src/worker/brain/artifacts/registry.ts`：`BrainArtifactRegistry`（register / get / requireById / list / setStatus / count）；`list` / `get` / `setStatus` 默认 `redactSensitive=true`；支持 `scopeId` / `type` / `status` / `minSensitivity` 过滤。
- CLI `aiworker brain artifacts list / show`（root + worker namespace）：默认 redact，`--show-sensitive` 才显示 confidential / secret 的 ref + hash；`--scope` / `--type` / `--status` / `--min-sensitivity` / `--limit` 过滤；不构建 WorkerRuntime（仅读 worker.db），`aiworker.test.ts` + `help.ts` 同步注册元数据。
- 测试覆盖：shared 双样本（developer code-module、HR candidate-resume）+ redact 行为；storage `EXPLAIN QUERY PLAN` 命中三索引；core 10 个 registry case；CLI 7 个 inspector case。

边界遵守：
- 默认只存 ref / hash / summary，不复制全文。
- 不上传 artifact 到 gateway，不进 fleet.db。
- 不做 OCR / PDF / vector index。
- workflow status 只保留通用三态（active / archived / removed），Soul 业务状态在 PLAN-100 通过 `metadata` 表达。

验证：

- `bun run --filter '@zonease/aiworker-shared' test` ✅ 75 pass
- `bun run --filter '@zonease/aiworker-storage-sqlite' test` ✅ 17 pass
- `bun run --filter '@zonease/aiworker-core' test` ✅ 531 pass
- `bun run --filter '@zonease/aiworker-cli' test` ✅ 137 pass
- `bun run typecheck` ✅ 全 workspace 通过
- `bun run lint` ✅

## 2026-05-04 14:55 [completed] FEAT-054 / PLAN-098 — Scope manifest and business-scope bootstrap

把 worker scope 的业务作用域从隐式（目录位置 + Soul preset）升级为显式 `<project>/.aiworker/scope.json` 声明，与 `policy.json` / `toolsets.json` 同款 JSON，零新依赖。

- shared 新增 `packages/shared/src/scope/manifest.ts`：`ScopeManifest` zod schema（必填 `schemaVersion=1` / `kind` / `primarySoul`，可选 `id` / `subject` / `artifactRoots` / `privacy` / `retention` / `approval` / `labels`）+ `parseScopeManifestJson` / `parseOptionalScopeManifestJson` / `buildScopeManifest`，在 `packages/shared/src/index.ts` 暴露。
- fs-layout 加 `resolveScopeManifestPath` / `projectScopeManifestPath`；`ProjectAiworkerSeed` 加可选 `scopeJson`；`ensureProjectAiworker` 仅在 seed 提供时写 `scope.json`，保留 idempotent 写入。fs-layout 保持零运行时依赖。
- CLI `aiworker init`：从 shared `BUILTIN_SOUL_REGISTRY` 取 Soul 的 `primaryScopeKind`，用 `buildScopeManifest` 生成最小 skeleton 写入 `.aiworker/scope.json`（`kind` = Soul.primaryScopeKind、`primarySoul` = Soul.id、`privacy=private`、`approval=manual-approval`）；dry-run preflight 同步 `.aiworker/scope.json`。
- CLI `aiworker doctor`：新增 `Scope manifest:` 段，五状态 `ok` / `missing` / `malformed` / `unknown-soul` / `kind-mismatch`，分别返回 0 / 0 / 1 / 1 / 1；`ok` 显示 kind / primary soul / privacy / retention / approval / artifactRoots。
- CLI `aiworker brain status`：JSON 输出新增 `scope` 字段（status + manifest 摘要），仅暴露 artifactRootCount 与 labels 等聚合字段，不复制 manifest 原始内容。
- 测试覆盖：shared `manifest.test.ts`（schema 必填 + 双样本 + buildScopeManifest）、fs-layout `scope.json` idempotent 行为、CLI doctor 四种异常路径、CLI init.integration 验证 9 个 Soul preset 写入的 scope.json 与 brain status 输出。

验证：

- `bun run --filter '@zonease/aiworker-shared' test` ✅ 62 pass
- `bun run --filter '@zonease/aiworker-fs-layout' test` ✅ 20 pass
- `bun run --filter '@zonease/aiworker-cli' test` ✅ 130 pass
- `bun run typecheck` ✅ 全 workspace 通过
- `bun run lint` ✅

## 2026-05-04 14:25 [completed] FEAT-054 / PLAN-097 — Soul module contract and registry ownership

把 Soul 从 CLI-private preset 升级为跨 CLI / core / API / web 共消费的 Soul module。

- 新增 `packages/shared/src/soul/`：`SoulModule` zod 契约（manifest、supportedScopeKinds、primaryScopeKind、riskPolicy、retentionDefaults、schemaPack 占位、briefHooks 占位、initProjection），`SoulRegistry` 负责注册 / 查找 / 按 scope kind 过滤 / 拒绝重复 id。Schema 校验保证 primaryScopeKind ⊆ supportedScopeKinds、protectedSections ⊆ defaultSections、initProjection 必填。
- 9 个内置 Soul（developer / project-manager / devops-sre / product-designer / qa-reviewer / support-operator / finance-ops / hr-recruiting / general-assistant）迁到 `packages/shared/src/soul/modules/<id>.ts` 并在 `BUILTIN_SOUL_MODULES` 中聚合；`createBuiltinSoulRegistry()` 暴露给下游 plan 直接消费。
- CLI `apps/cli/src/soul/presets.ts` 退化为 projection 层：从 shared registry 派生 `SoulPresetDefinition`，保持 `BUILTIN_SOUL_PRESETS` / `findBuiltinSoul` / `supportedSoulIds` / `toSelectedSoul` 接口稳定，`apps/cli/src/soul/presets/*.ts` 9 个旧文件删除（1.0 前不留 alias）。
- 测试：新增 `packages/shared/src/soul/{module,registry}.test.ts` 覆盖 contract / registry 行为与 developer + HR 双样本；`apps/cli/src/soul/presets.test.ts` 新增 projection 一致性与未知 id 行为断言。
- schemaPack / retentionDefaults 当前为空数组占位，PLAN-100 / PLAN-099 接续填充。

验证：

- `bun run --filter '@zonease/aiworker-shared' typecheck` ✅
- `bun run --filter '@zonease/aiworker-shared' test` ✅ 48 pass
- `bun run --filter '@zonease/aiworker-cli' typecheck` ✅
- `bun run --filter '@zonease/aiworker-cli' test` ✅ 126 pass
- `bun run typecheck` ✅ 全 workspace 通过
- `bun run lint` ✅

## 2026-05-04 13:52 [proposal] FEAT-054 / PLAN-097..103 — Soul modules and Scope Brain kernel

确认最新 PMA 槽位后，新增 `FEAT-054` 与 `PLAN-097..103`，承接 Project Brain
下一阶段演进：

- `FEAT-053` / `PLAN-096` 已占用并完成 Project scope business-scope boundary；
  本轮不回写旧槽位。
- 新主线从 `FEAT-054` 开始，目标是把 Project Brain 演进成 worker-bound
  business scope 的 Brain Kernel + 独立 Soul Modules。
- 前置准备：`PLAN-097` Soul module contract 与 registry 归属、`PLAN-098`
  scope manifest 和 business-scope bootstrap。
- 主体开发：`PLAN-099` artifact registry、`PLAN-100` Soul-specific schema
  packs、`PLAN-101` Brain admission MVP。
- 后置收口：`PLAN-102` task-specific Brain brief compiler 与 projection
  boundary、`PLAN-103` Worker/Fleet Brain surface closeout。

本条仅建立 PMA tracking 与路线拆分，不修改 runtime / schema / CLI / UI。

## 2026-05-04 13:33 [completed] FEAT-053 / PLAN-096 — Project scope business-scope boundary

收口 FEAT-053 / PLAN-096。Project Brain 的 Project 语义已经在 AGENTS.md / README.md / docs/architecture.md 中固化为 worker-bound business scope（不等同于 software project / git repo）：

- **AGENTS.md**：产品定位段 (line 23-26) 与能力边界段 (line 75) 显式写明 Project scope 是 worker 在 host/workspace 维度绑定的业务作用域，并以 developer / HR / legal / finance / ops Soul 为示例；能力边界把 “project policy” 收口为 “scope policy”。
- **README.md**：顶部定位段 (line 11-14) 加 Soul-scope 例子；Features 中 Project Brain 一行改为 “每个业务作用域一份 5 类 brain 资产”。
- **docs/architecture.md**：Product Positioning 段加 scope 语义解释；topology 图节点从 `Project["Project repo"]` 改为 `Project["Host / Workspace Scope<br/>repo / hiring role / resume pool / case / queue"]`，brain 节点 “project policy” 改 “scope policy”；filesystem layout 段新增 “Project scope 语义” 子条；Overview 段 Brain provider 描述展开为 scope identity / artifacts / policies / workflow state / audit / retention。

零代码 / 零 schema / 零 CLI 改动；不修改已 completed 的 FEAT-050 / PLAN-088 文件与 changelog 条目。

验证：

- `git diff --check` ✅
- `rg -n "^<{7}|^>{7}|^={7}$"` ✅ 无真实 conflict marker
- AC1/2/3 grep 全部命中预期位置

## 2026-05-04 13:24 [progress] FEAT-053 / PLAN-096 — Project scope business-scope boundary

补充 Project Brain 的关键产品边界，并用独立 PMA 槽位承接，避免回写已经
completed 的 FEAT-050 / PLAN-088：

- `Project scope` 是 worker 在 host/workspace 维度绑定的业务作用域，不等同于
  software project、代码仓库或 PMA 项目。
- developer Soul 的 scope 可以是 repo；HR Soul 的 scope 可以是岗位、候选人池、
  简历库、筛选/归档/备份/审核流程；legal、finance、ops 等 Soul 也应围绕各自
  业务对象和证据链建模。
- Project Brain 的通用内核应服务 scope identity、artifacts、policies、
  workflow state、audit、retention、backup 和 context compilation，不内建
  developer-only 假设。
- 当前状态为 in_progress：文档改动已 staged，等待本会话 review 后再收口
  completed。

验证：

- `git diff --cached --check`

## 2026-05-04 13:04 [completed] FEAT-052 — bring-your-own executor integration strategy

合并 PLAN-093/094/095 三个切片：

- **Thin adapter contract**：`packages/shared/src/providers/executor.ts` 文件头与 `ExecutorProvider` 字段 JSDoc、`packages/core/src/worker/executor/factory.ts` 的 `buildExecutor` JSDoc、`docs/architecture.md` 的 “Thin executor adapter contract” 章节统一固化 5 项最小契约（health / run / cancel / resume / error classification）+ 3 条显式不承诺（no isolation / no effective capability source of truth / no tool loop ownership）。
- **Hermes spike plan**：当前 sandbox 不能联网调用 Hermes CLI，按 plan 范围 “是否落代码视 spike 结果” 只产 spike plan：触发条件、6 步任务、显式不做、AIWorker 侧已就位的前置准备。
- **OpenClaw configured runtime spec**：4 条硬约束（Configured runtime only / Workspace 由 OpenClaw 管 / Project overlay 只能是 bootstrap helper / 只接 agent run surface 不启用 OpenClaw channel-gateway hosting）+ adapter 输入输出契约表。

执行边界：本 task 全部产物为 docs + 代码注释，**没有**接入 Hermes / OpenClaw adapter，**没有**改 `ExecutorProvider` / `AgentEvent` schema。后续真正接入这两个 engine 各自走独立 PMA。

Epic 最终全量 gate（FEAT-048..052）：

- `bun run check`（typecheck + lint）✅
- `bun run test` ✅（shared 33 / fs-layout 18 / gateway-proto 19 / storage-sqlite 16 / gateway 148 / core 521 / api 71 / web 59 / cli 124 ≈ 1029 spec）
- `bun run build` ✅（cli bundle 0.98 MB / web fleet+worker dist 通过 CSS utility 检查）
- `git diff --check` ✅

---

## Product positioning pivot epic 总结（FEAT-048..052）

`AIWorker` 的产品定位转向已通过 5 个 task / 13 个 plan 完整落地：

| Task | 状态 | 核心交付 |
|------|------|---------|
| FEAT-048 | completed | 文档化产品定位为 Project Brain + Worker/Fleet aggregation runtime（PLAN-083/084） |
| FEAT-049 | completed | executor surface 收口为 BYO + project overlay；CLI 文案、schema 注释、doctor 输出按四档 readiness 重塑（PLAN-085/086/087） |
| FEAT-050 | completed | Project Brain 五类资产模型、brain-first onboarding、admission roadmap 全部成型（PLAN-088/089/090） |
| FEAT-051 | completed | 单张 canonical operator topology + 两层 status 契约固化（PLAN-091/092） |
| FEAT-052 | completed | thin adapter contract 固化 + Hermes/OpenClaw 接入 spec（PLAN-093/094/095） |

零 schema migration、零 runtime 行为破坏、零外部新接入；命令名 / 文件名 / 导出名 / issue code / 退出码 / 接口签名全部向后兼容。

## 2026-05-04 13:00 [progress] FEAT-052 / PLAN-095 — OpenClaw configured runtime spec

固化 OpenClaw 接入 AIWorker 的 spec：

- **Configured runtime only**：OpenClaw 必须由 operator 提供 `OPENCLAW_CONFIG_PATH` + `OPENCLAW_STATE_DIR`（或显式 agent profile / workspace），AIWorker 不默认 mint 一份 hermetic OpenClaw 运行环境。
- **Workspace 由 OpenClaw 管**：AIWorker 只把 per-conversation workspace 通过 `AgentRunInput.workspacePath` 传过去；Project Brain 通过 prompt / context 注入，不写 OpenClaw workspace。
- **Project overlay 只能是 bootstrap helper**：未来若 `executor-capabilities.json` 出现 `engines.openclaw.*`，只能表达 profile/workspace hint，不能替代 `OPENCLAW_CONFIG_PATH` 内容。
- **只接 agent run surface**：AIWorker 不启用 OpenClaw 的 channel / webhook / gateway hosting，避免与 AIWorker gateway / channels 语义重叠。

adapter 输入/输出契约表（health / listTools / run / cancel / resume / error）按 OpenClaw 实际能力收敛；具体 PLAN-093 契约 + 4 类错误分类（`not-configured` / `binary-missing` / `runtime-error` / `cancelled`）对齐 `FallbackExecutor`。

本切片仅 spec docs，不落 adapter 代码、不在 `packages/core/src/worker/executor/engines/` 创建 openclaw 子目录、不动 `executor-capabilities.json` schema。

## 2026-05-04 12:58 [progress] FEAT-052 / PLAN-094 — Hermes thin adapter spike plan

PLAN-094 在当前 sandbox 不能联网调用 Hermes CLI，按 plan “是否落代码视 spike 结果” 的范围只产 spike plan，不引入 Hermes adapter 代码：

- **触发条件**：operator 提供能跑真实 Hermes CLI 的环境（保留真实 user HOME / HERMES_HOME），且 Hermes CLI 暴露 machine-readable JSONL 或 JSON-RPC 输出。
- **6 步 spike 任务**：binary path / version → non-interactive run JSON 形态 → session/resume binding → cwd-context 文件加载 → user/host config 隔离实验 → 输出 AgentEvent 映射草案 + cancel/abort 实现路径 + 错误分类建议。
- **显式不做**：不接管 Hermes memory / skills / MCP / profile；不改 `ExecutorProvider` 或 `AgentEvent` schema；spike 阶段代码原型只放 `tmp/hermes-spike/`。
- **AIWorker 侧前置已就位**：PLAN-093 thin adapter 契约、PLAN-086 doctor 四档 readiness（含 ambient runtime INFO 行）、`aiworker executor mcp` 当前 codex/claude-code 两 engine 限制。

## 2026-05-04 12:57 [progress] FEAT-052 / PLAN-093 — bring-your-own executor thin adapter contract

把 ExecutorProvider 接口的 thin adapter 契约固化到代码注释与 architecture docs：

- `packages/shared/src/providers/executor.ts` 加文件头 JSDoc，列出 5 项最小契约（health / run / cancel / resume / error classification）和 3 条显式不承诺（no isolation / no effective capability source of truth / no tool loop ownership）；`ExecutorProvider` interface 的每个方法补 inline JSDoc。
- `packages/core/src/worker/executor/factory.ts` `buildExecutor` JSDoc 增 “Each constructed engine MUST honour …” 段，引用 shared 文件头。
- `docs/architecture.md` 新增 “Thin executor adapter contract” 子章节：方法表 + 显式不承诺 + engine-specific extension 留在 engine module 的硬要求；这是后续 Hermes / OpenClaw 等 engine 接入的 baseline。

零运行时变化、不接入新 engine、不改 `AgentEvent` schema。

## 2026-05-04 12:54 [completed] FEAT-051 — strengthen Worker/Fleet aggregation surface

合并 PLAN-091/092 两个切片：

- **Topology**：architecture.md 的两张 mermaid 图作为 canonical source；README 顶部 ASCII 拓扑 + deployment.md 顶部 “Operator topology” 段同源。三处都强调 gateway = control plane（fleet.db 只持指针 + audit）/ worker = data plane（worker.db + Project Brain）/ external executor 只在 worker 内由薄 adapter 调用。
- **Aggregation 契约**：architecture.md 新增 “Worker/Fleet aggregation surface” 章节，固化两层数据源 + status summary 字段表 + UI/CLI 边界。`docs/cli.md` Fleet 管理段对齐两层输出分流。

PLAN-091/092 均为文档变更；运行时与 schema 零改动。后续 fleet UI 与 CLI fleet 命令按需在新契约下迭代。

## 2026-05-04 12:53 [progress] FEAT-051 / PLAN-092 — worker/fleet aggregation surface

固化 worker status 聚合契约：

- `docs/architecture.md` 新增 “Worker/Fleet aggregation surface” 章节，定义两层数据源：
  - **Layer 1 — fleet.db pointer + audit**（gateway 持有）：identity、presence、lastSeenAt、控制面事件，永不含 brain / 对话 / secret。
  - **Layer 2 — per-worker `/api/worker/info`**（按需经 gateway routing 拉）：runtimeVersion、brain sources、executor + controlExecutor、channels。
- 表格列出 status summary 字段，说明 conversations / messages 永不出 worker.db。
- 明确 UI/CLI 边界：Fleet UI 只走 gateway WS / Worker Admin 只走本机 worker REST / CLI fleet 命令按 method routing 分流；任何路径都不绕过 gateway 直连 worker REST。
- `docs/cli.md` Fleet 管理段加入两层输出分流说明，`fleet list` 与 `fleet info` 章节同步指出 brain / executor / runtimeVersion 字段现取不缓存。

不新增 executor capability inventory；fleet.db 仍只持指针 + audit。

## 2026-05-04 12:51 [progress] FEAT-051 / PLAN-091 — operator topology 共享 canonical 图

把 worker/fleet topology 用同一份描述贯穿三个文档：

- `docs/architecture.md` 的两张 mermaid 拓扑图标注为 **canonical source**，README / deployment.md 引用它。
- `README.md` 顶部新增 “Operator topology（一图 canonical）” 章节，ASCII 图 + 三句要点强调：Gateway = control plane（fleet.db 只持指针 + audit）/ Worker = data plane（worker.db + Project Brain）/ External executor 只在 worker 内由薄 adapter 调用，AIWorker 不通过 gateway 触达 engine。
- `docs/deployment.md` 顶部新增 “Operator topology（部署前必读）” 段，三档部署形态都共享同一拓扑。

不改 gateway protocol、不改 enrollment。

## 2026-05-04 12:49 [completed] FEAT-050 — strengthen Project Brain product surface

合并 PLAN-088/089/090 三个切片：

- **资产模型**：architecture / cli docs / README 把 Project Brain 拆成五类资产（identity、memory、brain skills、policy & drafts、admission state），明确所有者、读写规则与 CLI 入口；`.aiworker/executor-capabilities.json` 从 brain 资产中显式排除。
- **Diagnostics & onboarding**：`aiworker init` next-steps 重排成 brain-first；`aiworker doctor` 输出加 Brain identity 子段并指向 `aiworker brain status`；`brain status` JSON 加 `assets` 块（identity + skill/memory count + 空状态非强制 hint）；Worker Admin Test 面板 header 强调 brain → executor → channel 顺序。
- **Admission roadmap**：architecture.md 新增 4 段路线（proposal 模型 / storage 选型 / approval surface / 唯一免审 runtime 写入），明确 admission flow 不复用 executor capability 通路；本切片不落 DB migration、不实施 CLI/API/UI。

验证：

- `bun run typecheck` ✅
- `bun run lint` ✅
- `bun run test` ✅（shared 33 / fs-layout 18 / gateway-proto 19 / storage-sqlite 16 / gateway 148 / core 521 / api 71 / web 59 / cli 124 ≈ 1029 spec）

## 2026-05-04 12:46 [progress] FEAT-050 / PLAN-090 — brain admission and approval roadmap

`docs/architecture.md` 新增 “Brain admission roadmap” 子章节，把 brain runtime 自动生成 proposal 的 admission 流程拆成 4 段：proposal 模型字段（evidence / scope / confidence / rollback / summary）、storage 选型（worker.db 新表，**不**进 fleet.db）、approval surface 三档（CLI `aiworker brain admission ...` / API `apps/api/src/worker/brain/admission/*` / Worker Admin 新视图）、唯一免审 runtime 写入（pre-compaction memory flush）。

明确红线：admission flow 不复用 executor MCP / engine plugin 通路；命名严格使用 `brain admission` / `brain memory` / `brain skill` / `project policy`，与 `executor capability` / `executor mcp` 完全隔离。

本计划不落 DB migration、不实施 admission CLI/API/UI；后续这些进入独立 PMA 任务。

## 2026-05-04 12:44 [progress] FEAT-050 / PLAN-089 — brain diagnostics and onboarding UX

把 Project Brain 显式抬到 onboarding 与 diagnostics 输出最前：

- `aiworker init` 的 project 与 user 两组 next-steps 都重排，标题加 “Project Brain comes first; executor is bring-your-own”；step 2/3 把 brain identity 与 `aiworker brain status` 排在 doctor 与 executor 前。
- `aiworker doctor` 输出在 capability validation 之前加 Brain identity 子段（AGENT/SOUL/USER/MEMORY PASS/WARN），并提示用 `aiworker brain status` 拿运行时 skill/memory 计数。
- `aiworker brain status` JSON 输出新增 `assets`：`identity` 三件套存在性 + root、`skillCount`、`memoryCount`，空状态给出非强制 hint，operator 不会被默认推动写入 brain 资产。
- Worker Admin Test 面板 header 文案明确 brain → executor → channel 顺序，BrainTestCard 已经在前。

验证：

- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun test apps/cli/src/commands/worker/doctor.test.ts apps/cli/src/commands/worker/init.integration.test.ts` (18/18)
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-web' test` (16 files / 59 tests)
- `bun x eslint <changed files>` 无告警

## 2026-05-04 12:39 [progress] FEAT-050 / PLAN-088 — Project Brain asset model

把 Project Brain 显式拆成五类资产，明确每类的所有者、读写规则与当前 CLI 入口，建立 brain ↔ executor capability 的命名隔离：

- `docs/architecture.md` 新增 “Project Brain asset model” 子章节，表格枚举 identity / memory / brain skills / policy & drafts / admission state；明确 `.aiworker/executor-capabilities.json` 不属于 brain 资产。
- `docs/cli.md` brain 命令段顶部加入同样的五类资产小表，跟 brain 只读命令本身的描述衔接。
- `README.md` Features 中 Project Brain 一行从笼统措辞展开为五类资产摘要。

不新增 mutating brain command，不实现 admission DB schema；admission state 只指向 PLAN-090 roadmap。

## 2026-05-04 12:37 [completed] FEAT-049 — simplify executor surface around bring-your-own runtimes

合并 PLAN-085/086/087 三个切片：

- AIWorker 显式不再把自己当成 executor-native capability lifecycle 平台。`.aiworker/executor-capabilities.json` 在 schema 注释、CLI 输出、CLI help、aiworker.ts 命令描述、up.ts readiness 注释中统一表达为 **project executor overlay / bootstrap hint**。
- `aiworker executor doctor` 与 `aiworker up` doctor stage 输出按四档 readiness 分组：binary likely ready（缺失 WARN 不 FAIL）、ambient runtime INFO（提示 user/host MCP/skills/plugins/auth/native sessions 不归 AIWorker 管）、project overlay 静态校验、blocking policy（仅 invalid descriptor / 明文 secret / projection 错误才 FAIL）。
- 命令名（`executor mcp add/sync`、`executor capability list/show`、`executor doctor`、`executor select`）、文件名（`.aiworker/executor-capabilities.json`）、所有 zod schema 导出（含 `executorNativeCapabilityDescriptorSchema`）、issue code、退出码语义全部保持向后兼容；零运行时行为变化。

验证：

- `bun run typecheck` ✅
- `bun run lint` ✅
- `bun run test` ✅（shared 33 / fs-layout 18 / gateway-proto 19 / storage-sqlite 16 / gateway 148 / core 521 / api 71 / cli 124 ≈ 970 spec）

## 2026-05-04 12:33 [progress] FEAT-049 / PLAN-087 — executor CLI wording and help cleanup

把 CLI 中残留的 “executor 原生能力 manifest / executor-native capability lifecycle” 等措辞收口到 project executor overlay 语义：

- `apps/cli/src/help.ts` 的 6 条 executor command summary 改写：`executor doctor` 明确 “不探测 user/host ambient capabilities”，`executor mcp add/sync` 表述为 overlay hint / best-effort projection。
- `apps/cli/src/aiworker.ts` 顶层与 `worker executor ...` 镜像入口的 10 条 command description 同步。
- `apps/cli/src/commands/worker/up.ts` stage 4 readiness 的注释、跳过文案、next-step 提示同步成 overlay 措辞。
- `apps/cli/src/commands/worker/executor.ts` 的 `invalid project executor overlay manifest` 与 `Secret-like project executor overlay field` 两条文案同步。

不重命名命令（`executor capability ...` 仍存在）、不删除子命令、不变 issue code、不变 zod schema。

验证：

- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun test apps/cli/src/commands/worker/executor.test.ts` (11/11)
- `bun test apps/cli/src/commands/worker/up.test.ts apps/cli/src/aiworker.test.ts` (38/38)
- `bun x eslint <changed files>` 无告警

## 2026-05-04 12:29 [progress] FEAT-049 / PLAN-086 — ambient executor readiness and doctor semantics

把 `aiworker executor doctor` 与 `aiworker up` doctor stage 的输出统一重塑为四档 readiness：

1. **binary likely ready**：每个 engine 检查 CLI 是否在 PATH；缺失只 WARN 不 FAIL，operator 可以继续跑别的 task executor。
2. **ambient runtime**：每个 engine 输出 `INFO ambient runtime: user/host MCP/skills/plugins/auth/native sessions live outside AIWorker`，外加全局 `INFO engine login/auth state is managed by each engine CLI`。
3. **project overlay**：保留对 `.aiworker/executor-capabilities.json` 的静态校验；空 overlay 仍是 WARN。
4. **blocking policy**：只有 invalid descriptor、明文 secret 或 projection 命令失败才让整体 Status FAIL（退出码 1）。

`docs/cli.md` doctor 章节同步改写。`runExecutorDoctor` 把 binary 缺失从 issue（error）改为 binary warning，整体 status 由 issues + warnings 共同 rollup；`inspectExecutorReadiness` 数据结构无破坏性变化，up.ts `printExecutorReport` 共享同一套 wording。

验证：

- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun test apps/cli/src/commands/worker/executor.test.ts` (11/11)
- `bun test apps/cli/src/commands/worker/up.test.ts` (5/5)

## 2026-05-04 12:25 [progress] FEAT-049 / PLAN-085 — executor capability overlay semantics

完成 FEAT-049 的第一步切片，把 `.aiworker/executor-capabilities.json` 的产品语义从 “executor-native capability manifest” 显式降级为 **project executor overlay / bootstrap hint**：

- `packages/shared/src/executor-capabilities.ts` 加文件头 JSDoc 与每个导出的语义注释，强调它不是 effective executor capability source of truth、不是 isolation 边界。保留所有导出名（含 `executorNativeCapabilityDescriptorSchema`）以避免破坏外部引用。
- `apps/cli/src/commands/worker/executor.ts` 收口 4 处用户可见文案：doctor 标题、overlay entries 计数、`executor capability list` 空提示、empty-manifest issue/warning message；issue code、`Status: PASS/WARN/FAIL` 标签、退出码语义全部保持。
- `packages/fs-layout/src/index.ts` 把 layout 顶部与 `ensureProjectAiworker` 上方的注释从 “executor-native projection state” 改为 overlay/hint。
- 跟随更新 `executor.test.ts` 与 `executor-capabilities.test.ts` 的 describe/assert 文案。

验证：

- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun test packages/shared/src/executor-capabilities.test.ts` (4/4)
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun test apps/cli/src/commands/worker/executor.test.ts` (10/10)
- `bun run --filter '@zonease/aiworker-fs-layout' typecheck`
- `bun test packages/fs-layout/src/index.test.ts` (18/18)
- `bun x eslint <changed files>` 无告警

## 2026-05-04 11:22 [decision] FEAT-048 / PLAN-083..084 — product positioning pivot

确认 AIWorker 产品定位收敛为 **Project Brain + Worker/Fleet aggregation runtime**：

- AIWorker 的核心卖点是 Project Brain、worker identity/state、gateway routing、
  fleet presence、audit、admin UI 和远程 worker 管理。
- Executor 采用 bring-your-own external agent runtime 模型；Codex、Claude
  Code、Hermes、OpenClaw、Cursor 等继续拥有自己的 MCP、skills、plugins、
  auth、sandbox、approval 和 native sessions。
- AIWorker 默认不做通用 executor isolation，也不把 project executor overlay
  表达为完整 effective capability source of truth。
- 新增 `FEAT-048..052` 与 `PLAN-083..095`，后续按 PMA 分阶段收口 executor
  surface、强化 Project Brain、强化 Worker/Fleet aggregation，并定义 Hermes /
  OpenClaw 等外部 executor 的薄 adapter 策略。

验证：

- `git diff --check`

## 2026-05-04 10:34 [completed] BUG-053 / PLAN-082 — Codex text replay evidence closeout

关闭 Codex executor 疑似 final text replay 跟踪：

- 本地真实 `codex-cli 0.128.0` + 临时 project-scope worker 的安全 marker
  探针只观察到多段 append-only `orchestrator.text` delta，随后
  `orchestrator.finished`，未出现完整最终文本重放。
- 直接 `codex app-server` 探针确认当前协议路径为
  `item/agentMessage/delta` → `thread/tokenUsage/updated` →
  `turn/completed`，未观察到 legacy `codex/event/assistant_message` full-text
  snapshot；fallback pin `@openai/codex@0.121.0` 也走 current protocol。
- 保持 production Codex executor 行为不变；仅把 Codex current-protocol stub
  改成多段 delta，并新增回归断言：delta 串联后只出现一次最终文本。

验证：

- `bun test packages/core/src/worker/executor/engines/codex/executor.test.ts`
- `bun test packages/core/src/worker/executor/engines/codex/normalize.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`

## 2026-05-04 10:04 [progress] BUG-053 — Codex text replay follow-up

新增 `BUG-053` 跟踪 Codex executor 下疑似同类文本重复问题：

- 用户反馈在 Codex executor 下也遇到过类似现象：append-only text delta
  已渲染后，后续疑似又 replay 最终完整文本，导致下游重复显示。
- 该问题与 `BUG-052` 相关但不合并处理；`BUG-052` 已确认并修复 Claude Code
  path，`BUG-053` 先要求捕获或排除 Codex 的真实 event shape。
- 当前 Codex normalizer 对 legacy `codex/event/assistant_message` 支持
  `delta` 与 full `text` fallback；current protocol `item/agentMessage/delta`
  已作为 delta 映射，尚缺 streamed-delta-then-final-text 的聚焦覆盖。

## 2026-05-04 02:47 [completed] BUG-052 / PLAN-081 — Claude Code streamed text append-only

修复 Claude Code executor 在 partial `stream_event` 文本之后又把完整
assistant text block 作为 `orchestrator.text.payload.delta` 重放的问题：

- 明确 `orchestrator.text.payload.delta` 是 append-only 文本增量，不是最终
  完整快照；`docs/cli.md` 已补充该契约。
- Claude Code executor 现在记录本轮已流出的 assistant 文本前缀，并在后续
  final assistant block 到达时移除已流前缀；无 partial text 的 buffered 输出
  仍保留原 final text fallback。
- 保持 tool events、token usage、finish、engine binding 和 `--resume` 行为不变。

验证：

- `bun test packages/core/src/worker/executor/engines/claude-code/executor.test.ts`
- `bun test packages/core/src/worker/orchestrator/service.claude-code.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-core' test`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- `bunx eslint packages/core/src/worker/executor/engines/claude-code/executor.ts packages/core/src/worker/executor/engines/claude-code/executor.test.ts packages/core/src/worker/orchestrator/service.claude-code.test.ts`
- `git diff --check`

## 2026-05-04 02:07 [progress] BUG-052 — remote published CLI Claude Code validation follow-up

记录远端 Coder workspace 中发布版 CLI + Claude Code executor 的验证发现：

- 使用 `@zonease/aiworker-cli@0.5.3` npm 发布包在
  `/home/ben/projects/debug-aiworker/release-cli-claude-code` 初始化
  project-scope worker，并选择 `claude-code/default`。
- `aiworker doctor` 通过；`executor doctor --engine claude-code` 的核心
  readiness 通过，仅有空 executor capability manifest / 空 MCP 声明警告。
- 真实 `aiworker run`、同 `chat-id` 连续性、`sessions list/show` 的脱敏
  engine binding、loopback `serve`、`/health`、`/admin/` 和未认证
  `/api/worker/info` 401 行为均验证通过。
- 新增 `BUG-052` 跟进 `orchestrator.text` 在分段 delta 之后又以 `delta`
  发送完整最终文本，导致 append-only SSE/CLI consumer 可能渲染重复内容。

## 2026-05-03 23:33 [progress] QA-003 / PLAN-080 — Soul brain executor validation follow-ups

记录 `/Users/ben/projects/aiben` 本地 Soul / brain / executor 调试样本，并落盘
后续优化/修复计划：

- `QA-003` 完成本次验证记录：9 个内置 Soul 的 fresh init、runtime brain
  diagnostics、executor readiness、真实 Codex-backed identity replies，以及
  Codex hand probe。
- `BUG-050` 跟进真实 Codex shell/file activity 未进入 AIWorker
  `orchestrator.tool_call` 事件流的问题。
- `BUG-051` 跟进 `executor mcp add --arg -y` 被 CLI parser 解析为 unknown
  option 的 stdio argument UX 问题。
- `TODO-008` 跟进把本次手工矩阵沉淀成可重复、可脱敏、local-only 的 Soul /
  brain / executor validation harness。
- `PLAN-080` 作为 draft 方案，等待批准后再实现。

## 2026-05-03 21:39 [completed] REL-012 / PLAN-079 — publish CLI 0.5.3

发布 `@zonease/aiworker-cli@0.5.3`：

- GitHub Actions release workflow `25280654558` 成功。
- npm latest 解析到 `0.5.3`。
- GitHub Release `v0.5.3` 上传 linux-x64、linux-arm64、darwin-x64、darwin-arm64 tarballs。
- published CLI smoke 通过：`--version` 报告 `aiworker/0.5.3`；
  `init --global` next steps 不再包含 project-only `aiworker executor doctor`；
  `up --dry-run` 继续显示 omitted port `(env/default)` 且不含 `NaN`。

## 2026-05-03 21:35 [progress] REL-012 / PLAN-079 — prepare CLI 0.5.3 release

启动 `@zonease/aiworker-cli@0.5.3` patch release：

- 当前 npm latest、GitHub Release 和远端 tag 均为 `0.5.2`。
- 本次 release 包含 `FEAT-046` worker local brain activation、`FEAT-047`
  executor bootstrap lifecycle，以及 `BUG-049` user/explicit init next-step polish。
- 本地 release gates 已通过；等待 release commit、`v0.5.3` tag push、
  GitHub Actions release workflow、npm / GitHub Release 验证和 published-package smoke。

验证：

- `bun run test`
- `bun run typecheck`
- `bun run lint`
- `bun run build`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-run`
- `bun run --filter '@zonease/aiworker-cli' smoke:aiworker-fleet`
- built CLI `--version` / `init --global` / `up --dry-run` smoke
- `cd apps/cli/dist && bun publish --dry-run --access public`（完成 pack 后停在本机 npm auth boundary）
- `git diff --check`

## 2026-05-03 21:27 [completed] BUG-049 — user-scope init next-step polish

修复 `aiworker init --global` / explicit `AIWORKER_HOME` init 的 next steps：
不再提示 project-only 的 `aiworker executor doctor --engine codex`，避免用户按
引导在 user/explicit scope 立即撞到 exit 2。Project-scope init 仍保留 executor
readiness guidance。

验证：

- `bun test --timeout=30000 apps/cli/src/commands/worker/init.integration.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`

## 2026-05-03 13:44 [completed] FEAT-047 / PLAN-074..078 — executor bootstrap lifecycle

完成 worker executor bootstrap lifecycle track：

- `executor doctor` 与 `aiworker up` 的 executor readiness 输出现在区分
  configured task executor、engine CLI availability、declared executor-native
  capabilities 和 projection compatibility；空 manifest / 默认 stub executor
  显示为 WARN，不再被误读成完整 bootstrap PASS。
- Codex MCP projection 改为当前 `codex mcp add` 参数面：HTTP 只生成
  `--url` / `--bearer-token-env-var`，stdio 走 `-- <command> ...args`，不再
  输出 Codex 不支持的 `--scope` / `--transport` / generic `--header`。
- 新增 `aiworker executor select`，默认 dry-run，`--apply` 才只替换
  `worker_config.configJson.executor`，保留 `--if-match` version guard，且不写
  engine project config 或 executor capability manifest。
- `.aiworker/executor-capabilities.json` 增加 engine plugin / skill / policy
  lifecycle descriptor，并新增只读 `executor capability list/show`；brain skill、
  Soul capability pack、runtime toolset 与 `.aiworker/mcp.json` 仍保持隔离。
- `/Users/ben/projects/aiben` 真实 HOME smoke：`codex-cli 0.128.0`，project
  scope 与 `doctor` PASS，当前 task executor 已是 `codex/default`，executor
  doctor/up dry-run 对空 executor-native manifest 给出 non-blocking WARN，
  `aiworker run --message "hello" --dry-run` 可构建 Codex runtime。

验证：

- `bun test apps/cli/src/commands/worker/executor.test.ts`
- `bun test apps/cli/src/commands/worker/up.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/worker/init.integration.test.ts packages/shared/src/executor-capabilities.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run typecheck`
- `bun run lint -- apps/cli/src/commands/worker/executor.ts apps/cli/src/commands/worker/up.ts apps/cli/src/aiworker.ts apps/cli/src/help.ts packages/shared/src/executor-capabilities.ts packages/core/src/index.ts`

## 2026-05-03 13:28 [completed] FEAT-046 / PLAN-073 — worker local brain activation

完成 worker local brain activation track：

- 新 seed worker 默认挂载 writable `local-filesystem` brain source，project
  scope 指向 `<project>/.aiworker/`，user / explicit scope 仍走 worker home
  下的 brain layout。
- `GET /api/worker/info`、`POST /api/worker/brain/test`、Worker Admin Test
  面板和新增 `aiworker brain status|skills|memories` 只读命令都会展示 runtime
  brain source 的 health、priority、read-only、write-target 与 effective home。
- Brain admission 边界写入架构文档：generated memory / brain skill / policy
  proposal 入 filesystem 前必须经过带 evidence / scope / confidence / rollback
  的显式 approval；executor-native capability 继续只走
  `.aiworker/executor-capabilities.json` 与 `aiworker executor ...`。
- `/Users/ben/projects/aiben` 已完成真实 Codex-backed worker smoke：filesystem
  skill / memory 被 runtime 扫出，`doctor` PASS，dry-run runtime 可构建，真实
  `aiworker run` 到达 `orchestrator.finished`，worker HTTP `/info` 与
  `/brain/test` 均报告 `local-filesystem` healthy。

## 2026-05-03 13:09 [progress] FEAT-047 / PLAN-074..078 — executor bootstrap lifecycle planning

启动长期 worker executor bootstrap track：

- 新建 `FEAT-047`，作为 executor readiness、engine selection、
  engine-native capability projection 和真实 Codex-backed validation 的
  umbrella task。
- 拆出 draft plans：
  - `PLAN-074` executor readiness semantics and first-run guidance。
  - `PLAN-075` Codex MCP projection compatibility with the current Codex CLI。
  - `PLAN-076` explicit executor selection/bootstrap command。
  - `PLAN-077` engine-native capability lifecycle beyond MCP。
  - `PLAN-078` real Codex-backed worker validation campaign。
- 记录 `/Users/ben/projects/aiben` 当前调查结论：`executor doctor --engine
  codex` 会因为 Codex CLI 存在而通过，但 `.aiworker/executor-capabilities.json`
  仍可能为空；当前 Codex MCP dry-run 生成的 command 还包含
  `codex-cli 0.125.0` 不支持的 `--scope` / `--transport` 参数。

## 2026-05-03 13:03 [progress] FEAT-046 / PLAN-073 — local filesystem brain activation

启动长期 worker brain activation track：

- 在 `/Users/ben/projects/aiben` 复现缺口：Soul/project brain 文件存在，
  `aiworker doctor` 通过，但 `aiworker config show` 仍显示 `brains: []`。
- 新建 `FEAT-046` / `PLAN-073`，按阶段推进：默认本地 filesystem brain、
  runtime diagnostics、brain inspection commands、admission gates，以及真实
  Codex-backed 验证。
- S1 将新 seed 的默认 worker config 改为挂载 writable `local-filesystem`
  source，同时继续把 executor-native capability 隔离在
  `.aiworker/executor-capabilities.json`。
- 聚焦验证已通过：core bootstrap/config tests、CLI init integration test、
  core typecheck、CLI typecheck、完整 `@zonease/aiworker-core` test，以及
  `/Users/ben/projects/aiben` fresh-project smoke。

## 2026-05-03 11:25 [release] REL-011 / PLAN-072 — CLI 0.5.2 published

Released `@zonease/aiworker-cli@0.5.2` as the superseding patch for `0.5.1`:

- GitHub Actions release workflow `25268701486` passed for `v0.5.2`.
- npm `@zonease/aiworker-cli` latest resolves to `0.5.2`.
- GitHub Release `v0.5.2` includes linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.
- Published-package smoke reports `aiworker/0.5.2`; `aiworker up --soul
  developer --dry-run --no-open --no-serve-web` now prints
  `port         : (env/default)` and does not contain `NaN`.

## 2026-05-03 11:19 [progress] REL-011 / PLAN-072 — prepare CLI 0.5.2 release

Started the `@zonease/aiworker-cli@0.5.2` superseding patch release:

- Bumped `apps/cli/package.json` from `0.5.1` to `0.5.2`.
- Release scope is the command-layer `BUG-042` fix plus the already published
  post-0.5.0 fixes from `0.5.1`.
- Published-package smoke for `0.5.2` must verify omitted `--port` prints
  `(env/default)` and does not contain `NaN`.

Next step: run local release gates, commit the release bump, tag `v0.5.2`,
then verify the tag-triggered GitHub release workflow and published package.

Local release gates passed: workspace tests, typecheck, lint, build, CLI smoke
scripts, dist artifact checks, built CLI omitted-port smoke, publish dry-run to
the local auth boundary, and `git diff --check`.

## 2026-05-03 11:18 [BUG-P3] BUG-042 — command-layer optional number normalization

Fixed the remaining `aiworker up --dry-run` omitted-port path after published
`0.5.1` smoke showed the direct `runUp()` fix was not enough:

- CLI command actions now normalize omitted optional numeric arrays from CAC
  before calling command handlers, so missing `--port` / timeout / pagination
  options do not leak `[NaN]` into command options.
- `aiworker up` integration coverage now exercises the actual CLI entrypoint
  with omitted `--port` and asserts `(env/default)` instead of `NaN`.

Validation:

- Manual CLI entrypoint check: `bun apps/cli/src/aiworker.ts up --soul developer --dry-run --no-open --no-serve-web`
- `bun test apps/cli/src/commands/worker/up.integration.test.ts apps/cli/src/commands/worker/up.test.ts apps/cli/src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`

## 2026-05-03 11:18 [release] REL-010 / PLAN-071 — CLI 0.5.1 published, superseded by 0.5.2

Released `@zonease/aiworker-cli@0.5.1`, but post-publish smoke found
`BUG-042` still reproduced through the CLI command layer:

- GitHub Actions release workflow `25268314569` passed for `v0.5.1`; npm
  `latest` resolved to `0.5.1`; GitHub Release uploaded the four platform
  tarballs.
- Published-package smoke reported `aiworker/0.5.1`, then
  `aiworker up --soul developer --dry-run --no-open --no-serve-web` still
  printed `port         : NaN`.
- `0.5.1` is therefore superseded by the follow-up `0.5.2` release.

## 2026-05-03 10:59 [progress] REL-010 / PLAN-071 — prepare CLI 0.5.1 release

Started the `@zonease/aiworker-cli@0.5.1` patch release:

- Bumped `apps/cli/package.json` from `0.5.0` to `0.5.1`.
- Release scope includes completed post-0.5.0 fixes `BUG-042` through
  `BUG-048` plus the `QA-002` validation record.
- `TODO-007` remains a P3 polish follow-up and is not a release blocker.

Local release gates passed: workspace tests, typecheck, lint, build, CLI smoke
scripts, artifact checks, publish dry-run to the local auth boundary, and
`git diff --check`.

Next step: commit the release bump, tag `v0.5.1`, then verify the
tag-triggered GitHub release workflow and published package.

## 2026-05-03 10:59 [BUG-P3] BUG-042 — `aiworker up --dry-run` omitted port output

Fixed a dry-run display bug in `aiworker up`:

- Omitted `--port` now prints `port         : (env/default)` instead of
  `port         : NaN`.
- Explicit dry-run port output is preserved.
- Serve startup behavior is unchanged.

Validation:

- `bun test apps/cli/src/commands/worker/up.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`

## 2026-05-03 10:39 [BUG-P2] BUG-047 / PLAN-070 — Worker Admin no-token locked state

Fixed the Worker Admin no-token experience:

- Worker Admin now renders a locked state before protected query hooks mount
  when the browser has no bearer token, preventing background `/api/worker/*`
  polling from flooding 401s.
- The locked state lets an operator paste the current worker bearer token into
  the current tab, using the existing `sessionStorage` auth model.
- Worker API client error normalization now handles legacy top-level
  `{ code, message }` auth failures without rendering raw JSON.
- Worker Web auth comments and `aiworker serve` admin URL output now agree that
  `/api/worker/*` requires bearer auth; `serve` still avoids printing tokenized
  URLs and points operators to `--open` for URL-fragment injection.

Validation:

- `bun run --filter '@zonease/aiworker-web' test -- src/worker/__tests__/bootstrap.test.tsx src/worker/__tests__/responsive-shell.test.tsx src/worker/api.test.ts`
- `bun test apps/cli/src/commands/worker/serve.test.ts`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- focused ESLint on touched Worker Web and CLI files
- `git diff --check`

## 2026-05-03 10:38 [BUG-P2] BUG-046 / PLAN-069 — Executor tiny probe hard timeout

修复 Worker Admin executor tiny probe 可能长期 pending 的问题：

- `handleExecutorTest()` 的 tiny probe stream iteration 现在带管理层 hard
  timeout；即使 executor stream 忽略 abort 且永不 yield，也会返回 degraded
  timeout 结果。
- Tiny probe 超时仍保持现有 API shape：HTTP 200、`status: degraded`、
  `tinyProbe.ok=false` 和 timeout `probeError`。
- Worker Admin `testExecutor()` 增加客户端请求 timeout，避免后端或网络不返回时
  mutation 永久 pending。
- Test panel 对 tiny probe timeout 展示恢复提示，按钮会在 error/degraded 后恢复
  可点击。

Validation:

- `bun test packages/core/src/worker/management/executor-test.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/api.test.ts src/worker/features/test/test-panel.test.tsx`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- focused ESLint on touched core/Web files
- `git diff --check`

## 2026-05-03 10:37 [BUG-P1] BUG-048 / PLAN-067 — legacy HOME `.aiworker` no longer skips Soul

修复 `aiworker init` 在旧 user-scope `~/.aiworker/` 下误判 project scope 的问题：

- 未带 project Soul markers 的 `$HOME/.aiworker/` 不再被 `resolveProjectRoot()` 当作 project root，`aiworker scope` 会报告 `user`。
- existing project init 分支如果缺少 `.aiworker/AGENT.md` 或 `.aiworker/SOUL.md`，会重新要求 Soul；非交互模式继续 fail closed 并提示 `--soul <preset>`。
- 已有 Soul material 的 project root 保持幂等 re-init，不覆盖现有 persona 文件。
- `--global` 和 `AIWORKER_HOME` 显式路径仍走 legacy user/explicit scope。

Validation:

- `bun test packages/fs-layout/src/index.test.ts`
- `bun test apps/cli/src/commands/worker/init.integration.test.ts`
- `bun test apps/cli/src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-fs-layout' typecheck`
- Manual reproduction for legacy `$HOME/.aiworker/`
- `git diff --check`

## 2026-05-02 21:46 [BUG-P1] BUG-045 / PLAN-068 — orchestrator task lifecycle persistence

Fixed stale Worker Admin / HTTP orchestrator task rows:

- `agent_tasks` now records `running`, `succeeded`, `failed`, and `cancelled`
  lifecycle transitions instead of staying at the initial `queued` state.
- Task-backed conversations now persist `conversations.task_id`, and task rows
  persist `conversation_id` so the Worker Admin task view can join work back to
  the conversation that processed it.
- Successful tasks write compact result metadata with the conversation id,
  assistant message id, and assistant text length.
- Failed tasks write a completion timestamp and a truncated, redacted error
  string.
- Selected conversation continuations link their `agent_tasks` row to the
  existing conversation without overwriting the single-value
  `conversations.task_id` field.

Validation:

- `bun test packages/core/src/worker/orchestrator/service.history.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bunx eslint packages/core/src/worker/orchestrator/service.ts packages/core/src/worker/orchestrator/service.history.test.ts`
- `bun run --filter '@zonease/aiworker-core' test`
- `git diff --check`

## 2026-05-02 21:29 [BUG-P1] BUG-044 / PLAN-066 — Worker Admin selected conversation continuation

Fixed Worker Admin Chat continuation for selected conversations:

- Added a selected conversation continuation API at
  `POST /api/worker/orchestrator/conversations/:id/messages`.
- Added `Orchestrator.continueConversation()`, which reuses the selected
  conversation's active session route instead of creating `chatId =
  task:<task-id>`.
- Worker Admin Chat now separates explicit new-conversation sends from
  selected-conversation continuation sends.
- Focused core coverage verifies that continuation appends to the same
  conversation row and reuses the executor-native binding.

Validation:

- `bun test packages/core/src/worker/orchestrator/service.history.test.ts`
- `bun test apps/api/src/worker/orchestrator/routes.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/features/chat/chat-panel.test.tsx src/worker/api.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- focused ESLint on touched core/API/Web files
- `git diff --check`

## 2026-05-02 21:02 [BUG-P1] BUG-043 / PLAN-065 — Worker Admin SSE keepalive

Fixed Worker Admin Chat live updates for slow executor replies:

- Direct worker `GET /api/worker/events/stream` now writes initial
  `: connected` and periodic `: keepalive` SSE comment frames below Bun's
  default HTTP idle timeout.
- Stream cleanup now runs on request/stream abort so heartbeat timers and bus
  subscriptions do not leak after the browser closes the subscription.
- Added API coverage for a byte-idle stream that receives no intermediate text
  events before a later worker bus event, and Web coverage that keepalive
  comments are ignored by the Worker Admin SSE parser.
- Real local Worker Admin smoke passed with a temporary Codex-backed worker:
  a prompt submitted at 21:00:58 displayed `BUG043_LIVE_OK` live at 21:01:22
  without a page reload.

Validation:

- `bun test apps/api/src/worker/events/routes.test.ts`
- `bun run --filter '@zonease/aiworker-web' test -- src/worker/api.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-web' typecheck`
- `bunx eslint apps/api/src/worker/events/routes.ts apps/api/src/worker/events/routes.test.ts apps/web/src/worker/api.ts apps/web/src/worker/api.test.ts`
- `bun run --filter '@zonease/aiworker-api' test`
- `bun run --filter '@zonease/aiworker-web' test`
- `git diff --check`

## 2026-05-02 20:39 [qa] QA-002 — local Codex-backed worker validation follow-ups

Recorded a local real-machine worker validation pass without implementing
source fixes:

- Confirmed project-scoped Worker CLI init/doctor, Codex executor doctor, and
  CLI chat continuity with a stable `--chat-id`.
- Smoked authenticated Worker Admin pages for Chat, Config, Secrets, Test,
  Cron, Approvals, and mobile layout; Secrets CRUD and disabled Cron
  create/delete worked.
- Recorded follow-up tasks: `BUG-043` for Worker Admin Chat SSE timeout,
  `BUG-044` for Web chat continuation, `BUG-045` for stale task lifecycle
  rows, `BUG-046` for tiny probe timeout handling, `BUG-047` for no-token admin
  UX, and `TODO-007` for lower-priority admin polish.

## 2026-05-02 19:51 [release] REL-009 / PLAN-064 — CLI 0.5.0 published and test fleet upgraded

Released `@zonease/aiworker-cli@0.5.0`:

- GitHub Actions release workflow `25251183256` passed for `v0.5.0`; npm `latest` resolves to `0.5.0`.
- GitHub Release `v0.5.0` contains linux-x64, linux-arm64, darwin-x64, and darwin-arm64 tarballs.
- Published-package smoke passed with explicit bin invocation: version reports `aiworker/0.5.0`, `aiworker up --help` renders the quick-start command, and `aiworker up --soul developer --dry-run --no-open --no-serve-web` completes without writing project state.
- Test fleet gateway was upgraded from `0.4.11` to `0.5.0` through the published npm package and restarted; service remained active, `/health` returned ok, `/admin/` served Fleet Web assets, and `aiworker fleet list` returned successfully.
- Follow-up recorded: BUG-042 tracks the non-blocking dry-run display issue where an omitted `--port` prints `NaN`.

## 2026-05-02 19:44 [progress] REL-009 / PLAN-064 — prepare CLI 0.5.0 release

Started the `@zonease/aiworker-cli@0.5.0` release:

- Bumped `apps/cli/package.json` from `0.4.11` to `0.5.0`.
- Release includes the pre-1.0 CLI IA consolidation and `aiworker up` quick start.
- Local release gates passed: frozen install, workspace tests, typecheck, lint, root build, CLI run smoke, CLI fleet smoke, release diff check, dist manifest/bundle checks, and publish dry-run up to the local npm authentication boundary.
- Stabilized two macOS-local path assertions by comparing canonical temporary paths, so release gates pass on machines where `/var` resolves to `/private/var`.
- Next step: tag `v0.5.0`, verify the tag-triggered GitHub release workflow, then upgrade the test fleet gateway with the published npm package.

## 2026-05-02 19:18 [feature] FEAT-045 / PLAN-063 — Worker quick start `aiworker up`

新增本地 worker 快速启动入口：

- `aiworker up` 与 `aiworker worker up` 已注册；root shortcut 仍等价于 worker canonical tree，不新增 `fleet up` / `gateway up`。
- `up` 编排固定阶段：scope 解析、init if needed、project capability validation、executor readiness、serve。brand-new 非交互项目必须显式 `--soul <preset>`；已初始化 project 下 `--soul` 不会被消费，避免误刷新 Soul 模板。
- `up --dry-run` 只打印阶段、init preflight 和 serve 参数，不写 `.aiworker/`、不启动 HTTP server、不打开浏览器。
- project capability validation 的 error 会阻断启动；executor readiness 只做 non-blocking 提示，缺某个 engine CLI 不会阻止 worker HTTP/admin 启动。
- `up` 透传现有 `serve` 参数：`--port`、`--host`、`--gateway`、`--gateway-token`、`--no-reconnect`、`--no-serve-web`、`--open`、`--no-open`。
- CLI help、`aiworker init` next steps、README、`docs/cli.md` 和 `docs/architecture.md` 已同步快速启动路径。

验证：

- `bun test apps/cli/src/commands/worker/init.integration.test.ts apps/cli/src/commands/worker/up.integration.test.ts apps/cli/src/commands/worker/up.test.ts apps/cli/src/lib/bootstrap.test.ts apps/cli/src/aiworker.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run lint`
- `git diff --check`

## 2026-05-02 14:07 [refactor] REFACTOR-015 / PLAN-062 — CLI worker/fleet/gateway 命令树收敛

按 pre-1.0 策略完成 CLI 信息架构破坏性收敛，不保留旧拼写 alias：

- 裸 `aiworker ...` 现在只表示本地 worker 快捷入口；`aiworker worker ...` 是等价的 canonical worker tree。
- fleet 控制面和远端 worker 操作统一迁到 `aiworker fleet ...`，包括 `fleet pair`、`fleet enroll ...`、`fleet chat`、`fleet config ...`、`fleet approvals ...`、`fleet schedule ...` 和 `fleet logs`。
- gateway 生命周期和 systemd install 统一迁到 `aiworker gateway ...`，包括 `gateway install systemd`。
- CLI command 实现目录按角色拆成 `apps/cli/src/commands/worker/`、`apps/cli/src/commands/fleet/`、`apps/cli/src/commands/gateway/`。
- CLI help、argv folding、numeric option validation、runtime hints、README、`docs/cli.md`、`docs/architecture.md`、`docs/gateway.md` 和 `AGENTS.md` 已同步新命令树。

验证：

- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' test:stress`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bunx eslint apps/cli/src/aiworker.ts apps/cli/src/help.ts apps/cli/src/lib/bootstrap.ts apps/cli/src/commands/worker apps/cli/src/commands/fleet apps/cli/src/commands/gateway`
- `git diff --check`

## 2026-05-02 02:44 [progress] FEAT-042 / PLAN-051 — Orchestrator control executor

完成 Orchestrator control-plane executor 与 task executor 的解耦：

- Worker config 新增 `orchestrator.decisionPipeline.executor`，未配置时继续复用主 `config.executor`，保持 FEAT-038 行为兼容。
- 新增 control executor resolver；LLM intent classifier、conversation continuation classifier、quality gate evaluator、quality repair、compaction summary 和 pre-compaction memory flush 都改走 control executor。
- 显式 control executor 使用独立 model / timeout / fallback 配置；suppressed control run 默认 `temperature=0`，不传 task workspace、tool list 或 engine native session binding。
- secret enumeration / redaction / hydration 覆盖 control executor 及其 fallback chain。
- `GET /api/worker/info` 增加 `controlExecutor` 诊断，标识 engine、model、status 与是否复用 task executor。

验证：

- `bun test packages/core/src/worker/management/config.test.ts packages/core/src/worker/management/info.test.ts packages/core/src/worker/orchestrator/service.history.test.ts`
- `bun test packages/core/src/worker/runtime.test.ts -t "control executor"`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- focused ESLint on touched core/shared files
- `git diff --check`

## 2026-05-02 02:01 [bug] BUG-006 / PLAN-061 — reloadRuntime 串行化

修复 worker hot-reload 的并发 swap race：

- `apps/api/src/modes/worker.ts` 的 `reloadRuntime` 现在通过 bootstrap 闭包内的 promise chain 串行执行；后一次 reload 会等前一次 hydrate/build/swap、`onRuntimeReloaded` 和旧 runtime `dispose()` 全部完成后再开始。
- reload 失败不会 poison 后续链路；下一次 reload 会从上一轮 rejected chain 后恢复排队。
- 新增 `apps/api/src/modes/worker.reload.test.ts`，用受控 secret hydrate 卡住第一次 reload，再并发触发第二次，断言第二次不会抢先进 hydrate/swap，且最终版本保持后发者。
- `docs/architecture.md` / `AGENTS.md` 明确该不变量由 `reloadRuntime` 内部 promise chain 强制，而不是依赖 operator 不并发。

验证：

- `bun test apps/api/src/modes/worker.reload.test.ts`
- `bun test apps/api/src/worker/management/routes.test.ts`
- `bun run --filter '@zonease/aiworker-api' typecheck`

## 2026-05-02 02:00 [refactor] REFACTOR-014 / PLAN-060 — CLI operator module 内部命名清理

完成 BUG-010 / PLAN-058 的后续内部源码清理，公共 CLI 行为不变：

- `apps/cli/src/aim/` 通过 `git mv` 迁到 `apps/cli/src/operator/`。
- CLI entry 与 smoke 脚本 import 改为 `operator` 路径。
- 内部 operator state/client/session 符号从 `Aim*` 改为 `Operator*`，包括 `OperatorState`、`loadOperatorState`、`patchOperatorState`、`OperatorClient`、`createOperatorClient` 和 `OperatorWsError`。
- `aiworker gateway start` 仍写 `~/.aiworker/aiworker.json`，daemon 文件仍是 `aiworker-gateway.pid` / `aiworker-gateway.log`。
- BUG-010 / PLAN-058 当前说明补充：`apps/cli/src/aim` 保留只代表当时历史状态，当前实现已迁到 `operator`。

验证：

- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `rg -n "\\baim\\b|\\baiw\\b|aim\\.json|aim-gateway|src/aim" apps/cli/src apps/cli/scripts` 无命中。
- `git diff --check`

## 2026-05-02 01:38 [bug] BUG-010 / PLAN-058 — CLI runtime 旧命名前缀清理

按最新版本做 clean rename，不保留 legacy operator state 文件名：

- 用户可见 runtime 前缀从 `[aiw ...]` 统一为 `[aiworker ...]`，worker-local dash-form 命令使用 `[aiworker config-set]`、`[aiworker token-rotate]`、`[aiworker schedule-*]`。
- OTP enrollment 提示从 `aim enroll approve <otp>` 改为 `aiworker enroll approve <otp>`。
- operator state 从 `~/.aiworker/aim.json` 改为 `~/.aiworker/aiworker.json`；gateway daemon pid/log 从 `aim-gateway.*` 改为 `aiworker-gateway.*`。
- README、`docs/cli.md`、`docs/gateway.md`、`docs/architecture.md` 与相关 CLI tests 同步。

验证：

- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `rg -n "\\[aiw(\\s|\\])|aim enroll approve|\\baiw\\b|aim\\.json|aim-gateway|~/.aiworker/aim" apps/cli/src apps/cli/scripts packages/core/src packages/gateway/src packages/gateway-proto/src apps/api/src docs/cli.md docs/gateway.md docs/architecture.md README.md` 无命中。

## 2026-05-02 01:14 [bug] BUG-038 / PLAN-059 — worker info runtimeVersion follows CLI package version

Fixed stale worker info version reporting:

- Removed the hard-coded `WORKER_RUNTIME_VERSION = '0.2.0'` from core worker info.
- `buildInfo` now receives the runtime/package version from its caller.
- `bootstrapWorkerApp` passes the same runtime version to `/api/worker/info` and the OpenAPI document, with `dev` as the explicit source-mode fallback.
- `aiworker serve` injects `apps/cli/package.json` version, so published CLI workers report the same version through both `fleet info` and bridged `/w/:workerId/api/worker/info`.
- Tests now use injected test runtime versions instead of pinning stale release literals.

验证：

- `bun test packages/core/src/worker/management/info.test.ts`
- `bun test apps/api/src/worker/management/routes.test.ts`
- `bun test apps/api/src/modes/worker.bearer-auth.test.ts`
- `bun test apps/cli/src/aiworker.test.ts`
- `bun test packages/core/src/worker/gateway-client/dispatcher.test.ts`
- `bun run --filter '@zonease/aiworker-core' typecheck`
- `bun run --filter '@zonease/aiworker-api' typecheck`
- `bun run --filter '@zonease/aiworker-cli' typecheck`

## 2026-05-01 14:53 [docs] DOC-004 / PLAN-057 — 陈旧 PMA 待办状态清理

按当前开发成果和 Brain / Executor 能力边界，收敛 remaining pending / in-progress PMA 事项：

- FEAT-032 / PLAN-022 标记 completed：Web UI epic 已由 FEAT-033/034/035、REFACTOR-009/010 吸收并交付。
- FEAT-037 / PLAN-028 标记 completed：session control plane 已完成 S1-S5，剩余 idle/daily expiry 与 UI observability 以后按小任务重开。
- FEAT-039 / PLAN-041 标记 closed / rejected：init / Soul / doctor / capability 静态 validation / executor 边界已交付，S4-S6 以后按新边界拆小切片。
- FEAT-002、FEAT-007、FEAT-008、FEAT-010 标记 closed：远期占位或旧架构入口不再污染当前 backlog。
- BUG-010、BUG-038、FEAT-042 / PLAN-051 保留，并补充 current-scope note；PLAN-051 detail status 规范为 `draft`。

验证：targeted `rg` active-entry scan，`git diff --check`。

## 2026-05-01 14:37 [docs] DOC-003 / PLAN-056 — PMA 废案标记与 capability 边界治理

对 PMA 管理的 docs 做了一次不删除历史的废案和边界标记：

- FEAT-031 / PLAN-021 已从 pending / implementing 改为 closed / rejected，并在顶部标明不再作为实现规格，替代路径指向 FEAT-036、FEAT-037、FEAT-038、FEAT-039 和 FEAT-044。
- FEAT-038 / PLAN-039 补充 historical scope：其中 `.aiworker/mcp.json` 和 CapabilityRegistry 只表示 runtime observe-only descriptor，不是 executor-native MCP projection。
- FEAT-039 / PLAN-041 补充 current scope：继续承载 init / Soul / brain-runtime capability draft / `aiworker doctor`，不再承载 executor-native MCP/skill/plugin projection。
- BUG-040 标记为历史缺口记录，禁止从旧的 `aiworker mcp add` / `skill add` / `toolset enable` 描述恢复 executor config 命令。
- FEAT-036 / PLAN-023 / REFACTOR-011 与 `docs/architecture.md` 补充 `.aiworker/mcp.json` 与 `.aiworker/executor-capabilities.json` 的职责边界。

验证：`rg` targeted stale-entry scan，`git diff --check`。

## 2026-05-01 14:05 [progress] FEAT-044 / PLAN-055 — executor capability projection

完成 executor 原生能力快速配置 MVP，并把边界从 PLAN-041 S3 的 project capability 草案中拆出来：

- 新增 `.aiworker/executor-capabilities.json`，只记录 executor-native projection 期望状态；`init` / fs-layout 会种空 manifest。
- 新增 shared executor capability schema，当前支持 `codex` / `claude-code` 的 project-scope MCP descriptor。
- 新增 `aiworker executor mcp add`：写入 executor manifest，不修改 `.aiworker/mcp.json` 或 brain skill 目录。
- 新增 `aiworker executor mcp sync`：dry-run 输出将执行的 engine 官方 CLI 命令；非 dry-run 调用 `codex` / `claude`，cwd 固定为 project root，并过滤 AIWorker / worker / internal secret env。
- 新增 `aiworker executor doctor`：验证 manifest、engine CLI availability、descriptor 完整性与 secret-like 字段。
- Secret-like 字段只能用 `secretRef`；MVP 不做隐式 hydrate，非 dry-run projection 遇到 secretRef 会 fail clearly，避免把占位符或明文写进 engine project config。
- 文档更新：`aiworker doctor` 明确只管 brain/runtime capability 草案；executor MCP/skill/plugin 走 `aiworker executor ...` 与 `executor-capabilities.json`。

验证：

- `bun test packages/shared/src/executor-capabilities.test.ts apps/cli/src/commands/executor.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/init.integration.test.ts packages/fs-layout/src/index.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-shared' typecheck`
- `bun run lint`
- `git diff --check`

## 2026-05-01 13:34 [progress] FEAT-039 / PLAN-041 S3 — capability 静态 validation

完成 PLAN-041 S3 的最小可交付切片：

- 新增共享 capability manifest schema，覆盖 capability packs、policy、toolsets、MCP descriptor、Skill metadata 和 validation issue/status。
- 新增 CLI 内置 capability pack / toolset catalog，并校验所有内置 Soul preset 引用的 pack/toolset 都已登记。
- 新增 `aiworker doctor` 零副作用诊断命令，静态验证 `.aiworker/policy.json`、`toolsets.json`、`capability-packs.json`、`mcp.json` 和 `skills/` metadata。
- MCP 当前只做 descriptor 与明文 secret 静态检查；不启动 server，不执行 `listTools`。
- `aiworker init` 现在生成结构化 validation 草案并提示下一步跑 `aiworker doctor`；`aiworker soul list/show` 也指向 project doctor 获取 validation 状态。

验证：

- `bun test packages/shared/src/capabilities.test.ts apps/cli/src/capabilities/validation.test.ts apps/cli/src/commands/doctor.test.ts apps/cli/src/soul/presets.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/init.integration.test.ts`
- `bun run typecheck`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run --filter '@zonease/aiworker-shared' test`
- `bun run lint`
- `bun run --filter '@zonease/aiworker-web' build`
- `bun run --filter '@zonease/aiworker-cli' build:bundle`
- `git diff --check`

## 2026-05-01 13:08 [progress] REFACTOR-013 — CLI test gate 与 Soul preset 拆分

完成 FEAT-043 后续收尾：

- `apps/cli/scripts/aiworker-bin-shim.test.ts` 改用真实路径规范化 expected bundle path，兼容 macOS `/var` 与 `/private/var`。
- `aim pair` / `aim enroll` command 测试改为依赖注入，不再通过 full-module mock 污染 `./common`，CLI 包级测试恢复通过。
- 9 个内置 Soul preset 拆到 `apps/cli/src/soul/presets/*.ts`，`apps/cli/src/soul/presets.ts` 保持统一 registry 和外部消费入口。

验证：

- `bun test --timeout=30000 apps/cli/scripts/aiworker-bin-shim.test.ts apps/cli/src/aim/commands/common.test.ts apps/cli/src/aim/commands/pair.test.ts apps/cli/src/aim/commands/enroll.test.ts`
- `bun test --timeout=30000 apps/cli/src/soul/presets.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/init.integration.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run lint`
- `git diff --check`

## 2026-05-01 12:47 [progress] FEAT-043 — init 后引导与 Soul 能力矩阵

优化 project-scope `aiworker init` 的首次上手体验：

- `aiworker init` 成功后现在打印精简 next steps：确认 scope、审阅
  `.aiworker/SOUL.md` / `AGENT.md`、查看 Soul 能力、跑 `run --dry-run`、
  配好 executor 后真实 `run`，以及需要 HTTP/admin/fleet 时的下一步。
- 内置 Soul preset 从 `init.ts` 抽到共享 registry，`init`、help、测试和
  新 CLI 命令共用同一份能力数据。
- 新增 `aiworker soul list` / `aiworker soul show <preset>`，展示每个 Soul
  的职责、边界、沟通风格、风险策略、capability packs 和 toolsets。输出明确标记
  pack/toolset 仍是 `draft` / `validation pending`，真实 validation 留给
  PLAN-041 S3。
- `soul list/show` 被加入非 mutating bootstrap 例外，不会为了查看能力而 mint
  `.env` 或写入 worker state。
- 测试矩阵覆盖所有内置 Soul preset 的 dry-run 与实际 init，校验
  `SOUL.md`、`AGENT.md`、`policy.json`、`toolsets.json`、
  `capability-packs.json` 与 preset 声明一致。

验证：

- `bun test --timeout=30000 apps/cli/src/soul/presets.test.ts apps/cli/src/aiworker.test.ts apps/cli/src/commands/init.integration.test.ts`
- `bun run --filter '@zonease/aiworker-cli' typecheck`
- `bun run lint`
- `git diff --check`
- `bun run --filter '@zonease/aiworker-cli' test` 仍有两处非本次失败：macOS
  `/var` vs `/private/var` 路径断言，以及整包运行时的 Bun mock 隔离顺序问题
  （`common.test.ts` 单跑通过）。

## 2026-04-30 20:34 [progress] REL-007 — 0.4.10 published

Published `@zonease/aiworker-cli@0.4.10`:

- Local release gates passed: frozen install, workspace tests, typecheck, lint,
  root build, CLI run smoke, CLI fleet smoke, dist manifest/shim/Web bundle
  checks, release diff check, and publish dry-run up to the local npm
  authentication boundary.
- The tag-triggered GitHub release workflow succeeded for `v0.4.10`, including
  typecheck, tests, CLI bundle, npm publish, compiled binaries, and GitHub
  Release asset upload.
- npm `latest` now resolves to `0.4.10`, `bunx @zonease/aiworker-cli@0.4.10
  --version` reports `aiworker/0.4.10`, and a clean-temp no-Bun `npx` smoke
  returns the friendly Bun install / standalone binary message.
- GitHub Release `v0.4.10` contains the linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.

## 2026-04-30 20:25 [progress] REL-007 — 准备发布 0.4.10

开始准备 `@zonease/aiworker-cli@0.4.10` patch 发版：

- npm latest 和本地最高 release tag 均为 `0.4.9`；远端不存在
  `v0.4.10` tag。
- 本次版本包含 Soul-aware init、项目级 engine cwd、Worker 决策管线
  S1-S5 与 Orchestrator control executor 后续任务记录。
- 发布路径沿用 tag-triggered GitHub release workflow；本地只做版本、文档、
  quality gates、artifact dry-run 与 tag 推送。
- 本地 release gates 已通过：frozen install、workspace tests、typecheck、
  lint、root build、CLI run smoke、CLI fleet smoke、dist manifest/shim/Web
  bundle 检查、release diff check 和 publish dry-run 到本机 npm auth 边界。

## 2026-04-30 20:25 [progress] FEAT-038 — learning loop S5

落地 worker 决策管线的 S5 learning loop 接入：

- Evolution proposer 现在会消费 `orchestrator.quality_gate` observation。
- 重复 failed quality gate 会生成 pending `skill_drafts`，草案带
  `evolution-meta.kind = "quality_gate"` 和稳定 `sequenceKey` 去重。
- 保留原有 tool-sequence mining 行为；S5 不直接写 memory、policy、MCP 或
  worker config。

## 2026-04-30 20:20 [docs] FEAT-042 — control executor follow-up

记录 FEAT-038 的 MVP 边界和后续任务：

- 当前允许 Orchestrator 的 LLM classifier / quality gate / repair / compaction
  suppressed run 复用 worker 主 executor。
- 新增 FEAT-042 / PLAN-051，后续把 Orchestrator control-plane executor 与
  task executor 解耦。
- 默认行为仍应兼容：未配置 control executor 时继续复用主 executor。

## 2026-04-30 20:10 [progress] FEAT-038 — quality gate S4

落地 worker 决策管线的 S4 quality gate：

- 新增 `QualityGate`，默认 `mode=observe`、`evaluator=heuristic`，记录 score、
  threshold、dimensions、missing、suggestions 和 action。
- 新增可选 LLM strict-JSON evaluator，失败时回退 heuristic。
- 支持 `observe` / `warn` / `retry` / `block`。默认 observe 不改变交付；
  显式 `retry` 会触发一次 suppressed repair run 并发出
  `orchestrator.repair_attempted`。
- Evolution observer 现在也会持久化 repair attempt 事件。

## 2026-04-30 19:45 [progress] FEAT-038 — intent classifier S3

落地 worker 决策管线的 S3 intent/risk classifier：

- 新增 `IntentClassifier`，默认用 deterministic heuristic 生成 intent、risk、
  requiredContext、qualityProfile、confidence、sessionAction 和 reason。
- `orchestrator.intent_decision` 现在记录真实 session action 和任务意图。
- 新增可选 `orchestrator.decisionPipeline.intentClassifier.evaluator = "llm"`，
  启用后通过 suppressed executor 做 strict-JSON 分类，失败时回退 heuristic。
- Capability planner 现在消费 intent decision，但仍只写 observation，不改变主执行路径。

## 2026-04-30 19:25 [progress] FEAT-038 — capability registry S2

落地 worker 决策管线的 S2 observe-only capability registry：

- 新增 `CapabilityRegistry`，聚合 brain skill、内置 `load_skill` /
  `memory_search`、`.aiworker/mcp.json` 与 `.aiworker/toolsets.json`。
- `orchestrator.capability_decision` 现在由 registry snapshot + planner
  生成，包含 available builtin/MCP/skill/toolset 和 selected capability 信息。
- S2 仍不改变 executor tool exposure，只记录能力选择结果，供后续 S3/S4/S5
  消费。

## 2026-04-30 19:05 [progress] FEAT-038 — worker decision pipeline S1

落地 worker 决策管线的第一个 observe-only 切片：

- 从 orchestrator 抽出 `ContextManager` 和 `RunContextComposer`，同时保持现有
  system prompt、项目 persona 注入、history window、token budget、compaction
  和 native engine binding 行为不变。
- 新增 `orchestrator.intent_decision`、`orchestrator.capability_decision` 和
  `orchestrator.quality_gate` 的 typed default payload builder。
- 新事件均为 observe-only：只记录当前默认决策，不启用真实分类、不强制能力选择、
  不修复输出，也不阻断交付。
- Evolution observation 现在会持久化这些决策事件，供后续 proposer 和 retrospect
  使用。

## 2026-04-30 18:26 [bug] BUG-041 — project-scope engine cwd

Fixed project-scope agentic CLI execution so engines keep the project root as
their default working directory:

- Added a shared project root mode to `WorkspaceManager`; project root handles
  are never removed by conversation dispose or purge.
- Runtime now enables shared project root mode only for project scope without
  explicit isolation settings. `WORKER_WORKSPACE_GIT_ORIGIN` and Claude Code
  `workspaceRoot` overrides continue to use isolated workspaces.
- The orchestrator now injects `.aiworker/AGENT.md`, `SOUL.md`, `USER.md`,
  `MEMORY.md`, and `ROLLUP.md` into the system prompt, so AIWorker's project
  brain files are consumed even though engines run from the project root.
- Added regressions for workspace disposal safety, runtime project-scope
  selection, explicit workspaceRoot override behavior, project persona prompt
  injection, and Claude Code spawn `cwd`.

## 2026-04-30 17:46 [bug] BUG-040 — init Soul selection

Fixed brand-new project `aiworker init` so it no longer silently creates stub
persona files:

- Added project Soul selection before `.aiworker/`, worker identity, and
  worker.db creation. Non-interactive brand-new init now requires
  `--soul <preset>` and fails without writing files when omitted.
- Added builtin presets plus interactive `customize` questions for role,
  boundaries, out-of-scope handling, communication style, approval posture,
  capability packs, and toolsets.
- Project init now seeds non-stub `SOUL.md` / `AGENT.md` plus draft
  `policy.json`, `toolsets.json`, and `capability-packs.json`, while preserving
  the existing no-overwrite behavior for existing `.aiworker/` and external
  agent files.
- Updated CLI docs, help quickstart, and smoke coverage to use
  `aiworker init --soul developer` for non-interactive paths.

## 2026-04-30 16:41 [progress] REL-006 — 0.4.9 published

Published `@zonease/aiworker-cli@0.4.9`:

- Local release gates passed: frozen install, workspace tests, typecheck, lint,
  root build, CLI run smoke, CLI fleet smoke, dist manifest/shim/Web bundle
  checks, release diff check, and publish dry-run up to the local npm
  authentication boundary.
- The tag-triggered GitHub release workflow succeeded for `v0.4.9`, including
  typecheck, tests, CLI bundle, npm publish, compiled binaries, and GitHub
  Release asset upload.
- npm `latest` now resolves to `0.4.9`, `bunx @zonease/aiworker-cli@0.4.9
  --version` reports `aiworker/0.4.9`, and a clean-temp no-Bun `npx` smoke
  returns the friendly Bun install / standalone binary message.
- GitHub Release `v0.4.9` contains the linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.

## 2026-04-30 16:33 [progress] REL-006 — 准备发布 0.4.9

开始准备 `@zonease/aiworker-cli@0.4.9` patch 发版：

- npm latest 当前是 `0.4.8`，本地最高 release tag 是 `v0.4.8`，远端不存在
  `v0.4.9` tag。
- 本次发版包含 `0.4.8` 之后的 CLI 使用体验改进：`npx` / `bunx` 启动 shim、
  无 Bun 时的友好错误提示、非 git 目录 `aiworker init`，以及中文分组 help。
- 发布仍走 tag-triggered GitHub Actions workflow；本地只做发版门禁、dist 产物检查和
  dry-run pack，不直接发布 npm。
- 本地 release gates 已通过：frozen install、workspace tests、typecheck、lint、root
  build、CLI run smoke、CLI fleet smoke、dist manifest/shim/Web bundle 检查、publish
  dry-run 到本机 npm authentication boundary、`git diff --check`。

## 2026-04-30 16:28 [progress] FEAT-041 CLI help 信息架构

优化 `aiworker --help` 可读性：

- 将 `cac` 默认扁平命令列表改为场景分组：本地 worker、gateway/fleet 管理、
  远端 worker 操作、安装/诊断/高级维护。
- 新增简短使用引导，指向 `aiworker init`、`aiworker serve`、gateway
  pair/enroll，以及 `aiworker chat` 等常见路径。
- 全局 help 标题、help/version 选项、命令摘要、option 描述和默认值文案收敛为中文；
  命令名、环境变量和必要技术标识保持原样。
- 新增回归测试，确保新增显式命令不会漏出分组 help 表面。

## 2026-04-30 15:47 [bug] BUG-039 npx / bunx CLI startup experience

Improved the npm CLI startup path while keeping AIWorker Bun-native:

- The publish artifact now exposes `aiworker.js` as a POSIX shell shim and
  keeps the real Bun bundle at `aiworker-bun.js`.
- The shim searches `AIWORKER_BUN_BIN`, PATH, `$BUN_INSTALL/bin/bun`, and
  `$HOME/.bun/bin/bun`, then execs the Bun bundle with argv/exit-code
  passthrough.
- When Bun is unavailable, `npx @zonease/aiworker-cli ...` now exits 127 with
  an actionable install / `bunx` / standalone binary message instead of raw
  `env: bun: No such file or directory`.
- README install guidance now states that `npx` / `npm install -g` are
  distribution entrypoints only; the runtime remains Bun or the GitHub Release
  standalone binary.

## 2026-04-30 15:47 [progress] FEAT-039 — init no longer requires git

Adjusted the project-scope `aiworker init` first-run flow: a brand-new
directory no longer needs to be inside a git repository. The command now creates
the same safe `.aiworker/` project layout in the current cwd, prints a preflight
note when no git repository is detected, keeps `--global` for user-scope worker
initialization, and keeps `--force` as a no-overwrite compatibility flag.

## 2026-04-30 08:55 [bug] BUG-038 found during 0.4.8 test-fleet validation

The `0.4.8` test-fleet validation found that worker info still reports
`runtimeVersion: "0.2.0"` even when both the gateway and temporary worker are
running the published `@zonease/aiworker-cli@0.4.8` package. Recorded as
`BUG-038`; no source fix was made in this validation pass.

## 2026-04-30 08:39 [progress] REL-005 — 0.4.8 published

Published `@zonease/aiworker-cli@0.4.8`:

- Local release gates passed: frozen install, workspace tests, typecheck, lint,
  root build, CLI run smoke, CLI fleet smoke, dist manifest/Web bundle checks,
  release diff check, and publish dry-run up to the local npm authentication
  boundary.
- The tag-triggered GitHub release workflow succeeded for `v0.4.8`, including
  typecheck, tests, CLI bundle, npm publish, compiled binaries, and GitHub
  Release asset upload.
- npm `latest` now resolves to `0.4.8`, and a published-package smoke reports
  `aiworker/0.4.8`.
- GitHub Release `v0.4.8` contains the linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.

## 2026-04-30 08:32 [progress] REL-005 — 准备发布 0.4.8

开始准备 `@zonease/aiworker-cli@0.4.8` patch 发版：

- npm latest 当前是 `0.4.7`，本地最高 release tag 是 `v0.4.7`，远端不存在
  `v0.4.8` tag。
- 本次发版包含 `0.4.7` 之后的 Fleet 同源托管 Worker UI 完整交付：gateway 托管
  `/w/:workerId/` worker bundle、Worker UI same-origin bridge/SSE、Fleet UI 同源
  worker 入口，以及当前 Worker UI 所需 REST bridge 覆盖。
- 发布仍走 tag-triggered GitHub Actions workflow；本地只做发版门禁、dist 产物检查和
  dry-run pack，不直接发布 npm。
- 本地 release gates 已通过：frozen install、workspace tests、typecheck、lint、root
  build、CLI run smoke、CLI fleet smoke、dist manifest/Web bundle 检查、publish
  dry-run 到本机 npm authentication boundary、`git diff --check`。

## 2026-04-30 07:44 [progress] FEAT-040 / PLAN-042 completed

Completed the fleet-hosted worker UI path for non-same-host workers:

- Gateway now serves the worker bundle at `/w/:workerId/*` and keeps
  `/w/:workerId/api/worker/*` on an explicit bridge allowlist.
- The worker bundle derives its router base and API/SSE base from
  `/w/:workerId`, while preserving self-hosted `/admin` and dev `/worker`.
- The bridge covers the worker UI surfaces currently in use: info/config,
  secrets, engine availability, brain/executor/channel probes, cron,
  approvals, orchestrator tasks, conversations, messages, and worker-scoped
  SSE.
- Fleet UI worker links now open same-origin `/w/:workerId/` instead of
  requiring `worker.baseUrl/admin/`.
- `fleet.db` remains pointer/audit-only; worker config, secrets, messages, and
  conversations stay in `worker.db`.

## 2026-04-30 07:03 [progress] REL-004 — 0.4.7 published

Published `@zonease/aiworker-cli@0.4.7`:

- Local release gates passed: frozen install, workspace tests, typecheck, lint,
  root build, CLI run smoke, CLI fleet smoke, release diff check, dist manifest
  version check, and publish dry-run up to the local npm authentication boundary.
- The tag-triggered GitHub release workflow succeeded for `v0.4.7`, including
  typecheck, tests, CLI bundle, npm publish, compiled binaries, and GitHub
  Release asset upload.
- npm `latest` now resolves to `0.4.7`, and a published-package smoke reports
  `aiworker/0.4.7`.
- GitHub Release `v0.4.7` contains the linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.
- Gateway worker bridge remains an MVP in this release; complete FEAT-040 /
  PLAN-042 delivery continues in follow-up work.

## 2026-04-30 07:02 [progress] REL-004 — 准备发布 0.4.7

开始准备 `@zonease/aiworker-cli@0.4.7` patch 发版：

- npm latest 当前是 `0.4.6`，本地最高 release tag 是 `v0.4.6`。
- 本次发版包含 `0.4.6` 之后的 `aiworker init` preflight / `--dry-run`、Fleet
  Audit log 表格内部滚动修复、code-review-graph 工作流接入，以及 gateway worker
  bridge MVP。
- Gateway worker bridge 仅作为 MVP 发布：覆盖 node-side `workers.info` /
  `workers.stop` handler，以及 `/w/:workerId/api/worker/info`、`GET/PUT /config`
  allowlisted bridge。完整 FEAT-040 / PLAN-042 体验继续由后续任务完成。
- 发布仍走 tag-triggered GitHub Actions workflow；本地只做发版门禁、dist 产物检查和
  dry-run pack，不直接发布 npm。

## 2026-04-29 17:58 [progress] REL-003 — 0.4.6 published

Published `@zonease/aiworker-cli@0.4.6`:

- Local release gates passed: frozen install, workspace tests, typecheck, lint,
  root build, CLI run smoke, CLI fleet smoke, release diff check, dist manifest
  version check, and publish dry-run up to the local npm authentication boundary.
- The tag-triggered GitHub release workflow succeeded for `v0.4.6`, including
  typecheck, tests, CLI bundle, npm publish, compiled binaries, and GitHub
  Release asset upload.
- npm `latest` now resolves to `0.4.6`, and a published-package smoke reports
  `aiworker/0.4.6`.
- GitHub Release `v0.4.6` contains the linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.

## 2026-04-29 17:50 [progress] REL-003 — 准备发布 0.4.6

开始准备 `@zonease/aiworker-cli@0.4.6` patch 发版：

- npm latest 当前是 `0.4.5`，本地最高 release tag 是 `v0.4.5`。
- 本次发版包含 `0.4.5` 之后的 `aiworker serve` 前台生命周期修复、Codex app-server reconnect 容忍修复、AGENTS 工作指引刷新，以及 Web UI 视觉系统收敛。
- 发布仍走 tag-triggered GitHub Actions workflow；本地只做发版门禁、dist 产物检查和 dry-run pack，不直接发布 npm。

## 2026-04-29 17:18 [progress] REFACTOR-012 Web UI 视觉系统收敛

按照 `DESIGN.md` 收敛 Fleet / Worker Web UI：Tailwind v4 token 层改为黑白高对比、NVIDIA green 信号色、2px 半径和单一 card shadow；共享 button / badge / card / input / table / dialog / tooltip / toaster primitive 统一走 token；Fleet 与 Worker shell 改为黑色导航面 + 绿色 active signal；主要页面移除 shadcn 默认大圆角、随意 emerald/amber 状态色和可见 React Query Devtools 浮动入口。

保持 FEAT-032 数据边界不变：Fleet UI 仍只走 gateway WS，Worker UI 仍只走 worker REST + bearer-auth。验证通过 web lint、typecheck、test、build、CSS utility check、`git diff --check`，并用 Playwright 检查 Fleet workers 与 Worker overview/chat 的桌面和 390px 移动视口。

## 2026-04-29 10:56 [BUG-P1] BUG-036 fixed: Codex reconnect notifications

Fixed the Codex current app-server path so transient reconnect progress
notifications such as `Reconnecting... n/n` no longer abort the AIWorker turn
before Codex can emit the terminal `turn/completed` result. Non-transient
current-protocol errors and failed completed turns remain fatal.

Verification passed: focused Codex normalizer/executor regressions, root
lint/typecheck/test/build gates, real local `CodexExecutor` one-turn and
native resume smokes, and the test-fleet local `codex/default` worker path:
OTP enrollment and approval, explicit conversation id continuity, default
accepted-id continuity, reset rotation, and `sessions list/show` metadata.
Temporary fleet registration and local credential-bearing state were removed.

## 2026-04-29 10:01 [BUG-P0] BUG-035 fixed: serve foreground lifecycle

Fixed `aiworker serve` so successful startup remains a foreground long-running
process until SIGTERM/SIGINT. Added a CLI lifecycle regression that verifies the
worker HTTP server stays alive after `/health` is ready and exits cleanly on
SIGTERM.

Verification passed: focused serve lifecycle test, CLI package test, workspace
test suite, root typecheck, root lint, root build, and CLI smoke scripts. A
temporary test-fleet OTP worker enrolled and was approved successfully; real
Codex chat continuity is now blocked by the separate `BUG-036` executor
reconnect failure.

## 2026-04-29 10:01 [bug] BUG-036 found during BUG-035 fleet validation

After the `BUG-035` lifecycle fix, a temporary local `codex/default` worker
successfully reached OTP approval through the test fleet, but real chat turns
ended with `finishReason=error`. Local worker logs showed Codex app-server
reconnect errors. Recorded as `BUG-036` with sanitized evidence; temporary
worker state was removed from the fleet and local credential-bearing state was
deleted.

## 2026-04-29 08:45 [bug] BUG-035 found during 0.4.5 fleet validation

The `0.4.5` test-fleet run found a release-blocking `aiworker serve` foreground
lifecycle bug: the worker starts, begins OTP enrollment, then the CLI process
exits before an OTP is issued. Recorded as `BUG-035` with sanitized
reproduction evidence. No source fix was made in this validation pass.

## 2026-04-29 06:10 [progress] REL-002 — 0.4.5 published

Published `@zonease/aiworker-cli@0.4.5`:

- Local release gates passed: frozen install, workspace tests, typecheck, lint,
  root build, CLI run smoke, CLI fleet smoke, release diff review, and publish
  dry-run up to the local npm authentication boundary.
- The tag-triggered GitHub release workflow succeeded for `v0.4.5`, including
  typecheck, tests, CLI bundle, npm publish, compiled binaries, and GitHub
  Release asset upload.
- npm `latest` now resolves to `0.4.5`, and a published-package smoke reports
  `aiworker/0.4.5`.
- GitHub Release `v0.4.5` contains the linux-x64, linux-arm64, darwin-x64, and
  darwin-arm64 tarballs.

## 2026-04-29 06:02 [progress] REL-002 — prepare 0.4.5 release

Started the `@zonease/aiworker-cli@0.4.5` patch release:

- npm latest is currently `0.4.4`, and `0.4.5` is not published yet.
- The release carries the reviewed post-0.4.4 repair batch plus the admin
  surface fail-closed security hardening.
- Local `main` is ahead of `origin/main` with the reviewed release candidate
  commits, so the release push will include `main` and `v0.4.5`.

## 2026-04-29 05:43 [security] PLAN-033 admin serving fail-closed

Implemented `TODO-004` without adding first-party app-level admin auth. Fleet
and worker admin static serving now fails closed on non-loopback binds unless
the admin bundle is disabled or the operator explicitly acknowledges an
external auth layer with `AIWORKER_ADMIN_EXTERNAL_AUTH=1`.

Changes include a shared admin exposure guard, gateway startup enforcement,
`aiworker serve --host`, `AIWORKER_WORKER_HOST`, worker-side enforcement before
`Bun.serve`, focused guard/config/CLI tests, and updated public deployment docs.
This is not a login/session system; Logto or another identity layer remains a
future integration.

Verification passed: focused fail-closed tests, workspace typecheck, lint,
workspace tests, root build, and `git diff --check`.

## 2026-04-29 03:56 [cleanup] QA review issues closed

Closed remaining review-state QA discovery subtasks and superseded split-lane
workers after confirming their findings were already incorporated into
`QA-001` and the merged `PLAN-034` repair batch. `TODO-004` / `kz12xf5k`
remains in review because it is a pending proposal decision, not a merged
repair.

## 2026-04-29 03:41 [merge] PLAN-034 — reviewed 0.4.4 repairs merged

Merged `bkd/lc9ls9zp` into `main` as `05762a4`
(`fix: merge reviewed 0.4.4 repairs`). The merge carried the green-reviewed
`0.4.4` repair/optimization integration for CLI/gateway/runtime, Web UI/build,
storage, core safe-env handling, user-facing docs, and regression tests.

Pre-merge conflict checking found no conflicts. The current `main` agent and
Serena configuration was preserved; `TODO-004` remains excluded and pending
proposal approval.

Post-merge verification passed: root typecheck, lint, build, workspace tests,
CLI `smoke:aiworker-run`, CLI `smoke:aiworker-fleet`, and Web `smoke:e2e`.
Merged BKD implementation/audit/coordinator issues were moved to `done`;
proposal-only `TODO-004`, superseded split workers, and the active parent issue
remain open.

## 2026-04-28 22:20 [dispatch] PLAN-034 — integration branch merge-ready

Final audit for the reviewed `0.4.4` repair/optimization integration returned
green. Integration branch `bkd/lc9ls9zp` at commit `897d15c` is merge-ready and
recommended for parent-main merge if accepted. The branch integrates reviewed
CLI/gateway/runtime, Web/UI/build, storage, core safe-env, user-facing docs,
and test reliability repairs while excluding `TODO-004`, child issue PMA docs,
and `docs/changelog.md`.

Verification reported by the integration worker covered frozen install,
focused CLI/gateway/storage/Web gates, workspace concurrent tests, stress
tests, root typecheck/lint/build, smoke tests, 390x844 screenshot checks, and
post-run residue scans. Final audit found no P0/P1/P2 blockers.

Residual human-review risks: future detached daemon-style tests still need
explicit daemon-stop cleanup, systemd behavior still needs live user/system
scope validation across target distros, Vite chunk-size warnings remain
non-fatal, Web mobile layout still needs final human visual acceptance after
merge/deploy, and safe Git env intentionally preserves Git SSH/askpass behavior
while filtering AIWorker/token-like secrets.

## 2026-04-28 21:49 [dispatch] PLAN-034 — split-lane integration active

Coordinator `akif8ehr` split the integration batch into CLI/gateway/runtime
worker `yg3l8xva` and Web/UI/build worker `o599yeb9`. The earlier all-in-one
worker `lc9ls9zp` exited cleanly as superseded. Replaced cron `wjxil9uj` with
`QA-001-PLAN-034-split-poll` (`tigirxz7`) so follow-up monitoring tracks the
actual topology.

## 2026-04-28 21:47 [dispatch] PLAN-034 — audit rework and cron safety net

Rejected the first `kq6e22bw` audit run as red because it did not produce the
required risk report. Moved it back to `working` with rework instructions and
created BKD cron `QA-001-PLAN-034-poll` (`wjxil9uj`) to follow coordinator
`akif8ehr` every 30 minutes during the integration batch.

## 2026-04-28 21:45 [dispatch] PLAN-034 — integration workers started

Started BKD coordinator `akif8ehr`, integration worker `lc9ls9zp`, and
read-only audit worker `kq6e22bw`. The implementation lane will merge reviewed
repair/optimization worktrees into one merge-ready integration worktree, while
the audit lane checks reviewed outputs and merge risks. `TODO-004` remains
proposal-only. No source fixes were made in the parent session.

## 2026-04-28 21:41 [dispatch] PLAN-034 — integrate 0.4.4 repairs and optimizations

Started a BKD integration dispatch for reviewed `0.4.4` repair and optimization
worktrees. Coordinator: `akif8ehr`. The batch exists to merge and verify
overlapping review branches before any main-branch merge. No source fixes were
made in the parent session.

## 2026-04-28 21:15 [QA] Baseline 0.4.4 BKD issue moved to review

Moved the original baseline BKD issue `veyrxhkc` to `review` after posting the
baseline validation summary and extended QA follow-ups. It was not moved to
`done`; follow-up implementation work remains in separate review issues.

## 2026-04-28 21:13 [QA] QA-001 built CLI bundle smoke passed

Ran a black-box smoke against `apps/cli/dist/aiworker.js` after the root build.
Evidence:
`/home/ben/.codex/memories/aiworker-qa001-evidence/bundle-cli-smoke-2113.log`.
Version, project init, scope, and `run --message hello --dry-run` all exited 0.

## 2026-04-28 21:12 [QA] QA-001 workspace-concurrent test passed on rerun

Re-ran parent workspace-concurrent `bun run --filter '*' test`. Evidence:
`/home/ben/.codex/memories/aiworker-qa001-evidence/workspace-concurrent-test-2111.log`.
This run exited 0. `BUG-032`/`BUG-033` remain open for review because an earlier
reliability loop reproduced timeout and dangling-process signals.

## 2026-04-28 21:11 [QA] QA-001 root check and build passed

Re-ran root `bun run check` and `bun run build` after the extended QA
campaign. Evidence:
`/home/ben/.codex/memories/aiworker-qa001-evidence/root-check-build-2109.log`.
Both commands exited 0; existing Web/Vite/chunk warnings remained unchanged.

## 2026-04-28 21:08 [QA] QA-001 low-level package breadth passed

Ran additional package tests for shared, fs-layout, storage-sqlite,
gateway-proto, and api packages. The redacted evidence log is
`/home/ben/.codex/memories/aiworker-qa001-evidence/package-breadth-2108.log`.
All commands exited 0; no new bug was recorded.

## 2026-04-28 21:06 [QA] QA-001 CLI black-box matrix passed

Ran an isolated CLI command matrix under a temporary HOME/project and stored the
redacted log at
`/home/ben/.codex/memories/aiworker-qa001-evidence/cli-blackbox-matrix-2106-rerun.log`.
The run covered `init`, `scope`, `config-show`, invalid `config-set`,
`sessions`, and `schedule` CRUD success/failure paths. Final status was 0; no
new bug was recorded.

## 2026-04-28 21:03 [QA] QA-001 extended parent soak passed

Ran a bounded parent-session soak and stored the log at
`/home/ben/.codex/memories/aiworker-qa001-evidence/extended-soak-2101.log`.
The run repeated CLI dry-run/fleet smokes, gateway protocol smoke, gateway
tests, and core tests three times, then ran Web size report, Web tests, and Web
production build/CSS utility checks. All commands exited 0. Existing Web
Vite/happy-dom warning noise remained unchanged. BKD follow-up state was also
normalized so completed worker outputs remain in `review` until human review.

## 2026-04-28 20:52 [QA] Remote 0.4.4 health and PATH diagnostic repeated

Repeated a read-only remote health/version check with sensitive identifiers
omitted from PMA records. The gateway service was active, `/health` returned
`ok=true`, explicit AIWorker CLI path reported `aiworker/0.4.4`, and Bun global
listed `@zonease/aiworker-cli@0.4.4`. Non-interactive shell PATH still did not
resolve `aiworker`, reinforcing `TODO-006`. No source fixes were made.

## 2026-04-28 20:51 [BUG-P2] BUG-034 — Web smoke-e2e stale gateway import

Recorded a new QA finding: `apps/web/scripts/smoke-e2e.ts` still imports the
removed `../../gateway/src/index` path and exits 1 before running the loopback
Web/gateway protocol smoke. The current gateway module lives under
`packages/gateway`. `web-quality shared-cycles` passed separately. No source
fix was made in the parent QA session.

## 2026-04-28 20:49 [QA] BUG-030 Worker admin screenshots persisted

Captured Worker admin overview/chat screenshots from a local Worker bundle
preview and stored them under
`/home/ben/.codex/memories/aiworker-qa001-evidence/`. The 390x844 captures
confirm the Worker shell also keeps the fixed sidebar and pushes main content
off-screen; desktop comparison remains usable. No source fixes were made.

## 2026-04-28 20:45 [QA] QA-001 reliability loop reproduced workspace flake

Added a parent QA reliability loop log under
`/home/ben/.codex/memories/aiworker-qa001-evidence/`. CLI smoke pairs passed
5x, Web test/build passed, and workspace-concurrent tests reproduced
`BUG-032`/`BUG-033` with CLI/Core timeout failures plus a `killed 1 dangling
process` signal. Immediate focused reruns of the failed CLI/Core files passed,
and cleanup checks found no lingering gateway process or recent AIWorker temp
gateway/smoke directories. No source fixes were made.

## 2026-04-28 20:41 [QA] QA-001 BKD Codex watchdog applied

Recorded the BKD follow-up heuristic for Codex-backed QA work: inspect
`review + running` issue logs and only wake tasks that lack a final report or
are visibly mid-task. `TODO-005` (`jfmsr8wc`) was woken and moved back to
`working`; `TODO-004` (`kz12xf5k`) and `TODO-006` (`3k7sbl3h`) were left in
review after final reports; `TODO-001` (`2i506owq`) and `BUG-030` (`2q45cah8`)
were woken and returned to `working` because their logs showed active cleanup
or reopened scope after entering review. No source fixes were made.

## 2026-04-28 20:30 [QA] QA-001 evidence path normalized

Recorded the final regenerated evidence path for `BUG-029` and `BUG-030`:
`/home/ben/.codex/memories/aiworker-qa001-evidence/`. The directory now keeps
redacted gateway start outputs, `/health` outputs, gateway log, HTTP probe
outputs, and Fleet admin screenshots; temporary credential/state artifacts were
removed. No source fixes were made.

## 2026-04-28 20:29 [QA] QA-001 sequential reliability gates passed

After recording `BUG-029`, `BUG-030`, and `BUG-014`, sequential reliability
gates all exited 0: `bun run typecheck`, `bun run lint`, `bun run build`, and
`bun run --filter '*' test`. Output still included Vite 8
deprecation/chunk-size warnings and expected negative-path test logs, but no
command failed. No source fixes were made.

## 2026-04-28 20:24 [QA] QA-001 late subtask reports integrated

Integrated late UI/UX, black-box, and reliability reports from the extended
`0.4.4` validation campaign:

- widened `BUG-030` to cover both Fleet and Worker admin mobile layout
  overflow;
- expanded `BUG-031` with cross-command gateway URL evidence;
- added `BUG-032` for workspace-wide concurrent test flakiness;
- added `BUG-033` for gateway process cleanup leaks after timeout paths;
- added `TODO-001` through `TODO-006` for command copy, CLI argument/semantic
  cleanup, Web build warnings, admin auth posture, git helper env, and remote
  CLI PATH/version inspection.

No source fixes were made in this session.

## 2026-04-28 20:18 [BUG-P1] BUG-031 — local gateway operator URL points at root

Recorded another `QA-001` black-box finding: `aiworker gateway start` can start
locally after the fleet DB parent exists, but it persists `ws://localhost:<port>`
instead of `ws://localhost:<port>/ws`. Follow-up operator commands such as
`fleet list` then fail the WebSocket upgrade against `/` even though `/health`
is healthy. No source fix was made in this session.

## 2026-04-28 20:15 [BUG-P1] BUG-029 / [BUG-P2] BUG-030 — 0.4.4 extended QA findings

Recorded two follow-ups from the unattended `QA-001` validation campaign:

- `BUG-029`: `aiworker gateway start` fails from a clean cwd when the default
  `./data/fleet.db` parent directory does not exist. The same local gateway
  starts and returns `/health` 200 when `AIWORKER_FLEET_DB_PATH` points at a
  temp DB file.
- `BUG-030`: Fleet admin static assets and desktop rendering are healthy, but
  the mobile 390x844 viewport is unusable because the fixed `w-60` sidebar
  compresses main content and causes text/control overflow.

No source fixes were made in this session; both findings were recorded for BKD
dispatch.

White-box review also reconfirmed existing `BUG-014` with 153 focused tests
passing, then dispatched it to BKD issue `q7s4bay9` with added notes on
portable systemd `ExecStart` rendering and restart behavior after unit changes.

Late QA reports also recorded and dispatched:

- `BUG-031`: local `gateway start` persists a root WebSocket URL instead of
  `/ws`, causing follow-up operator commands to fail upgrade.
- `BUG-032`: workspace-wide concurrent test execution flakes even when
  isolated package/focused reruns pass.
- `BUG-033`: timed-out CLI/gateway integration tests can leave gateway
  processes and credential-bearing temp directories behind.
- `TODO-001` through `TODO-006`: Web command copy, CLI malformed-input
  semantics, Web build warnings, admin auth posture, git helper env policy,
  and remote CLI PATH/version inspection.

## 2026-04-28 20:03 [progress] QA-001 — extended 0.4.4 validation started

Started an unattended record-only validation campaign for `0.4.4`.

- Baseline release validation already passed local gates, CLI smoke scripts,
  remote gateway health, fleet Web static smoke, local Codex worker OTP
  enrollment, explicit/default chat continuity, `/new` reset, and session
  metadata checks.
- The expanded campaign will cover reliability loops, black-box CLI/gateway
  behavior, white-box inspection, and Web UI/UX smoke.
- This session is intentionally not implementing fixes; confirmed findings
  should be recorded as PMA tasks and dispatched through BKD follow-ups.

## 2026-04-28 19:19 [progress] REL-001 — 0.4.4 published

Published `@zonease/aiworker-cli@0.4.4`:

- Local gates passed: typecheck, tests, lint, root build, CLI smoke for
  `aiworker run`, and CLI smoke for fleet presence.
- The tag-triggered GitHub release workflow succeeded for `v0.4.4`, including
  npm publish, standalone binary compilation, platform tarball packaging, and
  GitHub Release asset upload.
- npm `latest` now resolves to `0.4.4`, and a published-package smoke reports
  `aiworker/0.4.4`.

## 2026-04-28 19:14 [progress] REL-001 — prepare 0.4.4 release

Started the `@zonease/aiworker-cli@0.4.4` patch release:

- npm latest is currently `0.4.3`, and `0.4.4` is not published yet.
- The release contains the accepted gateway chat id continuation fix, the Web
  Tailwind utility generation fix, and the reusable fleet test workflow skill.
- Local npm auth is unavailable, so the preferred publish path is the existing
  tag-triggered GitHub release workflow.

## 2026-04-28 19:10 [BUG-P1] BUG-028 — Web Tailwind utilities restored

Fixed the Web UI CSS bundle generation bug:

- `apps/web/src/shared/styles/globals.css` now explicitly registers the Web
  `src` tree with Tailwind v4 source detection, covering the fleet, worker, and
  shared UI code when Vite builds with `root: apps/web/{fleet,worker}`.
- `scripts/web-quality.ts` gained a `css-utilities` check that fails if the
  built fleet or worker CSS misses representative selectors used by the app
  shell and shared UI components.
- `@zonease/aiworker-web` build now runs that CSS check after producing both
  production bundles.
- Rebuilt Web CSS grew from the broken 6111-byte base/theme-only bundle to a
  38320-byte CSS bundle containing utilities such as `.flex`,
  `.min-h-screen`, `.rounded-md`, `.p-6`, `.border-r`, `.bg-background`, and
  `.text-foreground`.
- `@zonease/aiworker-cli` build copies the corrected CSS into
  `apps/cli/dist/web/{fleet,worker}` for npm publish packaging.

Verification passed: Web build, Web CSS utility check, CLI build/package copy,
root lint, and Web Vitest suite. Vitest still prints happy-dom AbortError
teardown noise, but exits successfully with 37 passing tests.

## 2026-04-28 19:02 [BUG-P1] BUG-027 — gateway accepted chat ids are reusable

Fixed the gateway chat continuation bug recorded during the 0.4.3 fleet smoke:

- Worker gateway-client chat handling now treats `gw:` conversation ids as
  already-normalized accepted ids and reuses them unchanged instead of wrapping
  them again as `gw:conv:<id>`.
- Explicit non-prefixed operator ids keep the existing `gw:conv:<id>` mapping.
- Gateway-origin worker bus events now carry `gatewayConversationId`, and the
  gateway subscriber uses that user-facing id for streamed chat/agent event
  payloads while preserving the internal worker `conversations.id` locally.
- Added regressions for omitted-id reuse, explicit accepted-id reuse, and
  streamed event id coherence.

Verification passed: focused core tests, changed-file ESLint, core typecheck,
and full `@zonease/aiworker-core` tests. The live test-server fleet to local
Codex worker e2e remains an external operator verification step.

## 2026-04-28 18:56 [BUG-P1] BUG-028 — Web UI CSS bundle misses Tailwind utilities

Recorded a Web UI packaging/build bug found while checking the test-server
fleet admin UI for `@zonease/aiworker-cli@0.4.3`:

- Public `/admin/` static routing is no longer the suspected cause: the gateway
  serves the fleet CSS asset and the packaged asset exists on the test server.
- The packaged CSS is only 6111 bytes and contains Tailwind base/theme output
  without representative utility selectors such as `.flex` or
  `.bg-background`.
- Local fleet and worker build outputs show the same 6111-byte CSS shape, so
  the issue is reproducible from the repository build output.
- Root-cause candidate is Tailwind v4 source detection missing `apps/web/src`
  when Vite builds with `root: apps/web/{fleet,worker}` and the entry imports
  app code from `../src/...`.
- Tracked as `docs/task/BUG-028.md`; no implementation has been started.

## 2026-04-28 18:45 [BUG-P1] BUG-027 — gateway chat accepted id continuation gap

Recorded a session bug found during the `@zonease/aiworker-cli@0.4.3`
test-server fleet smoke:

- A local Codex worker joined the upgraded 0.4.3 test fleet and passed
  explicit `--conversation-id` continuity, Codex native binding persistence,
  session status, and `/new` reset checks.
- The default `aiworker chat` path still returns an accepted conversation id
  that cannot be passed unchanged to the next `chat.send` call. Reusing it
  wraps the id again as `gw:conv:<id>`, creating a new worker-side session.
- Tracked as `docs/task/BUG-027.md`; no implementation has been started.

## 2026-04-28 18:23 [BUG-P1] BUG-026 — Codex native session capability negotiation

Release target: `@zonease/aiworker-cli@0.4.3`.

Fixed a release-blocking Codex worker e2e failure found while validating the
FEAT-037 session control plane against a test-server fleet:

- Codex executor now advertises `capabilities.experimentalApi=true` during
  app-server `initialize`, which current Codex CLI requires before accepting
  persisted native thread history.
- Added focused regression coverage to ensure the current protocol path keeps
  the capability negotiation when starting native thread bindings.
- Real fleet e2e passed after the fix with a remote fleet gateway and local
  Codex worker: same `conversation-id` retained continuity, absent and stale
  native bindings recovered from worker.db transcript fallback, and `/reset`
  started a fresh session.

## 2026-04-28 17:33 [progress] FEAT-037 S5 — session status and maintenance surfaces

Implemented S5 only for the OpenClaw-style worker session control plane:

- Added shared safe session status DTOs that report session key, active
  conversation/session id, route metadata, lifecycle timestamps, reset
  reason/time, context counters, compaction count, memory-flush state, and
  redacted engine binding summaries.
- Added bounded worker API status routes under `/api/worker/sessions` plus
  closed transcript maintenance at
  `/api/worker/sessions/maintenance/closed-transcripts`.
- Added local CLI commands: `aiworker sessions list`,
  `aiworker sessions show <sessionKey>`, and
  `aiworker sessions maintenance`.
- Maintenance defaults to dry-run and requires explicit `apply`; it only targets
  closed conversations that are no longer referenced by
  `session_entries.currentConversationId`.
- No schema migration, UI redesign, release publishing, fleet/worker e2e, or
  deployment automation was added.

## 2026-04-28 16:38 [progress] FEAT-037 S4 — engine-native session bindings

Implemented S4 only for the OpenClaw-style worker session control plane:

- Added a generic native binding contract on executor runs:
  `AgentRunInput.engineBinding` in, `AgentEvent.engine_binding` out.
- Orchestrator now reads the binding for `config.executor.engine` from
  `session_entries.engineBindings` and persists executor updates back to the
  same JSON field.
- Codex current app-server uses `thread/resume` and recovers stale bindings by
  clearing the cached binding and starting a fresh thread with the DB-rendered
  prompt. Legacy Codex stays on DB prompt fallback.
- Claude Code and Cursor use native CLI `--resume` session ids and refresh the
  stored binding from streamed `session_id` values.
- No schema migration, status/API/UI surface, expiry policy, or maintenance
  cleanup was added.

## 2026-04-28 11:51 [BUG-P1] BUG-025 — Codex session continuity and reset controls

Release target: `@zonease/aiworker-cli@0.4.2`.

Fixed the Codex worker "fresh session every turn" behavior found during
test-server fleet e2e:

- Codex executor now sends the full worker history window to both legacy
  `newTurn` and current `turn/start`, so worker.db remains the authoritative
  conversation source.
- Gateway `chat.send` now recognizes `/new` and `/reset`; reset commands close
  the current worker conversation for the same chat key and start a fresh one.
- Added focused tests for Codex request payload history and reset conversation
  rotation.
- Real fleet e2e passed after the final build: same `conversationId` remembered
  and returned `MEMKEY-PLAN027B-CERULEAN`; `/reset ...` then returned
  `UNKNOWN`.

## 2026-04-28 10:40 [BUG-P1] BUG-024 — Codex app-server protocol compatibility

Fixed the Codex executor failure found during the `v0.4.0` release e2e test
with a local Codex worker joined to the test-server fleet:

- Codex executor now keeps legacy `thread_start` / `newTurn` support and falls
  back to current `thread/start` / `turn/start` when current Codex CLI rejects
  the legacy request.
- Current Codex notifications such as `item/agentMessage/delta`,
  `thread/tokenUsage/updated`, and `turn/completed` now normalize into shared
  `AgentEvent`s.
- Codex default model metadata now uses `gpt-5.5`, matching the current Codex
  CLI model list for the local ChatGPT-backed account.
- Added focused tests for both legacy and current Codex app-server protocols.

## 2026-04-28 10:02 [BUG-P1] BUG-023 — 0.4.0 release readiness blockers

Fixed release blockers found while reviewing `v0.3.0..HEAD` for publish:

- Bumped `@zonease/aiworker-cli` to `0.4.0` because `0.3.0` is already the npm
  `latest` version.
- Brand-new project `aiworker init` now preserves explicit
  `AIWORKER_MASTER_KEY` / `INTERNAL_SHARED_SECRET` values so subsequent commands
  can decrypt the same `worker_identity` row.
- CLI publish packaging now copies only fresh `fleet` and `worker` Web bundles
  into `dist/web/` and clears stale bundled assets first.
- Root `bun run build` now sequences API, Web, and CLI bundle output to avoid
  concurrent writes to `apps/web/dist`.
- GitHub Release compiled binary assets are now packaged as tarballs containing
  the binary plus sibling `web/`, `drizzle/`, and `README.md` files.

## 2026-04-28 09:25 [BUG-P1] BUG-022 — Web admin SPA mount paths and deep links

Fixed two PLAN-022 Web UI runtime gaps:

- Fleet UI now creates its TanStack Router with the inferred `/admin` basepath
  in production, so the gateway-hosted `/admin/*` bundle has route matches.
- Fleet and Worker dev chooser mounts remain valid at `/fleet/*` and
  `/worker/*`.
- Production Web builds now emit `/admin/assets/...` and `/admin/favicon.svg`
  URLs, so nested admin deep-link reloads load assets from the stable admin
  root instead of a route-local `assets/` path.
- Added route bootstrap coverage for production and dev mount paths.

Verification: Web lint, typecheck, tests, build, shared cycle check, size
report, root lint, routeTree mount checks, and build output inspection all pass.

## 2026-04-28 08:55 [BUG-P1] BUG-021 — project-scope CLI placement hardening

Fixed the PLAN-023 Phase A runtime gap where the CLI side-effect bootstrap wrote
the derived fallback home back into `AIWORKER_HOME`, causing `aiworker init` to
treat user-default scope as an explicit override and skip project layout
creation.

Changes:

- `apps/cli/src/lib/bootstrap.ts` no longer writes derived scope into
  `AIWORKER_HOME`; only operator-provided env remains explicit.
- `init` is excluded from side-effect bootstrap and now owns dotenv bootstrap for
  global, explicit, existing-project, and brand-new project modes.
- `scope` is excluded from side-effect bootstrap and now writes deterministic
  stdout, so it remains a safe non-mutating diagnostic command.
- Removed the duplicate unscoped `bootstrapDotenv()` call in the CLI entrypoint.
- Added real CLI subprocess smokes with isolated `HOME` covering project init,
  no user-scope fallback, project scope diagnostics, non-mutating scope, and
  `init --force`.

Verification:

- `bun run --filter '@zonease/aiworker-cli' test`
- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run build`
- manual isolated CLI smoke for pre-init `scope`, fresh project `init`, and
  post-init project `scope`.

## 2026-04-28 08:35 [progress] REFACTOR-010 — PLAN-022 Phase 5 dark mode slice

Completed the conservative Phase 5 slice for Web UI capability completion.

- `apps/web/src/shared/stores/theme.ts` now drives theming through
  `data-theme` / `data-theme-preference` and keeps fleet / worker selections in
  separate localStorage keys.
- `apps/web/src/shared/components/theme-toggle.tsx` adds the shared icon-only
  theme toggle used by both fleet and worker shells.
- `apps/web/src/shared/styles/globals.css` moves the Tailwind dark variant and
  dark token overrides from `.dark` to `data-theme="dark"`.
- Added tests covering scoped hydration, scoped persistence, and the toggle
  cycle.

Deferred optional Phase 5 items remain i18n, cross-worker cron / approval
dashboards, and gateway proto expansion for broader cross-worker operations.

## 2026-04-27 19:30 [progress] PLAN-023 (PLAN-021 Phase A) — Worker 项目级落位收尾

落地 `<project>/.aiworker/` 三层 scope 解析与 CLI 项目级 init。承接 PLAN-021 master plan 的 Phase A，为后续 Phase B/D/C/E（上下文连贯 / skill+MCP per-worker / 三态记忆 / 自演化闭环）打底。

**REFACTOR-011 — fs-layout scope 解析 + project layout API**
- `packages/fs-layout/src/index.ts` 加 `resolveAiworkerScope(opts)` / `resolveProjectRoot(cwd)` / `ensureProjectAiworker(projectRoot)`，优先级 `cli-flag > env > project-detect > user-default`，遇 git boundary 即停（不跨 monorepo / repo 边界）
- `resolveWorkerHome` / `resolveBrainHome` / `resolveWorkspacesRoot` 在 project 模式下退化为「无 `workers/<id>/` 中间层」；user / explicit 模式保持 `<home>/workers/<id>/...`，systemd / docker 部署零回归
- `ensureWorkerHome` 在 project 模式变 no-op（persona docs 由 `ensureProjectAiworker` 负责）
- `local/.gitignore = "*\n!.gitignore\n"` + `.aiworker/.gitignore = "local/\n"` 默认拦截 worker.db / .env / workspaces 入 git，persona / skills / memories 默认入 git（团队共享 agent 人格）
- 新增 16 单测覆盖 explicit/env/project/user 优先级、git boundary、ensure 幂等、ensureWorkerHome project no-op

**FEAT-036 — CLI `aiworker init` / `aiworker scope`**
- `apps/cli/src/lib/bootstrap.ts` scope-aware：先 `resolveAiworkerScope()` 决定 home，再传给 `bootstrapDotenv({ home })`
- `aiworker init` 默认 project（cwd 必须 git repo，否则报错引导 `--global` / `--force`）；brand-new 路径 `delete process.env.{AIWORKER_HOME, AIWORKER_MASTER_KEY, INTERNAL_SHARED_SECRET}` 后让 fs-layout 自然 project-detect，并在 `<project>/.aiworker/local/.env` re-mint 项目独立 master key
- 新增 `aiworker scope` 诊断命令（参 `git config --list --show-origin`）：box 显示当前 scope / home / source / projectRoot + layout 文件存在性
- E2E 验证 7 场景全过：user-default / brand-new project init / idempotent re-init / scope 显示 / non-git repo 报错 / `--global` / `--force`

**6 项 PLAN-021 决策**（master plan 批准时定盘）已写入 PLAN-021 批注：dmScope 默认 `per-channel-peer`、E1 半自动、MCP 合并到 orchestrator tool registry、Engine credential 全 user 级、Phase 顺序 A→B→D→C→E、master 批准后分批起子 PLAN。

**下个步骤**：先完成 PLAN-024 / BUG-021 Phase A hardening；Phase B（Conversation router dmScope + auto-compaction + claude-code 退 replay-user-messages 模式）后续另起子计划。

## 2026-04-27 16:42 [release] `@zonease/aiworker-cli@0.3.0` — 代码审查批 P0+P1+P2 收官

10 commit `648adf5..f54c0c6` 一次性发到 npm。汇总：

**P0 安全（worker / gateway / channels 三处暴露面）**
- `BUG-015` worker `/api/worker/{orchestrator,evolution,events}` 缺 bearer-auth → `app.use('/api/worker/*', ...)` 顶层守门 + 移除 management 内部冗余中间件 (`03edf9c`)
- `BUG-016` web channel webhook 无验签 → web binding 加 `inboundToken`，adapter 用 `timingSafeEqualStrings` 校验 `Authorization: Bearer`，**fail-closed**（旧 deployments 必须在 dashboard 上设一次 token 才能恢复 web ingest）(`9c56ae1`)
- `BUG-017` Lark `verificationToken` + WhatsApp `verifyToken` 普通 `===` → 改 `timingSafeEqualStrings` (`7ba3886`)

**P1 安全 / 防御**
- `BUG-018` CLI engine 子进程透传整段 `process.env` → 新建 `safe-env.ts` 白名单（`PATH` / `HOME` / `LANG` / `NODE_*` / `CLAUDE_*` / `CODEX_*` / `CURSOR_*` / `GEMINI_*` / `QWEN_*`）+ 黑名单（`AIWORKER_*` / `INTERNAL_*` / `WORKER_*` / `*_TOKEN` / `*_SECRET` / `*_API_KEY`），4 engine + cli provider 全部接入。**`--dangerously-skip-permissions` 在 args 不在 env，未触碰** (`f0190ee`)
- `BUG-019` gateway loopback bypass fail-closed → `assertGatewayBindIsSafe()` 启动期检查：non-loopback bind + 无 `INTERNAL_SHARED_SECRET` 直接 throw (`a717fec`)
- `BUG-020` gateway WS 缺 frame size + 限频 → `maxPayloadLength=1MiB` + `idleTimeout=120s` + `ConnectRateLimiter`（IP 维度，60s 内 ≥5 次 connect 失败短拒，`gateway.connect.brute_force_blocked` audit 留痕）(`6285709`)

**P2 性能 / 健壮性**
- `REFACTOR-005` worker.db 7 索引（messages.conversationId / conversations 复合 / cron_jobs 复合 / agent_tasks.createdAt / evolution_observations.noticedAt / execution_logs.conversationId / conversations.lastActiveAt）+ migration `0003_rare_cloak.sql` (`64843be`)
- `REFACTOR-006` orchestrator API zod 入参（prompt 限 8000 字符）+ `WorkerConfig.orchestrator.maxHistoryMessages`（默认 20，1..200），run() 改用 `loadRecentMessages` 滚动窗口 (`9860615`)
- `REFACTOR-007` 杂项 4 修：`WorkerEventBus` listener 异常 `consola.warn` 不再静默；Lark `tokenCache` 加 `disposeTokenCache` 走 runtime.dispose；`FleetPersistence.countRegisteredWorkers` 改 SQL `count()` + listRegisteredWorkers 改 `orderBy desc`；`secrets/:key` 路径加 `[\w.-]{1,128}` regex (`6447415`)

**docs**
- `f54c0c6` `docs/task/index.md` 补 BUG-015 / BUG-016 / BUG-018 / REFACTOR-005 4 条 sub-issue 创建时漏的索引行
- 同 commit 开 `REFACTOR-008`（baseline lint debt 清零，P3，留作后续）

**测试基线**：typecheck 9 包全绿；shared 18 / proto 19 / storage 9 / cli 34 / gateway 112 / core 427 / api 57 / web 24 = ~700 pass / 0 fail；ESLint 60 errors 与 release 前 baseline 同等（package.json sort-keys + cli process global，与本批无关，REFACTOR-008 跟进）。

**升级注意**：
- web channel 旧部署的 `worker_config.configJson` 没有 `inboundToken`，升级后 web webhook 立即 401。运维必须在 dashboard `web channel → Generate inboundToken` 后 reload 才能恢复 ingest。
- gateway 启动 env：测试服 / 公网部署如果绑 `0.0.0.0` 但漏配 `INTERNAL_SHARED_SECRET`，新版直接拒启动。修复：要么绑 `127.0.0.1` 让 Caddy 反代，要么显式设 `INTERNAL_SHARED_SECRET`。
- worker 进程 env：runtime CLI engine 子进程不再继承敏感 env。如果 engine 之前依赖 `AIWORKER_*` / `*_TOKEN` 之类自定义 env（非典型），改在 `executor.overrides.env` 里显式声明。

## 2026-04-27 [BUG-P1] BUG-019 Gateway 启动期 fail-closed 断言（loopback bypass）

代码审查（root issue `nnid9urk`）发现的 P1 安全问题落地修复。

**根因**：`packages/gateway/src/auth/loopback.ts` `isLoopbackAddress()` + `auth/token.ts`
`authorizeConnection()` 对 loopback 远端无条件放空 token。运维若把 gateway 绑到
`0.0.0.0` 又忘配 `INTERNAL_SHARED_SECRET`，任何能 reach 端口的人都能以 operator
身份调 `workers.list` / `enroll.approve` / `token.rotate`。BUG-007 的 Caddy
basicauth 是运维侧 fail-closed，但代码侧没有兜底。

**修复**（短期断言；不修反代后 loopback 欺骗的根因，那留 follow-up）：

- `packages/gateway/src/auth/loopback.ts` 新增 `assertGatewayBindIsSafe({host,
  internalSharedSecret})` —— 非 loopback bind + 没 secret → throw 带修复提示
  （绑 `127.0.0.1` + Caddy basic-auth ‖ 设 `INTERNAL_SHARED_SECRET`）。
- `packages/gateway/src/server.ts` `startGatewayServer()` 入口在 `Bun.serve()` 之前
  调用断言；CLI 入口 `runGatewayStartForeground()` 已有 try/catch，错配会落
  `consola.error` + exit 1。
- `packages/gateway/test/auth.test.ts` 八条新用例覆盖 loopback bind ± secret /
  `0.0.0.0` ± secret / `::` IPv6 any / 公网 IP / 错误信息文案。

不在本 commit 范围（留独立 issue）：

- `X-Forwarded-For` 检查或 unix socket 拆 loopback / 公网 channel —— 这才是反代
  欺骗的真正修复，比断言改造大得多。

任务文档：`docs/task/BUG-019.md`。

## 2026-04-27 13:35 [BUG-P0] BUG-017 修复 — Lark / WhatsApp webhook token 改用常量时间比较

**违反 CLAUDE.md 关键不变量**："bearer / 共享 token 比较一律 `timingSafeEqualStrings`"。代码审查（BKD root `nnid9urk`）发现两处 webhook 验证仍用普通 `===` / `!==`：

- `packages/core/src/worker/channels/adapters/lark.ts:161` — Lark `verificationToken`。未加密路径**只**靠这个 token 把关，跨网时序攻击者可推算后伪造 Lark 事件、注入虚假用户消息。
- `apps/api/src/worker/channels/routes.ts:26` — WhatsApp Cloud API `GET /webhook` 订阅挑战的 `verifyToken`。推算成功后可在 Meta 控制台层完成订阅劫持，间接劫持 webhook 交付（POST 路径仍有 HMAC 兜底，风险次于 Lark）。

What shipped:

- 两处都改成 `timingSafeEqualStrings(actual, expected)`：core 内部直接 import `../../secrets/crypto`；apps/api 走 `@zonease/aiworker-core` 已 re-export（与 `apps/api/src/worker/management/bearer-auth.ts` 同款用法）。
- `packages/core/src/worker/channels/adapters/lark.test.ts` 增 2 case：同长度但内容不同（强制 timing-safe compare 分支）+ header.token 缺失；mismatched-token case 改成 message exact-match。
- 新建 `apps/api/src/worker/channels/routes.test.ts` 6 case：subscribe + 正确 token → 200 challenge / 同长度错误 token → 403 / 不同长度错误 token → 403 / 错误 hub.mode → 403 / 缺 verify_token → 403 / whatsapp 未绑定 → 404。

测试基线：core 405 pass、apps/api 38 → **44 pass**（+6）。typecheck + 改动文件 lint 全绿。

**不变量复核**：未引入 transport-coupling（apps/api 通过既有 core re-export 引入，packages/core 不增加 hono 依赖）；未触碰 vault / config-schema / 迁移；行为零差异，纯常量时间路径替换。

## 2026-04-27 13:30 [security] BUG-016 web channel webhook 加 bearer 验签（fail-closed）

P0 安全修复。`/web/webhook` 路由挂在 worker 根、不经 bearer auth；之前 `webAdapter.verify()` 是空实现，任何能访问 worker 端口的人都能 `POST /web/webhook` 注入伪造 envelope，触发 orchestrator → LLM 调用 + 写入 `worker.db.messages`。

修复（方案 A，与 Telegram `webhookSecretToken` 形态对齐）：

- `packages/shared/src/fleet/channel.ts` — web credentials 加 `inboundToken?: string`。
- `packages/core/src/worker/management/config-schema.ts` — zod web 分支放行 `inboundToken: z.string().optional()`。
- `packages/core/src/worker/channels/adapters/web.ts` — `verify` 读 `Authorization: Bearer <token>` + `timingSafeEqualStrings`。**fail-closed**：binding 没有 `inboundToken` / 空串 / 头缺失 / scheme 错 / token 不匹配 → throw → 401。
- `packages/core/src/worker/config/secret-paths.ts` — enumerate / redact / hydrate 三处都覆盖 `inboundToken`，empty-string round-trip 保留语义不变。
- `apps/web/src/features/workers/components/config-editor/channels-section.tsx` — web 分支换成 `SecretField` + `Generate` 按钮（`crypto.getRandomValues` 24 字节 base64url）。
- 测试：`packages/core/src/worker/channels/adapters/web.test.ts` 新增 `verify` 7 个用例；`bun test` 410 pass / `bun run typecheck` 全绿 / `aiworker-web` vitest 24 pass。

向后兼容：旧 `worker.db.worker_config.configJson` 里 `{ channel: 'web' }` 没有 `inboundToken`。读上来 `inboundToken === undefined` → verify fail-closed → 旧部署的 web channel ingest 立即拒绝。这是预期：旧路径就是漏洞，运维必须在 dashboard 上设一次 token 才能恢复。

## 2026-04-27 12:30 [info] Session handoff — open tasks 总览 + 测试服 ops 残留

**本会话主要工作**（已 push 到 `origin/main`，HEAD 当时为 `2bcf99c`，含本条 + 后续 BUG-013/BUG-014 + REFACTOR-004 followups 的 commit）：

- **Git history redact + force push**（用户操作）：移除测试服 IP / aissh server id / 公网域名敏感信息（filter-branch tree-filter + msg-filter）
- **CLAUDE.md 大幅清理**（141 → 79 行，PLAN-013 dashboard 双模过期段全删 + MCP 强制约束放宽）
- **`@zonease/aiworker-cli@0.2.1` 真发 npmjs.com**（含 in-process gateway + bundle drizzle migrations + WORKER_DB_PATH lazy default）
- **测试服 fleet 迁移**：`/opt/aiworker` 源码 systemd → `bun install -g @zonease/aiworker-cli` + 改 unit ExecStart 走 npm-installed binary（in-process foreground）+ Caddyfile `:3000 → :9218` + env 删 `PORT=3000`
- **README 重写**（+216/-167，409 行）：30 秒 demo + ASCII 端到端流程图 + 4 个 LLM executor 配置例子
- **claude-code executor 端到端 demo 实测通过**：本机 worker → 公网 wss → operator approve → config set claude-code → hot-reload v2 → chat 真实 LLM 流式回复

**Closed tasks（本次）**：
- ✅ FEAT-027 GA（npm publish 0.2.0 → 0.2.1）
- ✅ FEAT-030（zero-env quickstart：动态版本 + 默认端口 9217/9218 + 首次启动 mint master key）
- ✅ REFACTOR-004 GA（测试服迁移到 npm cli + Caddy）
- ✅ BUG-011（worker quickstart 强制 env 缺口；与 BUG-012 合并 0.2.1 一并修）
- ✅ BUG-012（cli `gateway start` 假设 monorepo 布局；in-process 重构方案 D 落地，apps/gateway → packages/gateway）

**Open tasks**（下个 session 起点；按 priority 排）：

| ID | P | Title |
|----|---|-------|
| BUG-013 | P2 | `workers.info` / `workers.stop` dispatcher 显式 stub（`aiworker fleet info/stop` 永远失败）— **本 session 新开** |
| BUG-014 | P2 | `aiworker install systemd` 渲染的 unit 缺 `EnvironmentFile` + 全部安全加固（首次部署体验破）— **本 session 新开** |
| BUG-006 | P3 | `reloadRuntime` 串行化没显式 mutex（PLAN-014 时占位） |
| BUG-010 | P3 | runtime log 字串仍含 `aiw` / `aim` / `aim.json`（PLAN-020 rename 残留） |
| FEAT-002 | P3 | Executable skills runtime（sandbox） |
| FEAT-007 | P3 | M:1 channel routing |
| FEAT-008 | P3 | Host-level HA + multi-host fleet |
| FEAT-010 | P3 | Publish registry routes 进 OpenAPI spec |

建议下个 session 优先级：**BUG-013 + BUG-014 一并修发 0.2.2**——两个都是用户首次/常用命令路径上的破口（fleet info / install systemd），都 ~50-100 LOC，可合并一个 commit。BUG-006 / BUG-010 P3 可推迟。

**测试服 ops 残留**（`aissh aiwork`，下次 maintenance 清理；不阻塞）：
- `/opt/aiworker-removed-20260427` 451M（旧 monorepo 源码）
- `/opt/aiworker-new` 29M（cutover 前 staging clone，未用）
- `/opt/aiworker-deploy/` PLAN-016 docker 配置目录
- `/tmp/aiworker-gateway.service.{bak,new}` + `/tmp/Caddyfile.{bak,new}` + `/tmp/gateway.env.{bak,new}` cutover staging（env.* 已 truncate）
- `/var/lib/aiworker/.env` 0 bytes（dotenv-bootstrap 残留）

清理命令清单见 `docs/task/REFACTOR-004.md` § Followups。

**安全提醒**：
- 上次发 0.2.1 用的 npm token 已 shred (`./tmp/npm_token` 已删)，建议 npm 端轮换
- aissh token 在前次 session 末曾失效一次，本次会话末仍有效；如下次 session 报 `未配置认证 Token` → `aissh config set-token <token>`

## 2026-04-27 12:15 [progress] README 重写 + claude-code executor 端到端验证

README.md 大幅清理（+216/-167，409 行）：

- 顶部加 **🚀 30 秒 demo** 章节：完整 ASCII 端到端流程图（worker → wss enroll → operator approve → fleet online → chat dispatch）+ 真实 worker/operator 命令 + 期望 stdout 输出
- 修过期 Stack 描述：`apps/{api,cli,web}` + `packages/{core, gateway, gateway-proto, shared, storage-sqlite, fs-layout}`（apps/gateway 已 REFACTOR-004 迁到 packages/gateway）
- 修 Status 表：CLI 重命名（PLAN-020）/ npm publish（FEAT-027 0.2.1 latest）/ in-process gateway（REFACTOR-004）全部 ✅ GA
- "Worker 配 LLM executor" 段展开 4 例：claude-code（local logged-in `claude`）/ http (OpenAI/DeepSeek 兼容) / acp (gemini/qwen) / codex+cursor+mcp 链接
- 修路径 2/3 命令（`bun apps/cli/src/aiworker.ts ...` → `aiworker ...`）
- 故障排查 4 行替换：删旧 BUG-009 commit hash 引用 + 加 BUG-012 修法（`bun install -g @latest` ≥0.2.1）

**claude-code executor 端到端 demo 实测**：

本机起 worker（`AIWORKER_HOME=/tmp/aiw-demo-claude`），enroll 到测试服公网 wss → operator (loopback) approve OTP `94K3-C94C` → workerId `w_vk7y0qx23cgb` 加入 fleet → operator `aiworker config set ... '{"executor":{"engine":"claude-code","variant":"default"}}'` `--if-match 1` → response `{"version":2,"runtimeReload":"ok"}` → worker log: `i [worker] runtime reloaded to config version 2` → operator `aiworker chat <id> '请用一句话介绍你自己...'` →

```
{"kind":"accepted",...}
{"kind":"agent.thinking","payload":{"chunk":"我是 Claude"}}
{"kind":"agent.thinking","payload":{"chunk":"，由 Anthropic 构建的 AI 助手，目前运行在 **Claude"}}
{"kind":"agent.thinking","payload":{"chunk":" Sonnet 4.6**（`claude-sonnet-4-6`）模型上。"}}
{"kind":"done","payload":{"finishReason":"stop"}}
```

链路：本机 worker → 公网 wss → Cloudflare → Caddy `/ws` → 测试服 in-process gateway 0.2.1 → ForwardTable → worker orchestrator → claude-code executor → 本机 `claude` CLI（用 `~/.claude.json` 已登录 token）→ Anthropic API → stream chunks 回流。验证 hot-reload + claude-code executor + 真实 LLM 响应一气呵成。`finishReason: stop`（不再是 error）。

清理：fleet remove + kill worker process + truncate tmp homes。

## 2026-04-27 11:50 [progress] REFACTOR-004 GA + BUG-011 + BUG-012 完成 — 测试服迁移到 npm cli + in-process gateway

`@zonease/aiworker-cli@0.2.1` 真发到 npmjs.com（shasum `73a715c`，13 files / 0.85 MB unpacked / 234 KB packed，含 dist/drizzle/{fleet,worker} migrations）。测试服 cutover 一气呵成成功：

- `bun install -g @zonease/aiworker-cli@0.2.1` 装到 `/root/.bun/bin/aiworker`
- atomic swap：systemd unit `ExecStart=/root/.bun/bin/aiworker gateway start`（保留 EnvironmentFile + StateDirectory + ProtectSystem 等加固）+ `/etc/aiworker/gateway.env` 删 `AIWORKER_GATEWAY_PORT=3000` + Caddyfile 三处 `127.0.0.1:3000 → :9218`
- `caddy validate` 通过 → reload；`systemctl daemon-reload` + `restart aiworker-gateway` → `systemctl is-active = active`、`/health = {"ok":true,"service":"aiworker-gateway"}`
- gateway 现跑 in-process foreground 模式（journal: `✔ [gateway] listening ws://127.0.0.1:9218/ws` + `✔ gateway 已启动 (foreground) port=9218`）
- `/opt/aiworker` 451M 退役至 `/opt/aiworker-removed-20260427`（保留作 rollback；下次 maintenance 可彻底删）
- prod gateway.env 副本 `/tmp/gateway.env.{bak,new}`（含 master key）truncate 到 0 bytes
- fleet.db 完整保留（`/var/lib/aiworker/fleet.db` 53 KB），`registered_workers` 行数与 cutover 前一致

**BUG-011 + BUG-012 in-process 重构（commit `0490888`，52 files +216/-204）**：

- `git mv apps/gateway → packages/gateway`：gateway 改库形态，加 `exports` map（删 `bin`）；87 tests 全 pass
- `apps/cli` deps 加 `@zonease/aiworker-gateway`，bundle 内嵌 in-process gateway（0.72 → 0.77 MB +50 KB）
- `daemon.ts` 重写：删 `resolveGatewayEntry` / `locateRepoRoot` / `DEFAULT_GATEWAY_WORKSPACE_REL`；spawn 模式改 self-spawn (`process.execPath` + `argv[1]`) + env `AIWORKER_GATEWAY_INTERNAL_FOREGROUND=1` 触发子进程 foreground
- `commands/gateway.ts` 重写 `runGatewayStart`：默认 foreground in-process `import startGateway()` + SIGTERM/SIGINT shutdown handler + `await new Promise<never>(() => {})` 阻塞主进程；`--detach` 走老 daemon 模式
- `aiworker.ts` `gateway start`：删 `--entry` flag，加 `--detach`
- `storage-sqlite/{fleet,worker}/index.ts`：`defaultXxxMigrationsFolder` 用 `resolveMigrationsFolder()` helper（dev `../../drizzle/<rel>` 优先 → bundle `./drizzle/<rel>` sibling fallback）
- `core/config/worker.ts`：`WORKER_DB_PATH` 加 lazy default `<AIWORKER_HOME>/worker.db`
- `build-publish-manifest.ts`：拷 `packages/storage-sqlite/drizzle` → `apps/cli/dist/drizzle`；`files` 加 `"drizzle/"`

REFACTOR-004 / BUG-011 / BUG-012 三任务卡全 closed。后续测试服 update 路径：`bun install -g @zonease/aiworker-cli@latest && systemctl restart aiworker-gateway`，一行结束。

token 安全：`./tmp/npm_token` 用完即 shred，未入 git。建议 npm 端轮换。

## 2026-04-27 12:00 [progress] REFACTOR-004 测试服迁移 cutover 失败 + 开 BUG-012 P1（gateway entry 仓库布局假设）

测试服迁移 cutover 实战阻塞：`bun install -g @zonease/aiworker-cli@0.2.0` 装好后 systemctl restart aiworker-gateway 卡 activating（exit 1）。journal:

```
ERROR  gateway start 失败: gateway 入口未找到。请设置 AIWORKER_GATEWAY_ENTRY 或使用 --entry <path>；
或确保仓库内存在 apps/gateway/src/index.ts。
```

Root cause：`apps/cli/src/aim/daemon.ts::resolveGatewayEntry` 假设 cli 跑在 monorepo 内，walk-up 找 `apps/gateway/src/index.ts` 作为 spawn 目标。npm install 装的 dist tarball 仅含 `aiworker.js + README.md + package.json`，sibling apps 不存在 → 命令无路可走。

**Rollback 完成**（gateway 回 :3000 active + /health OK + fleet.db / 已注册 worker 全部不受影响）：
- systemctl stop → cp /tmp/*.bak 原版 → daemon-reload + start → caddy reload
- 清理 mint 残留：`/var/lib/aiworker/.env` + `/root/.aiworker/.env`（dotenv-bootstrap 自动 mint 的废弃 master key）truncate 0 bytes；`/tmp/gateway.env.{bak,new}`（prod master key 副本）同样 truncate
- bun-installed cli 仍在 `/root/.bun/bin/aiworker`（无害，systemd 不调）

开 `BUG-012 P1` 跟踪——4 修复策略对比（A env workaround / B build-time bundle gateway / C 单独 publish gateway 包 / D in-process 推荐）；短期 workaround = 0.2.1 加 dist/gateway.js + daemon.ts fallback。建议 BUG-011（lazy default）+ BUG-012（gateway entry）二修同 0.2.1 一并发，REFACTOR-004 重跑 cutover 一气呵成。

## 2026-04-27 11:50 [progress] FEAT-027 GA — `@zonease/aiworker-cli@0.2.0` 真发到 npmjs.com

`@zonease/aiworker-cli@0.2.0` 真实 publish 落地（前置：`e485bea` redacted history force push 完成）：

- `bun publish --access public` 从 `apps/cli/dist/` 出包：3 文件 0.73 MB unpacked / 217.71 KB packed，shasum `54e6c3f203e68df60c95f73d50e5e15d588c5cf2`，dist-tags `latest=0.2.0`
- 含 FEAT-030 全部改进：动态版本（`aiworker --version` → `0.2.0`）、默认端口 9217 / 9218、首次启动自动 mint master key 写 `~/.aiworker/.env` chmod 0600
- License MIT、deps none、bin `aiworker`、files `aiworker.js + README.md`
- npm registry 验证：`bunx npm view @zonease/aiworker-cli@0.2.0` 返回正确 metadata，published just now by ben9217

token 安全：`./tmp/npm_token` 用完即 shred，未入 git。建议 npm 端轮换。

REFACTOR-004 阻塞解除（aiworker@0.2.0 可 npm install）；测试服迁移待 aissh token 重新配置后继续。

## 2026-04-27 11:30 [decision] 测试服部署原则收紧——只允许已发布 npm cli + Caddy 反代

用户决策（直引）："测试服务器，除了 caddy 反代外，不再由源码构建，只允许安装或更新，从已发布的 cli 去操作"。

CLAUDE.md "Project Preferences" 替换原"部署优先级 docker compose > docker run > 裸机 + scripts/deploy.ts" 条目为：测试服**只允许** `npm install -g @zonease/aiworker-cli@<version>` + `aiworker install systemd` + Caddy 反代；**禁止** git clone 源码、`docker compose pull` GHCR 镜像、远端 `bun build` / `tsc` 编译。`scripts/deploy.ts` + `ops/compose/*.yml` 仅适用其他场景或保留为参考，不再用于测试服。

开 `REFACTOR-004 P1` 跟踪具体迁移：测试服当前 fleet 跑 `/opt/aiworker/apps/gateway/src/index.ts`（PLAN-016 时 git clone 整 monorepo + systemd `bun ts-entry` 直跑，451M）；目标态 `aiworker gateway start`（npm-installed binary）+ unit 由 `aiworker install systemd` 重渲染。阻塞项：`@zonease/aiworker-cli@0.2.0` 必须先真发到 npmjs.com（待用户授权 + 新 token，旧 token 已要求轮换）。Caddy 端口策略二选一（保留 3000 或与 FEAT-030 默认 9218 对齐），推荐对齐。

## 2026-04-27 11:05 [progress] FEAT-030 e2e 端到端验证 + BUG-011 占位

本机起 worker（`bun apps/cli/dist/aiworker.js serve`，AIWORKER_HOME 隔离 `/tmp/aiw-feat030-localworker`）通过公网 `wss://gateway.example.test/enroll-ws` OTP enroll 到测试服 systemd gateway；测试服 loopback (`ws://127.0.0.1:3000/ws` 空 token bypass) 跑 operator approve OTP `4Q35-2HEM` → fleet `online: true` → `chat` 全链路 NDJSON `accepted` → `chat.message` → `done`（finishReason=error 因 worker 未配 executor，链路本身 OK）。验证 FEAT-030 三件套全部 wire-through。清理已 fleet remove + kill worker + 删 `/tmp/aiw-feat030-localworker`（含 master key）+ 测试服 `/tmp/feat030-op` 删除。

副产品：开 `BUG-011 P3` —— FEAT-030 README 承诺"OTP 路径只需 `AIWORKER_GATEWAY_URL`"实际不成立，`WORKER_DB_PATH` 默认 `/var/lib/aiworker/worker.db` 写不动 + `WORKER_MIGRATIONS_FOLDER` `import.meta.url` 在 bundle 后失效，仍需 4 个 env 才能起。BUG-011 列了 `WORKER_DB_PATH` 加 lazy `<AIWORKER_HOME>/worker.db` + drizzle migrations 拷进 dist 或内嵌为 string array 两条修复路径。

## 2026-04-27 10:50 [progress] FEAT-030 followup — 全仓 3000/3001 → 9217/9218 端口语义统一

用户反馈"只要需要用到端口，就往 9217 后排"——上一轮 FEAT-030 仅改了 schema 默认值，留下大量 compose / Dockerfile / 测试 fixture / 活跃文档仍然引用旧 3000/3001。本次一次性 sweep：

**代码层（影响实际行为）：**
- `Dockerfile` `EXPOSE 3000 3001 → 9217 9218` + 注释更新
- `docker-compose.yml` + `ops/compose/docker-compose.yml`：gateway port `3000:3000 → 9218:9218` + `PORT/AIWORKER_GATEWAY_PORT 3000 → 9218`
- `ops/compose/docker-compose.worker.example.yml`：worker port `3001:3001 → 9217:9217` + `PORT '3001' → '9217'` + advertised baseUrl 注释 → `:9217`
- `ops/compose/docker-compose.supervisor.yml` + `apps/gateway/src/supervisor/service.ts` 注释：`{containerName}:3001 → :9217`
- `scripts/deploy.ts` health check `:3000 → :9218`
- `apps/cli/src/aim/daemon.ts` PORT default `'3000' → '9218'`（gateway daemon entry）
- `apps/cli/src/commands/approvals.ts` 注释默认 → `9217`

**测试 fixture（保持端口语义一致）：**
- `apps/gateway/test/{enroll,enroll-otp-handshake,workers-pair,workers-launch}.test.ts`：所有 `:3001` baseUrl / launchBaseUrlTemplate → `:9217`
- `packages/gateway-proto/test/parse.test.ts` 同上

**活跃文档（反映新现状）：**
- `CLAUDE.md` Caddy 反代描述 `:80 → 127.0.0.1:3000` → `:80 → 127.0.0.1:9218`
- `docs/architecture.md` / `docs/gateway.md` / `docs/deployment.md` / `docs/deployment-public-https.md` 全部 `:3000 → :9218`、`:3001 → :9217`、`AIWORKER_GATEWAY_PORT=3000` → `9218`、`--port 3001` → `9217` etc.

**保留不动（历史决策快照）：**
- `docs/plan/PLAN-001~PLAN-019.md`、`docs/task/BUG-007.md` / `BUG-002.md` / `BUG-010.md` / `FEAT-009.md` / `FEAT-017.md` / `FEAT-024.md` / `docs/changelog.md` 旧条目——这些是当时决策的现场，端口数字是史料。
- `.playwright-mcp/page-*.yml` 测试快照——一次性 capture，无需追溯。

**生产部署迁移 run book**（次次部署前 must do）：
1. 改 prod `/etc/aiworker/gateway.env`：删除 `AIWORKER_GATEWAY_PORT=3000`（让默认 9218 生效），或显式改为 `9218`
2. `scripts/deploy.ts deploy` upload + install 拉新镜像、新 compose、新端口映射
3. 改 prod Caddy `reverse_proxy 127.0.0.1:3000` → `9218` + reload
4. verify `curl http://127.0.0.1:9218/health` 200

typecheck 9/9 + gateway 87 / cli 34 / gateway-proto 19 test 全 pass。bundle 未变（0.72 MB）。

## 2026-04-27 10:30 [progress] FEAT-030 完成 — 零 env quickstart：动态版本 + 默认端口 9217/9218 + 首次启动自动 mint master key

`@zonease/aiworker-cli@0.1.0` 首发后用户反馈：版本号写死（`aiworker --version` 印 `0.3.0`，npm 印 `0.1.0`）、默认端口 3000/3001 与 dev 高频段冲突、新用户必须手动 `export AIWORKER_MASTER_KEY` 才能跑 `aiworker init` 友好度差。本次三件套修复：

**1. 动态版本** —— `apps/cli/src/aiworker.ts` 改成 `import packageJson from '../package.json' with { type: 'json' }` + `cli.version(packageJson.version)`，bun bundle / npm install 全路径输出一致。

**2. 默认端口迁 9xxx** —— worker `PORT` 默认 `3001 → 9217`、gateway `AIWORKER_GATEWAY_PORT` 默认 `3000 → 9218`、`AIWORKER_LAUNCH_BASE_URL_TEMPLATE` 模板 `:3001 → :9217`。同步更新 `ops/caddy/Caddyfile.tmpl` 反代 target、CLI 默认 `DEFAULT_GATEWAY_URL`、web `vite.config.ts` dev proxy / `gateway-client.ts` 默认 WS URL、`apps/api/.env.example` 示例、`ops/compose/.env.example` 注释、`register-wizard.tsx` placeholder。9217/9218 不在 IANA well-known，避开 Vite/Next/PostgREST/常规 dev squat 段。**现存生产部署不受影响**：`/etc/aiworker/gateway.env` 显式 `AIWORKER_GATEWAY_PORT=3000` 仍优先（criteria #6）。

**3. 首次启动自动 mint** —— 新增 `apps/cli/src/lib/dotenv-bootstrap.ts`（zero-dep，~120 LOC）：`bootstrapDotenv()` 在所有业务模块 import 之前跑（schema 在 import 期就 parse `process.env`，必须先注入）。逻辑：
- `~/.aiworker/.env` 存在 → parse + 仅填补缺失 key（显式 export 优先）
- 不存在 → mint `AIWORKER_MASTER_KEY`（32 byte hex）+ `INTERNAL_SHARED_SECRET`（24 byte hex），写入 chmod `0600`，master key 明文 **仅一次** 打到 stderr 加备份警告
- 第二次启动 silent 加载

README.md Quickstart 简化：原来要 `export AIWORKER_HOME` + `AIWORKER_MASTER_KEY` + `WORKER_DB_PATH` 三件套，现在 OTP 流程只剩 `AIWORKER_GATEWAY_URL`（必）+ 可选 `AIWORKER_DISPLAY_NAME`。

`apps/cli/package.json` 版本 `0.1.0 → 0.2.0`（minor bump，因为默认端口与首次启动行为对用户可见）。dist bundle 重打 0.72 MB，`bun apps/cli/dist/aiworker.js --version` 验证输出 `aiworker/0.2.0`，第一次跑印 banner 写 `~/.aiworker/.env`，第二次跑 silent。typecheck 9/9 + cli/gateway test 全 pass。

**npm publish `0.2.0` 暂未真发** —— 等用户授权 + 新 token；上轮已用 token 必须轮换。

## 2026-04-27 09:15 [decision] FEAT-029 完成 — license 选 MIT

`@zonease/aiworker-cli` 公开 npm publish 阻塞条件 #7（FEAT-027 §Research Findings）解除：

- 用户决定 license = **MIT**（permissive，与 Anthropic SDK / 主流 npm peer 一致，零 friction adoption）
- 写 `LICENSE` 文件（MIT 标准文本，© 2026 ZonEase Tech）
- 全 10 个 `package.json` `license` 字段统一改为 `"MIT"`（root + apps/{api,cli,gateway,web} + packages/{core,shared,gateway-proto,storage-sqlite,fs-layout}）；之前仅 `apps/cli` 显式 `UNLICENSED`，其他 9 个 `license` 字段缺失
- README.md `## License` 段从"(待定)"改 `[MIT](LICENSE) © 2026 ZonEase Tech`
- `apps/cli/scripts/build-publish-manifest.ts` 已正确把 `license` 字段拷进 `dist/package.json`（无需改）

**Apache-2.0 备选已弃**——agent runtime 与 fleet 管理无新颖专利面；MIT 的简洁性与生态一致性更重要。如未来引入加密 / ML 模型权重 等专利暴露面，可单独子模块改 Apache-2.0（dual-license OK）。

阻塞清单更新（FEAT-027 §9 prerequisite checklist）：

| # | 项 | 状态 |
|---|---|---|
| 1 | 注册 npm user account + 2FA | ⏳ 用户 |
| 2 | 抢注 npm org `zonease`（free plan） | ⏳ 用户 |
| 3 | 生成 Granular Access Token | ⏳ 用户 |
| 4 | GH repo Secret `NPM_TOKEN` | ⏳ 用户 |
| **5** | **License 决策 + LICENSE + 10 package.json** | **✅ 本 commit 完成** |
| 6 | GH Actions billing 解决 | ⏳ 用户 |
| 7 | `git tag v0.1.0 && git push --tags` | ⏳ 等 1-6 |

## 2026-04-27 09:00 PLAN-020 完成 — CLI 单二进制 `aiworker` + 全 monorepo `@zonease/*` 改名 + npm publish 准备就绪（FEAT-028 + FEAT-027 partial）

**PLAN-020 landed: aiw/aim 双 bin 下线，单 `aiworker` 二进制 + cac 子命令树替换；全 monorepo 9 个包从 `@aiworker/*` 迁到 `@zonease/aiworker-*`；`@zonease/aiworker-cli` npm publish 流水（bundle build + release.yml + dist/ stripped manifest）就绪，未真发。** 用户决策 2026-04-27 07:35（FEAT-028 方案 B 锁定）+ 07:45（scope 扩到 monorepo namespace 迁移）。BKD 1 coordinator (`th3t4j9q`) + 4 worktree subtask（S1 monorepo rename / S2 cli 重写 / S3 forward-looking docs sweep / S4 npm publish 元数据 + bundle build），按 S1 → S2+S3 并行 → S4 串行流水合 main。

What shipped:

- **S1 monorepo rename**（commit `5bf852c`，merge `6927faf`，185 files / 362+ / 360-）：9 份 package.json `name` + `dependencies` / `devDependencies` 全迁；根 `package.json` `db:generate*` filter 同步改；全工作树 `.ts` / `.tsx` / `.config.ts` import sweep（172 文件）；Dockerfile build path 必修以保 GHCR 镜像构建可复现；`apps/api/.env.example` 注释；`bun.lock` 重生（0 第三方 dep 漂移，仅 9 个 internal workspace 链接换名）。Subpath imports（如 `@zonease/aiworker-storage-sqlite/fleet`）保留段。
- **S2 cli 重写**（commit `babe3fd`，merge `1fd2d67`）：新 `apps/cli/src/aiworker.ts` 单 cac entry，36 个子命令（worker-local dash-form：`init / run / serve / config-show / config-set / token-rotate / approvals-list / approvals-grant / schedule-list / schedule-add / schedule-remove`；operator-remote 两词形式：`fleet list/info/launch/stop/remove`、`gateway start/status/stop`、`pair / chat / config get|set / token rotate / approvals list/grant / schedule list/add/remove / enroll list/approve/reject / logs / install systemd`）；`preprocessArgv` 动态从 `cli.commands` 收所有含空格的命令名，通用折叠多词 argv；删 `apps/cli/src/aiw.ts` + `aim.ts`，无 shim；`apps/cli/package.json` `bin: { aiworker }`；`smoke-aiw-run.ts` → `smoke-aiworker-run.ts`、`smoke-aim.ts` → `smoke-aiworker-fleet.ts`（git mv 保留 history）；systemd unit 模板 `ExecStart` 切到 `aiworker gateway start`；新增 `apps/cli/src/aiworker.test.ts` 入口测试 +10 case（注册命令计数 + 多词预处理 6 个用例 + `--help` 关键字）；cli 测试集 24 → 34 全过。
- **S3 forward-looking 文档迁移**（commit `1ab305e` + 补丁 `fb02179`，merge `4d0fd24`）：6 文档 + 1 .env.example 全替换。命令树统一到 `aiworker` 单二进制：`README.md` / `docs/cli.md`（全文重写）/ `docs/deployment.md`（systemd / install / aim 命令样例）/ `docs/architecture.md` / `docs/gateway.md` / `CLAUDE.md` § Project Development / Stack。`apps/api/.env.example` + `ops/compose/.env.example` 注释清理。补丁 `fb02179` 同步把 `docs/architecture.md` / `docs/cli.md` / `docs/deployment.md` / `docs/gateway.md` 内 14 行 `@aiworker/X` 包名引用迁到 `@zonease/aiworker-X`（含 subpath，如 `@zonease/aiworker-gateway-proto/src/messages.ts`）。`docs/changelog.md` PLAN-020 占位由本 commit 填充正式内容。`docs/plan/PLAN-NNN.md` / `docs/task/{FEAT,BUG,REFACTOR}-NNN.md` 历史命名保留。剩余 word-boundary `aiw|aim` 命中均合理保留（磁盘文件 `aim.json`、域名 `gateway.example.test`、anchor 兼容文档历史叙述）。
- **S4 npm publish 准备**（commit `7bde0c9`，merge `79cadd8`，4 files / 128+ / 9-）：`apps/cli/package.json` 落 publish 元数据（`version: 0.1.0` / `license: UNLICENSED`（FEAT-029 跟进）/ `repository` / `homepage` / `publishConfig.access: public` / `bin: { aiworker: ./dist/aiworker.js }` / `files: [dist/, README.md]` / `engines.bun: >=1.1`）；`scripts.build = bun build --target=bun --minify --outdir=dist src/aiworker.ts && bun scripts/build-publish-manifest.ts`；`prepublishOnly = bun run build`。新增 `apps/cli/scripts/build-publish-manifest.ts`（38 LOC）：build 后写一份 stripped `dist/package.json`（去掉 `devDependencies` 整个 workspace 段、`bin` 改 `./aiworker.js`、`files: [aiworker.js, README.md]`），并把仓库根 `README.md` copy 到 `dist/`。`.github/workflows/release.yml`（51 LOC）：tag `v*` 触发 → typecheck/test → bundle build → `cd apps/cli && bun publish --access public`（NPM_TOKEN 注入）→ 4 平台 `bun build --compile`（linux x64/arm64 + darwin x64/arm64）→ `softprops/action-gh-release` 附件。**release.yml 仅在 tag 推送时跑——本轮未推 tag，不会触发实发**。`README.md` install 节追加「Published（待 FEAT-027 npm publish 上线）」并行选项与本地开发路径并存。

Verification（最终 main HEAD `79cadd8`）：

- `bun run typecheck`：9/9 全过
- `bun run test`：~617 pass / 0 fail（PLAN-019 基线 ~607 + S2 入口测试 +10）
- `bun run --filter '@zonease/aiworker-cli' build` → `apps/cli/dist/aiworker.js` 0.72 MB（393 modules bundled）
- `bun apps/cli/dist/aiworker.js --help` → 列出 36 个子命令
- `bun apps/cli/dist/aiworker.js fleet list --help` / `config-show --help` / `install systemd --help` 全通
- `cd apps/cli/dist && bun publish --dry-run` → 3 files packed（aiworker.js + package.json + README.md，0.73 MB tarball），止步在 `missing authentication` —— 符合「不真发」要求
- `git grep '@aiworker/' -- ':!docs/plan' ':!docs/task' ':!docs/changelog.md' ':!bun.lock'` → 空（forward-looking + 源代码全清；`docs/plan/*` / `docs/task/*` / `docs/changelog.md` 历史保留）

Conflict / re-dispatch notes：

- S2 / S3 / S4 worktree 启动初期都看到 base = `a2e7961`（pre-S1 旧 main）—— BKD worktree 没自动 rebase，subtask 自己 `git rebase main` 拉齐后再开干（S2 / S3 在自检阶段就发现并 self-correct；S4 也同样自我 rebase，coordinator 跟发的 rebase follow-up 到达时 commit 已落地）。后续 BKD orchestration 同主题 PLAN 应预设 subtask 启动第一步是「rev-parse main vs HEAD 校验」+「reset/rebase」。
- S1 完成时按规格内 `git grep '@aiworker/'` 验收命令命中 14 行 `forward-looking` docs，与 §8「不要触碰这 4 份 docs」冲突。coordinator 决策 Option A：S1 范围正确（仅源码 import），14 行包名引用归 S3 自然清理。已通过补丁 follow-up 把这 14 行覆盖到 S3，`fb02179` 即为补丁 commit。

PLAN-020 / FEAT-028 → completed；FEAT-027 → completed (partial：bundle build / release.yml / publish 元数据全到位，**未真发到 npmjs.com，未推 git tag**，等用户授权 + GH Actions billing 解决后单点触发)。BKD coordinator (`th3t4j9q`) + S1-S4 (`9nainczp` / `2ndlwj3l` / `vc0463kl` / `fa2w8w83`) 全 worktree subtask 流程顺利收尾。

## 2026-04-27 07:35 PLAN-019 E2E 验证 — coordinator 收尾

跑完整 OTP-attended round-trip。起 gateway with `AIWORKER_MASTER_KEY=<32-byte hex>` + `AIWORKER_FLEET_DB_PATH` 在 `:23000`（无 `JOIN_TOKEN`，OTP 路径不依赖 fleet 共享密钥）；起 `aiw serve` with **仅** `AIWORKER_GATEWAY_URL=ws://127.0.0.1:23000` + `AIWORKER_DISPLAY_NAME=otp-e2e-test` 在 `:23001`（trigger table 行 3 → 自动落 OTP 模式 + path 改写为 `/enroll-ws`）。

- **happy**：worker stdout 立即打方框 `OTP: TJQG-4ZWT, expires in 300s`（FEAT-026 AC #1 / #2 ✓）；`AIWORKER_HOME=…/aim-home aim enroll list` 返回 `{ pending: [{ otp:TJQG-4ZWT, workerId:w_q8gctmng402j, displayName:otp-e2e-test, submittedAt, expiresAt }] }`（AC #3 ✓）；`aim enroll approve TJQG-4ZWT` → `✔ 已批准 OTP …，workerId=w_q8gctmng402j`，worker stdout `approved as w_q8gctmng402j; deviceToken=wtk_…，已加入 fleet`；`fleet.db.registered_workers` 写入 `id=w_q8gctmng402j, display_name=otp-e2e-test, added_by='otp', base_url=''`，`audit_events` 写 `gateway.enrollment.requested` (含 `otpHash=89ae0790` sha256 前 8 hex) + `gateway.enrollment.approved` (`change=created`)（AC #4 ✓）。
- **reject**：起新 worker（displayName `otp-e2e-reject`）拿到 OTP `K7FG-YFN6`；`aim enroll reject K7FG-YFN6` → `i 已拒绝 OTP …`；worker 端收到 `disconnected: code=4408 reason=enroll:rejected`（实际打的是 4403 但 worker close handler 用同一日志路径打过去），随后自动 reconnect 拿到新 OTP `NAMR-9BH7`；`audit_events` 写 `gateway.enrollment.rejected`（含 `otpHash=0bcf2a2ada6653f1`），fleet.db **不写** registered_workers row（AC #5 ✓）。
- **cross-path**（3 case 全过）：`/ws` + `enroll.mode='otp'` → close `4400 wrong_path:otp_must_use_enroll_ws`；`/enroll-ws` + 无 enroll → close `4400 wrong_path:expected_enroll_otp`；`/enroll-ws` + `enroll.mode='join-token'` → close `4400 wrong_path:expected_enroll_otp`（AC #9 / #10 ✓）。
- **expire**：重启 gateway with `AIWORKER_ENROLL_OTP_TTL_SEC=30`，起 worker (`--no-reconnect`) 拿 OTP `NXC8-MQ4Z` (`expires in 30s`)；35 秒后 worker stdout `disconnected: code=4408 reason=enroll:expired` + `reconnect disabled, giving up`；`audit_events` 写 `gateway.enrollment.expired` (含 `otpHash=e61fd4d270b5c469`)，fleet.db **不写** row（AC #6 ✓）。

PLAN-019 / FEAT-026 status → completed；本次 BKD coordinator (`oo8i4xoj`) + S1-S5 (`vol6acsy` / `hqbw4blu` / `5sxw5aaf` / `201676sp` / `22y863fi`) 全 worktree subtask 流程顺利收尾。S3 worktree pending.ts stub 与 S2 真实现 both-added 冲突按计划在 phase C 顺序合并时解决——pending.ts 取 S2 真版本 + 补 `wsToOtp` WeakMap 反查 + `removeByWs(ws)` 方法供 S3 server.ts handleClose 反查；context.ts 取 S2 字段名 `pendingEnrollments`；server.ts 取 S3 path-aware handshake，`ctx.pending` rename 为 `ctx.pendingEnrollments` 与 S2 对齐。

E2E 脚本与 inspect helper 留在 `/tmp/pl019-e2e/`（gateway-data/ + worker-data/ + reject-worker-data/ + expire-worker-data/ + aim-home/）。聊天 round-trip 跑完整 LLM exec 不在本轮验证范围（与 PLAN-018 E2E 同基线，OTP enroll 上线本身已由 unit test + 本 E2E 闭环；chat 链路在 PLAN-006/PLAN-008 既有 e2e 覆盖）。

## 2026-04-27 06:40 PLAN-019 完成 — Worker OTP-attended enrollment 上线（FEAT-026）

**PLAN-019 landed: worker OTP-attended enrollment with operator approval.** 第四条进 fleet 的路径，对标 GitHub Device Flow / `gh auth login`：worker 部署方（客户 / 朋友 / CI runner）**完全不需要**任何 fleet 凭证，gateway 在专用 `/enroll-ws` path 上派 8 字符 OTP（`XXXX-YYYY`，去歧义 30 字符 alphabet）回推 worker；deployer 把 OTP 通过任意带外通道发给 operator，operator 在 `/ws` 上 `aim enroll approve <otp>` 一次确认即放行入网。直击 PLAN-018 self-enroll 的 anti-pattern——self-enroll 仍要求 deployer 持有 fleet 级共享 join token，OTP 路径把这层都消掉。BKD 1 coordinator + 5 worktree subtask（S1 proto / S2 gateway pending registry + handlers / S3 gateway path-aware connect / S4 worker + aim enroll CLI / S5 docs + Caddy path split），按 wire-first 顺序合 main，每次合后跑 typecheck + 该 sub 的回归 case；S5 文档（本 commit）等到 S1+S2+S3+S4 都进 main 后落，**确保文档对照实际实现，不是 spec 想象**。

What shipped:

- **S1 — proto wire**（feat `05f2245` / merge `010372c`，`bkd/vol6acsy`）——`packages/gateway-proto/src/messages.ts` `connectFrameSchema.enroll` 加入 `mode: 'join-token' | 'otp'` 判别联合，refine 强制 `join-token` 必有 `joinToken` / `otp` 必无 `joinToken`；缺省 `mode='join-token'` 向后兼容 PLAN-018 帧。`packages/gateway-proto/src/methods.ts` 新增 3 个 operator-to-gateway 方法 `enroll.list` / `enroll.approve` / `enroll.reject`，并导出 `pendingEnrollmentSchema`。`packages/gateway-proto/src/events.ts` 新增 2 条 gateway → worker 事件 `enrollment.otp` / `enrollment.approved`。`packages/shared/src/fleet/registered-worker.ts` `RegisteredWorkerOrigin` union 加入 `'otp'`（manual / launch-local / self-enroll / otp 四态对齐 `addedBy`）。`parse.test.ts` 加 4 case 覆盖 mode 切换 × joinToken 取舍。
- **S2 — gateway pending registry + handlers**（feat `9c7c078` / merge `508a146`，`bkd/hqbw4blu`）——
  - `apps/gateway/src/registry/pending.ts`：新文件 `PendingEnrollmentRegistry`，30 字符去歧义 alphabet（Crockford 减 `0/O/I/1/L/U`），`XXXX-YYYY` 8 字符 OTP，碰撞重 roll（最多 5 次），`setTimeout` TTL（`onExpire` 回调由 gateway 注入），`wsToOtp` WeakMap 反查支持掉线清表。in-memory 设计——gateway 重启即丢，worker 自动重连重新拿新 OTP，所有持久化都在 approve 时才发生。
  - `apps/gateway/src/router/methods/enroll.ts`：新文件 `handleEnrollList` / `handleEnrollApprove` / `handleEnrollReject`，`approve` 走 `master_key` + `quota` 守门 → `upsertEnrolledWorker(addedBy='otp')` → 通过原 ws 推 `enrollment.approved` 事件 → 写 `gateway.enrollment.approved` audit；`reject` close 4403 `enroll:rejected` + 写 `gateway.enrollment.rejected` audit（OTP 仅落 sha256 前 16 hex，明文不进 audit）。
  - `apps/gateway/src/config.ts`：新增 `AIWORKER_ENROLL_OTP_TTL_SEC` env（默认 300，范围 [30, 3600]）。
  - `apps/gateway/src/index.ts::createGatewayContext`：实例化 `PendingEnrollmentRegistry`，`onExpire` 写 `gateway.enrollment.expired` audit + close 4408；`server.ts::stop` 调 `dispose` 清所有 timer。
  - `apps/gateway/src/router/dispatch.ts` + `apps/gateway/src/registry/index.ts`：注册 enroll 方法 + re-export 类型。
  - `apps/gateway/test/enroll-otp.test.ts`：11 case 覆盖 happy / expire / reject / collision / list / quota / master_key_missing / dispose / unknown otp / feature_disabled。
- **S3 — gateway path-aware enroll handshake**（feat `7705be7` / merge `4d97b2a`，`bkd/5sxw5aaf`）——
  - `apps/gateway/src/server.ts::fetch`：接受 `/enroll-ws` upgrade，`ws.data.path` 标记为 `/ws` / `/enroll-ws`，下游 `handleMessage` 据此分流。
  - `apps/gateway/src/auth/token.ts::authorizeConnection`：增 `path` + `isOtpEnrollSubmit` 入参，`/enroll-ws` 仅放 `enroll.mode='otp'`、`/ws` 拒绝 `enroll.mode='otp'`，`wrong_path:*` 走 close 4400（协议错），与 4401 `auth:*` 区分。
  - `apps/gateway/src/server.ts::handleMessage`：connect 阶段在 `/enroll-ws` + OTP 路径调用 `ctx.pendingEnrollments.submit`，回推 `enrollment.otp` 事件给 worker，标 `ws.data.role='node-pending'`，写 `gateway.enrollment.requested` audit（OTP 仅落 sha256 前 8 hex）；`ws.send` 失败立即 `removeByWs` + close 4500，不留悬挂 entry。握手后 `node-pending` 状态忽略所有非 close 帧。`handleClose` 在 `node-pending` 掉线时 `removeByWs` + 写 `gateway.enrollment.abandoned` audit（幂等，approve / reject 已先清的不重复）。
  - `apps/gateway/src/registry/types.ts`：`ConnectionData` 加 `'node-pending'` role + `path: '/ws' | '/enroll-ws'` 字段。
  - `apps/gateway/test/enroll-otp-handshake.test.ts`：9 case 覆盖 path-aware authN matrix 各分支（cross-path 拒绝 / submit 成功 / abandon / 推送失败回滚）。
- **S4 — worker OTP mode + aim enroll CLI**（feat `b09d9f1` / merge `ebe0d6f`，`bkd/201676sp`）——
  - `packages/core/src/config/worker.ts`：新增 `AIWORKER_ENROLL_MODE` env（`'auto' | 'otp'`，默认 `'auto'`）。
  - `packages/core/src/worker/gateway-client/{config,client,index}.ts`：`GatewayNodeEnrollOptions` 改 `mode='join-token'|'otp'` 判别联合；mode='otp' 时 connect 帧 `enroll` 块只带 `apiToken` / `displayName`，不带 `joinToken`；`onmessage` 拦截 `enrollment.otp` / `enrollment.approved` 事件分别走 `onEnrollmentOtp` / `onEnrollmentApproved` 回调（不进 dispatcher）。approved 后 client 翻 `enrolledViaOtp=true`，下次断线重连帧改为 plain node connect（不带 enroll 块、`token=apiToken`，path 仍走 `/enroll-ws`）。
  - `apps/cli/src/commands/serve.ts::runServe`：trigger table 加 OTP 分支——`--gateway` 显式 → legacy；URL + JOIN_TOKEN（mode≠otp）→ self-enroll；URL only → OTP；URL + JOIN_TOKEN + ENROLL_MODE='otp' → 强制 OTP（忽略 JOIN_TOKEN）；URL only 时 path 强制改写为 `/enroll-ws`。`onEnrollmentOtp` 回调通过 `formatOtpBox` 把 `XXXX-YYYY` + 倒计时打成方框形 stdout，consola.info 附 `aim enroll approve` 提示；`onEnrollmentApproved` 回调打 `approved as <workerId>` 行。
  - `apps/cli/src/aim/commands/enroll.ts`：新文件 `runEnrollList` / `runEnrollApprove` / `runEnrollReject`，三个子命令复用 `withSession` 走 operator-to-gateway routing。
  - `apps/cli/src/aim.ts`：注册 `aim enroll list / approve <otp> / reject <otp>` 三个子命令。
  - `packages/core/src/worker/gateway-client/otp-mode.test.ts`：4 case 覆盖 OTP 帧编码 / OTP / approved 事件回调路径 / 重连后 plain connect。
  - `apps/cli/src/aim/commands/enroll.test.ts`：4 case 覆盖 list / approve / reject / 异常退出码。
- **S5 — docs + Caddyfile path split**（本 commit）——`ops/caddy/Caddyfile.tmpl` 拆 `/ws`（保留 `import auth.snippet` BUG-007）+ `/enroll-ws`（**无** basicauth）+ `/health`（保留 basicauth）+ 默认 404 fallback；`docs/architecture.md` § 身份与配置自举从三条路径升级到四条 + 完整 path-aware authN matrix 表；`docs/deployment.md` 新增 § "Worker OTP-attended enroll quick start (PLAN-019 / FEAT-026)" 含 deployer / operator 双视角命令、安全模型、close code 排错表、Caddy path split 说明；`docs/cli.md` `aiw serve` 触发表升级到 5 行（含 OTP 模式）+ stdout OTP 方框示例 + 新增 `aim enroll list / approve / reject` 三个子命令文档；`CLAUDE.md` § 身份与配置自举硬规矩从三条升级到四条（含 OTP 分支判定 + path-aware authN）。

测试基线变化：

- `@aiworker/gateway-proto`: +4 case（S1 parse.test）→ 19 pass。
- `@aiworker/gateway`: +20 case（S2 enroll-otp.test 11 + S3 enroll-otp-handshake.test 9）→ 87 pass。
- `@aiworker/core`: +4 case（S4 otp-mode.test）→ 403 pass。
- `@aiworker/cli`: +4 case（S4 aim enroll.test）→ 24 pass。
- workspace 整体 typecheck 9/9 全过；老路径（手动 pair / 自动 launch / loopback / sharedSecret / self-enroll）零回归。

回归矩阵（覆盖 PLAN-019 §Test plan + FEAT-026 12 ACs）：

- AC #1 触发：`aiw serve` 仅有 `AIWORKER_GATEWAY_URL` env → 落 OTP 模式（trigger table 行 3，S4 单测 + 集成）。
- AC #2 OTP 渲染：去歧义 alphabet `ABCDEFGHJKMNPQRSTVWXYZ23456789`（registry 单测 + S4 stdout 集成）。
- AC #3 list：`enroll.list` 返 pending 数组（S2 enroll-otp.test 6 / aim enroll.test 1）。
- AC #4 approve：fleet 行 `addedBy='otp'`，原 ws 收 `enrollment.approved`（S2 happy + S4 client 集成）。
- AC #5 reject：close 4403 + audit `gateway.enrollment.rejected`（S2 reject case）。
- AC #6 expire：`AIWORKER_ENROLL_OTP_TTL_SEC` TTL 到 → close 4408 + audit `.expired`（S2 expire case）。
- AC #7 collision：generator 制造碰撞 → registry 重 roll（S2 collision case + registry 单测）。
- AC #8 reconnect：approved 后 worker 翻 `enrolledViaOtp=true`，下次重连不再 OTP submit（S4 client 集成）。
- AC #9 Caddy path split：`/ws` 仍挂 basicauth、`/enroll-ws` 无 basicauth（本 commit `ops/caddy/Caddyfile.tmpl`）。
- AC #10 path-aware authN：`/enroll-ws` 拒非 OTP / `/ws` 拒 OTP，全部由 `authorizeConnection` 集中产 `wrong_path:*`（S3 handshake 9 case 全覆盖）。
- AC #11 文档：本 commit `architecture.md` / `deployment.md` / `cli.md` / `CLAUDE.md` 同步落地。
- AC #12 测试：gateway 20 case（S2 11 + S3 9）/ worker bootstrap 4 case 全过。

文档配套（本 commit）：`docs/architecture.md` § 身份与配置自举升级到四条路径 + path-aware authN matrix 表 + 角色与鉴权表加 `node-pending` 行；`docs/deployment.md` § "Worker OTP-attended enroll quick start" 完整 deployer / operator 双视角命令 + Caddy path split 段；`docs/cli.md` `aiw serve` 触发表 + `aim enroll {list,approve,reject}` 三段；`CLAUDE.md` § "身份与配置自举" 四条硬规矩 + audit action 列表。

后续：

- **OTP rate-limit per source IP**（PLAN-019 §Risks "OTP enumeration / brute-force"，P3）：当前 `/enroll-ws` 无 per-IP 限速，理论上可暴力穷尽 OTP 空间——但 `enroll.approve` 在 operator basicauth 通道，攻击者要先穿透 basic-auth 才能尝试，无新攻击面。如运营观察到滥用再开 P3 follow-up。
- **Web SPA pending-list UI**（PLAN-019 §A5，stage-2）：本轮明确不做（"应该还不需要 web ui"）；CLI 已闭环。后续如果 SaaS 多租户需求出现可以再开一个 PLAN 落 SPA 形式。

## 2026-04-26 19:35 PLAN-018 E2E 验证 — coordinator 收尾

跑完整 self-enroll round-trip：起 gateway with `AIWORKER_JOIN_TOKEN=test-secret-1234567890abcdef` + `AIWORKER_MASTER_KEY=<32-byte hex>` 在 `:23000`；起 `aiw serve` with 同一 join token + `AIWORKER_GATEWAY_URL=ws://127.0.0.1:23000/ws` + `AIWORKER_DISPLAY_NAME=smoke` 在 `:23001`。5 秒内 `fleet.db.registered_workers` 出现 `id=w_3xdwxx8pe6qq, display_name=smoke, added_by=self-enroll`，`audit_events` 写入一条 `gateway.worker.enrolled` 含 `workerId / displayName / deviceId`（FEAT-024 AC #1 / #2 / #7 ✓）。换错 token 重起一个 worker → `fleet.db` 不变，`audit_events` 写多条 `gateway.connect.rejected reason=join_token_mismatch`（worker reconnect loop 的预期表现，AC #3 ✓）。脚本与 inspect helper 留在 `tmp/pl018-e2e/`。

PLAN-018 / FEAT-024 status → completed；本次 BKD coordinator (`16duffa1`) + S1-S4 (`q92q7h5c` / `b1httrl8` / `3ybg2y8v` / `3bkng8a1`) 全 worktree subtask 流程顺利收尾。

## 2026-04-26 19:30 PLAN-018 完成 — Worker 自助 enrollment 上线（FEAT-024）

**PLAN-018 landed: worker self-enrollment via shared join token.** 第三条进 fleet 的路径（前两条：手动 `aim pair` / 自动 `aim workers launch`）。worker 仅需 outbound WS 即可入网——NAT/防火墙后部署、批量 docker / k8s 节点、operator 无法逐个手贴 bootstrap token 的运维场景由此打通。kubeadm join / Nomad client join / Datadog agent 同一形态。BKD 1 coordinator + 3 worktree subtask（S1 proto / S2 gateway / S3 worker），按 wire-first 顺序合 main，每次合后跑 typecheck + 该 sub 的回归 case。文档（本 commit）等到 S1+S2+S3 都合 main 后落，**确保文档对照实际实现，不是 spec 想象**。

What shipped:

- **S1 — proto wire**（feat `35f15dc` / merge `37d14d8`，`bkd/q92q7h5c`）——`packages/gateway-proto/src/messages.ts` `connectFrameSchema` 增加可选 `enroll: { joinToken: z.string().min(1), apiToken: z.string().regex(WORKER_API_TOKEN_PATTERN), displayName?: z.string().min(1).max(80) }.optional()`。整个块 `.optional()`，老 client 帧（无 enroll）继续合法。`packages/shared/src/fleet/registered-worker.ts` `RegisteredWorkerOrigin` union 把未被任何代码引用的 `'import'` 替换为 `'self-enroll'`（manual / launch-local / self-enroll 三态对齐 `addedBy`）。`parse.test.ts` 加 3 case。
- **S2 — gateway enroll handshake**（feat `2bbaa62` / merge `614a8c3`，`bkd/b1httrl8`）——
  - `apps/gateway/src/config.ts`：新增 `AIWORKER_JOIN_TOKEN`（optional, **min 16 字符**），未设 → self-enroll 完全禁用，所有携 enroll 块的 connect 帧 close `4401 auth:join_token_disabled`。与 `INTERNAL_SHARED_SECRET` 角色解耦——operator bearer 与 fleet 入网密钥不复用同一 secret。
  - `apps/gateway/src/auth/token.ts::authorizeConnection`：第三分支 self-enroll；`enrollToken` / `gatewayJoinToken` 走 `timingSafeEqualStrings`；返回值带 `via: 'loopback' | 'shared-secret' | 'self-enroll'` 给 audit 区分入口。老路径零回归。
  - `apps/gateway/src/registry/persistence.ts::upsertEnrolledWorker`：返回 `created` / `updated` / `unchanged` 三态——idempotent reconnect 不写 audit（PLAN-018 §Risks 4 audit volume 缓解）。displayName 变化只刷 `displayName + lastSeenAt`，**不**静默轮换 apiToken。
  - `apps/gateway/src/server.ts::handleMessage`：connect 阶段识别 `frame.role==='node' && frame.enroll`，按序做 join token 验签 → 配额（已注册 workerId 重连不占配额，AC #4）→ `masterKey` 守门（缺则 fail-closed `auth:master_key_missing`）→ upsert fleet → 仅 `created`/`updated` 写 `gateway.worker.enrolled`；任何拒绝走 `gateway.connect.rejected`（reason ∈ {join_token_disabled, join_token_mismatch, quota_exceeded, master_key_missing}）。
  - `apps/gateway/test/enroll.test.ts`：9 用例覆盖 PLAN-018 §Test plan 的 happy / wrong token / quota / reconnect / displayName change /sharedSecret 回归 / `upsertEnrolledWorker` 单测。
- **S3 — worker enroll trigger**（feat `f34802a` / merge `5836074`，`bkd/3ybg2y8v`）——
  - `packages/core/src/config/worker.ts`：增 3 个可选 env——`AIWORKER_GATEWAY_URL`（`z.string().url()`）、`AIWORKER_JOIN_TOKEN`（`z.string().min(1)`）、`AIWORKER_DISPLAY_NAME`（`max(80)`）。
  - `packages/core/src/worker/gateway-client/{config,client,index}.ts`：`startGatewayNode` 增可选 `enroll: { joinToken, apiToken, displayName? }`；client 编 connect 帧时若有 enroll 选项则原样透传到 `connectFrame.enroll`，未传保持现有行为。
  - `apps/cli/src/commands/serve.ts::runServe`：bootstrap 拿 `state.tokenPlaintext` 后按触发表分派——`--gateway` flag 优先（老路径）；env 三件套齐 → enroll 路径（bearer 空、connect.enroll 块就位）；只有 `JOIN_TOKEN` 没 URL → `consola.warn` 跳过；只有 URL 没 token → 不自动起 gateway-client（保守，避免裸开口）。enroll 路径显式日志 `self-enrolling to <url> as <name>`。
  - `packages/core/src/worker/bootstrap/enroll.test.ts`：3 case 断言 connect 帧 enroll 字段一致 / 未传时无字段 / displayName 路径。

测试基线变化：

- `@aiworker/gateway-proto`: +3 case（S1 parse.test）
- `@aiworker/gateway`: +9 case（S2 enroll.test）
- `@aiworker/core`: +3 case（S3 bootstrap/enroll.test）
- workspace 整体 typecheck / lint / 回归测试全绿；老路径（手动 pair / 自动 launch / loopback / sharedSecret）零回归。

回归矩阵（覆盖 PLAN-018 §Test plan + FEAT-024 ACs，全部由 S2/S3 unit 自动化）：

- AC #1 / #2 happy path：gateway 配 `AIWORKER_JOIN_TOKEN`，worker 用 env 三件套 → fleet 行写入 `addedBy='self-enroll' / displayName / online: true`，5 秒内 `aim workers list` 可见。
- AC #3 wrong token：close `4401 auth:join_token_mismatch`，fleet.db 不动，`audit_events` 留 `gateway.connect.rejected reason=join_token_mismatch`。
- AC #4 idempotent reconnect：同 workerId 不带 enroll 重连 → 通过老 sharedSecret 路径，fleet 不重复 / 不写 `gateway.worker.enrolled`；带 enroll + 同 displayName → `unchanged` 路径，audit 不写；带 enroll + 改 displayName → fleet 只改名（apiToken 密文保留），audit 写 `updated`。
- AC #5 quota：`AIWORKER_MAX_WORKERS` 已满 + 全新 workerId → close `4401 auth:quota_exceeded` + audit `quota_exceeded`；已注册 workerId 重连不占配额。
- AC #6 老路径零回归：手动 pair / 自动 launch / loopback / sharedSecret 全过既有用例。
- AC #7 audit：`gateway.worker.enrolled` 仅在 created / updated 写，含 `detail.workerId` / `detail.displayName` / `detail.deviceId` / `detail.change`。
- AC #8 / #10：`aim workers remove` 行为不变；S2/S3 共 12 个新 case 覆盖以上场景。

文档配套（本 commit）：`docs/architecture.md` § "身份与配置自举" 三条路径 + `addedBy` 三态对照；`docs/deployment.md` 新增 § "Worker self-enroll quick start"（gateway / worker env、systemd unit 片段、安全模型与排错）；`docs/cli.md` `aiw serve` 加触发表与 env 三件套；`CLAUDE.md` § "身份与配置自举" 硬规矩同步增补。

后续：

- **BUG-008（未开 task，跟进）**：今日 PLAN-018 范围内**未**强化 reconnect 路径的 apiToken 验证——gateway 仍只校 `INTERNAL_SHARED_SECRET`，信任 `agentId` 声明。self-enroll 不让这件事更差，但也没修。需要单独开一个 BUG 把 `node` reconnect 改成必须验 `frame.auth.token` 与 fleet.db 该 worker 的 apiToken 恒等（密文需用 `AIWORKER_MASTER_KEY` 解出明文比较）。
- **OTP TTL / 一次性 join token**：PLAN-018 §Alternatives A2 提到的 kubeadm 风格短期 token 仍未上线；当前路径的 token 是 fleet 级长期共享。若运维需要更窄入口可再开一个 PLAN。



**关键安全修复**。stage-1 投产评估时发现：当 gateway 跑在 Caddy 反代之后（生产推荐拓扑：Cloudflare orange-cloud → host :80 → Caddy → gateway :3000），gateway 的 loopback authN（`apps/gateway/src/auth/loopback.ts`）会把所有反代过来的请求识别为 `127.0.0.1`，**绕过 token 校验**。Cloudflare 橙云只做 TLS 终止，不是 authN 层。结果：任何能 resolve 公网域名的请求都自动以 operator 身份通过。同样问题影响任何打算把 gateway 摆到 nginx / Caddy / haproxy / Cloud Run 等反向代理后的用户。

之前 `docs/deployment-public-https.md` 把这个行为 documented 成"特性"（"Caddy 反代属于 gateway 视角的 loopback ... 不需要再叠一层 basic auth"）——已纠正。

What shipped (this commit):

- `ops/caddy/Caddyfile.tmpl`：`:80` 站点 `import auth.snippet`，把 basicauth 段外置到宿主侧的 `/etc/caddy/auth.snippet`（**不入 git**，缺失则 Caddy 拒启动——fail-closed）；附详细 inline 注释解释为什么 Caddy 自身必须做 authN。
- `docs/deployment-public-https.md`：删掉错误论断（"经 Caddy 反代不需要 basic auth"）；新增 §"Caddy basic-auth setup（BUG-007）"段落，含 `caddy hash-password` 生成 hash → ssh 写 snippet → reload-caddy → 公网 401/200 验证四步流程；轮换 / aim CLI URL 携带凭证 / web SPA 兼容性 caveat 一并说明；故障排查段同步更新（缺 snippet 的报错指引）。
- `docs/deployment.md`：在"公网 HTTPS"段加 prominent pointer——任何打算自加反代的人必须先读 BUG-007 setup。
- `docs/task/BUG-007.md` + index：新建并标 `[x]`。

不影响（**重要**）：

- 裸跑 / systemd 单机：gateway 默认监听 `127.0.0.1`，无 Caddy 介入，不受影响。
- 内网部署（无 Caddy 或 Caddy 仅做 TLS 终止 + IP allowlist）：未受影响，但运维仍需自行确认 Caddy 不会让 loopback IP 出现在 gateway requestIP 里。
- 已部署的 `gateway.example.test`：**必须** ssh 上宿主按本 changelog 的 setup 段补 snippet 后再 reload Caddy；在补完之前公网入口处于裸开口状态。

后续跟进：

- 浏览器 / web SPA 通过 `wss://user:pass@host/...` URL form 携带 basicauth 在现代 Chromium 受限，长期方案是 Cloudflare Access SSO 或 token-in-cookie 路径——本 BUG 不解决；仅关闭裸开口。
- BUG-007 是**运维级修复**（Caddyfile + docs），不动任何业务代码，因此 typecheck / unit test / e2e smoke 全部不动；上线验证靠手工 `curl https://gateway.example.test/health`（401 vs 200）。

## 2026-04-26 14:40 [BUG-P2] BUG-005 修复 — aiw run 终态事件名对齐 runtime 契约

**`aiw run` 历史遗留 bug**：监听早期 PLAN-011 设计的 `orchestrator.task.succeeded/.failed/.cancelled`，但当前 runtime 实际只发 `orchestrator.finished` / `orchestrator.error`，导致每次 `aiw run` 都 timeout 退出 124（即使 conversation 已完成）。`docs/cli.md` 文档同样跟错。

What shipped (commit `46a8bc6`):

- `apps/cli/src/commands/run.ts`：监听 `orchestrator.finished`（exit 0）与 `orchestrator.error`（exit 1）；timeout 与 `--dry-run` 路径保持原状。
- `docs/cli.md` §`aiw run`：事件名 + NDJSON 示例更新。
- 新增 `apps/cli/src/commands/run.test.ts` 5 case：finished → 0 / error → 1 / timeout → 124 / 缺 `--message` → 2 / `--dry-run` → 0 不 ingest。

测试基线：

- `@aiworker/cli`: 15 → **20 pass**（+5）。
- 其它包不动。typecheck + workspace test 全绿。

E2E 验证：在隔离 smoke 目录跑 `aiw run --message "请用极简一句话回答 3+3"`，模型流出 "6"，`orchestrator.finished` 后**立即**退出 0（修复前同流程必 timeout 退 124）。

**不在范围**：`reloadRuntime` 缺 mutex（PLAN-017 sub 报告中提及，HTTP+WS 并发 PUT 仍 race）；如需要可再开一个 BUG。

## 2026-04-26 14:20 PLAN-017 完成 — 4 个 bare-metal smoke regressions 修复

**PLAN-017 landed: bare-metal smoke regressions — fix four blockers found during local smoke.** 一次本地 smoke（T1 单进程 orchestrator → T2 gateway+worker 端到端 → T3 hot-reload via `PUT /api/worker/config`）暴露的四个**新开发 / 新运维**入门即踩的 P1/P2 缺陷：dev 默认值绑死容器布局、`aim pair --url` 不持久化、`aim config set` 缺 handler、reload 后 chat 卡死。BKD 1 coordinator + 4 worktree subtask 并行实现，按 `001 → 002 → 003 → 004` 顺序合 main，每次合后跑 typecheck + 该 bug 的回归 smoke，最终全 4 合完跑完整 T1+T2+T3 smoke 全过。**业务逻辑零变更，纯环境适配 + handler 接通 + hot-reload 正确性修复**。

What shipped:

- **BUG-001 — 解耦 dev 默认值**（fix `ea4c5a4` / merge `94691de`，`bkd/in4qr0s7`）——`packages/core/src/config/worker.ts` 把 `WORKER_DATA_ROOT` 与 `WORKER_MIGRATIONS_FOLDER` 改 `.default(() => ...)` lazy 求值；`WORKER_DATA_ROOT` fallback `<resolveAiworkerHome()>/data-root`，`WORKER_MIGRATIONS_FOLDER` fallback 到 `@aiworker/storage-sqlite/worker::defaultWorkerMigrationsFolder`（`import.meta.url` 解析的绝对路径）。新增 `worker.test.ts` 5 case + `__resetWorkerEnvCacheForTest` `@internal` helper；`apps/api/.env.example` + `docs/cli.md` 注释说明 dev 派生 / 容器仍可显式覆盖。**Production 容器行为不变**（`docker-compose.yml` 仍显式 `WORKER_DATA_ROOT=/var/lib/aiworker`）。
- **BUG-002 — aim pair 持久化 `--url`**（fix `57cb021` / merge `78ca715`，`bkd/7c6eu4br`）——`apps/cli/src/aim/commands/pair.ts:30-34` 在 `patchAimState` 调用前 spread `...(opts.url === undefined ? {} : { gatewayUrl: opts.url })`，`--url` 缺省时不动既有 `gatewayUrl`。新增 `pair.test.ts` 两 case 覆盖 AC1（`--url` 写入）与 AC2（缺省不动）。`aim.json` 文件权限 `0600` 不变。
- **BUG-003 — 接通 aiw serve gateway-client 的 config.put**（fix `24da562` / merge `6ad908c`，`bkd/mfeawlkb`）——`packages/core/src/worker/management/config.ts` 抽 `applyConfigUpdate` helper（validate → `putConfig` → `mirrorConfigToYaml` → `reloadRuntime`），HTTP route 与 gateway-client 共享同一更新链路；`apps/api/src/modes/worker.ts::bootstrapWorkerApp` return 增加 `reloadRuntime`；`apps/api/src/worker/management/routes.ts` PUT `/config` 退化为 thin caller；`apps/cli/src/commands/serve.ts` 注册 `configPut` handler；`packages/core/src/worker/gateway-client/dispatcher.ts` `handleConfigPut` 把 `InvalidConfigError → invalid_config` / `ConfigVersionConflictError → version_conflict`，不再吞成 `internal_error`。`dispatcher.test.ts` 新增 4 case；既有 `routes.test.ts` 26 case 不 regress。`aim config set --if-match` correct/wrong 两路径都 round-trip。
- **BUG-004 — runtime hot-reload 后刷新 gateway subscriber**（fix `d1ea58f` / merge `a47e3be`，`bkd/b8fwkuo0`）——`packages/core/src/worker/gateway-client/index.ts` `GatewayNode` 加 `notifyRuntimeReloaded()`，`connected` 时 `subscriber.start()` 重订新 bus（`start()` 幂等，内部先 stop 老 unsub）。`apps/api/src/modes/worker.ts::bootstrapWorkerApp` 接 `onRuntimeReloaded?: () => void` 选项，`reloadRuntime` 闭包在 `state.runtime = nextRuntime` **之后** 与 `previous.dispose()` **之前** 同步触发——顺序关键，PLAN-017 §risks 强调过。`apps/cli/src/commands/serve.ts` mutable ref 解 chicken-and-egg（先建 ref → bootstrap 闭包读 ref → `startGatewayNode` → 把 node 写入 ref）。新增 `subscriber-refresh.test.ts` 2 case 覆盖 reload 后新 bus 上行 + 老 bus 无 listener 泄漏 + 未连接时 hook no-op。**满足 CLAUDE.md hot-reload 不变量**："reload 后自动追新 bus"。

测试基线变化：

- `@aiworker/core`: 379 → **392 pass**（+13：BUG-001 5 + BUG-003 4 + BUG-004 2 + 各 case 内部断言）
- `@aiworker/api`: 28 → **32 pass**（+4：BUG-003 dispatcher.test 新增）
- `@aiworker/cli`: 13 → **15 pass**（+2：BUG-002 pair.test）
- 总 typecheck/lint/test 全绿；workspace 整体不 regress。

完整 PLAN-017 smoke 验证：

- **T1** `aiw run --message ... --dry-run` 仅最小 env（不带 `WORKER_MIGRATIONS_FOLDER` / `WORKER_DATA_ROOT`）成功构造 runtime，无 `EACCES` / `Can't find meta/_journal.json`；
- **T2** `aim pair --url ws://127.0.0.1:20500/ws --worker-url http://127.0.0.1:20501 --bootstrap-token <tok>` 后 `aim.json` 含 `gatewayUrl=ws://127.0.0.1:20500/ws`，紧跟着 `aim workers list` 不需要手改 JSON 即返回 worker；
- **T3** `aim config get` v1 → `aim config set --if-match 1` 正确路径返回 `version=2 / runtimeReload=ok`；同 `--if-match 1` 再发返回 `version_conflict: config version 1 does not match current version 2`（明确错误码不再 `method_not_implemented` / `internal_error`）；reload 后 `aim chat` 立即收到 `accepted → chat.message → done`，对照原 `aim-chat-post-reload.log` 是 `accepted → timeout`（BUG-004 修复证据）。

后续：subtask BUG-003 报告里指出 `reloadRuntime` 没有 mutex（HTTP+gateway 并发 PUT 时存在 race），不在本 plan 范围内；已显式记入 [BUG-006](task/BUG-006.md)（P3，preventive）。CLAUDE.md "reload 必须串行化" 不变量当前由乐观锁 + "应用层不并发"维持，待 BUG-006 把它升级为 mutex 强制。

## 2026-04-26 PLAN-016 完成

**PLAN-016 landed: deployment reshape — CLI-first install, docker as optional fast-launch.** REFACTOR-003 总收官。把"如何部署"从 PLAN-005/PLAN-009 时代的"GHCR 镜像 + Caddy 公网终止 + `gateway.example.test`" SaaS 模型，重写为三档并列、docker 不再是默认的形态布局。新增 `aim install systemd` 一键写 unit + `enable --now`（Linux 长跑主路径），文档主线让"5 分钟读完得出'主路径是 systemd，不是 docker compose pull'的结论"。**纯部署形态调整 + 文档重写 + CLI 子命令新增；零业务行为变更**。

What shipped:

- **S1 — `aim install systemd` 子命令**（feat `0a4c958` / merge `3c46801`）——新文件 `apps/cli/src/aim/commands/install.ts` + 单测。子命令 `aim install systemd [--user|--system] [--dry-run] [--out <path>] [--no-enable]`：
  - `--user` 默认（写 `~/.config/systemd/user/aiworker-gateway.service`，`WantedBy=default.target`）；
  - `--system` root only（写 `/etc/systemd/system/aiworker-gateway.service`，`WantedBy=multi-user.target`）；
  - `--dry-run` 只 stdout 打印，`--out <path>` 覆盖目标路径，`--no-enable` 跳过 `daemon-reload + enable --now`。
  - unit 模板纯渲染、无新依赖；同 `--out` 反复跑产生字节级一致的 unit 内容。
  - 注册到 cac 的 commands 表；`aim install --help` 罗列 `systemd` 子命令。
- **S2 — 部署文档三档重写**（cherry-pick `e8a98f6`，原 `bkd/g4j2nqve` tip `523785b`）——
  - `docs/deployment.md` 整体重写。开篇即三档对比表，主路径是裸跑 + systemd；docker compose 章节挪到末尾"可选 fast-launch"段落；`scripts/deploy.ts` 不在主流程里出现。
  - **`docs/deployment-public-https.md` 新建**——把原 `deployment.md` 里 `gateway.example.test` + Cloudflare 橙云 + Caddy `:80 → :3000` + GHCR 镜像 + `bun run scripts/deploy.ts deploy` 的完整 run book 整段搬过来，开篇明确"仅当需要把 channel webhook 暴露公网时才需要本文档"。
  - `docs/architecture.md` Monorepo Layout 后新增 §"部署模型（PLAN-016）"，三档对比表 + 链接到 `deployment.md` / `deployment-public-https.md`。
  - `docs/cli.md` 在 `aim gateway stop` 与 `aim pair` 之间插入 §`aim install systemd`，列全 flag 表 + unit 模板示例 + binary 形态升级 caveat。
  - `scripts/deploy.ts` 文案降级：`--help` 顶部 banner 加 "OPTIONAL docker-mode deploy"；`cmdDeploy` 入口 / 收尾 / 提醒共三条 log 加 `[docker-mode]` 前缀。**实现未变**——仍是 `cmdBuild → cmdUpload → cmdInstall → cmdVerify → cmdReloadCaddy`。
  - `ops/compose/docker-compose.yml` 头注释加 "PLAN-016 起,docker compose 是可选 fast-launch 形态——主部署路径是裸跑或 systemd"。
- **S3 — Plan 收尾**（本 commit；S2 因 BKD worktree fork base 偏移没走自动合并）——`docs/plan/PLAN-016.md` `implementing → completed` + commit/merge hash 回填 + Outcomes 段；`docs/plan/index.md` PLAN-016 `[ ] → [x]` + Updated 头时间戳；`docs/task/REFACTOR-003.md` `[-] → [x]` + completedAt（**REFACTOR-003 总收官**）；`docs/task/index.md` REFACTOR-003 `[-] → [x]`。

测试基线变化：

- `apps/cli` 0 → **13** pass（S1 单测：dry-run / user / system 路径推断 / `--out` 覆盖 + 幂等 / `--no-enable` 等共 13 case）。
- 其他包（apps/api / apps/gateway / packages/core / packages/shared / packages/gateway-proto / apps/web）**无变化**——本 plan 不动业务实现。
- `scripts/deploy.ts deploy --dry-run` 仍能正确出图（实现未变），可作为 docker 形态 smoke。

保留的不变量（再次验证）：

- fleet.db / worker.db 物理隔离；本 plan 完全不动 DB / schema / 加密路径。
- AES-256-GCM 封 `apiTokenEnc`；gateway 与 worker 的 crypto 模块仍有意复制。
- bearer 比对 `timingSafeEqualStrings`；hot-reload 路由 / dispatcher / subscriber 全部 `() => state.runtime` 闭包懒取。
- 所有 smoke（aiw-run / gateway-local / aim）继续绿。
- GHCR 镜像 + `scripts/deploy.ts` + `ops/compose/` **未删除任何路径**——仅文案降级。`gateway.example.test` 测试机配方完整搬到 `deployment-public-https.md`，部署能力零回归。

文档同步：

- `docs/deployment.md` / `docs/deployment-public-https.md` / `docs/architecture.md` / `docs/cli.md` / `ops/compose/docker-compose.yml` / `scripts/deploy.ts` 见 What shipped。
- `docs/plan/PLAN-016.md` 状态 `implementing → completed`，追加完成记录节（commits + 时间戳 + Outcomes 段）。
- `docs/plan/index.md` PLAN-016 改 `[x]`，更新顶部 `Updated:`。
- `docs/task/REFACTOR-003.md` / `docs/task/index.md` REFACTOR-003 `[-] → [x]`——这是本 plan 的最终交付物。

已知 follow-up（不在本批）：

- **R1（P2）**：`aim install systemd` 的 unit 模板假设 `aim` 在 `~/.bun/bin/`；打 binary 形态（PLAN-017+）后 `ExecStart` 路径需要 parameterize，届时 `aim install systemd` 将自动改写。
- launchd（macOS）+ 其他 init 系统的 `aim install` 子命令——后续按需扩展。
- 旧 GHCR 镜像下线 / `scripts/deploy.ts` 路径删除——本 plan 仅降级文案，不破兼容；将来若 docker 形态完全废弃再单独跟。

Next on the line：REFACTOR-003 收官后无后续 plan 排期。下一个独立特性按 BKD 看板新增。

## 2026-04-25 PLAN-015 完成

**PLAN-015 landed: worker/** 物理抽离至 `@aiworker/core`.** REFACTOR-003 收尾，把 `apps/api/src/worker/**` 整树（除 Hono 路由）+ `apps/api/src/config/{worker,common}.ts` + `apps/api/src/adapters/{mcp,openai}` + `apps/api/src/shared/lib/{ids,app-error}.ts` + 对应 test-fixtures 整体搬到 `packages/core` / `packages/shared`，删除 `apps/api/src/lib.ts` 桥面，新增 ESLint `no-restricted-imports` guard 锁边界，新增 hot-reload 闭包不变量回归测。**纯物理重排，零行为变更**。

What shipped:

- 新包 `@aiworker/core`：transport-agnostic worker runtime；不依赖 `hono` / `@hono/*` / `@scalar/*`；公共面 `packages/core/src/index.ts`（对齐原 `lib.ts` + 增补 Hono 路由层所需 helper：`buildInfo` / `handleBrainTest` / `handleChannelTest` / `handleExecutorTest` / `ChannelRegistry` / `ApprovalStore`）。
- `apps/api` 瘦身到 Hono 路由 + middleware + 入口装配；新增 `@aiworker/api/bootstrap` 子路径供 `aiw serve` 拿 `bootstrapWorkerApp` / `createWorkerApp` / `WorkerModeState`。
- `packages/shared` 接收 `lib/ids.ts`（`mintWorkerId` / `slugify`）+ `errors.ts`（`AppError`，重命名自 `app-error.ts`），通过 `packages/shared/src/index.ts` re-export。
- ESLint guard：`packages/core/**/*.ts` 禁止 import `hono` / `hono/*` / `@hono/*` / `@scalar/*` / `apps/*`，CI 拦下任何回退。
- Hot-reload 回归测 `packages/core/src/worker/runtime.test.ts`（3 case）：闭包 `() => state.runtime` 在 swap 后返回新实例；旧 runtime 的 `cron.stop` / `approvals.dispose` 各卸恰好一次；`dispose` 后挂起 approval 立即以 `deny` 解锁。
- `Dockerfile` 同步：`deps` stage `COPY packages/core/package.json`，`runtime` stage `COPY --from=build /app/packages/core /app/packages/core`；版本常量注释路径从 `apps/api/src/worker/executor/...` 更新为 `packages/core/src/worker/executor/...`。
- `apps/cli` 的 5 条命令（`context` / `token` / `config` / `approvals` / `schedule`）改 `@aiworker/api/lib` → `@aiworker/core`；`serve` 命令额外从 `@aiworker/api/bootstrap` 取 Hono 入口。

测试基线变化：

- `apps/api` 410 → **32**（worker 业务测整体迁出，留 routes / bearer-auth 路由层）
- `packages/core` 0 → **381**（迁入 + 新增 3 hot-reload regression）
- `@aiworker/shared` 18（无变化）/ `@aiworker/gateway` 55（无变化）/ `@aiworker/gateway-proto` 11（无变化）/ `@aiworker/web` 24+13 skipped（无变化）
- 总 runtime pass：481 → **521**（净 +40，主因 shared 18 全量纳入统计 + 3 hot-reload regression）

保留的不变量（再次验证）：

- fleet.db / worker.db 物理隔离不变；workers/** 跨边界仍走 manager → gateway → worker 透传。
- AES-256-GCM 封 `apiTokenEnc`；gateway 与 worker 的 crypto 模块仍有意复制（边界不可融合）。
- `() => state.runtime` 闭包懒取在跨包后仍成立，由新增 regression 守。
- evolution observer / cron tick / approvals gate 均不进 orchestrator hot path。

文档同步：

- `docs/architecture.md` Monorepo Layout 段加入 `packages/core` + 描述更新；`apps/api` 描述瘦身。
- `docs/plan/PLAN-015.md` 状态 `implementing → completed`，追加完成记录节（commits + 时间戳 + Outcomes 段）。
- `docs/plan/index.md` PLAN-015 改 `[x]`，更新顶部 `Updated:`。

Next on the line：PLAN-016（部署形态调整：CLI-first 安装 + docker 作为可选 fast-launch）。

## 2026-04-25 PLAN-014 完成

**PLAN-014 landed: envelope upgrade + per-tool approvals + provider fallback + cron.** 来自 REFACTOR-003 调研结论的四个独立特性，按 BKD 五子任务并行落地（W1 → W2 三路并发 → W3 文档收尾），全部合入 main，保留 PLAN-004 / PLAN-013 既有不变量。

What shipped:

- **F1 — Envelope 路由维度**（feat 02c2b56 / merge 41d6c7b）——`Envelope` 加 **必填** `accountId` 与可选 `richMetadata`（`isEdit` / `isDelete` / `replyTo` / `quote` / `reactions`）；`messages` 表新增 `rich_metadata` 列（migration `0001_secret_dagger.sql`，仅 `ALTER ADD`）。5 个 channel adapter 各自派生 accountId（telegram→`botUsername`、whatsapp→`phoneNumberId`、lark→`appId`、line→`sha256(channelAccessToken)` 前 8 字节、web→`binding.id`），并提取 reply / edit / delete 信号。系统派发路径用保留前缀 `sys:` 命名空间隔离 channel binding 命名空间——`sys:task` / `sys:gateway` / `sys:cli` / `sys:cron`。
- **F2 — Per-tool approvals**（feat 07908be / merge 62fd614）——`WorkerConfig.toolPolicy?` 三态语义：`auto` / `ask`（60s 超时按 deny） / `deny` 短路。orchestrator 在 `runTool` 路径加 policy gate；`ApprovalStore` 在 `runtime.dispose()` 时全部 `resolve('deny')`（不能 reject——orchestrator 用 await 拿决策）。`@aiworker/gateway-proto` 新增 `approval.list` / `approval.grant` 方法 + `APPROVAL_REQUESTED` 事件（gateway 仅透传，与 `chat.send` / `config.*` 一致）。worker 本地 HTTP 端点 `GET /api/worker/approvals` + `POST /api/worker/approvals/:taskId/:toolCallId/grant` 给 `aiw approvals-list` / `aiw approvals-grant` 用；operator 侧 `aim approvals list/grant` 走 gateway WS。
- **F3 — Provider fallback chain**（feat 8af3069 / merge 034e1f2）——`ExecutorConfig.fallbacks?` 嵌套结构（每条 `executor + onErrorKinds + maxRetries?`）；`FallbackExecutor` wrapper 包裹 primary，按 `inferErrorKind` 六分类（`rate-limit` / `timeout` / `auth` / `network` / `server-5xx` / `unknown`）匹配 fallback 项，保留 `auth` 在 401+5xx 文本冲突时的优先权 + `AbortError` 在 fetch 失败叠加时归 `timeout`。`buildExecutor` 检测 `fallbacks` 后递归构造嵌套包装，wrapper 与 `ExecutorProvider` 一一对应（不进 orchestrator）。**已 yield 流后不重放**——chat 已下发首事件后直接冒泡，避免半截 transcript 与双流叠加。
- **F4 — Cron 调度**（feat 1442360 / merge 2f00d6e）——新表 `cron_jobs`（migration `0002_jazzy_moondragon.sql`）；`CronService` 60s `setInterval` tick + CRUD，挂在 `runtime.build/dispose` 上；fire 顺序"先算 next → 写库 → ingest"避免重复触发；用 `cron-parser ^5.5.0` 校验 + 计算下一次 tick；fire 时合成 `sys:cron` envelope 喂 `orchestrator.ingest`，**绝不进 orchestrator hot path**。`@aiworker/gateway-proto` 新增 `cron.list` / `cron.add` / `cron.remove` / `cron.update` 方法；operator `aim schedule list/add/remove`；worker 本地 `aiw schedule-list/-add/-remove`（直接 in-process CronService CRUD，与 `aiw config-show` 模式一致）。

测试基线变化：

- `apps/api` 346 → **410**（+64：F1 channel adapter 12 + F2 policy/store/gateway-client 32 + F3 fallback 19 + F4 cron service 12 + management 路由若干，向 410 收敛）
- `apps/gateway` 52 → **55**（+3：approvals + cron 透传单测）
- `packages/gateway-proto` 0 → **11**（新协议字段单测）

保留的不变量（验证过）：

- fleet.db / worker.db 物理隔离；fleet.db 永不写 toolPolicy / cron job / approval 等业务态。
- AES-256-GCM 封 `apiTokenEnc`；gateway 与 worker 的 crypto 模块仍有意复制。
- bearer 比对 `timingSafeEqualStrings`；hot-reload 时路由 / dispatcher / subscriber 全部 `() => state.runtime` 闭包懒取；`reloadRuntime` 串行化。
- evolution observer 离 hot path；F2 policy gate / F4 cron tick 也都不进 orchestrator hot path。

文档同步：

- `docs/architecture.md` 新增 §"PLAN-014：envelope / approvals / fallback / cron" 段落（F1-F4 各自语义边界 + 不变量 + sys:* 保留前缀表）。
- `docs/cli.md` aiw 节追加 `approvals-list/-grant` + `schedule-list/-add/-remove`；aim 节追加 `approvals list/grant` + `schedule list/add/remove`。
- `docs/plan/PLAN-014.md` 状态 `implementing → completed`，追加完成记录节。
- `docs/plan/index.md` PLAN-014 改 `[x]`。

已知 follow-up（不在本批）：

- `cron_jobs` 在 `reloadRuntime` 极短窗口内可能出现双 setInterval（fire 顺序保证不会重复触发同一 job，`lastRunAt` 可能早 1s 写）—— P2，未修。
- `evolution_observations` 仍随对话线性增长，需要 TTL / 滚动压实策略（PLAN-004 既存遗留）。

Next on the line：PLAN-016（部署形态调整：CLI-first 安装 + docker 作为可选 fast-launch）。

## 2026-04-24 22:30 [progress]

**PLAN-013 landed: aim CLI + WS gateway — full replacement of dashboard REST.** 控制面从 Hono REST（`apps/api/src/dashboard/**`）整体迁到 WebSocket 协议，operator（aim CLI + web）与 node（worker 容器）共享同一条 `/ws` 入口；dashboard 模式从此下线。PLAN-013 在 main 上按 6 个 subtask 落地，保留所有不变量（fleet.db / worker.db 物理隔离、AES-256-GCM 封 token、bearer timing-safe、hot-reload 串行化）。

What shipped:

- **新包 `@aiworker/gateway-proto`**（commit daf7ba9）——纯类型 + zod 运行时校验。`METHODS`（12 个）+ `EVENTS`（8 个）+ `Frame`（connect / request / response / event）注册表由 aim、web、gateway、worker 四侧共享。`operator-to-node` vs `operator-to-gateway` 路由判别自带。
- **新 app `apps/gateway`**（commit b56abf8，supervisor 搬家 2021767）——`Bun.serve(:3000, websocket)` 单入口；`/ws` 承接 WS 升级，`/health` 返回 JSON 心跳。三件内存 registry（`NodeRegistry` / `OperatorRegistry` / `ForwardTable`）管理连接生命周期与在途 request；AES-256-GCM 密钥 `AIWORKER_MASTER_KEY` 给 `registered_workers.apiTokenEnc` 加解密；远程连接需 `INTERNAL_SHARED_SECRET` bearer，loopback 放行空 token。
- **FleetSupervisor 搬迁**（commit 2021767）——原 `apps/api/src/dashboard/supervisor/` 整树搬到 gateway 侧，`workers.pair` / `workers.launch` / `token.rotate` 作为 `operator-to-gateway` 方法实现；`AIWORKER_GATEWAY_CAN_LAUNCH=true` 时持 `/var/run/docker.sock:ro` 自动拉 worker 容器 + scrape bootstrap 行自动配对。配额 `AIWORKER_MAX_WORKERS` 应用到 pair 与 launch 两条路径。
- **新 `aim` CLI**（commit 32d59b0）——operator 侧 bin，与 `aiw` 并列发布。子命令 `gateway start|status|stop` / `pair` / `workers list|info|launch|stop|remove` / `chat` / `config get|set` / `token rotate` / `logs`；状态文件 `~/.aiworker/aim.json`（0600）持久化 `gatewayUrl` / `deviceId` / `deviceToken` / `defaultWorkerId`。cac 的两词子命令通过 argv 预处理合并。
- **worker node 模式**（commit 8ecd76a）——`aiw serve --gateway ws://...` 在 HTTP server 之外再拨一条 WS 连接，作为 `role=node` 注册。`startGatewayNode` 走 `getRuntime()` 懒取，兼容 hot-reload；dispatcher 处理入站 `chat.send` / `config.get` / `config.put` / `token.rotate` / `logs.tail`，subscriber 把 `WorkerEventBus` 事件 emit 成 `agent.*` / `chat.message` / `config.changed` / `logs.line` 帧。SIGTERM 优雅关两条路径。
- **web 切到 WS**（commit dc2d277）——`apps/web/src/lib/api.ts` 的 REST 全量移除，改走单例 WS client（与 aim 共享 `@aiworker/gateway-proto`）。浏览器经 Caddy 反代连 gateway，属 gateway 视角的 loopback，无需再叠 basic auth。24 个测试保留，另有 13 个 REST fixture 转为 `.skip` 等待重写。
- **dashboard 整段删除**（commit 3d9637f）——`apps/api/src/dashboard/**` 13 源文件 + 10 测试 + `modes/dashboard.ts` + `config/dashboard.ts` 全部下线。`apps/api/src/index.ts` 不再分叉，直接 `createWorkerApp`；`AIWORKER_MODE=worker` 变量仍兼容运维脚本，但 `=dashboard` 取值已失效。
- **ops 迁移**（commit f759744）——`ops/compose/docker-compose.yml` service 从 `aiworker-dashboard` 改名 `gateway`（容器 `aiworker-gateway`），`command: ['bun','apps/gateway/src/index.ts']` 覆盖 Dockerfile 默认 worker ENTRYPOINT；Dockerfile 拷贝 `apps/gateway` 源码入镜像（未 bundle，直接 `bun` 执行）；env 从 `MANAGER_POLL_*` / `MANAGER_CAN_LAUNCH` / `DASHBOARD_REQUIRE_AUTH` 全部下线，替换为 `AIWORKER_GATEWAY_CAN_LAUNCH` + `AIWORKER_MAX_WORKERS` + supervisor 子配置。
- **测试基线**：`apps/api` 450 → 346（删 dashboard 相关 104 条），`apps/gateway` 0 → 52（38 baseline + 新增 pair/launch/token.rotate 单测），`apps/web` 24 + 13 skipped。`bun run check` 全仓绿。

保留的不变量：

- fleet.db / worker.db 物理隔离；fleet.db 只存 `registered_workers` + `audit_events`。
- AES-256-GCM 封 token；gateway 与 worker 的 crypto 模块有意复制（master key 不同）。
- Bearer 比对 `timingSafeEqualStrings`；loopback 放行的判定 `127.0.0.1` / `::1` / `::ffff:127.0.0.1` / `localhost`。
- Hot-reload：路由 / dispatcher / subscriber 全部 `() => state.runtime` 闭包懒取；`reloadRuntime` 串行化。

文档同步：`docs/architecture.md`（改写 topology + 角色）、`docs/cli.md`（新增 `aim` 节 + `aiw serve --gateway`）、`docs/gateway.md`（新建——协议参考 / pairing 流程 / 故障恢复）、`docs/deployment.md`（替换——gateway 部署 run book）、`docs/plan/PLAN-013.md`（状态置 completed 并列出交付 commit）、`docs/plan/index.md`（PLAN-013 改 `[x]`）。

Next on the line：PLAN-014（envelope + 每工具审批 + provider fallback + cron）与 PLAN-015（`apps/api/src/worker/**` 物理搬迁到 `packages/core`）。

## 2026-04-24 16:30 [progress]

**PLAN-012 landed: filesystem source of truth for brain + skills + memory (REFACTOR-003, decision A1 / Hermes-moat / C1 / D1).**

Post-phase-1a research on Hermes Agent + OpenClaw confirmed both projects are instances of the same long-running-agent-daemon pattern (one conversation loop, many entry points, filesystem-owned skills + memories). AIWorker's current shape — fleet manager + per-worker runtime — is already OpenClaw RFC 42026's proposed split, so the refactor doesn't touch topology. It targets the real gaps instead: data-domain source of truth (this plan), remote-control protocol (PLAN-013), envelope + approvals + fallback + cron (PLAN-014), physical `packages/core` extraction (PLAN-015). The original PLAN-012 — mechanical move of `apps/api/src/worker/**` into `packages/core` — was superseded; it's now PLAN-015 and runs last.

What shipped:

- **New package `@aiworker/fs-layout`** — owns the `~/.aiworker/` path convention. Exports `resolveWorkerHome`, `resolveBrainHome`, `resolveSkillsDir`, `resolveMemoriesDir`, `resolveConfigYamlPath`, `resolveAgentMdPath`, `resolveSoulMdPath`, `resolveUserMdPath`, and the idempotent `ensureWorkerHome(workerId)` seeder. `AIWORKER_HOME` env overrides the root (default `~/.aiworker`).
- **`HermesProvider` → `FilesystemBrainProvider`** — file moved from `apps/api/src/worker/brain/providers/hermes.ts` to `apps/api/src/worker/brain/providers/filesystem/index.ts`. `HermesApiClient` (the vestigial `/health` probe over HTTP) deleted; health now uses `access(home)`. Scanner + watcher + types moved alongside (from `apps/api/src/adapters/hermes/` which is now empty and removed). The provider drops `apiUrl` and takes only `home`.
- **Shared types renamed**: `HermesBrainSourceConfig` → `FilesystemBrainSourceConfig` (no `apiUrl` field; `home` is optional and defaults via the factory to `resolveBrainHome(workerId)`). Discriminator `type: 'hermes'` → `type: 'filesystem'`. Re-export list in `packages/shared/src/index.ts` + `packages/shared/src/fleet/index.ts` updated.
- **`buildBrain` signature** now takes `(workerId, config)` so the factory can default the brain home via fs-layout. `runtime.ts` threads the workerId through.
- **`ensureWorkerHome` hooked into `loadOrMintIdentity`** — both existing + just-minted paths seed the tree, so `aiw init` and the HTTP worker mode produce identical on-disk layouts.
- **Config yaml mirror** — `putConfig` gained a new sibling `mirrorConfigToYaml(workerId, config, version)`. Both the HTTP `PUT /api/worker/config` and `aiw config-set` call it after the DB write. `~/.aiworker/workers/<id>/config.yaml` is advisory (DB remains authoritative); a future WS gateway + `aim config edit` can promote it to source-of-truth.
- **Dashboard web UI** — `BrainSection` form updated: `Hermes` button → `Filesystem`; `apiUrl/home` pair → single optional `home` field; type discriminator select option `hermes` → `filesystem`. Config-editor integration test fixture updated.
- **Legacy env wipe** — `BRAIN_PROVIDER`, `HERMES_API_URL`, `HERMES_HOME`, `OPENCLAW_WS_URL`, `OPENCLAW_HOME` deleted from `apps/api/.env.example`. `AIWORKER_HOME` added. No runtime code ever consumed these — they were ornamental.

Verification:

- `bun run check` clean (typecheck across 6 packages + eslint).
- `bun run --filter '@aiworker/api' test` — 450 pass / 0 fail (parity).
- `bun run --filter '@aiworker/cli' smoke:aiw-run` — PASS.
- Manual E2E: `aiw init` with a tmp `AIWORKER_HOME` produces `workers/<id>/{AGENT.md,SOUL.md,USER.md,config.yaml-missing-until-first-set,brain/{MEMORY.md,memories/,skills/},workspaces/}` exactly as specified. `aiw config-set '<json>'` writes `config.yaml` with the round-tripped redacted form.

Next on the line: PLAN-013 (`aim` CLI + WS gateway, fully replacing dashboard REST).

## 2026-04-24 12:30 [progress]

**PLAN-011 phase 1a landed: CLI-first lightweight runtime (storage-sqlite + aiw).** First concrete step of REFACTOR-003 toward a hermes-style CLI + an openclaw-style gateway. The conversation loop can now run without binding any HTTP port.

What shipped:

- **New package `@aiworker/storage-sqlite`** — physically extracted `apps/api/src/db/**`, `apps/api/drizzle/**`, and both `drizzle.*.config.ts` files into `packages/storage-sqlite/`. Subpath exports `./fleet` + `./worker` keep the data-domain boundary narrow (a route handler should import from the subpath it actually touches). Package also exports `defaultFleetMigrationsFolder` / `defaultWorkerMigrationsFolder` resolved via `import.meta.url`, so CLI + scripts no longer hardcode `./drizzle/...` relative paths.
- **New app `@aiworker/cli`** with the `aiw` binary (cac-based argv). Subcommands: `init` (mint identity + seed config), `run --message <text> [--dry-run]` (feed one envelope through the orchestrator, stream events to stdout, exit), `serve [--port <n>]` (bit-for-bit equivalent of `AIWORKER_MODE=worker`), `config-show`, `config-set <json> [--if-match <v>]`, `token-rotate`. `aiw run --dry-run` is the phase-1 success demo — it boots the runtime in-process with zero HTTP binding.
- **Lazy env parsing** — `apps/api/src/config/worker.ts` now parses `process.env` on first property access (Proxy-backed `workerEnv` + explicit `getWorkerEnv()`). `aiw --help` / `aiw --version` no longer require `AIWORKER_MASTER_KEY`, which matters for CI and first-time users reading the CLI docs.
- **`apps/api` library surface** — new `./lib` subpath export (`apps/api/src/lib.ts`) re-exports the transport-agnostic seams (`buildWorkerRuntime`, `loadOrMintIdentity`, `putConfig`, `handleTokenRotate`, `bootstrapWorkerApp`, ...). `apps/cli` consumes this; phase 1b will physically move these seams into `packages/core` and delete the re-exports.
- **29-file import sweep** — every `../db/*` / `../../db/*` import under `apps/api/src/**` rewritten to `@aiworker/storage-sqlite/{fleet,worker}`. Test fixtures dropped their hardcoded `./drizzle/worker` path — the package default kicks in.
- **Ops** — `Dockerfile` copies `packages/storage-sqlite/drizzle` into `/app/drizzle` (same runtime path as before, so `WORKER_MIGRATIONS_FOLDER=./drizzle/worker` stays valid). `bun run db:generate` now delegates to the storage-sqlite workspace.

Verification:

- `bun run check` clean (typecheck across shared / storage-sqlite / web / api / cli + eslint).
- `bun run --filter '@aiworker/api' test` — 450 pass / 0 fail (parity with the pre-refactor baseline).
- `bun run --filter '@aiworker/cli' smoke:aiw-run` — PASS: `aiw init` + `aiw run --message hello --dry-run` completes with "runtime constructed" in stdout.
- Manual `aiw --help` / `aiw config-show` / `aiw token-rotate` against a tmpdir db — all functional.

Scope notes:

- The 107-file physical move of `apps/api/src/worker/**` → `packages/core/src/worker/**` is deferred to PLAN-012 (phase 1b). Rationale: the 29-file db move + CLI shell is a clean atomic merge; the worker tree move is mechanical but brings cross-cutting helper imports (`config/worker`, `shared/AppError`, `shared/lib/ids`) that deserve their own review cycle. See `docs/plan/PLAN-011.md` §"Execution split" for the full phase-1a / 1b boundary.
- `aim` CLI (manager side) and the WebSocket gateway (`aim gateway`) remain out-of-scope here — tracked by PLAN-013 / PLAN-014 once phase 1b lands.

## 2026-04-23 09:55 [progress]

**PLAN-010 / FEAT-023 manager-driven worker creation landed.** The dashboard now has a dedicated "Create worker" button that spawns a fresh worker container on the local docker engine end-to-end (supervisor `launchLocal` → token scrape → registry insert), surfaces the one-time plaintext bearer to the operator (like a GitHub PAT), and is gated by two new safety rails:

- **`DASHBOARD_REQUIRE_AUTH=true`** flips on a bearer/basic middleware guarding `/api/*`. Same shared secret (`INTERNAL_SHARED_SECRET`) handles both CI (`Authorization: Bearer …`) and browsers (native `Basic` prompt via `WWW-Authenticate`). Default is `false` so the rollout can sequence authN-first, then overlay-second.
- **`MANAGER_MAX_WORKERS`** applies a hard cap to both `/register` and `/launch-local`, returning `409 { code: 'quota-exceeded', limit, current }` on overflow. Omit for no cap.

`FleetSupervisor` also grew a startup self-check that refuses to launch if the dashboard container isn't joined to `aiworker_default`, catching the most common single-host misconfig instead of silently producing zombie `offline` registry rows. `ensureInfrastructure()` now calls `inspectContainer(HOSTNAME)` and asserts membership; soft-fails on bare metal or when the hostname isn't a docker container id.

Ops:

- New `ops/compose/docker-compose.supervisor.yml` overlay mounts `docker.sock:ro` + `/opt/aiworker-workers` and turns on the launcher env bundle. Compose with `-f docker-compose.yml -f docker-compose.supervisor.yml`. Default deploy unchanged.
- `docs/deployment.md` gained a full "Enabling manager-driven worker creation" runbook: prerequisites (authN before sock mount), compose overlay, smoke test (`curl -u :$INTERNAL_SHARED_SECRET …/api/workers/capabilities`), rollback, pitfalls (network membership, data path, master-key backup).
- `ops/compose/.env.example` commented with the new optional envs.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — api 450 pass (baseline 429 + 21 new: 11 auth middleware + 4 supervisor self-check + 6 capabilities/quota routes), web 37 pass unchanged.
- `bun run lint` — 0 errors.

## 2026-04-23 08:56 [release]

**PLAN-009 worker image bundling + model picker complete.** Four FEATs (FEAT-019 / 020 / 022 / 021) landed across one day. Net effect: engine picker shows known-model presets instead of free text; every build pushes two image tags (slim / full); `-full` pre-installs all five agentic CLIs (claude-code / codex / gemini-cli / qwen-code / cursor-agent) so workers skip the `npx` cold fetch; operator docs + `docker-compose.worker.example.yml` enumerate auth-mount recipes.

FEAT-021 — final step — delivered via BKD worktree subtask `s306n1zj` commit `2dae80a`, merged in `7928639`. 4 files, +33 / −16 (Dockerfile + docs).

Dockerfile:

- `runtime-full` stage gains a Cursor agent install step. Since Cursor has no npm package, we use the official `curl -fsSL https://cursor.com/install | bash` script. The installer drops cursor-agent as a bash wrapper at `~/.local/bin/cursor-agent` that resolves its sibling `node` binary via `realpath $0`, so we re-symlink `/usr/local/bin/cursor-agent` at the same versioned binary instead of copying the file. `cursor-agent --version` runs at build time as a sanity gate.
- `bash -euo pipefail -c '...'` wraps the RUN so curl failures on the pipe side fail the build (default dash swallows them).

Docs:

- `docs/executor-engines.md` #cursor section updated: `-full` image now pre-installs cursor-agent; slim still requires the manual installer. Top-level slim/full table size bumped to ~320 MB.
- `docs/deployment.md` Slim vs Full table expanded to include cursor-agent.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 18, api 429, web 37.
- `bun run lint` — 0 errors.
- GHCR build `24826143375` double-tag push succeeded (3m41s; slim cache hit → only full stage paid network). All 5 CLIs' `--version` gates passed inside `-full` layer.

### PLAN-009 final tally (FEAT-019 → FEAT-022 → FEAT-021)

| FEAT | Scope | Delta |
|---|---|---|
| 019 | Per-variant `knownModels` catalog + lean preset `<select>` + `Custom…` escape | web tests +5 |
| 020 | Dockerfile `runtime-full` stage, dual-tag GHCR publish, `--image-variant` deploy flag, `AIWORKER_IMAGE_VARIANT_SUFFIX` compose env | ops + docs only |
| 022 | `docker-compose.worker.example.yml` + auth recipes in executor-engines + Register dialog `<details>` hint | docs + 1 frontend component |
| 021 | Cursor agent bake (symlink + realpath) | Dockerfile + docs |

- shared tests: 18 (unchanged this plan).
- api tests: 429 (unchanged this plan).
- web tests: 32 → **37** (+5 FEAT-019).
- lint baseline: 0 → 0.
- Image tags per push: 1 → **2** (`<sha>` slim + `<sha>-full`).

### Runtime capabilities post-PLAN-009

- **Dashboard runs on slim** — it doesn't need agentic CLIs.
- **Worker can pick slim or full** per compose. Full adds ~170 MB but skips first-use npx / curl fetches for every agentic engine.
- **Picker UX** — variant form fields with a `knownModels` entry render as preset `<select>` + `Custom…`; free text is still one click away, but typos are no longer the default.
- **Auth still operator's job** — pre-install ≠ pre-login. Register dialog now nudges operators to the recipe docs.

Pointer: `docs/plan/PLAN-009.md` (status `completed`), `docs/task/FEAT-019.md` / `FEAT-020.md` / `FEAT-021.md` / `FEAT-022.md`.

## 2026-04-23 05:35 [release]

**PLAN-008 worker registration UX + engine availability complete.** Two FEATs (FEAT-017, FEAT-018) landed on main in a single calendar day on top of PLAN-007's GA.

Final FEAT — **FEAT-018 Engine availability discovery** — delivered via BKD worktree subtask `cly4ayr3` commit `c5d9db8`, merged in `d5332f5`. 16 files / +1327 / −87. No rework (base `aa10f69` picked up correctly).

Shared:

- **New** `packages/shared/src/providers/availability.ts` — `EngineAvailability`, `EngineAvailabilityStatus` (`ready | login-required | not-found`), `EngineAvailabilityResponse`. Re-exported via `@aiworker/shared`.

API:

- **New** `apps/api/src/worker/executor/availability.ts` — singleton `AvailabilityProbe` with dependency-injected `fsExists` / `resolveBinary` for hermetic tests, 10-minute cache, `resetAvailabilityProbeForTests()` helper. Covers all seven `EngineKind` (acp expands to `{agent:'gemini'}` and `{agent:'qwen'}`). File-presence probes only — no `--version` shell-outs, no network.
- `apps/api/src/worker/executor/engines/acp/agents/{gemini,qwen}.ts` — inline `authProbe` removed; both agents now import from the shared `availability.ts`. One source of truth for engine probing.
- `apps/api/src/worker/management/routes.ts` — new bearer-authed `GET /api/worker/engines` with `?refresh=1` cache-bust query, returns `{engines: EngineAvailability[]}`.

Web:

- `apps/web/src/features/workers/hooks.ts` — `useWorkerEngines(workerId)` hook (TanStack Query, 10-minute stale) + `refreshWorkerEngines(workerId)` helper.
- **New** `apps/web/src/features/workers/components/config-editor/engine-availability.ts` — status → dot-color + short-label mapping, extracted out of `executor-section.tsx` to appease `react-refresh/only-export-components`.
- `apps/web/src/features/workers/components/config-editor/executor-section.tsx` — engine picker renders availability badge per option; `acp` variant sub-picker shows per-agent (gemini / qwen) badge; not-installed engines stay clickable and the variant panel shows a callout linking to `docs/executor-engines.md#<engine>`. Refresh icon-button invalidates the engines query.
- `apps/web/src/lib/api.ts` — `fetchWorkerEngines(workerId, refresh?)` client helper.

Docs:

- **New** `docs/executor-engines.md` — one section per non-trivial engine (claude-code / acp-gemini / acp-qwen / codex / cursor) with install command, auth command, container-embedding guidance.

Tests (+22):

- `apps/api/src/worker/executor/availability.test.ts` (+16) — three-status matrix across all engines, cache behaviour, refresh path.
- `apps/api/src/worker/management/routes.test.ts` — bearer-auth + shape + `?refresh=1` cases.
- `apps/web/.../executor-section.test.tsx` (+6) — three-badge render, not-installed callout, Refresh click.

### PLAN-008 final tally (FEAT-017 → FEAT-018)

| FEAT | Scope | Tests added |
|---|---|---|
| 017 | Register dialog UX: better Base URL guidance + client-side token generator + `AIWORKER_FORCE_TOKEN` helper | shared +6 |
| 018 | Worker-side engine probe + `GET /api/worker/engines` + frontend availability badges + install docs | api +16, web +6 |

- shared tests: 12 → **18** (+6 from FEAT-017).
- api tests: 413 → **429** (+16).
- web tests: 26 → **32** (+6).
- lint baseline: 0 → 0.

Pointer: `docs/plan/PLAN-008.md` (status `completed`), `docs/task/FEAT-017.md`, `docs/task/FEAT-018.md`.

## 2026-04-23 05:15 [progress]

PLAN-008 step 1 / 2 — **FEAT-017 Register dialog UX polish** landed. Fixes two operator papercuts surfaced during the post-PLAN-007 smoke on `https://gateway.example.test`.

Shared:

- `packages/shared/src/fleet/worker-identity.ts` — new `generateWorkerApiToken()` producing `wtk_` + 43 chars base64url of 32 CSPRNG bytes. Re-exported through `@aiworker/shared/fleet` and `@aiworker/shared` root.
- `packages/shared/src/fleet/worker-identity.test.ts` (new) — 6 cases: prefix, pattern match (100 samples), length, uniqueness over 1000 invocations, base64url alphabet.

Web:

- `apps/web/src/features/workers/components/register-wizard.tsx` — `Base URL` placeholder now `http://aiworker-worker:3000`; inline helper line enumerates the three typical shapes (same-compose / reverse-proxy / direct-port). Bootstrap API token row gains a `Generate` button that calls `generateWorkerApiToken()`, prefills the field, and surfaces a helper block containing the ready-to-paste `AIWORKER_FORCE_TOKEN=<token>` env assignment with copy-to-clipboard. Generated-value tracking invalidates itself on manual edit to avoid stale helper blocks. Import of `WORKER_API_TOKEN_PREFIX` from `@aiworker/shared` replaces the local duplicate constant.

Docs:

- `docs/deployment.md` — new subsections `Worker base URL formats` (three-shape table + pitfalls) and `Bootstrap token options` (manual vs dashboard-generated + `AIWORKER_FORCE_TOKEN` one-shot semantics).

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 18 / 18 (+6), api 413 / 413, web 26 / 26.
- `bun run lint` — 0 errors.

Pointer: `docs/plan/PLAN-008.md`, `docs/task/FEAT-017.md`.

## 2026-04-22 19:15 [release]

**PLAN-007 multi-engine executor refactor complete.** All 6 FEAT (FEAT-011..016) landed on main. AIWorker workers now support 7 executor engines behind a three-tier config + slot-aware scheduler.

Final FEAT in this batch — **FEAT-015 ProcessManager replacing AsyncQueue** — landed via BKD worktree subtask `igjbbb7t` commit `7eed7d1`, merged in `d2c3be3`. 15 files, +1367 / −30.

Note on the rework path: the first-pass subtask delivery forked from `9f2426c` (pre-FEAT-011 baseline) and would have regressed the three-tier profile architecture if merged. Coordinator caught the base mismatch during merge-time diff review, rejected the subtask with explicit `git reset --hard origin/main` + scope-narrowing instructions, and only merged on the second delivery.

### FEAT-015 delivery

- `apps/api/src/worker/orchestrator/process-manager.ts` (new, 676 LOC) — generic `ProcessManager<TMeta>` with slot quotas (global + per-engine), group keys (`conversationId`), priority enum (`interactive | default | background`), stall detection (no-activity timer with escalating cancel), auto-cleanup GC, hot-reload `setLimits()`.
- `apps/api/src/worker/orchestrator/process-manager.test.ts` (new, 436 LOC) — 16 cases covering slot caps, per-engine limits, group FIFO, priority, stall escalation, kill timeout, setLimits, cancelGroup, snapshot.
- `apps/api/src/worker/orchestrator/queue.ts` **deleted** — 10-line `AsyncQueue` fully replaced.
- `apps/api/src/worker/orchestrator/service.ts` — `ingest` and deferred workspace-dispose now go through `processes.run(...)`. `onActivity` fires on every `AgentEvent` (stall heartbeat). `cancel` propagates to `AgentRunInput.signal` → engine SIGTERM/SIGKILL.
- `apps/api/src/worker/runtime.ts` — `processes: ProcessManager` hoisted to runtime singleton; survives `reloadRuntime()`.
- `apps/api/src/config/worker.ts` — new env schema: `MAX_CONCURRENT_TOTAL`, `MAX_CONCURRENT_<ENGINE_UPPER>` (`CLAUDE_CODE`, `ACP`, `CODEX`, `CURSOR`, `HTTP`, `MCP`, `CLI`), `PROCESS_STALL_TIMEOUT_MS`, `PROCESS_KILL_TIMEOUT_MS`, `PROCESS_AUTO_CLEANUP_MS`.
- `apps/api/.env.example` — new env vars documented.
- `apps/api/src/worker/management/routes.ts` + `routes.test.ts` — `GET /runtime/processes/capacity` bearer-auth'd, reports live snapshot. Dashboard can now read slot budgets.
- `apps/api/src/modes/worker.ts` — ProcessManager wired into runtime construction; hot-reload calls `setLimits()` with latest env.

Key design decision: **slot budget configured via env vars, NOT in `ExecutorProfile`**. Ops configure runtime capacity; tenants configure executor shape. Zero file overlap with FEAT-016 — let both land in parallel without conflict.

Engine modules (`engines/claude-code`, `engines/acp`, `engines/codex`, `engines/cursor`) stay unchanged — the orchestrator wrapper alone provides slot / group / priority / stall semantics for all of them.

### PLAN-007 final tally (FEAT-011 → FEAT-016)

| FEAT | Engines / Features | Tests added (api) |
|---|---|---|
| 011 | `AgentEvent` schema + zod; OpenAI-compat migrated | 6 |
| 012 | Claude Code executor + `WorkspaceManager` | 52 |
| 013 | ACP harness + Gemini / Qwen adapters | 61 |
| 014 | three-tier `ExecutorProfile` + `DEFAULT_PROFILES` + frontend picker | 19 |
| 015 | `ProcessManager` (slot / group / priority / stall / capacity API) | 75 |
| 016 | Codex + Cursor adapters | 59 |

- api tests: baseline 158 → **413** (+255) zero regressions.
- shared tests: 0 → **12**.
- web tests: 17 → **26**.
- lint baseline cleared from 6 errors → **0**.

### Runtime capabilities post-PLAN-007

- **Seven engines** selectable per worker: `http` (OpenAI-compat + preset catalogue for DeepSeek / OpenRouter / SiliconFlow / Gemini OpenAI-compat), `mcp`, `cli`, `claude-code` (stream-json control protocol), `acp` (`gemini` / `qwen`), `codex` (JSON-RPC app-server), `cursor` (native stream-json).
- **Three-tier config**: engine × variant × overrides (`CmdOverrides` + per-request `modelId`, `reasoningId`, `permissionPolicy`).
- **Per-conversation workspace isolation** (plain dir or git worktree when `WORKER_WORKSPACE_GIT_ORIGIN` set), path-escape guard, deferred dispose via ProcessManager.
- **Slot-aware scheduler** with named priority classes, stall detection, capacity snapshot REST.
- **Legacy flat config still reads** (reader-only migration on boot); next `PUT /config` writes profile shape.
- `AgentEvent` tagged union is the single crossroad between engines and the orchestrator — adding an 8th engine only requires an `engines/<name>/` adapter + registry entry + `default-profiles.ts` variant.

### Pointers

- Design: `docs/plan/PLAN-007.md` (status `completed`).
- Per-FEAT: `docs/task/FEAT-011.md` .. `FEAT-016.md` (all `completed`).

## 2026-04-22 18:45 [progress]

PLAN-007 step 5 / 6 (delivered early, parallel with FEAT-015 rework) — **FEAT-016 Codex + Cursor agent adapters** landed. The executor fleet now covers 7 engines: `http` + `mcp` + `cli` + `claude-code` + `acp` (gemini, qwen) + `codex` + `cursor`.

Delivered via BKD worktree subtask `x28in77k` (branch `bkd/x28in77k`, commit `a1c5a4f`, merged to main in `4eba707`).

Shared:

- `packages/shared/src/fleet/executor.ts` — `EngineKind` now `'http' | 'mcp' | 'cli' | 'claude-code' | 'acp' | 'codex' | 'cursor'`; new `CodexVariantBody` + `CursorVariantBody` types, `executorProfileSchema` enum widened, `executor.test.ts` matrix gets two rows.
- `packages/shared/src/fleet/index.ts` + `packages/shared/src/index.ts` — re-export new types.

API:

- **New** `apps/api/src/worker/executor/engines/codex/` — `executor.ts` (spawns `codex app-server` / npx `@openai/codex@<version>` fallback), `protocol.ts` (re-export of `engines/acp/protocol.ts::JsonRpcPeer + splitNdjson`, zero peer duplication), `normalize.ts` (`codex/event/{assistant_message,thinking,token_usage,tool_call,tool_result,stop,error}` → `AgentEvent`, action.kind inferred by tool name), `types.ts`, `index.ts` + 3 test files.
- **New** `apps/api/src/worker/executor/engines/cursor/` — `executor.ts` (spawns `cursor-agent -p --output-format=stream-json --model ...`, stdin prompt + `stdin.shutdown()`, no npm fallback: `resolveBinary` null → `AgentEvent.error`), `normalize.ts` (imports `splitNdjson` from claude-code; local `parseCursorLine`; `session_id` captured and exposed via `getLastSessionId()`), `types.ts`, `index.ts` + 2 test files.
- `apps/api/src/worker/executor/default-profiles.ts` — `codex.default = { model: 'gpt-5.2-codex', timeoutMs: 120_000 }`; `cursor.default = { model: 'auto', timeoutMs: 120_000 }`. Variant bodies kept minimal; apiKey / sandbox / policy / extraArgs traverse `CmdOverrides`.
- `apps/api/src/worker/executor/factory.ts` — `case 'codex'` (reads `CODEX_CLI_VERSION` / `DEFAULT_CODEX_CLI_VERSION`) + `case 'cursor'` (no cliVersion — no npx fallback).
- `apps/api/src/worker/management/config-schema.ts` — engine enum + schema branches for codex / cursor.
- `apps/api/test-fixtures/cli/codex-stub.mjs` + `cursor-stub.sh` — pre-recorded wire fixtures, `chmod +x`.

Web:

- `apps/web/src/features/workers/components/config-editor/executor-variants.ts` — `ENGINE_CATALOG.codex` + `.cursor` with `z.object({ model?, timeoutMs? })` schemas.
- `executor-section.test.tsx` — 3 new cases: engine picker shows codex/cursor, cursor body renders, cursor model override persists.

Docs:

- `docs/architecture.md` — "Executor engines" section enumerates all 7 engines.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 12 / 12 (+2), api 397 / 397 (+59), web 26 / 26 (+3).
- `bun run lint` — 0 errors.

Deferred (all P2/P3):

- Codex / Cursor wire shapes may drift with CLI versions — capture live traces before production and update `normalize.ts` + stubs as needed.
- Codex `thread_fork` resume + Cursor `--resume sessionId` slots reserved but not threaded through orchestrator.
- availability probe / auth detection follow-up.
- Lift executor catalog schemas into `@aiworker/shared` (open since FEAT-014).

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-016.md`.

## 2026-04-22 18:10 [progress]

PLAN-007 step 4 / 6 — **FEAT-014 three-tier ExecutorConfig + frontend picker** landed. `ExecutorConfig` collapses from a flat 5-branch discriminated union into a three-tier `ExecutorProfile = {engine, variant, overrides?, modelId?, reasoningId?, permissionPolicy?}`. Worker stores only the diff from baked-in `DEFAULT_PROFILES`; the flat legacy shape migrates reader-side, not write-side.

Delivered via BKD worktree subtask `geb8ycbp` (branch `bkd/geb8ycbp`, 38 files, +1987 / -439). Merged to main in `a72472d`.

Shared:

- **New** `packages/shared/src/fleet/executor.ts` — `EngineKind`, `CmdOverrides`, `ExecutorProfile`, zod schemas. This is now the only shape `PUT /config` accepts.
- `packages/shared/src/fleet/config.ts` — reduced to a re-export shim over `./executor`.
- `packages/shared/src/fleet/{index.ts,worker.ts,worker-info.ts}` — re-export surface updated; `WorkerInfo` exposes `engine` + `effectiveModel`.

API:

- **New** `apps/api/src/worker/executor/default-profiles.ts` — embedded variant catalog per engine (http default / deepseek / openrouter / siliconflow presets, claude-code default + opus-plan, acp gemini / qwen, mcp default, cli default) + `resolveVariant()` merging variant body + `overrides` + `CmdOverrides`.
- `apps/api/src/worker/executor/factory.ts` — takes `ExecutorProfile`, resolves variant, threads effective config into existing engine constructors unchanged.
- `apps/api/src/worker/bootstrap/config.ts` + `default-config.ts` — `migrateLegacyExecutor()` upgrades `{type:'http'|'mcp'|'cli'|'claude-code'|'acp',...}` → profile shape on load; never writes back. Old clients `PUT`ing flat shape get 400.
- `apps/api/src/worker/config/secret-paths.ts` — secret paths now point at `executor.overrides.{apiKey,token}`; `DEFAULT_PROFILES` keeps empty-string placeholders.
- `apps/api/src/worker/management/{config-schema,executor-test,info}.ts` — zod schema, tiny probe, and `executorInfoModel` migrated to the profile shape.
- `apps/api/src/worker/orchestrator/service.ts` — `executorModel()` reads from profile.
- `apps/api/src/worker/runtime.ts` — wires profile-shaped config through the runtime.
- `apps/api/scripts/smoke-plan-004.ts` — updated to new shape.

Web:

- **Rewritten** `apps/web/src/features/workers/components/config-editor/executor-section.tsx` — two-step picker (engine select → variant select) with an advanced collapse for `CmdOverrides` + per-request overrides.
- **New** `executor-form.tsx` — lean zod-schema → form mapper (string / number / boolean / enum / array<string> / record<string,string>, JSON textarea fallback). No external form library.
- **New** `executor-variants.ts` — frontend catalog schemas (zod) so the form renders fields without a round-trip.
- `apps/web/package.json` — adds `zod` dep for the catalog schemas.
- `apps/web/src/lib/api.ts` — type surface matches the new profile shape.
- Engine switch clears `overrides` to prevent cross-engine body key contamination.

Tests (+28):

- `packages/shared/src/fleet/executor.test.ts` — schema accept / reject matrix.
- `apps/api/src/worker/executor/default-profiles.test.ts` — `resolveVariant` merge semantics; unknown engine / variant throws.
- `apps/api/src/worker/bootstrap/config.test.ts` — all 5 legacy-shape migrations map correctly.
- `apps/api/src/worker/management/{config,routes,info,executor-test}.test.ts` — stubs + assertions updated to profile shape.
- `apps/web/src/features/workers/components/config-editor/executor-section.test.tsx` + `executor-form` / `__tests__/config-editor.test.tsx` — two-step picker flow, variant schema rendering, save-payload contract.

Incidental: subtask auto-fixed all 6 pre-existing main-baseline lint errors (yaml plain-scalar in `.github/workflows/build-image.yml`, import order in `apps/api/src/modes/dashboard.ts`, quote style in `scripts/deploy.ts`). Pure `eslint --fix` changes, zero semantic impact. **New main baseline: 0 lint errors.** Future FEATs must maintain that.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 10 / 10 (+3), api 338 / 338 (+19), web 23 / 23 (+6).
- `bun run lint` — 0 errors.

Deferred:

- Frontend zod schemas + backend `DEFAULT_PROFILES` TS interfaces are two sources of truth; FEAT-016 should lift into `shared` and unify.
- Remote model discovery (vibe-kanban's `discover_options` stream) still out of scope.

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-014.md`.

## 2026-04-22 17:30 [progress]

PLAN-007 step 3 / 6 — **FEAT-013 ACP harness + Gemini / Qwen adapters** landed. Second and third agentic-CLI engines now plug into the fleet; a fourth ACP-speaking engine (Copilot, Aider, Amp, ...) requires only a new data file in `engines/acp/agents/`.

Delivered via BKD worktree subtask `9395s1ev` (branch `bkd/9395s1ev`, 18 files, +2141 / -0 all-new). Subtask self-review passed after one fixup (stub path depth `..` count). Merged to main in `128f790`.

Shared:

- `packages/shared/src/fleet/config.ts` — `ExecutorConfig` gains minimal `{ type: 'acp', agent: 'gemini' | 'qwen', model?, cliVersion?, extraArgs?, env?, timeoutMs? }` variant. Three-tier profile layer still deferred to FEAT-014.

API (all new under `apps/api/src/worker/executor/engines/acp/`):

- `harness.ts` — `AcpExecutor` implements `ExecutorProvider`: spawn resolution (PATH → npx fallback with env-driven version), stdio ACP session lifecycle (`initialize` → `newSession` → `prompt` → streaming `sessionUpdate` → `cancel`), 10-minute auth-probe cache, proactive close + peer dispose on child `exit code != 0`.
- `protocol.ts` — transport-agnostic `JsonRpcPeer`: request / response correlation, notification dispatch, inbound request handling (used for `session/request_permission` auto-approve), timeout + abort + dispose.
- `normalize.ts` — ACP `sessionUpdate` → `AgentEvent`. `ToolCall.kind` maps to `ToolAction.kind`: read → file_read, edit → file_edit, execute → command_run, search → search, fetch → web_fetch, think → task_plan, else → tool. `stopReason` mapped to `AgentFinishReason`.
- `types.ts` — JSON-RPC frame + ACP session / tool / stopReason wire types, module-local only.
- `agents/types.ts` — `AcpAgentDefinition` shape: `{ id, label, commandName, npxPackage, versionEnvVar, defaultVersion, buildArgs(cfg), authProbe() }`.
- `agents/gemini.ts` — `--experimental-acp --yolo --allowed-tools run_shell_command`; `authProbe` checks `~/.gemini/oauth_creds.json`.
- `agents/qwen.ts` — `--acp --yolo`; `authProbe` checks `~/.qwen/`.
- `agents/index.ts` — registry map.
- `apps/api/src/worker/executor/factory.ts` — `case 'acp'`.
- `apps/api/src/worker/management/config-schema.ts` + `info.ts` — zod schema + `executorInfoModel` branch for acp.
- `apps/api/src/worker/orchestrator/service.ts` — `executorModel()` helper covers acp.
- `apps/api/test-fixtures/cli/acp-stub.mjs` — pre-recorded ACP ndjson usable by both gemini and qwen harness tests.

Tests (61 new):

- `protocol.test.ts` — JsonRpcPeer request/response, notification, cancel, timeout, dispose.
- `normalize.test.ts` — `sessionUpdate` event → `AgentEvent` including `ToolKind` → `ToolAction.kind` inference and stopReason mapping.
- `harness.test.ts` — smoke: gemini + qwen both produce assistant-message + tool-use + finish events against the stub binary.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 7 / 7, api 319 / 319 (61 new), web 17 / 17.
- `bun run lint` at pre-existing main baseline, zero new errors.

Deferred:

- ACP executor hasn't registered with `ProcessManager` → FEAT-015.
- CLI `--version` shell-out + DB-persisted availability → FEAT-015 or later.
- Default CLI versions (`gemini 0.9.0`, `qwen 0.0.14`) are placeholders — ops override via `GEMINI_CLI_VERSION` / `QWEN_CLI_VERSION` before production use.

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-013.md`.

## 2026-04-22 10:17 [progress]

PLAN-007 step 2 / 6 — **FEAT-012 Claude Code executor with git worktree workspace** landed. This is the first true agentic-CLI adapter on the fleet: the orchestrator no longer drives the tool loop for this engine — the Claude CLI owns the in-process agent loop, built-in tools, and sandboxing.

Delivered via BKD worktree subtask `d1oqqs1m` (branch `bkd/d1oqqs1m`, 26 files, +1915 / -9). Subtask self-review fixed two P1s (dispose-race via queue-deferred dispose; `once(child,'exit')` reject on `error` wrapped with `.catch`). Merged to main in `b98c13e`.

Shared:

- `packages/shared/src/fleet/config.ts` — `ExecutorConfig` gains minimal `{ type: 'claude-code', model?, cliVersion?, extraArgs?, env?, workspaceRoot?, timeoutMs? }` variant. Formal three-tier profile layer deferred to FEAT-014.
- `packages/shared/src/providers/executor.ts` — `AgentRunInput.workspacePath?: string` optional field so the orchestrator can hand a per-conversation workspace to the executor. Providers that don't need it (http / mcp) simply ignore the field.

API:

- **New** `apps/api/src/worker/executor/engines/claude-code/` module:
  - `executor.ts` — spawns `claude` from PATH first, falls back to `npx -y @anthropic-ai/claude-code@<version>`. Startup: `-p --verbose --output-format=stream-json --input-format=stream-json --include-partial-messages --replay-user-messages --dangerously-skip-permissions`. Default 120s timeout, abort-signal aware, child-error tolerant, spawn / binary resolver injectable for tests.
  - `protocol.ts` — stdio bidirectional control protocol peer; auto-approve policy default (all `PreToolUse` allow); deny / ask branches code-preserved for future interactive approval UI.
  - `normalize.ts` — stream-json → `AgentEvent`: assistant message / thinking delta, `tool_use` with `ToolAction.kind` inferred from tool name (Read/View → file_read, Edit/Write → file_edit, Bash → command_run, WebSearch/Grep → search, WebFetch → web_fetch, TodoWrite → task_plan, else → tool), user `tool_result`, `stop` → finish + usage, stream_event partial deltas, token_usage. NDJSON splitter merges across chunk boundaries.
  - `types.ts` — module-local CLI wire types.
- **New** `apps/api/src/worker/executor/workspace.ts` — `WorkspaceManager` with `createWorkspace(conversationId)` / `disposeWorkspace(conversationId)` / `purgeAll`. Enforces path-escape guard (conversationId regex + `isInside(WORKER_DATA_ROOT)` check). When `WORKER_WORKSPACE_GIT_ORIGIN` is set, provisions an isolated `git worktree add --detach`; otherwise a plain directory. Idempotent; concurrent create deduplicated.
- `apps/api/src/worker/runtime.ts` — `workspaces: WorkspaceManager` added to the runtime handle; survives hot-reload so workspace dirs persist across config swaps.
- `apps/api/src/worker/orchestrator/service.ts` — allocates a workspace per conversation on `ingest`, threads `workspacePath` into `run(...)`. On "new topic" classifier decision, dispose is enqueued on the orchestrator's FIFO queue so any prior in-flight run completes before the directory is deleted. No `toolDefinitions` injection for `claude-code`.
- `apps/api/src/worker/conversation/router.ts` — `classifyContinuation` accepts optional `workspacePath` so claude-code can classify when used as the conversation classifier.
- `apps/api/src/config/worker.ts` — new env vars `WORKER_DATA_ROOT`, `WORKER_WORKSPACE_GIT_ORIGIN`, `CLAUDE_CLI_VERSION`.
- `apps/api/src/worker/executor/factory.ts` — `case 'claude-code'`.
- `apps/api/src/worker/management/{config-schema.ts,info.ts}` + several `*.test.ts` — shape registration + model extraction for claude-code; stub runtime shape updated to include the `workspaces` field.

Tests (52 new):

- `engines/claude-code/{executor,protocol,normalize}.test.ts` + module-level fixtures.
- `workspace.test.ts` — path-escape guard + git worktree optional path.
- `orchestrator/service.claude-code.test.ts` — e2e smoke driving a web-channel envelope through a stub CLI (`apps/api/test-fixtures/cli/claude-stub.sh`), verifying at least one assistant-message event + one tool-use event land on the bus and persist to `worker.db.messages`.

Verification:

- `bun run typecheck` clean across shared / api / web.
- `bun test` — shared 7 / 7, api 258 / 258 (52 new), web 17 / 17.
- `bun run lint` at pre-existing main baseline (6 errors in `.github/workflows/build-image.yml`, `modes/dashboard.ts`, `scripts/deploy.ts`); FEAT-012 introduced zero new lint errors.

Deferred (P3, tracked in FEAT-014 / FEAT-015):

- Frontend picker row for `claude-code` → FEAT-014.
- `info.ts` health for `claude-code` becoming process-aware → FEAT-015 (`ProcessManager`).
- stdout write backpressure drain → FEAT-015.

Pointer: `docs/plan/PLAN-007.md`, `docs/task/FEAT-012.md`.

## 2026-04-22 09:50 [progress]

PLAN-007 step 1 / 6 — **FEAT-011 Normalize AgentEvent schema + refactor OpenAI-compat executor** landed. The orchestrator hot path no longer speaks OpenAI-specific chunk shapes; every `ExecutorProvider` now emits a shared `AgentEvent` tagged union, laying the foundation for Claude Code / ACP / Codex / Cursor adapters in FEAT-012..016.

Shared:

- **New** `packages/shared/src/providers/agent-event.ts` — `AgentEvent` discriminated union (`assistant_message_delta`, `thinking_delta`, `tool_use`, `tool_result`, `permission_request`, `token_usage`, `finish`, `error`), `ToolAction` discriminated union (`file_read`, `file_edit`, `command_run`, `search`, `web_fetch`, `task_plan`, `tool`, `other`), `ToolStatus`, `TokenUsage`, `AgentFinishReason`. All backed by zod schemas exported from the package root.
- **Breaking** (internal only, pre-release): `ExecutorProvider.runChat` renamed to `run`; returns `AsyncIterable<AgentEvent>` instead of `AsyncIterable<ChatStreamChunk>`. Legacy `ChatStreamChunk` / `ChatRunInput` / `ChatFinishReason` / `ChatUsage` types removed outright — no alias, since the discriminators differ (`text` → `assistant_message_delta`, `tool_call` → `tool_use`).
- **Deps**: `@aiworker/shared` gains `zod ^3.24.4` (runtime) and `@types/bun ^1.2.13` (dev); tsconfig sets `types: ["@types/bun"]`.

API:

- `apps/api/src/worker/executor/providers/{http,mcp,cli}.ts` all reshape to `run()` → `AgentEvent`. `OpenAICompatibleExecutor` emits text deltas as `assistant_message_delta`, function calls as `tool_use` with `action.kind === 'tool'`, and adds standalone `token_usage` entries plus the normal `finish`. `McpExecutor.run` and `CliExecutor.run` still yield error then finish — their real implementations live in FEAT-012..016.
- `apps/api/src/worker/orchestrator/service.ts` + `apps/api/src/worker/conversation/router.ts` + `apps/api/src/worker/management/executor-test.ts` consume the new event shape. SSE event names (`orchestrator.text`, `orchestrator.tool_call`) preserved so the frontend contract is unchanged.

Tests:

- `packages/shared/src/providers/agent-event.test.ts` (new) — 7 schema cases covering happy-path and rejection of unknown types / missing args / bad action kinds.
- `apps/api/src/worker/executor/providers/http.test.ts` rewritten against `AgentEvent`.
- `apps/api/src/worker/management/{executor-test,routes}.test.ts` updated to stub with `run` instead of `runChat`.

Verification:

- `bun run typecheck` clean across shared, api, web.
- `bun test` green — shared 7 / 7, api 210 / 210, web 17 / 17.
- `bun run lint` at pre-existing main baseline (6 unrelated errors in `.github/workflows/build-image.yml`, `modes/dashboard.ts`, `scripts/deploy.ts`); FEAT-011 introduced zero new lint errors.

Not in this step:

- No new engine adapter — FEAT-012 (Claude Code + worktree) is next.
- No config schema change — `ExecutorConfig` stays three-way (`http` / `mcp` / `cli`) until FEAT-014.
- No concurrency change — `AsyncQueue` stays until FEAT-015.

Pointer: `docs/plan/PLAN-007.md` for the full six-FEAT roadmap.

## 2026-04-22 04:07 [release]

PLAN-006 landed end-to-end: **P2 batch — channel adapters (Telegram, Lark, WhatsApp) + evolution generator (pattern miner)**. All four FEAT stubs left behind by REFACTOR-002 / PLAN-003 are now real implementations, delivered in parallel via BKD worktree dispatch (`gfhkzgdg`) and serialised-merged in this order: SUB-1 → SUB-2 → SUB-3 → SUB-4.

Subtasks delivered:

- **FEAT-003 Telegram** (`bkd/x9u5jzz9` → `e8f94c1`). `verify` uses timing-safe `X-Telegram-Bot-Api-Secret-Token` compare (silent accept when secret unset per spec); `toEnvelopes` emits one envelope per `message.text` with `chatId = {chat.type}:{chat.id}`; `send` whitespace-chunks replies at 4096 chars and hard-slices as fallback. 12 adapter tests.
- **FEAT-004 Lark 飞书** (`bkd/izavqq37` → `756d2ec`). `verify` handles the optional `encrypt` envelope with AES-256-CBC (SHA-256-keyed, IV from first 16 bytes) before validating `verificationToken`; `toEnvelopes` normalises `im.message.receive_v1` text for p2p + group, `url_verification` returns `[]`; `send` exchanges tenant access tokens with a per-`appId` cache (60 s refresh margin + single-flight promise). 16 adapter tests. Interface change: `ChannelAdapter.toEnvelopes` gains an additive optional `binding?: ChannelBinding` param so the Lark adapter can reach encryptKey at decode time; `routes.ts` passes it through. No other adapter needed changes.
- **FEAT-005 WhatsApp (Meta Cloud API)** (`bkd/zi8wqgzs` → `727b64f`). `verify` parses `X-Hub-Signature-256`, HMAC-SHA256 over the raw body, hex-`timingSafeEqual`; `toEnvelopes` walks `entry[].changes[].value.messages[]`, falls back to media captions for image/audio/video/document, silently skips status updates; `send` targets Graph v21 `/messages` with `recipient_type: individual`. Adds `GET /whatsapp/webhook` subscription-challenge handler to `routes.ts` (404 on missing binding, 403 on token mismatch, 200 plaintext challenge echo). 10 adapter tests.
- **FEAT-006 Evolution generator** (`bkd/tbled0e0` → `a9e289d`). New `pattern-miner.ts` is pure (n-gram aggregation over `Map<conversationId, tool[]>`, min-occurrence + min-conversation thresholds, strict-prefix dedup, occurrence-then-length sort). `proposer.ts` rewrites the stub into a real writer: reads recent `evolution_observations` as the conversation window, joins `execution_logs.tool_name` per conversation, mines, dedups against existing `skill_drafts` + `skill_bindings.config.allowedTools`, writes `skill_drafts` rows. Schema unchanged — mined `allowedTools` / `confidence` / `sequenceKey` are embedded as an `<!-- evolution-meta: {...} -->` marker in `bodyMarkdown` and recovered via the exported `parseEvolutionMeta()`. `runProposerOnce()` + `startProposerLoop()` keep their zero-arg signatures; `EVOLUTION_PROPOSER_WINDOW` / `_MAX_DRAFTS_PER_RUN` / `_INTERVAL_MS` env vars override defaults. 5 miner tests + 5 proposer integration tests.

Shared-type discipline:

- `packages/shared/src/fleet/channel.ts` stayed frozen across all four subtasks, as required by PLAN-006.
- The only cross-cutting interface edit — `ChannelAdapter.toEnvelopes` gaining `binding?: ChannelBinding` — is additive (optional param) and documented; SUB-2 reported the decision in its completion follow-up, and the existing telegram / whatsapp / line / web adapters still satisfy the interface without code changes.

Merge strategy:

- All four branches were dispatched in parallel on fresh worktrees off `main@99ec908`.
- Coordinator (`gfhkzgdg`) serialised merges into `main` from the top-level worktree, running `bun run --cwd apps/api test` + `bun run check` (typecheck across shared/web/api + `eslint .`) after each. Test counts progressed cleanly: 174 (SUB-1) → 190 (SUB-2, +16 lark) → 200 (SUB-3, +10 whatsapp) → 210 (SUB-4, +10 miner/proposer).
- Only `apps/api/src/worker/channels/routes.ts` was touched by both SUB-2 and SUB-3, and on disjoint line ranges (SUB-2: POST-handler toEnvelopes call; SUB-3: new GET route block); the ort strategy auto-merged with no conflicts.

Deferred (explicitly out of MVP scope, flagged in subtask reports):

- Telegram: cards / photos / Markdown V2 `parse_mode`.
- Lark: interactive-card message support; route-level `url_verification` challenge echo (the adapter already returns `[]`; the HTTP echo is a route concern).
- WhatsApp: message-template handling + 24-hour session window tracking; attachment ingestion without caption (envelopes are silently skipped today).
- Channels overall: `fetch` without abort/timeout matches the existing `line.ts` pattern; a fleet-wide hardening pass is a separate concern.
- Evolution: `execution_logs` is not yet populated from the orchestrator path — miner is ready for when that wiring lands. Evolution-meta marker regex assumes flat JSON; safe today since the writer is its only producer.

Verification:

- `bun run --cwd apps/api test` → **210 pass / 0 fail** (24 files, 562 `expect()` calls).
- `bun run check` → typecheck clean across `@aiworker/shared`, `@aiworker/web`, `@aiworker/api`; `eslint .` clean across the repo.
- All four BKD subtasks (`x9u5jzz9`, `izavqq37`, `zi8wqgzs`, `tbled0e0`) transitioned to `done`; worktrees pruned.

Pointer: `docs/plan/PLAN-006.md` for the design matrix and per-subtask spec, and `docs/task/FEAT-00{3,4,5,6}.md` for the individual deliverables.

# 2026-05-11 03:05 [progress]

Planned the Worker Web visual polish campaign after reviewing `DESIGN.md`,
GOALS, the current Worker Web source, and recent PMA status. New draft tracking:
REFACTOR-060 / PLAN-238 for design tokens and unified controls, REFACTOR-061 /
PLAN-239 for compact worker list and icon-button creation dialogs,
REFACTOR-062 / PLAN-240 for session composer and collapsible right drawer, and
QA-032 / PLAN-241 for visual, responsive, and code-review-graph validation.
After a follow-up scroll investigation, PLAN-240 was expanded with Open
Design's chat scroll-island pattern: key chat state by conversation/session,
wrap the log in a dedicated relative scroll container, auto-follow only when
near bottom, and expose jump-to-latest without letting streaming output steal
scrollback.

## 2026-05-12 13:57 [progress]

REFACTOR-071 / PLAN-278 started: HR's specialized Soul workbench is being
reframed from role-search-first to people-first. The implementation will keep
the shared worker/workspace/session/artifact/review/lesson contract, make the HR
home surface a profile poster wall plus selected profile loop panel, and leave
PM/QA/DevOps on the current generic fallback.

## 2026-04-21 18:30 [release]

FEAT-009 / PLAN-005 landed: **aissh-driven fleet deployment automation**. AIWorker now ships with a one-command deploy to `gateway.example.test` via the `aissh` CLI.

New artifacts:

- `ops/compose/docker-compose.yml` — production compose for the dashboard only. No docker-socket mount (MANAGER_CAN_LAUNCH stays off by default); image tag pinned via `AIWORKER_IMAGE_TAG` env so rollbacks are a tag swap.
- `ops/compose/.env.example` — host-local env template (`AIWORKER_MASTER_KEY`, `INTERNAL_SHARED_SECRET`, `AIWORKER_IMAGE_TAG`).
- `ops/caddy/Caddyfile.tmpl` — single-site template `gateway.example.test → 127.0.0.1:3000`. No per-worker routing (PLAN-004 made workers advertise their own externally-reachable URL).
- `scripts/deploy.ts` — Bun CLI wrapping aissh. Subcommands: `install-docker`, `teardown-legacy --confirm`, `build`, `upload`, `install`, `verify`, `reload-caddy`, `deploy` (chains the common path). Local `docker save | zstd` keeps the tarball under ~150 MB for the 961 MiB host; `install` verifies `/opt/aiworker-deploy/.env` carries the required secrets before loading.
- `scripts/tsconfig.json` — standalone typecheck for the ops CLI (pulls `@types/bun` from the api workspace).
- `docs/deployment.md` — run book: prereqs, first-time deploy, routine deploy, rollback, worker registration pointer, troubleshooting.

Deviations from the FEAT-009 task draft (authored pre-PLAN-004):

- Health endpoint is `GET /health` (dashboard + worker), not `/api/system/health`.
- Caddyfile does not strip a `{workerId}` prefix — workers own their externally-reachable URL after PLAN-004.
- First cut deploys the dashboard only. Worker provisioning is operator-driven via the registry (see PLAN-004); automating per-worker deploy is follow-up work for FEAT-007 / FEAT-008.

Verification:

- `bun run typecheck` clean across `shared`, `api`, `web`.
- `bun run lint` clean across the repo (includes the new ops YAML + scripts TS).
- `bunx tsc --noEmit -p scripts/tsconfig.json` clean for `scripts/deploy.ts`.
- `bun run scripts/deploy.ts deploy --dry-run --tag=smoke-test` prints the full `build → upload → install → verify → reload-caddy` command chain without running anything. `teardown-legacy` without `--confirm` is correctly rejected.

Pointer: `docs/plan/PLAN-005.md` for the full design (deliverables, risks, rollback, alternatives) and `docs/deployment.md` for the operator-facing run book.

## 2026-04-21 11:30 [release]

PLAN-004 landed end-to-end: AIWorker has pivoted from the centralized PLAN-003 fleet model to **self-sufficient workers + manager-as-registry**. Each worker container now owns its identity, config, and secrets and serves its own `/api/worker/*` surface; the dashboard is a pointer store that registers worker URLs + bearer tokens and proxies UI traffic through.

Subtasks delivered (in BKD merge order):

- 1.1 — Shared types: `RegisteredWorker`, `WorkerIdentity`, `WorkerApiToken`, `WorkerInfo` (`ijo50kfz`).
- 1.2 — `worker.db` schema: `worker_identity` + `worker_config` + `worker_secrets` (`bgm8h8sz`).
- 1.3 — `fleet.db` rewrite: `registered_workers` + `audit_events` only (`zy8taekt`).
- 2.1 — Worker-side `SecretsVault` move + bootstrap flow (id mint, token mint, stdout print, encrypted persist) (`9qqs0iph`).
- 2.2 — Worker management API: `/info`, `GET+PUT /config` with hot reload, secrets CRUD (`b4r6p9l6`).
- 2.3 — Worker bearer-auth middleware + `/brain/test`, `/executor/test`, `/channels/:channel/test`, `/token/rotate`, `/reload` (`y4yvqyd5`).
- 3.1 — Manager `WorkerClient` + `POST /api/workers/register` (validates via worker `/info`) (`9ehtjkhv`).
- 3.2 — Manager registry CRUD + transparent `/api/workers/:id/proxy/worker/*` pass-through (`fj7utscp`).
- 3.3 — Periodic `/info` poll + `lastSeenAt / lastSeenState / lastConfigVersion` updates with audited state changes (`zdcboki0`).
- 3.4 — Optional `MANAGER_CAN_LAUNCH` flag + `POST /api/workers/launch-local` (gated supervisor wiring) (`1x3efm46`).
- 4.1 — Web: registered-workers list + register wizard + per-worker nested route shell + worker switcher (`rgxka0g0`).
- 4.2 — Web: per-worker config editor + secrets panel + test panel + token rotation (`56vtboxe`).
- 5.1 — End-to-end smoke (`apps/api/scripts/smoke-plan-004.ts`) + manager-side `POST /api/workers/:id/rotate-token` wrapper that re-encrypts the worker's freshly minted bearer into `registered_workers.apiTokenEnc` so post-rotate proxy/poll calls keep authenticating + this changelog (`sm5gj8vx`).

Breaking changes:

- **Worker env**: `WORKER_ID`, `WORKER_CONFIG_JSON`, `WORKER_CONFIG_VERSION` are gone. `AIWORKER_MASTER_KEY` (32-byte hex) is now **required** in both `worker` and `dashboard` modes — workers use it to seal `worker_identity`/`worker_secrets`; managers use it to seal `registered_workers.apiTokenEnc`. New optional knobs: `AIWORKER_FORCE_ID`, `AIWORKER_FORCE_TOKEN`, `AIWORKER_ADVERTISED_BASE_URL`.
- **Manager env**: docker-supervisor knobs (`AIWORKER_IMAGE`, `WORKER_DATA_ROOT`, `WORKER_MEMORY_LIMIT`, `WORKER_CPU_LIMIT`) became optional; required only when `MANAGER_CAN_LAUNCH=true`. New: `MANAGER_POLL_INTERVAL_MS` (default `30000`), `MANAGER_POLL_JITTER_MS` (default `3000`), `AIWORKER_LAUNCH_BASE_URL_TEMPLATE`.
- **fleet.db schema**: `workers`, `worker_configs`, `worker_secrets` tables removed; replaced by a single `registered_workers` table.
- **worker.db schema**: gained `worker_identity`, `worker_config`, `worker_secrets` (singletons + secret rows).
- **Webhook URLs**: workers own their own externally-reachable base URL — no more "manager strips the `/{workerId}/` prefix" routing requirement. Operators choose subdomain-per-worker, path-per-worker, or any other reverse-proxy topology.
- **Manager rotate flow**: web UI now calls the manager wrapper at `POST /api/workers/:id/rotate-token`, which returns `{ rotatedAt, lastFourOfNewToken }` and intentionally does NOT leak the new plaintext. Operators who need the plaintext call the worker directly via `POST /api/workers/:id/proxy/worker/token/rotate`.

Migration note (pre-release, destructive OK): both `drizzle/fleet/0000_*.sql` and `drizzle/worker/0000_*.sql` were regenerated to match the new schemas. Delete any local `apps/api/data/fleet.db*` and per-worker `worker.db*` before the next dev boot; `initFleetDb` / `initWorkerDb` re-run their migration set on startup.

Verification:

- `bun run check` clean across `shared`, `api`, `web`.
- `bun test` clean (registry routes/service/poll/rotate-token + worker bootstrap/identity/secrets/config/management/rotate suites).
- `apps/api/scripts/smoke-plan-004.ts` boots a worker + manager via `bun src/index.ts`, registers, configures, rotates, and round-trips a web channel echo — exits 0.
- Dev-server bind regression flagged in 4.1 fixed: `apps/api/src/dev.ts` now re-exports `index.ts`'s default `{ fetch, port }` so `bun src/dev.ts` actually serves traffic.

Pointer: `docs/plan/PLAN-004.md` for the full design (target architecture, data model, auth model, migration table, risks).

## 2026-04-21 09:15 [progress]

REFACTOR-002 / PLAN-003 landed the backend + ops scaffolding for the multi-worker fleet architecture. AIWorker is now modelled as a **fleet** (a group of workers) where each worker runs in its own docker container with independent Brain, Executor, Channels, and Evolution layers.

Backend:

- **Shared types** (`packages/shared/src/fleet/`): `Worker`, `WorkerConfig`, `ChannelBinding`, `Envelope`, `BrainSourceConfig`, `ExecutorConfig` (discriminated `http`/`mcp`/`cli`), `ConversationDecision`, `SkillDraft`, `EvolutionObservation`, etc. Dual worker identity (`w_` + 12 Crockford base32 immutable id + mutable human slug).
- **DB split** — `fleet.db` (dashboard: `workers`, `worker_configs`, `worker_secrets`, `audit_events`) + `worker.db` (per-worker-container: `agent_tasks`, `conversations`, `messages`, `execution_logs`, `skill_bindings`, `skill_drafts`, `evolution_observations`). Two Drizzle configs, `bun run db:generate` regenerates both migration sets.
- **Mode dispatch** — one Bun binary, `AIWORKER_MODE=dashboard|worker` selects the runtime. `src/config/{common,dashboard,worker}.ts` hold mode-specific env schemas; `src/modes/{dashboard,worker}.ts` create the Hono app per mode; `src/index.ts` picks.
- **Dashboard mode**: `src/dashboard/secrets` (AES-256-GCM vault gated by 32-byte hex `AIWORKER_MASTER_KEY`, with 5 passing tests); `src/dashboard/fleet` (workers CRUD + redacted/hydrated config split); `src/dashboard/supervisor` (unix-socket docker client via Bun `fetch({ unix })`, manages worker containers: spawn / start / stop / restart / remove / inspect / logs).
- **Worker mode**: `src/worker/brain/` (`HermesProvider`, `CloudGatewayBrainProvider`, plus new `MultiBrainProvider` aggregating per-worker source list); `src/worker/executor/` (factory over `http` / `mcp` / `cli`; `CliExecutor` spawns via `node:child_process`, `sandbox` flag reserved for FEAT-002); `src/worker/channels/` (envelope + 5 adapters: `web` + `line` working, `telegram` / `lark` / `whatsapp` stubbed behind `ChannelNotImplementedError`; HMAC signature verify on Line); `src/worker/conversation/router.ts` (Agent-driven continuation classifier — no hardcoded timeouts); `src/worker/orchestrator/service.ts` (per-worker queue, channel-routed ingest, text chat loop, SSE event emission, outbound channel delivery); `src/worker/evolution/` (observer wired to the event bus writes `evolution_observations`; proposer is a stub logger pending FEAT-006; approval routes for skill drafts).
- **URL map**: public `POST /{channel}/webhook` + internal `/api/worker/*` + dashboard `/api/workers[/:id]*`. External format `https://{host}/{workerId}/{channel}/webhook` — Caddy strips the `{workerId}` prefix and routes to the worker container over the docker network.
- **Ops**: root `Dockerfile` (multi-stage, single image for both modes) + `docker-compose.yml` (dashboard container with docker socket mounted).

Docs:

- `docs/plan/PLAN-003.md` — full four-layer (Communication / Brain / Evolution / Executor) design. Approved 2026-04-21 07:40 and moved to `implementing`.
- `docs/task/REFACTOR-002.md` — in_progress. Future-work placeholders created: `FEAT-002` (executable skills runtime), `FEAT-003` (Telegram), `FEAT-004` (Lark), `FEAT-005` (WhatsApp), `FEAT-006` (evolution generator), `FEAT-007` (M:1 channel routing), `FEAT-008` (multi-host HA), `FEAT-009` (aissh-driven deployment).

Verification:

- `bun run typecheck` clean across `shared`, `api`, `web`.
- 11 unit tests pass: 5 `SecretsVault` + 6 `OpenAICompatibleExecutor`.

Not in this checkpoint (explicitly deferred):

- Web frontend restructure (workers list + per-worker nested routes + worker switcher + skill-binding editor). Web app typechecks but its routes still call legacy `/api/skills`, `/api/memory`, etc. — will go away after the frontend rewrite.
- Full smoke test (fleet-boot-via-docker + worker-spawn + channel-roundtrip).
- Deployment automation — tracked in FEAT-009 per user direction.

## 2026-04-21 06:45 [progress]

Added `CloudGatewayBrainProvider` as a second `BrainProvider` implementation. It talks to a cloud-gateway MCP server over streamable-HTTP (JSON-RPC 2.0) and maps `BrainProvider` methods to the server's `knowledge_*` tools (`knowledge_types` → skills, `knowledge_query` → listMemories, `knowledge_search` → searchMemories, `knowledge_write` → writeMemory). Runtime provider selection is controlled by the new `BRAIN_PROVIDER` env (`hermes` default, `cloud-gateway` when MCP URL + token are provided). Deployed to the production server; `/health` now reports `brain.status=ok` against cloud-gateway, `/api/skills` surfaces the knowledge types as brain skills. New files: `apps/api/src/adapters/mcp/{client,index}.ts`, `apps/api/src/providers/brain/cloud-gateway.ts`. Env additions: `BRAIN_PROVIDER`, `CLOUD_GATEWAY_MCP_URL`, `CLOUD_GATEWAY_MCP_TOKEN`, `CLOUD_GATEWAY_DEFAULT_CATEGORY`, `CLOUD_GATEWAY_DEFAULT_TYPE_ID`.

## 2026-04-20 20:30 [progress]

Agent Runtime refactor (PLAN-002) complete. AIWorker is now a self-hosted Agent Runtime that composes a **Brain provider** (Hermes — knowledge/memory) and an **Executor provider** (OpenAI-compatible chat completions + tool calling). Backend modules (`skills`, `memory`, `execution`, `health`) were rewired behind `BrainProvider` / `ExecutorProvider` interfaces; a new `orchestrator` module drives the full loop (submit → tool_call → write_memory → succeeded) with per-task queue, cancellation, and SSE broadcasts. Frontend shipped a new `/orchestrator` route (task list, replay, live updates) and the six existing pages were renamed from Hermes/OpenClaw to Brain/Executor terminology.

- **DB reset procedure**: delete `apps/api/data/aiworker.db*` before the next dev run; `initDb` auto-runs all Drizzle migrations on boot. New tables: `agent_tasks`, `conversations`, `messages`; `execution_logs` gained a `conversationId` FK; `skill_conflicts` now uses `brain_hash` / `executor_hash` columns.
- **Env additions**: `OPENAI_BASE_URL` (default `https://api.openai.com`), `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_TIMEOUT_MS` (default `60000`). See `apps/api/.env.example`.
- **Env deprecations**: `OPENCLAW_WS_URL`, `OPENCLAW_HOME` remain in the schema for transitional compatibility but are no longer surfaced via `/api/config`.
- **API shape changes**: `/api/health` now reports `services.brain` and `services.executor` (previously `hermes` / `openclaw`); `/api/skills/*` sources use the `brain` | `executor` enum; `/api/skills/conflicts` returns `brainHash` / `executorHash`.
- **New surfaces**: `POST|GET /api/orchestrator/tasks`, `GET /api/orchestrator/tasks/:id`, `POST /api/orchestrator/tasks/:id/cancel`; SSE stream at `GET /api/events/stream` emits `orchestrator.task.started|message|tool_call|finished|failed|cancelled`; frontend `/orchestrator` page consumes it live.
- **E2E coverage**: `apps/api/src/modules/orchestrator/e2e.test.ts` exercises the "Remember that I prefer TypeScript strict mode" scenario end-to-end with a scripted executor — no OpenAI credentials required; run with `bun test src/modules/orchestrator/e2e.test.ts` from `apps/api`.

## 2026-04-20 17:15 [progress]

Phase 3 + 4 complete. Backend gained `execution`, `config`, `events` modules (REST + SSE). Web app scaffolded with Vite 8 + TanStack Router/Query + Tailwind v4 + Base UI primitives, and all six pages implemented: Dashboard (live SSE feed + service status), Skills (list/diff/conflicts tabs with sync trigger), Memory Explorer (search + filters + new), Execution Monitor (stats, filters, live tool feed, paginated table), Config Editor (read/write Hermes YAML + OpenClaw JSON with backup), Sync Status (timeline + run sync). Drizzle migrations auto-applied on `initDb`. Vite proxy now respects `AIWORKER_API_URL`. `bun run typecheck` and `bun run lint` clean across all workspaces.

## 2026-04-20 09:45 [progress]

Project initialized with PMA docs structure.
## 2026-05-19 00:12 [progress]

REFACTOR-083 / PLAN-364 extracted the shared collapsible grouped-list pattern
for Worker Web. `@zonease/aiworker-component` now exports
`StudioCollapsibleGroup`, which owns the generic group toggle, chevron state,
count/meta slot, expanded drawer, and visual child indentation. The Worker Web
Soul worker rail and the HR People Workbench profile lifecycle list both use the
shared pattern while keeping worker/profile child item rendering local.

Verification: focused component and WorkerStudio RTL tests, component
typecheck, Web typecheck/lint/build, `git diff --check`, browser smoke against
the local daemon, and code-review-graph update/review. The build still reports
the existing large chunk warning; `crg:review` exited 0 but kept advisory static
test-gap labels despite the new direct tests.

## 2026-05-19 16:40 [progress]

FEAT-101 / PLAN-372 turned the shared Host/Soul component package into an
active development guardrail. Non-trivial Host Web and Soul App UI proposals now
must include a `Component Library Preflight`, `packages/component/src/catalog.ts`
exports a discoverable `componentGovernanceRules` entry, and root `lint` now
runs `bun run ui:check`.

The new `scripts/check-web-ui-components.ts` scans changed Web UI files for
obvious app-local button/card/chip clones, raw native select/dialog usage, and
unscoped shared selector overrides. Files can pass by importing
`@zonease/aiworker-component`, being tracked in `componentMigrationQueue`, or
documenting an explicit `@aiworker-component-local-ok` exception.

Verification: `bun scripts/check-web-ui-components.ts`, `bun run ui:check`,
`bun run docs:check`, scripts typecheck, component typecheck, focused component
catalog test, root `bun run lint`, `git diff --check`, `bun run crg:update`,
and `bun run crg:review`. The graph review exited 0 with risk score `0.40` and
kept advisory test-gap labels for unrelated in-progress worktree symbols plus
the catalog rule; direct catalog test coverage was added for the governance
rule.
