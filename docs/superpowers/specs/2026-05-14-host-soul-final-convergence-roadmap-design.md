# Host / Soul App final convergence roadmap

## Decision

The final convergence target is:

```text
Host = platform locator + capability broker + security layer + shell contract
Soul App = standalone vertical product + mounted protocol service + domain owner
```

Host must be useful because it provides standard location, identity/security,
platform capabilities, shell context and audited invocation. Soul Apps must be
useful without Host because they own vertical product behavior, domain state and
domain meaning.

## Current Baseline

Completed milestones:

- Official Soul Apps live under `apps/aiworker-*` and are installed/enabled into
  Host instead of being built in.
- Host discovers manifests and mounted surfaces.
- Host shell renders app-declared action/search/settings descriptors.
- Host invokes action/search only through generic protocol endpoints.
- Descriptor `requiredPermissions` are broker-enforced before mounted invocation.
- Host-private and sibling app imports are guarded by validation/lint.

## Final Acceptance

The architecture is considered converged when:

1. Host-owned platform capabilities are exposed through typed broker/provider
   contracts, not direct app imports or domain-specific Host routes.
2. Soul Apps can use Host storage/connector/audit/memory/search capabilities
   through SDK/broker calls while preserving standalone behavior.
3. HR/QA reference apps prove app-owned minimal persistence, search and action
   flows without Host understanding people profile or release gate fields.
4. Install/enable surfaces expose permission requirements and refuse mismatched
   grants before app code runs.
5. Shell layout remains generic: app descriptors configure title, primary
   action, search, actions, settings and drawer intents.
6. Future Logto, S3/GCP bucket, secret vault and connector integrations can be
   implemented as Host providers behind the same broker boundary.

## Implementation Sequence

### FEAT-075 Storage broker provider and app-owned drafts

Make storage a provider interface in Host/core. Keep SQLite as the default local
provider. Make HR/QA mounted create actions write app-owned draft records through
the public broker SDK.

This proves that Host provides storage while Soul Apps own content meaning.

### FEAT-076 Permission visibility and install/enable review

Expose app permissions, required connector needs and shell descriptor
`requiredPermissions` in Host UI before enabling an app. Keep the action generic:
enable/disable/review permissions, not HR/QA-specific approvals.

### FEAT-077 Broker provider registry

Introduce provider metadata for storage, connectors, audit and secrets:
`local-sqlite`, future `s3`, future `gcp-bucket`, future `vault-ref`. Do not
add cloud SDKs until the provider contract and local implementation are stable.

### FEAT-078 Identity boundary

Add a Host auth provider interface suitable for Logto integration. Keep the
first local implementation compatible with current bearer-token behavior. Soul
Apps receive operator identity and grants through signed mount context and
broker scope only.

### FEAT-079 App-owned search/index broker

Let Soul Apps optionally push non-authoritative search descriptors to a Host
index broker. Host indexes titles/summaries/references only; Soul Apps still own
query semantics and domain result meaning.

## Non-Goals

- Do not make Host create HR people profiles or QA release gates.
- Do not add app-specific Host API branches.
- Do not import Host private packages from Soul Apps.
- Do not add real Logto, S3, GCP or vault dependencies before local provider
  contracts are proven.
