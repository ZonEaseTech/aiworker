# Soul App Developer Guide Freeze Design

## Decision

Adopt the maximum anti-drift option: keep `docs/architecture.md#constraint-registry`
as the only active architecture contract, keep Host/Soul skills as thin routing
helpers, and freeze `docs/soul-app-developer.md` into a short temporary
quickstart stub.

Do not keep the current long Soul App authoring guide as an active explanatory
document. It contains many words that are individually guarded but collectively
invite agents to re-expand Host/Soul boundary semantics outside the architecture
contract.

## Current Findings

`docs/soul-app-developer.md` is not required by runtime code. Its active
references are documentation and doc-contract routing:

- `AGENTS.md` routes Soul App authoring to it.
- `README.md` and `README.zh-CN.md` list it as a Soul App authoring workflow.
- `docs/architecture.md` lists it as a thin reference for `SOUL-001` and
  `CONFIG-001`.
- `.agents/skills/aiworker-soul-app-dev/SKILL.md` includes it in Fit Check and
  Read Set.
- `scripts/check-doc-contract.ts` requires the file to exist and contain active
  contract details.

Historical PMA, Superpowers and changelog references are audit trail and should
not decide the active route.

The current guide repeats the right boundary in many places, but it also keeps
high-drift vocabulary close to active instructions: descriptor, compatibility,
generic worker-scoped options, MCP, provider, permission hints, review, memory,
and configuration. Those phrases make it too easy for an agent to rebuild a Host
configuration center even when each individual paragraph says not to.

## Goals

1. Reduce active Host/Soul boundary guidance to one normative source:
   `docs/architecture.md#constraint-registry`.
2. Keep `aiworker-host-dev` and `aiworker-soul-app-dev` as executable routing
   helpers, not parallel contracts.
3. Prevent `docs/soul-app-developer.md` from becoming a second architecture or
   protocol guide during product shaping.
4. Preserve a minimal human and agent pointer for `aiworker app create`,
   `aiworker app validate`, and `aiworker app smoke`.
5. Keep existing active entrypoints non-broken while changing their wording to
   mark the guide as frozen and non-normative.

## Non-Goals

- Do not remove Soul App authoring capability from the product.
- Do not change runtime behavior, manifests, schemas, scaffold output, API
  routes, storage, UI, or validation logic in this slice.
- Do not rewrite historical PMA, Superpowers, task, plan or changelog records.
- Do not design a complete third-party Soul App documentation portal now.
- Do not add new Host/Soul boundary rules outside `docs/architecture.md`.

## Design

### 1. Freeze `docs/soul-app-developer.md`

Replace the current long guide with a 40-80 line temporary stub. The stub should
say:

- the file is frozen during product shaping;
- it is not an architecture contract;
- the only active Host/Soul contract is `docs/architecture.md#constraint-registry`;
- agents should not expand descriptor, MCP, permission, provider, review,
  memory, Worker Configuration or Host/Soul boundary semantics here;
- use `aiworker app create`, `aiworker app validate`, and `aiworker app smoke`
  for the current authoring loop;
- current Soul App package shape is only a quick pointer:
  `soul-app.manifest.json`, `engine-assets/`, `product/`, `host-adapter/`.

This keeps the path alive for links while making the file a guardrail against
secondary-contract growth.

### 2. Thin `aiworker-soul-app-dev`

Keep the skill, but make it a short route:

- always start from `docs/architecture.md#constraint-registry`;
- use the frozen `docs/soul-app-developer.md` only as command and directory
  quick reference;
- classify whether the change belongs to app-owned domain surfaces, public
  authoring surfaces, shared protocol/schema, or Host-owned behavior;
- switch to `aiworker-host-dev` for Host platform lifecycle, daemon API, CLI,
  Worker Web Shell, storage metadata, Host runtime, registry, or Host/Soul
  protocol implementation;
- keep validation guidance focused on validate/smoke, focused tests, docs check,
  and code-review-graph only when production code changes.

The skill should avoid re-explaining descriptor, MCP/provider, Worker
Configuration and memory semantics except as negative routing warnings.

### 3. Thin `aiworker-host-dev`

Keep the Host skill as the Host route, but remove or narrow wording that sounds
like Host may generically model app configuration:

- avoid expanding "generic worker-scoped options/status" beyond the registry;
- say Host consumes only architecture-allowed declared surfaces;
- keep Worker Configuration guidance as "read `CONFIG-001` before touching this";
- keep verification tables because they help agents finish safely without
  inventing product behavior.

### 4. Update Active References

Update active references so they do not present `docs/soul-app-developer.md` as
a full workflow or contract:

- `AGENTS.md`: Soul App authoring starts from architecture and
  `aiworker-soul-app-dev`; the guide is a frozen quickstart pointer.
- `README.md` and `README.zh-CN.md`: label it as a temporary frozen quickstart,
  not the authoring workflow.
- `docs/architecture.md`: remove it from thin references or mark it as a
  non-normative quickstart pointer. Keep the registry as the only source of
  boundary truth.
- `scripts/check-doc-contract.ts`: keep the file in active docs only if it
  checks for the freeze declaration, architecture pointer and three commands.
  Stop requiring it to duplicate registry contract details.

### 5. Leave Historical References Alone

Do not edit `docs/superpowers/`, `docs/task/`, `docs/plan/` or
`docs/changelog.md` for old references unless a future cleanup explicitly
targets audit trail pruning. Those files are not active instructions.

## Alternatives Considered

### Delete The File Now

This is the strongest anti-drift move, but it creates avoidable link churn in
active entrypoints and `docs:check`. It also removes the chance to place a clear
"do not expand this into a second contract" warning at the exact path agents may
search for.

### Keep And Clean The Full Guide

This preserves authoring readability, but it leaves a long secondary document
beside the architecture contract. The current failure mode is not merely wrong
sentences; it is agents over-weighting long explanatory text and inventing
implementation direction from it.

### Freeze As A Stub

This is the recommended option. It preserves links and minimal authoring
commands while making the file explicitly non-normative and too small to become
an alternate product map.

## Verification

Implementation verification should include:

- `bun run docs:check`
- `git diff --check`
- `rg -n "docs/soul-app-developer.md.*workflow|authoring workflow|only active Host/Soul contract" AGENTS.md README.md README.zh-CN.md docs/architecture.md .agents/skills scripts`
- `rg -n "generic worker-scoped options|Host can display|MCP plumbing|provider|permission hints|review verdict|memory promotion" docs/soul-app-developer.md .agents/skills/aiworker-soul-app-dev/SKILL.md .agents/skills/aiworker-host-dev/SKILL.md`

Because the expected implementation is documentation and instruction only,
code-review-graph should be skipped unless production code changes are added
later. The final report should state that skip explicitly.

## Acceptance Criteria

- `docs/soul-app-developer.md` is short, frozen, and explicitly non-normative.
- Active docs point to architecture as the sole Host/Soul contract.
- The two AIWorker skills route work without duplicating product boundary
  semantics.
- `scripts/check-doc-contract.ts` enforces the frozen guide posture instead of
  requiring contract duplication inside the guide.
- No active entrypoint describes the guide as a full authoring workflow.
- Historical audit references remain untouched.
