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

- `paseo-daemon`: AIWorker prepares the workspace, then the target-side handoff follows Paseo’s native CLI flow from the workspace directory: install or verify `@getpaseo/cli`, run `paseo daemon status --home <paseo-home>` to confirm the effective Paseo home/status (default is `~/.paseo`), run `paseo daemon start --home <paseo-home>` when needed, then run `paseo daemon pair --home <paseo-home>` and open the printed pairing link in the Paseo frontend.
- `pairing-offer`: employee connects to a daemon through the real Paseo pairing link and opens the workspace path.
- `manual-path`: fallback instructions when a stable deep link is unavailable.

AIWorker may store the handoff reference and workspace path, but must not proxy workspace UI or session traffic.

## Secret boundary

AIWorker records secret references only. It must not write provider API keys into descriptors, assignment receipts, logs, diagnostics, OpenAPI examples, UI, or projected workspace files. Paseo/provider CLIs own provider authentication.
