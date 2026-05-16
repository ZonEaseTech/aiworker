# Soul App Authoring Layout V2 Design

## Decision

Adopt a breaking Soul App authoring layout before 1.0.0. The new layout makes a
Soul App understandable as three explicit surfaces:

```text
Soul App = engine-facing assets + Soul-owned vertical product + Host protocol adapter
```

The goal is not directory aesthetics. The goal is to make a new app author open
`apps/<app-id>/` and immediately understand:

1. what the external engine will see and load;
2. how the vertical product workflow, artifacts, profiles, reviews and Web
   experience work;
3. how the app exposes mounted or standalone surfaces to Host;
4. which executable MCP capabilities are generic packages rather than private
   Soul workflow scripts.

AIWorker has not reached production stability, so this design intentionally
prefers a clean authoring model over compatibility with the current scattered
layout.

## Current Findings

The current official app layout works, but it is no longer the clearest shape
for vertical Soul App authoring:

```text
apps/aiworker-hr/
  capabilities/*/{prompt,review}.md
  review/*.md
  schemas/*.schema.json
  packs/*/SOUL.md
  skills/*/SKILL.md
  src/protocol/*.ts
  src/ui/*.tsx
```

This layout mixes four different concerns at the same level:

- engine-facing files such as native skills;
- product semantics such as capability prompts, artifact schemas and review
  policies;
- Host adapter code such as mounted protocol handlers;
- ordinary implementation files.

Recent HR work also introduced workspace-root `AGENTS.md`, `CLAUDE.md`,
`README.md`, `.gitignore` and evidence scaffolding through runtime code. That
was useful for proving the behavior, but Markdown instructions and workspace
seed files should be author-visible source assets, not TypeScript string
renderers.

Native skill projection already established the right direction:

```text
source asset -> engine-native projection target -> projection receipt
```

The v2 layout generalizes that direction across workspace files, skills and
future MCP client configuration while keeping executable MCP servers as generic
monorepo packages.

## Goals

- Make Soul App authoring easier to inspect, scaffold and validate.
- Move engine-facing static assets into a single app-owned source tree.
- Keep Soul product semantics separate from Host protocol adaptation.
- Extend `packages/shared`, `packages/soul-app-sdk`,
  `packages/soul-app-runtime` and `packages/core` so the layout is a real
  platform contract, not a folder-only convention.
- Keep the product path centered on vertical workflow closure:
  workspace -> session -> skill/action -> artifact -> review -> accepted
  profile or business state.
- Preserve the Host/Soul ownership model in `docs/architecture.md`.
- Phase the migration so each phase can be tested and shipped independently.

## Non-Goals

- Do not finish the full app migration in one commit or one implementation
  plan.
- Do not turn Host into a domain interpreter.
- Do not make MCP servers private to a single Soul workflow by default.
- Do not manage external engine auth files or user-level engine login state.
- Do not add cloud MCP hosting, remote sandboxing or third-party app isolation
  in this design.
- Do not keep the old scattered official app layout as a long-term documented
  authoring path.

## Target Layout

Official and newly scaffolded Soul Apps should converge on:

```text
apps/<app-id>/
  soul-app.manifest.json
  package.json
  tsconfig.json

  engine-assets/
    workspace/
      AGENTS.md
      CLAUDE.md
      README.md
      .gitignore
      evidence/
        README.md
    skills/
      <skill-id>/
        SKILL.md
    mcp-clients/
      codex/
        config.toml
      claude-code/
        .mcp.json

  product/
    workflows/
      <workflow-id>.md
    artifacts/
      schemas/
        <artifact-type>.schema.json
      templates/
        <artifact-type>.md
    reviews/
      <review-policy>.md
    profiles/
      <profile-type>.md
    web/
      routes/
      panels/
      components/

  host-adapter/
    protocol/
      artifact.ts
      connector.ts
      lifecycle.ts
      review.ts
      runtime.ts
      ui.ts
    mounted/
      host-mounted.ts
    standalone/
      standalone.ts

  migrations/
    *.sql
```

The top-level app manifest remains the app entrypoint. `package.json`,
`tsconfig.json` and database migrations stay top-level because they are package
and storage infrastructure, not product semantics.

## Surface Responsibilities

### Engine Assets

`engine-assets/` contains files that are intended to be seen by, loaded by or
projected into external engines.

`engine-assets/workspace/**` is projected one-to-one into each workspace root.
It owns workspace seed files such as `AGENTS.md`, `CLAUDE.md`, `README.md`,
`.gitignore` and lightweight evidence instructions. It may use documented
template variables such as `{{appId}}`, `{{workerName}}`, `{{soulId}}` and
`{{workspaceName}}`.

`engine-assets/skills/**/SKILL.md` is the canonical native skill source. It is
projected to engine-native locations such as:

```text
workspaceRoot/.agents/skills/<app-id>-<skill-id>/SKILL.md
workspaceRoot/.claude/skills/<app-id>-<skill-id>/SKILL.md
```

