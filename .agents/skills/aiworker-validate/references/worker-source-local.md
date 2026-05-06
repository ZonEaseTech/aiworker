# Worker Source Local Mode

Use `worker-source-local` when the product-under-test is the current repo
checkout, a workspace command, or a built source-tree bundle.

## Inputs

- Repo checkout and command under test.
- Test project directory.
- Executor engine and variant.
- Worker Admin host/port.
- Whether this is read-only validation, regression retest, or bug discovery.

## Workflow

1. Inspect `git status --short` and preserve unrelated dirty work.
2. Build or locate the source CLI. Prefer the built bundle when testing the CLI
   surface from source:

   ```bash
   PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' build:bundle
   ```

3. Create or reuse a test project directory:
   - use the user's supplied directory when given;
   - otherwise prefer `tmp/` or a debug root;
   - do not write test artifacts into a real user project unless requested.
4. Initialize project worker state with the source command.
5. Run `worker doctor` and `worker executor doctor --engine <engine>`.
6. Verify CLI continuity with a non-secret marker and stable chat id:
   - turn 1 stores the marker;
   - turn 2 recalls only the marker;
   - sessions list/show reports a stable engine binding.
7. Start `worker serve` on loopback only.
8. Verify:
   - `/health`;
   - unauthenticated and authenticated `/api/worker/info`;
   - `/admin/`;
   - relevant REST routes;
   - SSE;
   - Worker Admin flows that match the risk.
9. Read worker.db only for evidence unless the user asks for repair:
   conversations, messages/session entries, agent tasks, admissions, and cron.
10. Run focused gates matching the changed packages. Use full gates for
    cross-package, migration, release, or security-sensitive changes.
11. Stop the worker server, verify the port has no listener, and remove
    credential-bearing temp state unless the user wants it retained.

## Useful Gates

```bash
PATH="$HOME/.bun/bin:$PATH" bun run --filter '@zonease/aiworker-cli' build:bundle
PATH="$HOME/.bun/bin:$PATH" bun run typecheck
PATH="$HOME/.bun/bin:$PATH" bun run lint
PATH="$HOME/.bun/bin:$PATH" bun run test
```

## Evidence

Capture command names, exit status, logs with secrets redacted, worker.db
queries, filesystem artifacts, event-stream snippets, server PID/port cleanup,
and PMA task ids for confirmed findings.

## Boundaries

- Do not touch fleet, gateway, enrollment, or Fleet Web UI unless the user
  expands scope.
- Do not treat source-tree success as proof that a published CLI works. Use
  `cli-release-local` for published package validation.
