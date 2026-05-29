---
name: aiworker-refactor-dev-loop
description: Use when continuing AIWorker destructive refactor work in Claude Code, canonical architecture migration, Freeform v1 progress, host-daemon/runtime/protocol/projection/engine-bridge work, checkpointed development, or multi-round goal continuation.
---

# AIWorker Refactor Dev Loop

Execute the loop. Do not explain the loop unless asked.

## Contract

- Mainline is development progress.
- Use current repo evidence before choosing work.
- Do not stop with only discovery, audit, verification, synthesis, status, or
  next-step advice when implementation is safe.
- Each round must produce implementation, old-architecture removal, canonical
  contract implementation, runtime/user behavior improvement, or a focused
  guardrail tied to the chosen target.
- Tests are gates. Test-only work is valid only when it proves or unlocks the
  chosen target.
- Commit verified progress with a conventional commit unless unsafe or
  explicitly forbidden.
- Never stage unrelated files. Never use `git add .`.
- If `/goal` is active, treat it as the outer loop and print evaluator-visible
  evidence: slice, files, verification, drift, commit, next target.
- If no goal is active, complete one checkpointed development round and report
  the next target.

## Start

Read:

- `AGENTS.md`
- `docs/architecture.md`
- `docs/protocol.md`
- `docs/runtime.md`
- `docs/soul-authoring.md`
- `docs/testing.md`

Run:

```bash
git status --short
bun run docs:check
bun run test:contracts
```

Treat memory, summaries, cached tests, stale agent claims, retired `tmp/refactor`
drafts, old E2E, old changelog, and historical local skills as untrusted. They
are evidence only, never authority.

Preserve user or concurrent-session changes.

## Mode

Default to normal Claude Code development.

Use Dynamic workflow only for inherently parallel work: broad independent audit,
large mechanical migration across disjoint surfaces, adversarial verification,
or cross-package research. A Dynamic workflow must still produce development
progress or an explicit blocker, and must not leave unmanaged agents.

## Drift

Fix P0/P1 drift before ordinary progress.

P0/P1 drift means any violation of current `AGENTS.md` or canonical docs,
especially Host/Soul descriptor-only boundaries, CLI-first shape,
apps/packages/souls monorepo ownership, protocol/runtime boundaries,
secret-handling rules, mounted workbench `router-mode="search"`, or resurrection
of `apps/api`, `apps/aiworker-*`, `packages/core`, `packages/shared`, `core-v2`,
or `shared-v2`.

## Select

Choose exactly one bounded target:

1. Freeform v1 golden path.
2. host-daemon broker routes.
3. `worker_config` envelope / Host metadata schema.
4. engine-projection receipts.
5. engine-bridge invocation lifecycle.
6. mounted workbench `router-mode="search"` proof.
7. contract gap tied to one item above.

Before editing, state target, allowed files/packages, forbidden files/packages,
verification commands, and expected commit scope.

## Execute

- Use available Superpowers for their trigger: brainstorming, writing-plans,
  test-driven-development, systematic-debugging,
  verification-before-completion.
- For behavior changes, write or update the focused contract test first when
  feasible.
- Implement the smallest passing change.
- Keep app code in `apps/*`, reusable capability in `packages/*`, and descriptor
  producing Soul products in `souls/*`.
- Keep UI on shadcn-managed primitives and shared `packages/ui`.
- Do not add scratch design notes to `docs/`; use `tmp/`.
- Do not copy secret-bearing data into persisted or displayed AIWorker outputs.
- Spawn subagents only for bounded sidecar work. Collect promptly. End no round
  with unmanaged agents or workflows.

## Verify

Run the smallest fresh verification that proves the touched surface.

For code changes, run code-review-graph unless unavailable. Skip it only for
docs-only, instruction-only, or pure formatting changes, and say why.

Before commit, confirm:

- changed files match the target;
- verification covers touched behavior;
- canonical docs remain authority;
- Host/Soul, protocol, runtime, monorepo, UI, and secret boundaries hold;
- unrelated files are unstaged;
- subagents/workflows are finished, stopped, or intentionally absent;
- all claims are backed by fresh output.

## Commit

After verification:

```bash
git add <only-current-slice-files>
git diff --cached --check
git commit -m "<conventional commit>"
```

Do not commit failed verification, mixed scope, unrelated staged files, or unsafe
changes.

## Report

End every round with:

- Preflight
- Slice
- Changes
- Verification
- Drift
- Commit
- Next

If `/goal` is active and Exit Criteria are not met, `Next` must be a bounded
implementation target.

## Exit

Long refactor completion requires fresh evidence that canonical docs match
implementation, Freeform v1 works through CLI/Web/host-daemon/mounted
workbench/engine bridge, descriptor-only and monorepo boundaries are tested,
old authority cannot return without failing guardrails, required verification
passes, and no P0/P1 drift remains.

Until then, one completed slice is progress, not completion.

After compaction, resume, interruption, or a new goal turn: restart at `Start`,
distrust stale context, re-check drift, choose the next bounded target, and
continue unless a user decision or unsafe state blocks work.