`engine-assets/mcp-clients/**` is a future source for engine-specific MCP client
configuration. It is not a raw one-to-one projection because each engine has a
different configuration surface. Codex, Claude Code and later engines need
target-specific adapters.

Engine assets must not contain secrets, connector credentials, bearer tokens or
engine auth material.

### Product

`product/` is the vertical product center. It owns workflow shape, artifact
schemas and templates, review policies, profile composition, Web product
experience and domain language.

Product files define meaning. For HR, this is where candidate profiles,
evidence review, interview preparation and hiring risk review live. For QA,
this is where release gates, regression matrices and go/no-go reviews live.

Host must not infer domain meaning from `product/` files. Product state reaches
Host only through manifest-declared protocol surfaces and descriptors.

### Host Adapter

`host-adapter/` contains the app boundary with Host:

- mounted protocol handlers;
- mounted service entrypoints;
- standalone runtime entrypoints;
- UI, artifact, review, connector, lifecycle and runtime protocol exports.

This layer adapts app-owned product semantics to Host-owned routing, shell,
broker and descriptor surfaces. It must not become the product center.

### MCP Packages

Executable MCP servers are monorepo packages, not app-local workflow files by
default:

```text
packages/
  mcp-ats/
  mcp-ci/
  mcp-calendar/
  mcp-github/
```

MCP server packages should be named by external system or generic capability,
not by Soul workflow. `packages/mcp-ats` is acceptable. A package named
`mcp-hr-candidate-screening` is not, because candidate screening meaning belongs
in the HR Soul App product layer.

Soul Apps may declare that they use a generic MCP package, but the package must
not import Soul App `src` or encode app-specific review decisions.

## Manifest Contract

The manifest must gain an `engineAssets` section. Initial v2 support covers
workspace files and skills. MCP client and server declarations belong to the
same section, but official apps must not declare them until Phase 4 adds the
matching runtime adapters and validation.

Recommended shape:

```json
{
  "engineAssets": {
    "workspace": {
      "source": "./engine-assets/workspace"
    },
    "skills": {
      "source": "./engine-assets/skills",
      "targets": ["codex", "claude-code"]
    },
    "mcpClients": [
      {
        "target": "codex",
        "source": "./engine-assets/mcp-clients/codex"
      },
      {
        "target": "claude-code",
        "source": "./engine-assets/mcp-clients/claude-code"
      }
    ],
    "mcpServers": [
      {
        "id": "ats",
        "package": "@zonease/aiworker-mcp-ats",
        "transport": "stdio",
        "requiredPermissions": ["connector:read:ats"]
      }
    ]
  }
}
```

`engineAssets.workspace.source` and `engineAssets.skills.source` are required for
official v2 apps. Third-party authoring may allow defaults in a later design,
but official apps are explicit.

## Projection Contract

Projection is a Host/runtime platform capability. It should be shared between
real Host runtime and `packages/soul-app-runtime` so standalone and mounted test
behavior matches production behavior.

Each projection run writes a generated receipt:

```text
workspaceRoot/.aiworker/projections.json
```

The receipt records:

- app id;
- projection kind: `workspace-file`, `native-skill`, `mcp-client`;
- source path;
- target path;
- sha256 digest;
- engine target when relevant;
- generated timestamp.

`.aiworker/` remains runtime-owned generated state. It is not an authoring source
directory. Source files live under the Soul App or MCP packages; `.aiworker/`
records what was projected and why.

Projection rules:

- Workspace files are one-to-one projections from
  `engine-assets/workspace/**`.
- Native skills fan out from `engine-assets/skills/**/SKILL.md` to
  engine-native skill directories.
- MCP client config uses engine-specific adapters.
- Runtime may update files it owns according to the projection receipt.
- Runtime must not silently overwrite user-authored files that are not recorded
  as generated by AIWorker.
- Runtime must never project secrets or engine auth material.

## Package-Level Changes

### `packages/shared`

`packages/shared` owns the manifest schema and exported types:

- add `engineAssets` schema;
- add engine target enum with initial values `codex` and `claude-code`;
- add projection receipt schema;
- add validation issue codes for missing engine assets, unsafe paths and
  unsupported engine targets;
- update manifest tests and official fixtures.

### `packages/soul-app-sdk`

`packages/soul-app-sdk` owns authoring helpers and type-safe app definitions:

- re-export `engineAssets` manifest types;
- provide helpers for defining engine asset declarations;
- keep broker clients and Web Storage helpers unchanged;
- do not perform file projection or engine config writes from SDK code.

The SDK describes and validates author intent. It does not own Host runtime
materialization.

### `packages/soul-app-runtime`

`packages/soul-app-runtime` owns standalone and mounted test parity:

- accept an app source root for file-backed app definitions;
- materialize `engineAssets.workspace` and `engineAssets.skills` when creating
  test or standalone workspaces;
- write `.aiworker/projections.json`;
- fail tests when manifest refs point to missing v2 assets.

This keeps app-local runtime behavior aligned with real Host runtime behavior.

### `packages/core`

