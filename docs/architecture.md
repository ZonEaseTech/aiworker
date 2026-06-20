# AIWorker Architecture

AIWorker CLI and AIWorker Web are thin enterprise distribution surfaces for Paseo Project workdirs.

## Product position

AIWorker turns an expert-authored capability package into ordinary files in a Paseo Project workdir, assigns that Project to an employee, and provisions the target machine through `aissh`. The CLI is the automation-first surface; AIWorker Web is an optional manager/admin console for the same assignment, provisioning, receipt, audit, and handoff records. Paseo owns the employee work surface and the runtime. Paseo owns Project/workspace/runtime/UI/session/provider orchestration; AIWorker owns only distribution metadata and file projection.

```text
Admin -> AIWorker CLI/Web -> aissh target -> Paseo environment -> Project workdir -> Paseo project/workspace -> agent sessions
```

## Ownership boundary

AIWorker owns only:

- organization/user authentication and assignment records;
- manager/admin web views over AIWorker-owned metadata;
- target machine registry (`aissh`, local dev, or rootless container targets);
- Paseo environment metadata (`PASEO_HOME` intent, daemon endpoint/socket/redacted offer or `local-home` binding, isolation kind);
- provider profile metadata and secret references, not literal provider keys;
- Soul release registry;
- Soul filesystem projection into a Project workdir;
- provisioning receipts, status, audit, and handoff metadata.

Paseo owns:

- daemon/client connection, relay/direct/socket access, and pairing;
- workspace UI, mobile/desktop/web/CLI clients;
- Project/workspace creation/opening, optional worktrees, sessions, terminal, browser, diff, logs, permission prompts;
- provider orchestration for Claude Code, Codex, OpenCode, ACP agents, and other installed CLIs;
- agent process lifecycle and provider-native authentication context.

AIWorker must not own or recreate:

- Worker daemon;
- Workbench or chat UI;
- sessions/invocations/transcripts;
- engine bridge or native engine adapters;
- projection services that observe agent runtime;
- broker APIs for local session follow-up;
- Paseo forks, vendored Paseo server/app code, or a Soul selector inside Paseo.

## Core model

```text
PaseoEnvironment
  has many ProviderProfiles
  has many Workspaces

SoulRelease
  projects into many Paseo Projects/workspaces

Assignment
  = User + PaseoEnvironment + SoulRelease + ProviderProfile + ProjectRef
```

A Paseo daemon is not a Soul container. AIWorker materializes the Soul into a normal Project workdir; Paseo then opens or runs against that directory through the selected daemon endpoint (`paseo --host <owner-loopback-host> <dir>` / `paseo run --host <owner-loopback-host> --cwd <dir>`). Paseo worktrees are optional git isolation under a Project and are not the default Soul projection target.

Default isolation is owner-scoped under the actual `aissh` execution HOME:

```text
target aissh HOME=/home/shared-ops
  .aiworker/
    alice-example.com/
      .paseo/
      run/
      daemon 127.0.0.1:<stable-alice-port>
      projects/
        hr-recruiter/
        software-support/
    bob-example.com/
      .paseo/
      run/
      daemon 127.0.0.1:<stable-bob-port>
      projects/
        product-manager/
```

Multiple employees may share the same target HOME only through separate AIWorker owner scopes: independent `$HOME/.aiworker/<userSlug>/.paseo`, stable loopback daemon endpoint derived from `userSlug`, and Project root. A separate OS user/container/VM remains the stronger deployment option when provider CLI credential isolation must be guaranteed. AIWorker surfaces that provider credential risk as a non-blocking admin warning because provider CLIs may still read credentials elsewhere under the shared HOME.

`PaseoEnvironment.ownerEmail` is the logical owner/admin of the target execution identity. It may differ from `WorkspaceAssignment.assignedEmail`; the assignment owner is represented by `assignedEmail`, `userSlug`, and the owner-scoped `$HOME/.aiworker/<userSlug>` tree. `--dedicated-target-user` remains a stronger assertion that the target execution identity is dedicated to the assigned user, but new writes still use the owner-scoped layout for consistency.

## Soul projection

A Soul is a versioned Project workdir template. It can contain:

```text
AGENTS.md
CLAUDE.md
skills/**
.mcp.json
.codex/config.toml
business-context/**
paseo.json
```

Provider secrets do not belong in the Soul or descriptor. Provider credentials are installed/configured at the Paseo environment/provider-profile layer and should be represented in AIWorker only by secret references.

## Provisioning flow

```text
1. Admin selects user + target + provider profile + Soul release and records an explicit target-owner assertion.
2. AIWorker creates an Assignment.
3. AIWorker uses aissh to discover the target execution identity and canonical remote HOME.
4. AIWorker derives `PASEO_HOME=$HOME/.aiworker/<userSlug>/.paseo`, `PASEO_LISTEN=127.0.0.1:<stable-user-port>`, and `$HOME/.aiworker/<userSlug>/projects/<project>` under that identity; caller-provided absolute paths are not path authority.
5. AIWorker installs/verifies Paseo, starts/checks the owner-scoped daemon, and gates provider readiness through the explicit `paseo-provider-json-v1` policy (`paseo provider ls --host "$AIWORKER_PASEO_HOST" --json`) under the same identity.
6. AIWorker writes the Soul Project workdir files.
7. AIWorker records a redacted receipt and instruction-only handoff; it does not store real pairing URLs or QR codes.
8. Employee opens Paseo with that Project workdir and works inside the Paseo-owned project/workspace.
```

The employee work journey happens in Paseo. AIWorker may expose an optional launcher or catalog, but it is not a workbench and must not render the Paseo project/workspace.

AIWorker Web is allowed only as a management plane for AIWorker-owned metadata: assignments, provisioning plans and status, redacted receipts, audit events, handoff references, Soul releases, Paseo environment metadata, and provider-profile secret references. It must not proxy Paseo UI or session traffic.

## AIWorker Web 定位

AIWorker Web 是管理员主可视化操作台：除审批/触发 provisioning 外，它可在 UI 内创建/编辑 AIWorker-owned 元数据 —— assignment、Paseo environment、provider 引用（profile + secret 引用）、Soul release（register 已 build 的 release，不是浏览器内 authoring）。

它仍是薄层，不是 snapshot source of truth：所有创建/编辑写动作经 `aiworker` CLI spawn 代写，由 CLI 命令负责落地元数据并保持与 CLI 一致的 read-or-derive 所有权契约。Web 只存 `secret://` 引用，绝不落 literal provider secret，并且不 render/proxy/observe Paseo runtime/workspace/session。

## License/commercial boundary

AIWorker treats Paseo as an external CLI/daemon installed on target machines. Do not fork, vendor, embed, or patch Paseo as part of AIWorker without an explicit legal/commercial review because Paseo is AGPL-licensed.
