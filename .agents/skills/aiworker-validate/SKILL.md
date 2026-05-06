---
name: aiworker-validate
description: "Route AIWorker validation to the correct mode: remote fleet, local source worker, local published CLI, or remote Coder Claude Code. Use for AIWorker validation planning or execution requests."
disable-model-invocation: true
argument-hint: "fleet-remote | worker-source-local | cli-release-local | coder-claude-code"
arguments: [mode, target]
---

# AIWorker Validate

Use this as the canonical AIWorker validation entrypoint. This skill is manual
only because every mode can touch real services, local credentials, long-running
processes, or real executor sessions.

If `$mode` is provided, use it. Otherwise infer exactly one mode from the user
request:

| Mode | Load this reference | Scope |
|------|---------------------|-------|
| `fleet-remote` | [references/fleet-remote.md](references/fleet-remote.md) | Shared remote fleet, gateway, Fleet Web UI, enrollment, or a temporary local worker attached to the fleet. |
| `worker-source-local` | [references/worker-source-local.md](references/worker-source-local.md) | Local worker validation where the product-under-test is the current repo checkout, workspace command, or built source bundle. |
| `cli-release-local` | [references/cli-release-local.md](references/cli-release-local.md) | Local black-box worker validation where the product-under-test is a published `@zonease/aiworker-cli` package. |
| `coder-claude-code` | [references/coder-claude-code.md](references/coder-claude-code.md) | Remote Coder workspace validation with a published CLI and Claude Code executor. |

## Routing Rules

- Do not combine modes unless the user explicitly asks for a combined campaign.
- Keep fleet/gateway/enrollment work in `fleet-remote`.
- Keep source-tree worker testing in `worker-source-local`.
- Keep published-package black-box testing in `cli-release-local`.
- Keep remote Coder workspace testing in `coder-claude-code`.
- Use `$target` as the version, server hint, debug root, or project path when it
  is supplied. If it is missing, discover it from the repo or ask only when a
  safe default does not exist.

Legacy `aiworker-test*`, `aiworker-release-debug`, and
`aiworker-coder-claude-engine` skills were removed. Use this skill directly.

## Always-On Safety

- Preserve the real user `HOME` for Codex / Claude Code executor tests so
  existing auth and sandbox config remain available.
- Isolate AIWorker state with `AIWORKER_HOME`, worker DB paths, data roots,
  logs, pidfiles, debug roots, and project directories.
- Never write bearer tokens, bootstrap tokens, master keys, cookies, auth
  headers, private URLs, generated credentials, or secret-like prompt content
  into repo docs, skill files, changelogs, final answers, screenshots, or
  persisted reports.
- Prefer `tmux` for long-running servers. If unavailable, use `setsid` or
  `nohup` with explicit pidfile/logfile cleanup.
- Never use broad cleanup such as `kill $(lsof -ti:PORT)`. Match only
  confirmed listeners with `lsof -tiTCP:PORT -sTCP:LISTEN`.
- Verify stateful claims with DB, filesystem, event-stream, or service evidence;
  do not trust LLM self-report for admission, memory, artifact, cron, or
  persisted state.
- Record confirmed product issues through PMA as sanitized BUG/TODO/QA tasks.
  Do not fix code unless the user expands scope.

## Completion Checklist

Before reporting done:

- the selected mode is explicit;
- the relevant reference file was followed;
- commands, pass/fail status, evidence paths, cleanup, and skips are recorded;
- sensitive values are redacted or omitted;
- out-of-scope surfaces are named instead of silently tested;
- skill/frontmatter validation and `git diff --check` pass when files changed.
