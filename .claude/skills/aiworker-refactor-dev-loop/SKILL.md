---
name: aiworker-refactor-dev-loop
description: Use when continuing AIWorker destructive refactor work in Claude Code, canonical architecture migration, Freeform v1 progress, host-daemon/runtime/protocol/projection/engine-bridge work, checkpointed development, or multi-round continuation.
---

# AIWorker Refactor Claude Dev Loop

This skill keeps Claude Code on a checkpointed development loop for AIWorker
refactor work.

It is not an architecture authority. It is not a fixed workflow plan. It decides
whether the current task should use the normal Claude Code development loop or a
Dynamic workflow. The normal development loop is the default.

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

## Execution Mode Selection

Do not create a Dynamic workflow merely because the task is long.

Default to the normal Claude Code development loop for:

- implementation;
- refactor;
- API or runtime changes;
- focused tests;
- verification;
- conventional commits;
- one-package or few-package development slices.

Use a Dynamic workflow only when current evidence shows the selected task is
inherently parallel, mechanical, or cross-check heavy, such as:

- broad independent codebase audit;
- large mechanical migration across disjoint write surfaces;
- adversarial verification where independent agents materially reduce risk;
- cross-package research where many independent findings must be reconciled.

If unsure, choose the normal development loop.

Goal mode is an outer session contract, not an execution mode this skill turns
on or off.

- If the user starts Claude Code with `/goal`, obey the active goal and make
  each round produce transcript-visible evidence the goal evaluator can judge.
- If no goal is active, run one checkpointed development round and report the
  next target.
- Do not clear, ignore, or work around an active goal unless the user explicitly
  asks.

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

Long tasks require checkpointed progress, not automatic Dynamic workflows. For
long tasks, choose the execution mode from current evidence, then run the
development mainline below.

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

The selected target should be small enough to produce verified commits.

Prefer targets that advance implementation. Tests are verification gates, not
the main product. Do not spend a round only expanding tests unless the test
directly proves or unlocks the selected development target.

## Development Mainline

Every run must move through this chain unless blocked or explicitly asked for
status, audit, review, or planning only:

1. zero-trust preflight;
2. choose one bounded implementation target;
3. implement or remove old architecture residue;
4. run fresh verification;
5. perform zero-trust completion review;
6. create a conventional commit for verified progress, unless unsafe;
7. report the next target or exact stop reason.

If preflight finds no P0/P1 drift, select the next implementation target and
make development progress.

## Non-Audit Contract

A run is invalid if it only performs discovery, audit, verification, synthesis,
or recommendation.

A valid long-task run must include write-capable development work unless it
stops as blocked, unsafe, or fully complete.

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

Do not report run success with only:

- drift audit;
- Exit Criteria audit;
- test matrix verification;
- synthesis of next-step recommendations;
- coverage gap list.

If no safe implementation target exists, stop as blocked and explain the missing
decision or unsafe state.

## Superpowers

Superpowers provide process discipline inside the selected execution mode.

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
  commit, or long task is complete.

Superpowers are quality gates, not an excuse to stop at audit-only or test-only
output. Development progress remains the mainline.

## Operating Mode

The selected execution mode should discover current state, review prior
development output with zero trust, choose the next bounded development target,
and then execute.

This skill defines invariants. The selected execution mode defines the concrete
plan.

Do not choose a read-only audit plan when implementation progress is safe.
Discovery and verification are setup and gates for development, not the main
output.

Prefer development progress in these areas:

- Freeform v1 golden path;
- host-daemon broker routes;
- `worker_config` envelope / Host metadata schema;
- engine-projection receipts;
- engine-bridge invocation lifecycle;
- mounted workbench `router-mode="search"` proof;
- contract gaps tied to one of the above.

## Required Guards

Every execution mode must enforce:

- zero-trust startup review from current files and commands;
- zero-trust completion review before reporting or committing;
- P0/P1 architecture drift is fixed before ordinary feature progress;
- agents and subagents are bounded, joined, and not left as unmanaged
  background work;
- verified development progress is committed with conventional commits;
- unrelated user or concurrent-session changes are not staged;
- `git add .` is forbidden;
- no secret-bearing data is copied into descriptor, DB, receipt, log,
  diagnostic output, OpenAPI example, or UI.

## Round Invariants

The selected execution mode may choose its own structure, but each completed
round must leave the repo easier to resume.

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

If the run stops before full completion, report why and provide a resume prompt.

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
