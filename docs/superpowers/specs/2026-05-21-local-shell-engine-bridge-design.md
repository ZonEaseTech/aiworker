# Local Shell + Engine Bridge Design

## Goal

AIWorker will converge from a governance-heavy Host product into a lightweight
local shell and engine bridge for Soul Apps.

The new product contract is:

```text
AIWorker = Local Shell + Engine Bridge for Soul Apps
```

AIWorker should help a user start a Soul App, enter a local workspace, open a
session, pass context to an engine, and return to app-owned work. It should not
make proposal, broker, review, audit, grant, governance, artifact, profile or
lesson semantics part of the Host product core.

## Architecture Contract

Host keeps only five responsibilities:

- **Start**: discover, install, enable and start Soul Apps.
- **Shell**: provide local Web, CLI and daemon entrypoints into Soul Apps.
- **Locate**: maintain local Soul worker, workspace and session context.
- **Mount**: mount Soul App UI/API as independent app-owned surfaces.
- **Bridge**: prepare session cwd, context files and engine invocation entrypoints.

Host does not own the engine tool loop, human approval workflow, memory policy,
review flow, business output lifecycle, cross-Soul orchestration or domain
semantics.

The default path becomes:

```text
AIWorker -> Soul App -> workspace -> session -> app-owned work
```

## Deprecated Host Concepts

The following concepts are removed from the Host core:

| Concept | New treatment |
| --- | --- |
| `proposal` | Removed from Host. A Soul App may define a domain draft or update request. |
| `review` | Removed from generic platform flow. A Soul App may define app-owned confirmation actions. |
| `broker` | Removed from the product kernel. Necessary platform calls become thin local adapters or engine bridge hooks. |
| `audit` | Removed as a default Host ledger. A Soul App may keep app-owned local history if useful. |
| `governance / admission` | Removed from the active product line and default runtime path. |
| `artifact/profile/lesson` | Host no longer owns generic meaning; it only locates app-owned outputs, files or state. |
| `grant / permission platform` | Removed as a product center. Any minimum local boundary must be implementation detail, not user-facing product architecture. |

This is not a rename. It is an ownership transfer from Host to each vertical
Soul App.

## Product Entry

The user-facing product should no longer look like a Worker Studio, artifact
review center, broker console or governance surface.

Web keeps a lightweight local shell:

- Soul App, workspace and session navigation.
- mounted Soul App container as the main surface.
- local running state, engine state, local path and session activity.
- no default generic artifact, review, lesson, memory, broker or provider panel.

CLI keeps the thin operator surface:

```text
aiworker daemon start|stop|status
aiworker app install|enable|list|open
aiworker worker create|list|open
aiworker workspace create|list|open
aiworker session start|list|open
aiworker engine select|doctor
```

CLI commands such as generic `review`, `lessons`, `profile promote`, broker,
provider, grant, security-review, brain admission, governance and generic
artifact inspection are deletion or app-owned migration candidates. If users
need to open generated files, the Host wording should be file/session oriented,
not artifact/review oriented.

## Code Boundary

Keep:

- `apps/cli` for daemon, app, worker, workspace, session and engine commands.
- `apps/api` for the local daemon API, static Web hosting and Soul App mounting.
- `apps/web` for the local shell, mounted app container and session activity.
- `packages/core` for local runtime, engine bridge, app registry and locator.
- `packages/shared` for minimal manifest, mount, session, engine and workspace schemas.
- `packages/soul-app-sdk` for Soul App authoring, manifest and standalone/mounted helpers.
- `packages/soul-app-runtime` for standalone/mounted harnesses without generic review/broker/proposal assumptions.
- `packages/storage-sqlite` for Host metadata only: app, worker, workspace, session, engine invocation and file references.
- `packages/fs-layout` for local directory layout.

Remove or collapse:

- Host generic broker routes, provider registry and SDK broker client.
- generic security review, grant and permission platform.
- generic artifact, review, lesson, memory and admission models/routes.
- Host generic profile promotion.
- Web generic artifact, review, lesson and memory panels.
- CLI generic artifact, review, lesson, profile promotion and brain admission commands.
- future-facing docs that still present these mechanisms as product commitments.

Historical PMA, changelog and task files can remain as audit history, but active
docs must mark the old direction as superseded where needed.

## Vertical Soul Boundary

HR and QA do not have to lose domain confirmation or evaluation features.
Those features must be app-owned and named in domain language:

- HR can keep a People Profile, candidate evidence and profile update confirmation.
- QA can keep a release readiness surface, release decision and test-suite risk.

These features must not depend on Host generic review, admission, broker or
proposal machinery.

## Execution Order

1. Rewrite the architecture contract and Constraint Registry around Local Shell
   + Engine Bridge.
2. Update README, AGENTS, CLI copy and Web default entrypoints so the product
   path is Soul App -> workspace -> session -> app-owned work.
3. Delete or collapse the generic Host mechanisms in focused slices, with
   package-level verification after each layer.
4. Verify HR and QA as vertical Soul Apps that can start, mount, create
   workspace/session context and show domain-owned work without Host generic
   review/broker/proposal dependencies.

## Verification

Documentation phase:

- `bun run docs:check` or the focused doc contract check.

Product entry phase:

- focused lint/typecheck for CLI and Web changes.
- mounted UI smoke when Web behavior changes.

Code removal phase:

- affected package tests.
- root typecheck once shared schemas or package exports change.

Final phase:

- HR and QA app validate/smoke.
- Web mounted-surface smoke.
- `bun run check` when the removal touches shared contracts or release paths.
- `bun run crg:update` and `bun run crg:review` after code changes.

## Failure Protection

- Do not mix this refactor with unrelated dirty worktree changes.
- Do not keep compatibility shims for deprecated product concepts unless they
  are required only to preserve local daemon/app/workspace/session/engine bridge
  operation during an intermediate slice.
- If deleting a module blocks the lightweight kernel, extract a minimal
  replacement interface before deleting the old concept.
- Each stage may leave an explicit deprecated-but-not-yet-removed inventory, but
  active docs must not present those items as future product commitments.
