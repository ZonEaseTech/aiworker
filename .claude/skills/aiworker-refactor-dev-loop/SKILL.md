---
name: aiworker-refactor-dev-loop
description: Use when running long AIWorker destructive refactor work in Claude Code, especially Dynamic workflows, canonical architecture migration, Freeform v1 progress, host-daemon/runtime/protocol/projection/engine-bridge work, checkpointed development, or multi-round continuation.
---

# AIWorker Refactor Dynamic Workflow Entry

This skill routes long AIWorker refactor work into Claude Code Dynamic
workflows.

It is not an architecture authority. It is not a fixed workflow plan. The
Dynamic workflow owns orchestration, decomposition, intermediate state, and
continuation decisions.

## Authority

Canonical authority is:

- `AGENTS.md`
- `docs/architecture.md`
- `docs/protocol.md`
- `docs/runtime.md`
- `docs/soul-authoring.md`
- `docs/testing.md`

Do not use `tmp/refactor`, old E2E, old changelog, historical local skills,
conversation summaries, cached test results, or stale agent claims as
architecture authority.

## Long Task Discovery

When asked to continue AIWorker refactor work, first determine whether the work
is a long task from current disk state.

Treat it as a long task when any of these are true:

- work spans more than one package, app, or Soul;
- canonical architecture boundaries affect the next decision;
- completion likely needs multiple verified commits;
- current repo state must be inspected before choosing work;
- previous sessions, compaction, or parallel work may have changed context;
- the next action is unclear until current implementation is reviewed;
- the user mentions continuing refactor, migration, Freeform v1, host-daemon,
  engine bridge, projection, mounted workbench, or canonical architecture work.

For long tasks, create and run a Dynamic workflow. Do not simulate long-running
work as one ordinary chat turn. Do not use `/goal` unless the user explicitly
asks for it.

## Boundary Setting

Before implementation starts, set a task boundary from current evidence. The
boundary must include:

- current verified state;
- dirty or uncommitted state;
- architecture drift, if any;
- one selected long-task target;
- allowed write surface;
- forbidden write surface;
- verification gates;
- commit or checkpoint expectation;
- stop conditions.

The selected target should be large enough to justify a Dynamic workflow and
small enough to produce verified commits.

Prefer targets that advance implementation. Tests are verification gates, not
the main product. Do not spend a round only expanding tests unless the test
directly proves or unlocks the selected development target.

## Non-Audit Development Contract

A Dynamic workflow run is invalid if it only performs discovery, audit,
verification, synthesis, or recommendation.

A valid long-task workflow must include a write-capable development lane unless
it stops as blocked, unsafe, or fully complete.

Baseline green is not a stopping condition. If preflight and verification are
green, select the next implementation target and make development progress.

A completed development round must produce at least one of:

- implementation change;
- removal of old architecture residue;
- canonical contract implementation;
- user-facing or runtime behavior improvement;
- focused guardrail tied directly to a concrete implementation target.

Test-only work is valid only when it unlocks or proves the selected
implementation target.

Do not report workflow success with only:

- drift audit;
- Exit Criteria audit;
- test matrix verification;
- synthesis of next-step recommendations;
- coverage gap list.

If no safe implementation target exists, stop as blocked and explain the missing
decision or unsafe state.

## Superpowers

Dynamic workflows own orchestration. Superpowers provide process discipline
inside the workflow.

Use relevant Superpowers when their trigger applies:

- use `superpowers:brainstorming` when changing architecture, product shape,
  user workflow, or behavior not already fixed by canonical docs;
- use `superpowers:writing-plans` when creating a multi-step or multi-agent
  implementation plan;
- use `superpowers:test-driven-development` when a behavior change can be proven
  by a focused test before implementation;
- use `superpowers:systematic-debugging` for failures, unexpected behavior,
  flaky verification, or unclear root cause;
- use `superpowers:verification-before-completion` before claiming a round,
  commit, or full workflow is complete.

Superpowers are quality gates, not the workflow plan. Do not let them turn the
run into audit-only or test-only work. Development progress remains the
mainline.

## Operating Mode

The workflow should discover current state, review prior development output with
zero trust, choose the next bounded development target, and then design its own
orchestration.

This skill defines invariants. The Dynamic workflow defines the actual plan.

The workflow must not choose a read-only audit plan when implementation progress
is safe. Discovery and verification are setup and gates for development, not the
main output.

Prefer development progress in these areas:

- Freeform v1 golden path;
- host-daemon broker routes;
- `worker_config` envelope / Host metadata schema;
- engine-projection receipts;
- engine-bridge invocation lifecycle;
- mounted workbench `router-mode="search"` proof;
- contract gaps tied to one of the above.

## Required Guards

The Dynamic workflow must enforce:

- zero-trust startup review from current files and commands;
- zero-trust completion review before reporting or committing;
- P0/P1 architecture drift is fixed before ordinary feature progress;
- workflow agents and subagents are bounded, joined, and not left as unmanaged
  background work;
- verified development progress is committed with conventional commits;
- unrelated user or concurrent-session changes are not staged;
- `git add .` is forbidden;
- no secret-bearing data is copied into descriptor, DB, receipt, log,
  diagnostic output, OpenAPI example, or UI.

## Round Invariants

The workflow may choose its own structure, but each completed round must leave
the repo easier to resume.

Each round must produce:

- evidence used to choose the target;
- implementation or architecture-residue removal, unless blocked;
- fresh verification evidence;
- zero-trust completion notes;
- joined or closed agent resources;
- a conventional commit for verified progress, unless unsafe;
- the next boundary or exact stop reason.

## Continuation

A completed slice, phase, test, or commit is not completion of the long task.

Continue while:

- canonical Exit Criteria are not satisfied;
- no user decision is required;
- repo and agent resource state are safe;
- run budget remains.

If the workflow stops before full completion, report why and provide a resume
prompt.

## Exit Criteria

The refactor is complete only when fresh evidence proves:

- canonical docs match the implemented architecture;
- Freeform v1 golden path is verified through CLI, Web, host-daemon, mounted
  workbench, and engine bridge;
- Host/Soul descriptor-only boundaries are enforced by tests;
- monorepo app/package/soul boundaries are enforced by tests;
- old app/package authority cannot return without failing guardrails;
- `docs:check`, `test:contracts`, and relevant slice verification pass;
- no P0/P1 architecture drift remains.