`packages/core` owns real Host/runtime projection:

- discover enabled app source roots from registry records;
- project workspace files and skills during workspace creation and repair;
- write and read `.aiworker/projections.json`;
- enforce safe overwrite rules;
- keep Host generic and avoid interpreting product files.

Existing native skill projection should be folded into the new projection
service instead of living as a separate one-off mechanism.

## Phased Migration

### Phase 1: Engine Assets Foundation

Scope:

- add `engineAssets.workspace` and `engineAssets.skills` to shared schema;
- add the shared projection receipt shape;
- move HR workspace seed files to `apps/aiworker-hr/engine-assets/workspace`;
- move HR native skills to `apps/aiworker-hr/engine-assets/skills`;
- update core and soul-app-runtime projection;
- replace hardcoded workspace Markdown renderers with file-backed templates;
- write `.aiworker/projections.json` for workspace files and skills.

Success criteria:

- creating an HR workspace projects `AGENTS.md`, `CLAUDE.md`, `README.md`,
  `.gitignore`, `evidence/README.md` and native skills from `engine-assets`;
- focused core runtime tests and soul-app-runtime tests pass;
- HR app validation accepts the v2 engine asset layout;
- the old `apps/aiworker-hr/skills` path is no longer the documented source.

### Phase 2: Product Layout Migration

Scope:

- move HR and QA product-owned files into `product/`;
- update manifest refs for capability prompts, review rubrics, artifact schemas,
  artifact templates, profiles and Web product files;
- update validation and smoke tests;
- keep product workflow closure visible in HR and QA.

Success criteria:

- app authors can find workflow, artifact, profile, review and Web product
  assets under `product/`;
- HR and QA validate and smoke successfully;
- Host still consumes only manifest/protocol-exposed surfaces.

### Phase 3: Host Adapter Layout Migration

Scope:

- move protocol handlers and mounted/standalone entrypoints into
  `host-adapter/`;
- update manifest `exports`, `api`, `modes` and local service refs;
- keep the Host mounted protocol unchanged at runtime.

Success criteria:

- a reader can distinguish product code from Host adapter code;
- standalone and Host mounted smoke pass for HR and QA;
- no Soul App production code imports Host private packages.

### Phase 4: MCP Client And Server Contract

Scope:

- add MCP client target adapters for Codex and Claude Code;
- define generic `packages/mcp-*` package conventions;
- allow Soul App manifests to declare required MCP servers and permissions;
- project client config only when the selected engine target supports it.

Success criteria:

- MCP servers are generic packages named by capability or external system;
- Soul Apps declare MCP usage without encoding workflow meaning in MCP packages;
- generated engine client config contains no secrets.

### Phase 5: Scaffold, Docs And Legacy Removal

Scope:

- update `aiworker app create`;
- update `docs/soul-app-developer.md`;
- update SDK README and runtime examples;
- update validator messages to point to v2 layout;
- remove old official app layout examples from active docs.

Success criteria:

- a new app scaffold uses the v2 layout;
- active docs do not teach the old scattered layout as the default;
- existing historical PMA and changelog entries remain audit trail only.

## Validation Strategy

Each phase needs focused verification:

- shared manifest schema tests;
- SDK type and helper tests;
- soul-app-runtime standalone and mounted runtime tests;
- core workspace projection tests;
- `aiworker app validate` and `aiworker app smoke` for official apps;
- `scripts/check-soul-app-boundaries.ts`;
- `git diff --check`;
- code-review-graph for production code changes.

Full root gates are reserved for phases that touch shared contracts, runtime,
CLI validation behavior or official app references across packages.

## Risks And Controls

Risk: the migration becomes a broad directory shuffle without product value.

Control: every phase must preserve or improve the vertical product loop from
workspace to reviewed artifact/profile state.

Risk: Host starts interpreting product files because they are easier to read.

Control: Host may project files and consume manifest/protocol descriptors, but
must not infer domain meaning from `product/`.

Risk: MCP servers become private Soul workflow implementations.

Control: MCP packages are named by external system or generic capability.
Workflow meaning stays in the Soul App product layer.

Risk: v2 and legacy layouts coexist too long.

Control: temporary compatibility is allowed only inside migration phases. Active
docs, scaffold and official examples must converge to v2.

Risk: engine-specific client config changes break user auth or global engine
profiles.

Control: AIWorker projects workspace-local config only when the engine target is
explicitly supported. It does not manage external engine login state or write
secrets.

## Acceptance Criteria

- The v2 layout is documented as the default Soul App authoring model.
- `engine-assets`, `product` and `host-adapter` have distinct responsibilities.
- `packages/shared`, `packages/soul-app-sdk`, `packages/soul-app-runtime` and
  `packages/core` all participate in the contract.
- HR migrates first without breaking the current profile-ledger product loop.
- QA migrates after the product layout is proven.
- MCP servers are treated as generic monorepo packages, not Soul-private
  workflow scripts.
- The final scaffold no longer teaches the pre-v2 scattered layout.
