# PLAN-218 Host daemon and Soul worker architecture contract

- **status**: completed
- **owner**: local
- **createdAt**: 2026-05-10 16:59
- **relatedTask**: DOC-009

## Current State

Investigation found a mismatch between target architecture and current docs:

- `GOALS.md`, `docs/architecture.md`, and `README.md` still described the
  default local product as a single Soul workspace.
- Current source code also reflects that transitional model: the daemon
  bootstrap owns one `soul-worker` runtime and one `soul-workspace`.
- `worker.db` currently uses workspace as the dominant isolation key and keeps
  Soul on project rows via `selectedSoulId`.
- `packages/fs-layout` still contains user-scope `workers/<workerId>` helpers,
  but project scope collapses to one `.aiworker` tree.
- Open Design's effective contract is `daemon -> project/workspace ->
  conversation/session -> turns -> artifact`; engine handoff happens at the
  conversation/session layer after a project/workspace exists.
- README presented separate API and Web dev commands as the Web path, which
  reinforces the wrong product mental model. The target should be one daemon
  lifecycle and one local URL, with split commands as contributor escape hatches
  only while the refactor is pending.

## Proposal

Adopt this architecture as the next phase contract:

```text
1 host
  -> 1 local daemon
    -> N Soul workers
      -> 1 Soul per worker
        -> N workspaces/projects
          -> N sessions
            -> N turns / artifacts
```

Object definitions:

- Host is the execution environment, not a product object.
- Local daemon is the host-local control plane for Web/API, DB, migrations,
  host settings, engine inventory, connector/MCP inventory, auth, and worker
  registry.
- Worker is the Soul-bound runtime and owns Soul identity, domain system,
  capability catalog, enabled capabilities, review/admission policy, durable
  memory namespace, and worker-scoped business state.
- Workspace/project is the business scope under one worker.
- Session is the durable work thread inside one workspace and the handoff point
  for an external engine native session.
- Turn is the user-visible unit inside a session.
- Engine invocation is an internal audit/retry/debug object for one technical
  engine call; it is not a product object.
- Capability template belongs to the Soul worker; workspaces inherit
  capabilities, sessions select or route to one, and turns/artifacts must
  record the capability/workflow version.

Documentation changes:

1. Update `GOALS.md` so the north star is host daemon -> Soul workers, not one
   workspace with selectable Soul metadata.
2. Update `docs/architecture.md` with object invariants, OD mapping, target API
   surface, target storage model, capability ownership, and local debug
   contract.
3. Add the file consumer contract so files exist only when daemon, engine,
   audit/replay, or humans consume them.
4. Update `README.md` with the simplified model and target startup contract.
5. Sync PMA task, plan, and changelog.

## Refactor Phase Target

This documentation becomes the target for the next implementation phase:

1. **Infrastructure model**
   - Add `workers`, `worker_settings`, `sessions`, `turns`,
     `session_events`, `engine_invocations`, and host settings to `worker.db`.
   - Carry `worker_id` through workspace/project/session/turn/artifact/review
     rows or through a strict relational chain.
   - Move Soul ownership from project metadata to worker rows.
2. **Daemon API**
   - Add `/api/local/workers` registry endpoints.
   - Move workspace/session/message/event/artifact routes under `:workerId`.
   - Split host settings from worker settings.
3. **Runtime**
   - Replace singleton daemon runtime state with a worker runtime registry.
   - Bind or resume external engine native sessions only inside
     worker/workspace/session context.
   - Treat `engine_invocation` as audit/retry/debug only, not as a product
     route or UI center.
   - Refuse or clearly fail session turns when no real engine/BYOK
     configuration is available.
4. **Web**
   - Treat Soul selection as selecting or creating a Soul worker.
   - Show worker capabilities, workspaces, sessions, turns, artifacts, review,
     and memory candidates through the worker boundary.
5. **CLI and dev lifecycle**
   - Add a single source-checkout `aiworker dev` lifecycle command.
   - Ensure packaged `daemon foreground/start` can serve Worker Web through the
     daemon origin.

## Risks

- The current code and tests still assume singleton `state.runtime`; this is an
  intentional future implementation gap, not solved by this documentation-only
  plan.
- Renaming `project` to `workspace` everywhere may be unnecessary churn. The
  architecture allows the product label `workspace/project` while enforcing
  worker ownership.
- There are existing in-progress/superseded PMA markers from prior local worker
  correction plans. This plan records the new target without cleaning unrelated
  historical PMA state.
- API route restructuring is a breaking change and should be implemented in a
  dedicated refactor plan with focused storage/API/Web gates.
- The architecture contract is now strict. It can only be adjusted after a new
  proposal if implementation evidence proves session handoff, file projection,
  or the no-run product model cannot meet the expected product experience.

## Scope

In scope:

- `GOALS.md`
- `docs/architecture.md`
- `README.md`
- `docs/task/DOC-009.md`
- `docs/plan/PLAN-218.md`
- `docs/task/index.md`
- `docs/plan/index.md`
- `docs/changelog.md`

Out of scope:

- DB schema migration.
- API route implementation.
- Web component rewrite.
- CLI lifecycle implementation.
- Settings behavior changes.
- code-review-graph review, because no code files are changed.

## Alternatives

- Keep one daemon -> one worker -> many Souls. Rejected because Soul identity,
  memory, review policy, and default executor overlay would all collapse into
  one runtime boundary.
- Create one daemon per Soul. Rejected because engine inventory, host settings,
  Web/API lifecycle, auth, and connector inventory are host-level concerns and
  would be duplicated.
- Make capability selection fully implicit. Rejected because turn, invocation,
  artifact, review, and memory provenance need an explicit capability or
  workflow version.

## Implementation Status

Completed on 2026-05-10.

Delivered:

- `GOALS.md` now defines the host daemon / Soul worker architecture and capability
  ownership rules.
- `docs/architecture.md` now contains the detailed object definitions, Open
  Design mapping, target local API, target storage model, runtime boundaries,
  file consumer contract, session handoff rule, and single-lifecycle debug
  contract.
- `README.md` now explains the model and marks split API/Web startup as a
  transitional contributor escape hatch rather than the intended product path.
- Follow-up correction on 2026-05-10 17:44: session is the engine handoff point;
  turn is the user-visible interaction unit; `run` is removed from the product
  model and replaced by internal `engine_invocation` audit.
- PMA task, plan index, task index, and changelog are synchronized.

Verification:

- `git diff --check`
- code-review-graph skipped because this is documentation-only architecture
  work.
