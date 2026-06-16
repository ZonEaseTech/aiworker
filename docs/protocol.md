# AIWorker Protocol

AIWorker protocol is now a thin distribution protocol around Paseo workspace provisioning. There is no Worker runtime protocol, no session invocation protocol, and no AIWorker-rendered Workbench protocol.

## Stable records

```text
PaseoEnvironment
  environmentId
  ownerEmail
  targetRef
  paseoHome              # metadata; default intent is $HOME/.paseo
  daemonEndpoint         # real endpoint or redacted/derived endpoint reference
  endpointKind           # local-home means HOME-derived local daemon, not a network URL
  isolation
  providerProfileIds[]

WorkspacePathPolicy
  kind=home-derived
  authority=aissh-execution-home
  workspaceName
  workspaceRoot=$HOME/aiworker-workspaces
  workspaceRef=$HOME/aiworker-workspaces/<workspaceName>

EndpointBinding
  bindingKind=home-derived-local-daemon | external-endpoint | opaque-pairing-offer
  endpointKind
  ref

ProviderReadinessPolicy
  kind=paseo-provider-json-v1
  providerId
  effect=non-blocking-warning
  providerListPredicate=warn if provider != providerId || status != "available" || enabled != "Enabled"
  modelListPolicy=not-collected-by-aiworker
  rawOutputPolicy=redacted-warning-only

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

`workspaceRef` remains a user-facing derived intent (`$HOME/...`) until the target shell resolves its canonical HOME. Consumers must not treat it as a caller-controlled absolute path. `daemonEndpoint=paseo-daemon:remote-home` is likewise a local-home binding marker, not a connectable network endpoint.

## Assignment lifecycle

```text
draft -> provisioning -> workspace_projected -> handoff_ready -> ready
   \         \                    \                  \        \
    -> archived -> needs_attention -> revoked --------> archived
```

`ready` means AIWorker has prepared a Paseo workspace and handoff. It does not mean AIWorker can read sessions, logs, terminal output, or agent events.

## Handoff

Handoff is intentionally opaque and Paseo-native:

- `paseo-daemon`: AIWorker prepares the workspace under the actual `aissh` execution identity. The operational `PASEO_HOME` is derived on target from canonical `$HOME/.paseo`, and the workspace path is derived from `$HOME/aiworker-workspaces/<workspace>`. The generated script starts/checks the HOME-bound daemon and provider readiness, but does not run `paseo daemon pair`; the handoff is an instruction to run `paseo daemon pair --home "$PASEO_HOME"` from the prepared workspace and open the printed link in Paseo.
- `pairing-offer`: employee connects to a daemon through a real Paseo pairing link. AIWorker treats any such link as opaque pairing material and must not persist or render the raw URL or QR.
- `manual-path`: fallback instructions when a stable deep link is unavailable.

AIWorker may store the redacted handoff reference and HOME-derived workspace intent, but must not proxy workspace UI or session traffic.

## Secret boundary

AIWorker records secret references only. It must not write provider API keys into descriptors, assignment receipts, logs, diagnostics, OpenAPI examples, UI, or projected workspace files. Paseo/provider CLIs own provider authentication. Provider readiness checks use the `paseo-provider-json-v1` contract as warning-only metadata: `paseo provider ls --json` may report whether the selected provider is available/enabled, but provider absence or login gaps do not block workspace projection. AIWorker does not call `paseo provider models` as a provisioning gate. Raw provider JSON, model lists, stderr, transcripts, pairing URLs, and QR codes must not be stored or shown.
