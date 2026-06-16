# AIWorker Architecture

AIWorker CLI and AIWorker Web are thin enterprise distribution surfaces for Paseo workspaces.

## Product position

AIWorker turns an expert-authored capability package into ordinary Paseo workspace files, assigns that workspace to an employee, and provisions the target machine through `aissh`. The CLI is the automation-first surface; AIWorker Web is an optional manager/admin console for the same assignment, provisioning, receipt, audit, and handoff records. Paseo owns the employee work surface and the runtime. Paseo owns workspace/runtime/UI/session/provider orchestration; AIWorker owns only distribution metadata and file projection.

```text
Admin -> AIWorker CLI/Web -> aissh target -> Paseo environment -> Paseo workspace -> agent sessions
```

## Ownership boundary

AIWorker owns only:

- organization/user authentication and assignment records;
- manager/admin web views over AIWorker-owned metadata;
- target machine registry (`aissh`, local dev, or rootless container targets);
- Paseo environment metadata (`PASEO_HOME` intent, daemon endpoint/socket/redacted offer or `local-home` binding, isolation kind);
- provider profile metadata and secret references, not literal provider keys;
- Soul release registry;
- Soul filesystem projection into a workspace directory;
- provisioning receipts, status, audit, and handoff metadata.

Paseo owns:

- daemon/client connection, relay/direct/socket access, and pairing;
- workspace UI, mobile/desktop/web/CLI clients;
- workspace creation/opening, sessions, terminal, browser, diff, logs, permission prompts;
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
  projects into many Workspaces

Assignment
  = User + PaseoEnvironment + SoulRelease + ProviderProfile + WorkspaceRef
```

A Paseo daemon is not a Soul container. A Paseo workspace directory is the Soul projection container.

Default isolation is one employee environment per OS user, rootless container, or VM:

```text
alice@server-1
  remote HOME=/home/alice
  PASEO_HOME=$HOME/.paseo
  daemon endpoint=local daemon for that HOME
  aiworker-workspaces/
    hr-recruiter/
    software-support/
    product-manager/
```

Multiple employees may share the same physical machine only when each has a separate OS user/container/VM, separate remote `HOME`, separate `PASEO_HOME`, separate daemon state, and separate provider credentials. AIWorker must not combine an `aissh` login for one HOME with paths or provider credentials from another HOME.

## Soul projection

A Soul is a versioned workspace file template. It can contain:

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
1. Admin selects user + target + provider profile + Soul release.
2. AIWorker creates an Assignment.
3. AIWorker uses aissh to discover the target execution identity and canonical remote HOME.
4. AIWorker derives `PASEO_HOME=$HOME/.paseo` and `$HOME/aiworker-workspaces/<workspace>` under that identity; caller-provided absolute paths are not path authority.
5. AIWorker installs/verifies Paseo, starts/checks the HOME-bound daemon, and gates provider readiness through the explicit `paseo-provider-json-v1` policy (`provider ls/models`) under the same identity.
6. AIWorker writes the Soul workspace files.
7. AIWorker records a redacted receipt and instruction-only handoff; it does not store real pairing URLs or QR codes.
8. Employee opens Paseo and works inside that workspace.
```

The employee work journey happens in Paseo. AIWorker may expose an optional launcher or catalog, but it is not a workbench and must not render the workspace.

AIWorker Web is allowed only as a management plane for AIWorker-owned metadata: assignments, provisioning plans and status, redacted receipts, audit events, handoff references, Soul releases, Paseo environment metadata, and provider-profile secret references. It must not proxy Paseo UI or session traffic.

## License/commercial boundary

AIWorker treats Paseo as an external CLI/daemon installed on target machines. Do not fork, vendor, embed, or patch Paseo as part of AIWorker without an explicit legal/commercial review because Paseo is AGPL-licensed.
