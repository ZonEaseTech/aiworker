# Host Platform Locator and Capability Shell Design

## Decision

AIWorker Host should be treated as a **platform locator and capability shell**,
not as the owner of Soul App domain data.

The core contract is:

```text
Host standardizes where Soul Apps live, how they are trusted, which platform
capabilities they may use, and how they appear in the local shell.

Soul App owns what its domain state means and how domain work is done.
```

This preserves standalone Soul App autonomy while still giving Host a necessary
product role.

## Why Host Exists

If every Soul App can run standalone, Host is only justified when it provides
standardized platform capabilities that would be wasteful, unsafe, or confusing
for every app to rebuild independently.

Host exists to provide:

- app lifecycle: install, enable, disable, launch, health, compatibility and upgrade;
- identity and security: Logto/Auth, user/org/team/session identity, grants and claims;
- platform capability brokers: storage, connector secrets, local MCP, default engine,
  theme, locale and user preferences;
- shell contract: app switcher, outer layout, global settings, permission indicators
  and mounted surface containers;
- protocol registry: manifest discovery, exposed views/actions/search providers and
  settings panels;
- permissioned invocation: scoped identity/grant context for mounted protocol calls.

Host does not exist to centralize HR, QA, finance, legal or other vertical domain state.

## Source Of Truth

The source-of-truth rule is:

```text
Soul App is the source of truth for domain state.
Host is the source of truth for platform capabilities, grants and shell context.
Host may consume only protocol-exposed views, never infer Soul domain meaning.
```

For HR:

- HR app owns people profile state, profile composition, candidate review meaning
  and HR memory candidate meaning.
- Host owns who can access HR app, which platform capabilities HR app may use,
  how HR app is launched, and how HR app appears in the local shell.

## Responsibility Matrix

| Area | Host owns | Soul App owns |
| --- | --- | --- |
| App lifecycle | install, enable, disable, launch, health, compatibility | manifest, service, standalone and mounted entrypoints |
| Auth | Logto/Auth, user/org/team/session, grants, claims | permission declaration, identity-context consumption |
| Storage | S3/GCP/local provider, namespace, grant, object ref | object meaning such as resume, profile, evidence, report |
| Secrets and connectors | vault, connector auth, broker, platform audit | connector needs and broker requests |
| Config | theme, locale, default engine, local MCP, preferences | Host context consumption and standalone fallback |
| Shell layout | outer shell, app switcher, user menu, global settings, permission indicator | domain navigation, toolbar intent, drawer intent |
| Header actions | render standard slots and layout-level actions | primary action, domain actions, search provider, app settings intent |
| Search | global search shell and provider registry | registered search provider and domain result semantics |
| Artifact | optional protocol-exposed summary/cache only | content, schema, composition, domain lifecycle |
| Review | optional review/admission service interface | review rubric, review meaning, review result source |
| Memory and lesson | optional org-level admission, namespace and provenance envelope | candidate lesson meaning and submission logic |
| Audit and logs | platform audit for install, grant, launch, broker and protocol calls | domain audit such as profile merged or candidate reviewed |
| Cross-app orchestration | protocol-only orchestration over exposed views/actions | deciding which objects/actions can be shared |
| Protocol | version, discovery, permission contract | implementation and domain-specific views/actions |

## Protocol Rule

Host must not read Soul App internal state. Host only reads what a Soul App
explicitly declares and exposes through Soul App Protocol, and only after the
operator grants the required permission.

Mounted mode means:

```text
Host shell
  -> reads manifest
  -> grants identity/config/storage/connector claims
  -> renders app-declared shell slots
  -> calls app protocol views/actions
  -> app remains domain source of truth
```

Mounted mode does not mean the app's data becomes Host-owned state.

If a Soul App does not expose artifacts, review status, memory candidates, search
providers or actions, Host should not fetch them and should not infer them.

## HR People Profile Example

Inside HR app:

```text
resume + interview-note + ats-record + reference-check
  -> HR composition logic
  -> people profile
```

Host does not know why those inputs form a valid people profile. Host does not
merge profile fields, score candidate risk, decide profile completeness, or
interpret HR review meaning.

HR app may expose a protocol view:

```text
peopleProfiles.summary:
  profileId
  title
  summary
  status
  updatedAt
  openAction
  permissionRequired
```

Host can render or search that view only because HR app exposed it. The view is
a protocol view, not Host's authoritative HR database.

## Header And Shell Contract

Host owns the outer shell, not the domain header meaning.

Soul App should declare toolbar intent:

```text
primaryAction: createPeopleProfile
actions: refresh, toggleEvidenceDrawer, openHrSettings
searchProvider: peopleProfileSearch
```

Host may render those declarations into a standard header. Host must not treat
the rendered button as Host-owned HR behavior. In standalone mode, the same
toolbar descriptor can be rendered by the Soul App's own shell.

## Host Must

- Provide app lifecycle management.
- Provide identity, security and permission grants.
- Provide platform capability brokers.
- Provide shell and mounted surface contracts.
- Provide protocol discovery and permissioned protocol invocation.
- Preserve standalone compatibility for mounted Soul Apps.

## Host Should

- Provide global search only through Soul App search providers.
- Provide cross-app orchestration only through protocol-exposed views/actions.
- Provide shared review/admission only as an optional service interface.
- Record platform audit for platform actions.
- Cache protocol views only as non-authoritative cache with source and freshness.

## Host Must Not

- Own Soul App domain state.
- Define vertical schemas such as profile, candidate, release or defect.
- Provide HR, QA, legal, finance or ops composition endpoints.
- Directly read or write Soul App databases or app-local workspaces.
- Treat artifact, review or memory as Host default main data.
- Infer lesson or memory from app internals.
- Force every app-local action through Host.
- Treat mounted Soul App as a Host module.
- Let shell layout become the owner of domain UI meaning.
- Sacrifice standalone behavior for Host consistency.

## Non-Goals

- No runtime or protocol implementation in this design.
- No migration plan for current artifact/review/memory storage in this design.
- No new marketplace, remote control plane, gateway or fleet concept.
- No `apps/AGENTS.md` rule surface change.

## Acceptance Criteria

- Host is described as platform locator, capability broker and shell contract.
- Soul App remains source of truth for domain state and domain meaning.
- Artifact, review, memory, audit and search are protocol-exposed views or
  optional services, not Host-owned defaults.
- HR people profile composition is explicitly Soul App-owned.
- Header actions are app-declared toolbar intent rendered by Host, not Host-owned
  domain actions.
- Any future Host metadata field must be justified by a Host platform capability:
  lifecycle, security, grant, broker, shell, protocol discovery, permissioned
  invocation or non-authoritative cache.
