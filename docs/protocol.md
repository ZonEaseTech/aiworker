# AIWorker Protocol

AIWorker protocol is now a thin distribution protocol around Paseo Project workdir provisioning. There is no Worker runtime protocol, no session invocation protocol, and no AIWorker-rendered Workbench protocol.

## Stable records

```text
PaseoEnvironment
  environmentId
  ownerEmail              # logical owner/admin of target aissh execution identity
  topologyKind            # owner-scoped-paseo-home-v1 (only legal value; abolished legacy-home-derived strings migrate-on-read to this)
  dedication?             # assigned-user-dedicated assertion for stronger isolation
  targetRef
  paseoHome              # ALWAYS $HOME/.aiworker/<userSlug>/.paseo; AIWorker never derives bare $HOME/.paseo
  daemonEndpoint         # real endpoint or redacted/derived endpoint reference
  daemonListenRef        # default 127.0.0.1:<stable-user-port>
  daemonHostRef          # default 127.0.0.1:<stable-user-port>
  endpointKind           # unix by default; tcp requires explicit listen+host refs
  isolation
  providerProfileIds[]

WorkspacePathPolicy
  kind=project-workdir
  authority=aissh-execution-home
  topologyKind=owner-scoped-paseo-home-v1
  ownerEmail             # target owner/admin
  assignedEmail
  ownerRoot=$HOME/.aiworker/<userSlug>
  paseoHome=$HOME/.aiworker/<userSlug>/.paseo
  runDir=$HOME/.aiworker/<userSlug>/run
  daemonListenRef=127.0.0.1:<stable-user-port>
  daemonHostRef=127.0.0.1:<stable-user-port>
  projectName
  projectRef=$HOME/.aiworker/<userSlug>/projects/<projectName>
  projectRoot=$HOME/.aiworker/<userSlug>/projects
  userSlug
  workspaceName
  workspaceRoot=$HOME/.aiworker
  workspaceRef=$HOME/.aiworker/<userSlug>/projects/<workspaceName>

EndpointBinding
  bindingKind=owner-scoped-local-daemon | home-derived-local-daemon | external-endpoint | opaque-pairing-offer
  endpointKind
  ref
  listenRef?
  hostRef?
  ownerRoot?

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
  projectRef
  workspaceRef
  status
  handoff?

PaseoOwnershipAssertion
  kind=target-owner-matches-assigned-user | dedicated-target-asserted | owner-scoped-shared-home
  assignedEmail
  environmentOwnerEmail
  topologyKind
  userSlug
  dedicatedTarget

ProvisionReceipt
  status=planned | applied | failed
  assignment tuple
  topologyKind
  targetOwnerEmail
  assignedEmail
  paseoHome
  ownerRoot
  runDir
  projectRoot
  daemonListenRef
  daemonHostRef
  projectRef
  workspaceRef
  handoffKind
  handoffState=instruction-only
  workspacePathPolicy
  endpointBinding
  environmentOwnerEmail?
  ownershipKind?
  dedicatedTarget?
  userSlug?
  providerReadinessPolicy
  providerReadinessEffect=non-blocking-warning
  providerWarning?
  redacted aissh invocation with generated script body omitted in persisted records
```

`projectRef` is the primary user-facing derived intent (`$HOME/...`) until the target shell resolves its canonical HOME. `workspaceRef` remains as a compatibility alias for the same Project workdir. Consumers must not treat either value as a caller-controlled absolute path. New writes use the owner-scoped Project path. Legacy `$HOME/.paseo`, `daemonEndpoint=paseo-daemon:remote-home`, and `$HOME/.aiworker/<userSlug>/<project>` records may load for display, but must not be automatically migrated or used as the new default.

`assignedEmail` owns the derived `$HOME/.aiworker/<userSlug>` scope. `PaseoEnvironment.ownerEmail` owns/administers the target execution identity and may differ from `assignedEmail` under `owner-scoped-shared-home`. `--dedicated-target-user` records `dedication.kind=assigned-user-dedicated` when the target execution identity is explicitly dedicated to the assigned user. Legacy v1 records may omit ownership receipt fields and still load, but live apply/pair paths must receive an explicit `--target-owner` or `--dedicated-target-user` assertion before invoking `aissh`.

AIWorker home 在任何机器上都是 `~/.aiworker`（`AIWORKER_HOME` 覆盖）。中心机角色把 management-plane SoT 默认落在 `~/.aiworker/control-plane`（`snapshot.json` + append-only `*.jsonl` receipts/audit/projection）；目标机角色对每个员工派生 `~/.aiworker/<userSlug>` owner-scoped 子树。`userSlug` 直接落在 home 顶层并受保留名守卫保护（`control-plane` / `config` / `cache` / `run` / `projects` / `paseo` / `.paseo`），防止员工 slug 撞上 home 结构段或中心 control-plane。`paseoHome` 因此恒为 `$HOME/.aiworker/<userSlug>/.paseo`，AIWorker 绝不派生裸 `$HOME/.paseo`。

