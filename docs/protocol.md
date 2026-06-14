# AIWorker Protocol

AIWorker protocol is now a thin distribution protocol around Paseo workspace provisioning. There is no Worker runtime protocol, no session invocation protocol, and no AIWorker-rendered Workbench protocol.

## Stable records

```text
PaseoEnvironment
  environmentId
  ownerEmail
  targetRef
  paseoHome
  daemonEndpoint
  endpointKind
  isolation
  providerProfileIds[]

ProviderProfile
  id
  provider
  label
  baseUrl?
  model?
  secretRef?
  paseoProviderId?

SoulRelease
  id
  version
  displayName
  descriptorRef
  workspaceTemplateRoot

Assignment
  assignmentId
  assignedEmail
  environmentId
  soulReleaseRef
  providerProfileId
  workspaceRef
  status
  handoff?
```

## Assignment lifecycle

```text
draft -> provisioning -> workspace_projected -> handoff_ready -> ready
   \         \                    \                  \        \
    -> archived -> needs_attention -> revoked --------> archived
```

`ready` means AIWorker has prepared a Paseo workspace and handoff. It does not mean AIWorker can read sessions, logs, terminal output, or agent events.

## Handoff

Handoff is intentionally opaque and Paseo-native:

- `paseo-daemon`: CLI/app connects to a daemon endpoint and opens the workspace path. When AIWorker generates Paseo CLI commands, `--host` is Paseo’s external flag name for that endpoint.
- `pairing-offer`: employee connects to a daemon through Paseo relay offer and opens the workspace path.
- `manual-path`: fallback instructions when a stable deep link is unavailable.

AIWorker may store the handoff reference and workspace path, but must not proxy workspace UI or session traffic.

## Secret boundary

AIWorker records secret references only. It must not write provider API keys into descriptors, assignment receipts, logs, diagnostics, OpenAPI examples, UI, or projected workspace files. Paseo/provider CLIs own provider authentication.
