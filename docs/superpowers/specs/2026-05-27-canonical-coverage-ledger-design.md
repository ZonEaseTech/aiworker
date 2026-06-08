# Canonical Coverage Ledger Design

Date: 2026-05-27 Asia/Shanghai
Branch: `codex/destructive-refactor`

## Authority

This file is a Superpowers design artifact. It is not an AIWorker architecture
authority. The active AIWorker architecture authority remains only:

- `docs/architecture.md`
- `docs/protocol.md`
- `docs/runtime.md`
- `docs/soul-authoring.md`
- `docs/testing.md`

`AGENTS.md` is the agent bootstrap for those contracts. `tmp/refactor/*` remains
evidence and decision staging input. A decision from `tmp/refactor/*` becomes
active authority only after it is represented in the canonical docs, guarded by
tests, or both.

## Goal

Prevent the accepted destructive-refactor architecture from drifting as future
agents work from the thinner canonical docs.

The design keeps the five canonical docs small, but adds an explicit coverage
ledger that maps the accepted `tmp/refactor/00-23` hard decisions to their
canonical home and verification guardrail.

## Scope

Included:

- audit accepted decisions in `tmp/refactor/00-23`;
- classify each hard decision as covered by canonical docs, covered by tests,
  covered by both, or still only present in `tmp/refactor`;
- update existing canonical docs with only the missing implementation-contract
  details that future agents need to avoid drift;
- update `AGENTS.md` with a short anti-drift rule;
- strengthen `docs:check` or architecture tests where a decision should be
  mechanically guarded.

Excluded:

- adding a sixth canonical architecture document;
- copying every temporary draft into `docs/`;
- changing product code as part of the documentation pass;
- reopening architecture decisions that `tmp/refactor/20-23` already closed;
- treating historical PMA, changelog, old E2E, or old local skills as authority.

## Proposed Approach

Use a hybrid documentation and test guardrail pass.

The canonical set stays five files. Instead of creating a large new contract
manual, each accepted decision is assigned to the existing canonical file that
already owns that topic:

- `docs/architecture.md`: product position, ownership, package boundaries, and a
  short decision coverage index.
- `docs/protocol.md`: descriptor v1, broker route methods, configuration
  envelope summary, mounted workbench, and app-owned API boundaries.
- `docs/runtime.md`: projection responsibility, runtime assets CRUD, session and
  invocation state, B+ bridge hard rules, lifecycle, cleanup, and redaction.
- `docs/soul-authoring.md`: 30-second authoring path, SDK conventions, build
  output, native MCP source layout, and Freeform v1 minimum source contract.
- `docs/testing.md`: the coverage ledger and the command/test guardrails that
  prove each decision.

`AGENTS.md` remains short. It should say that accepted `tmp/refactor` decisions
must not be implemented directly from `tmp`; if a future task depends on one,
the agent must first ensure the decision is represented in canonical docs or
tests.

## Coverage Model

The ledger uses four statuses:

- `docs+tests`: the preferred state for high-risk architecture boundaries.
- `docs-only`: acceptable for explanatory or low-risk guidance.
- `tests-only`: acceptable for mechanical constraints where docs would be noisy.
- `tmp-only`: not acceptable for closed hard decisions; these require promotion
  or an explicit note that the idea was exploratory and not accepted.

High-risk decisions should land in `docs+tests`, especially:

- Host is shell / locator / mount / bridge.
- Host/Soul is descriptor-only.
- production mounted workbench uses micro-app `router-mode="search"`.
- session lifecycle is `active | archived | deleted`.
- execution/process state lives in `engine_invocations`.
- follow-up uses `POST /api/sessions/:sessionId/invocations`.
- Host DB stores metadata and refs, not Soul domain records or engine secrets.
- native MCP files may contain author-owned literal secrets, but AIWorker must
  not copy secrets into descriptor, DB, receipt, logs, diagnostics, OpenAPI
  examples, or UI.
- `packages/core`, `packages/shared`, `core-v2`, `shared-v2`, and `apps/api`
  must not return as active ownership buckets.
- Freeform is the only strong v1 acceptance Soul.

Medium-risk decisions may be `docs-only` or `tests-only` depending on the
surface:

- full broker route method list;
- `worker_config.configValueJson` envelope fields;
- runtime skills/MCP/entry-file CRUD chain;
- engine bridge failure codes and allowed bridge event classes;
- projection freshness and receipt cleanup rules;
- SDK public authoring helper list.

## Drift Handling

If the audit finds an accepted decision that remains `tmp-only`, it should be
handled in one of three ways:

1. Promote it into the relevant canonical doc and add a focused guardrail when
   the decision affects code shape.
2. Keep it as evidence only and add a note in the ledger explaining why it is
   not active authority.
3. Flag it for user review if it appears accepted in one temporary draft but
   conflicts with the current canonical docs or implementation.

Future implementation work should not use `tmp/refactor/*` as a direct source of
truth. Temporary files can explain why a decision exists, but canonical docs and
tests define what agents may rely on.

## Verification

The documentation pass is complete only after:

1. The coverage ledger has no unexplained `tmp-only` accepted hard decisions.
2. `bun run docs:check` passes.
3. `bun run test:contracts` passes.
4. `git diff --check` passes.

Because this is docs and guardrail work, code-review-graph is not required
unless the implementation plan later touches product code.

## Handoff

After this design is approved, the next step is a Superpowers implementation
plan that lists the exact canonical doc sections, guardrail tests, and
verification commands. Product code changes stay out of scope unless the
coverage pass exposes a real contradiction that cannot be fixed by docs or
tests alone.
