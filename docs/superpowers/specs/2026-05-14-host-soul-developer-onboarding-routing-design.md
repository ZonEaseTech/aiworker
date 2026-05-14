# Host And Soul App Developer Routing Design

## Decision

Adopt a dual-route onboarding model for new AIWorker contributors and their
agents:

```text
Host work -> AGENTS.md -> docs/architecture.md -> aiworker-host-dev
  -> PMA + pma-bun/pma-web/pma-cr -> focused Host verification

Soul App work -> AGENTS.md -> docs/architecture.md -> aiworker-soul-app-dev
  -> app manifest/docs/files -> validate/smoke + focused app verification

Boundary questions -> AGENTS.md -> docs/architecture.md
  -> Host/Soul responsibility matrix -> matching skill
```

This keeps `docs/architecture.md` as the single architecture contract while
making task execution discoverable through agent-native skills.

## Current Findings

The current repository gives Soul App contributors a clearer route than Host
contributors:

- `AGENTS.md` and `docs/architecture.md` explain the Host/Soul App contract and
  current repository map.
- `docs/soul-app-developer.md` and `.agents/skills/aiworker-soul-app-dev` give
  Soul App authors an executable path.
- Host work is only indirectly routed through the implementation map and generic
  PMA stack skills. A new contributor can infer that `apps/api`, `apps/web`,
  `apps/cli`, `packages/core`, `packages/shared`, and
  `packages/storage-sqlite` are Host-facing, but there is no dedicated Host
  skill that explains read order, ownership, validation, or boundary pitfalls.
- The architecture contract is conceptually strong, but it is not yet mapped to
  an everyday "I need to change X" matrix for humans and agents.

The result is asymmetric onboarding: "I want to modify a Soul App" is guided;
"I want to modify Host behavior" still requires too much local inference.

## Goals

1. A new developer can quickly decide whether a change belongs to Host, a Soul
   App, or the shared protocol boundary.
2. A new agent can pick the correct skill before touching files.
3. Host platform work has an agent-native route comparable to Soul App work.
4. The Host/Soul App separation remains anchored in `docs/architecture.md`, not
   duplicated into a competing onboarding manual.
5. Verification guidance maps to the touched surface instead of always pushing
   root gates or relying on memory.

## Non-Goals

- Do not create a large `docs/developer-onboarding.md` portal in this slice.
- Do not resurrect `aiworker-validate` or old fleet/gateway validation modes.
- Do not modify runtime behavior, product UI, app manifests, API contracts, or
  database schema in this slice.
- Do not rewrite historical PMA records or changelog entries.

## Design

### 1. Add `aiworker-host-dev`

Create `.agents/skills/aiworker-host-dev/SKILL.md` as the Host-side counterpart
to `aiworker-soul-app-dev`.

The skill should trigger for Host platform work:

- `apps/api`: local daemon API, OpenAPI, Host routes, mounted service proxy.
- `apps/web`: Host Web Shell, Settings, worker/workspace/session workbench,
  shell header, drawers, app install/enable UX.
- `apps/cli`: daemon lifecycle, app install/enable, worker/workspace/session
  commands, bundled runtime entrypoints.
- `packages/core`: Host runtime, registry, brokers, identity, security review,
  engine adapter and provider registry.
- `packages/shared`: shared Host/Soul protocol types, manifest fixtures,
  registry projections and schemas.
- `packages/storage-sqlite`: Host metadata schema, repositories and migrations.
- `packages/component`, `packages/fs-layout`: shared UI primitives and Host
  filesystem layout.

It should instruct agents to:

- read `docs/architecture.md` first;
- classify the change as daemon/API, Web shell, CLI, core runtime, shared
  protocol, storage schema, or shared UI/layout;
- keep Host generic and avoid domain interpretation;
- route frontend work through `pma-web`, backend/runtime work through
  `pma-bun`, and review through `pma-cr`;
- synchronize zod/OpenAPI/client/test contracts for API changes;
- synchronize Drizzle schema/migration/tests for storage changes;
- verify with the smallest focused command set that proves the change.

### 2. Keep `aiworker-soul-app-dev` Narrow

Update `.agents/skills/aiworker-soul-app-dev/SKILL.md` only enough to make the
handoff explicit:

- If the requested change touches Host platform lifecycle, broker enforcement,
  Host shell rendering, daemon API, CLI lifecycle, shared storage schema, or
  security review, switch to `aiworker-host-dev`.
- Soul App work remains focused on app-owned domain state, standalone behavior,
  Host mounted handlers, app-owned descriptors, artifact schemas, review
  rubrics, prompts, packs and app-scoped broker use.

This prevents the Soul App skill from becoming a catch-all.

### 3. Update Active Entry Points

Update `AGENTS.md` so new agents see the split before reading implementation
details:

```text
Host platform / daemon / Web shell / CLI / broker / security -> aiworker-host-dev
Soul App / manifest / standalone / Host mounted / domain artifact -> aiworker-soul-app-dev
```

Update `README.md` with a short "Developer Route" table for humans:

| I want to change | Start here |
| --- | --- |
| Host daemon/API | `docs/architecture.md` + `aiworker-host-dev` |
| Host Web Shell | `docs/architecture.md` + `aiworker-host-dev` + `pma-web` |
| CLI lifecycle | `docs/cli.md` + `aiworker-host-dev` |
| Broker/security/storage/search | `docs/architecture.md` + `aiworker-host-dev` |
| Official HR/QA Soul App | `docs/soul-app-developer.md` + `aiworker-soul-app-dev` |
| New third-party Soul App | `aiworker app create` + `aiworker-soul-app-dev` |

Update `docs/architecture.md` with a compact "Development Entry Routing"
section that maps architecture ownership to repository paths and skills. This
keeps the architecture contract connected to daily execution without creating a
second contract.

### 4. Leave Historical References Alone

Historical PMA docs, changelog entries and old Superpowers specs may still
mention older flows. They are audit trail, not active guidance. Only active
entrypoints and current skills should be updated.

## Verification

This implementation is instruction/documentation-only. Required verification:

- Parse frontmatter for `aiworker-host-dev` and `aiworker-soul-app-dev`.
- Confirm the active entrypoints route Host and Soul App work to the correct
  skills with `rg`.
- Confirm `aiworker-validate` is not reintroduced.
- Run `git diff --check`.
- Skip code-review-graph with an explicit reason because no production code
  changes.

## Acceptance Criteria

- A new developer can answer "where do I start for Host work?" from
  `AGENTS.md` or `README.md`.
- A new developer can answer "where do I start for Soul App work?" from
  `AGENTS.md`, `README.md`, or `docs/soul-app-developer.md`.
- A new agent has separate Host and Soul App skills with clear trigger
  conditions.
- `docs/architecture.md` remains the single architecture contract and includes
  the Host/Soul route mapping.
- The implementation avoids creating a competing onboarding portal or reviving
  retired validation skills.
