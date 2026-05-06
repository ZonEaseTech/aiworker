# Coder Claude Code Mode

Use `coder-claude-code` only when the user explicitly wants validation inside a
remote Coder workspace with Claude Code as the executor.

## Inputs

- Coder workspace name.
- Remote debug directory.
- Published CLI version or released binary path.
- Soul preset, defaulting to `developer` unless the user specifies another.
- Loopback Worker HTTP port.

## Boundaries

- Use a published `@zonease/aiworker-cli` package, `npx`, or a user-provided
  released binary in the remote workspace.
- Do not clone, build, or run AIWorker source remotely unless the user changes
  scope.
- Do not enroll, pair, inspect, or restart fleet/gateway services unless the
  user explicitly asks for fleet validation.
- Preserve the real remote `HOME` so Claude Code can read existing auth.
- Isolate AIWorker state in the supplied remote debug directory.
- Keep first-run master keys, bootstrap tokens, bearer tokens, cookies, private
  URLs, and raw auth files out of repo docs and final reports.

## Workflow

1. Check Coder access:

   ```bash
   coder whoami
   coder list
   coder show <workspace>
   coder ssh --wait=no <workspace> -- pwd
   ```

2. Discover remote PATH and Claude Code binary explicitly; non-interactive Coder
   shells may not load the user's normal shell profile.
3. Install the published CLI into a remote debug project with an isolated npm
   prefix. Use the resolved `node_modules/.bin/aiworker` path for every command.
4. Initialize the worker scope, select `claude-code/default`, and run
   `doctor` plus `executor doctor`.
5. Run a direct `aiworker run` smoke and a two-turn marker continuity check.
6. Start loopback `serve` with a tracked pidfile/logfile.
7. Verify `/health`, `/admin/`, and auth boundary on `/api/worker/info`.
8. Stop the process and confirm the port listener is gone.
9. Record confirmed product findings through PMA, sanitized.

## Evidence

Capture remote workspace identity, CLI install path and version, Claude Code
binary/version, init/doctor/executor selection result, marker continuity,
loopback HTTP/Admin smoke result, cleanup, and PMA task ids for confirmed
findings.