## Create command face

AIWorker CLI 是 AIWorker-owned 元数据的唯一写者。管理员既可用 CLI 直接写，也可经 AIWorker Web 发起；Web 不持有自己的 snapshot source of truth，而是 spawn 同一套 `aiworker` create/edit 命令代写：

```text
aiworker environment create   # PaseoEnvironment（targetRef / paseoHome intent / daemon refs / isolation）
aiworker provider create      # ProviderProfile（provider / label / baseUrl? / model? / secretRef?）—— 只写 secret:// 引用
aiworker soul release register # SoulRelease（version / descriptorRef / workspaceTemplateRoot）—— register 已 build 的 release，非 authoring
aiworker assignment create    # Assignment（assignedEmail + environmentId + soulReleaseRef + providerProfileId + projectRef）
```

create 命令是 environment / provider / soul release 的唯一写者；它写入 admin-owned 字段（user / refs / labels / secretRef），不写 derived 字段。

## Read-or-derive ownership

被引用实体遵循 read-or-derive 所有权契约：

- **admin-owned 字段**（user、refs、labels、`secretRef`）只由对应 create/edit 命令写入。
- **derived 字段**（handoff、status、receipts、`paseoHome` 等运行派生值）由 plan/apply 派生，不由 admin 直接编辑。
- `plan` / `apply` 对被引用的 environment / provider / soul release 遵循「已存在则读取保留、缺失才 re-derive」：不覆盖 create 命令写入的 admin-owned 字段，只在缺失时重新派生 derived 字段。

provider create 仍只接受 `secret://` 引用，绝不接受 literal secret；read-or-derive 不会把任何 literal provider key 引入 descriptor、DB、receipt、log 或 projected workdir。

## Assignment lifecycle

```text
draft -> provisioning -> workspace_projected -> handoff_ready -> ready
   \         \                    \                  \        \
    -> archived -> needs_attention -> revoked --------> archived
```

`ready` means AIWorker has prepared a Paseo Project workdir and handoff. It does not mean AIWorker can read sessions, logs, terminal output, or agent events.

## Handoff

Handoff is intentionally opaque and Paseo-native:

- `paseo-daemon`: AIWorker prepares the Project workdir under the actual `aissh` execution identity. The operational `PASEO_HOME` is derived on target from canonical `$HOME/.aiworker/<userSlug>/.paseo`, the daemon listen/host ref is a stable loopback TCP endpoint derived from `userSlug`, and the Project path is `$HOME/.aiworker/<userSlug>/projects/<project>`. The generated script starts/checks the owner-scoped daemon and provider readiness, but does not run `paseo daemon pair`; the handoff is an instruction to run `paseo daemon pair --home "$PASEO_HOME"`, then open the Project with `paseo --host <owner-loopback-host> <dir>` or start an agent with `paseo run --host <owner-loopback-host> --cwd <dir>`.
- `transient-pair`: `aiworker pair` may call `paseo daemon pair --home "$PASEO_HOME"` through `aissh` after a Project workdir is prepared and ownership is validated. Raw pairing output is allowed only in that immediate command response and must not be written to receipt, audit, snapshot, projection, diagnostics, or UI storage. Pairing the daemon is not Project registration/open evidence.
- `pairing-offer`: employee connects to a daemon through a real Paseo pairing link. AIWorker treats any such link as opaque pairing material and must not persist or render the raw URL or QR.
- `manual-path`: fallback instructions when a stable deep link is unavailable.

AIWorker may store the redacted handoff reference and HOME-derived Project workdir intent, but must not proxy Paseo project/workspace UI or session traffic.

## Secret boundary

AIWorker records secret references only. It must not write provider API keys into descriptors, assignment receipts, logs, diagnostics, OpenAPI examples, UI, or projected Project workdir files. Paseo/provider CLIs own provider authentication. Provider readiness checks use the `paseo-provider-json-v1` contract as warning-only metadata against the selected owner-scoped daemon endpoint: `paseo provider ls --host "$AIWORKER_PASEO_HOST" --json` may report whether the selected provider is available/enabled, but provider absence or login gaps do not block Project workdir projection. AIWorker does not call `paseo provider models` as a provisioning gate. Raw provider JSON, model lists, stderr, and transcripts must not be stored or shown. Pairing URLs and QR codes may appear only in the immediate `aiworker pair` response or the Web action that calls that same CLI path; they must not be stored in descriptors, receipts, audit records, snapshots, logs, diagnostics, or projected Project workdir files.
