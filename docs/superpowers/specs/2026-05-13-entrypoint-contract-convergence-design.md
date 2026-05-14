# Entrypoint Contract Convergence Design

## Decision

AIWorker should converge active architecture entrypoints to two files:

```text
AGENTS.md
docs/architecture.md
```

`GOALS.md` should be removed as an active entrypoint. Its useful current content
must be folded into `docs/architecture.md`; stale or contradictory content must
be discarded.

The goal is not shorter documentation for its own sake. The goal is to prevent
agents and contributors from reading multiple competing contracts and drifting
back to an older Host-owned artifact/review/memory model.

## Why This Is Needed

The current entrypoint set is too broad:

- `AGENTS.md` points agents to both `GOALS.md` and `docs/architecture.md`.
- `GOALS.md` repeats architecture content and still frames Host as owning
  workspace/session runtime, artifact/review/memory and isolation brokers.
- `docs/architecture.md` still contains older sections where Host keeps artifact
  index, review/memory main storage and audit ownership.
- The new `aiworker-soul-app-dev` skill inherits the old read order by asking
  agents to read `GOALS.md`.

This conflicts with the newly accepted contract:

```text
Host is a platform locator, capability broker and shell contract.
Soul App is the source of truth for domain state and domain meaning.
Host may consume only protocol-exposed views, never infer Soul domain state.
```

## Target Roles

### AGENTS.md

`AGENTS.md` is the agent execution guide.

It should contain:

- the current product sentence;
- the only required architecture entrypoint: `docs/architecture.md`;
- the Soul App developer skill route;
- PMA, verification, shell, git and code-review rules;
- a compact implementation map.

It should not duplicate the full architecture.

### docs/architecture.md

`docs/architecture.md` is the single architecture contract.

It should contain:

- Host platform locator and capability shell contract;
- Soul App source-of-truth rule;
- Host/Soul App responsibility matrix;
- protocol-exposed views rule;
- HR people profile example;
- shell/header contract;
- must / should / must-not lists;
- current implementation map and verification guidance.

It should remove or rewrite sections that make Host the default owner of Soul
App domain state.

### GOALS.md

`GOALS.md` should be deleted.

Do not keep a redirect stub. A stub still functions as another active
entrypoint, which weakens the convergence.

Historical references in old PMA records and changelog entries can remain
because they describe past work. Active guidance should no longer require
`GOALS.md`.

## Active Reference Updates

The implementation must update active references away from `GOALS.md`:

- `AGENTS.md` required-reading list;
- `.agents/skills/aiworker-soul-app-dev/SKILL.md` read order and completion
  checklist;
- `docs/soul-app-developer.md` if its route language needs alignment;
- `README.md` or `docs/governance-node-status.md` when they present current
  entrypoints rather than historical context.

The implementation does not need to rewrite every historical PMA record or old
changelog paragraph that mentions `GOALS.md`.

## Architecture Rewrite Requirements

`docs/architecture.md` should be rewritten decisively around the current
contract:

```text
Host standardizes where Soul Apps live, how they are trusted, which platform
capabilities they may use, and how they appear in the local shell.

Soul App owns what its domain state means and how domain work is done.
```

Required corrections:

- Replace Host-owned artifact/review/memory main storage language with
  protocol-exposed view and optional platform service language.
- Replace "Host records/reviews domain artifacts" with "Host invokes or renders
  protocol views/actions under grant".
- Make storage, auth, connector, local MCP, default engine, theme, locale and
  preferences platform capabilities, not domain-state ownership.
- Make shell/header a contract where Soul App declares toolbar intent and Host
  may render it.
- State that Soul App not exposing a view means Host has nothing to fetch.
- Keep standalone and Host mounted modes equal in domain authority.

## Non-Goals

- No runtime implementation.
- No database migration.
- No API or protocol changes.
- No rewrite of historical PMA/changelog records.
- No new `apps/AGENTS.md`.
- No attempt to preserve `GOALS.md` as a compatibility alias.

## Acceptance Criteria

- `GOALS.md` is removed.
- `AGENTS.md` names `docs/architecture.md` as the single active architecture
  entrypoint.
- `docs/architecture.md` contains the Host platform locator / capability shell
  contract and no longer presents Host as the default owner of Soul App domain
  artifacts, reviews or memory.
- Active skill/docs references no longer require reading `GOALS.md`.
- Historical references are left alone unless they appear in active guidance.
- Changes are docs/instruction-only and pass `git diff --check`.
- code-review-graph is skipped with an explicit reason unless code files are
  changed.
