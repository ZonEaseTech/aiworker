# PLAN-134 Worker-local dotenv enrollment env persistence

- **status**: completed
- **createdAt**: 2026-05-06 12:21
- **approvedAt**: 2026-05-06 12:21
- **completedAt**: 2026-05-06 12:28
- **relatedTask**: FEAT-055

## Context

`AIWORKER_GATEWAY_URL` / `AIWORKER_DISPLAY_NAME` / `AIWORKER_JOIN_TOKEN`
historically appeared as process-level examples. That is convenient for a
single foreground worker, but it is ambiguous once one host runs multiple
workers: a shell-level env value can point the wrong project worker at the
wrong gateway identity.

The existing scope model already gives each project worker a private
`<project>/.aiworker/local/.env` file. It currently carries minted secrets;
the same file is also the correct place for worker-local gateway enrollment
startup env. `config.yaml` remains a redacted worker config mirror and should
not become the source of truth for process bootstrap secrets or gateway
enrollment tokens.

## Proposal

1. Extend `bootstrapDotenv()` so worker-local `.env` loads enrollment startup
   keys before worker env parsing:
   - `AIWORKER_GATEWAY_URL`
   - `AIWORKER_JOIN_TOKEN`
   - `AIWORKER_DISPLAY_NAME`
   - `AIWORKER_ENROLL_MODE`
2. When these keys are explicitly set in `process.env`, merge them back into
   the current scope's `.env` while preserving explicit env precedence for the
   current process. This supports one-time `export ... aiworker serve` flows
   without making shell env the durable worker identity source.
3. Keep `.env` chmod 0600 and avoid logging secret values.
4. Update README / CLI / deployment / architecture docs to explain:
   - `AIWORKER_HOME` is the worker runtime state root, not cwd;
   - project scope maps runtime state to `.aiworker/local`;
   - `config.yaml` remains an advisory redacted config mirror;
   - local project workers should keep gateway/display/enroll env in
     `.aiworker/local/.env`.

## Validation

- Focused unit test for `bootstrapDotenv()` loading and persisting enrollment
  env keys.
- Focused CLI bootstrap tests.
- `git diff --check`.

## Annotations

- 2026-05-06 12:21: Opened for worker-local enrollment env persistence and
  docs clarification.
- 2026-05-06 12:28: Completed. `bootstrapDotenv()` now loads and persists
  worker enrollment startup env in the active scope `.env`; docs explain
  `AIWORKER_HOME` as the worker state root and direct project workers to
  `.aiworker/local/.env`.
